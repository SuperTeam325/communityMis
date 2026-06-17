import fs from "node:fs";
import path from "node:path";
import { createFrontendServer } from "../frontend/server.mjs";
import { appRoutes } from "../frontend/src/spa/route-data.mjs";
import { DIST_ROOT } from "../frontend/src/spa/server-runtime.mjs";

const projectRoot = process.cwd();
const distRoot = DIST_ROOT;
const checks = [];

await run();

async function run() {
  checkDistLayout();
  checkSpaHtml();
  checkAssets();
  await checkProductionServer();

  const failed = checks.filter((item) => !item.ok);
  for (const item of checks) {
    console.log(`${item.ok ? "ok" : "fail"} - ${item.message}`);
  }
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

function checkDistLayout() {
  record(fs.existsSync(distRoot), "frontend/dist exists");
  for (const file of ["index.html", "config.json", "config.template.json", "manifest.json", "routes.json"]) {
    record(fs.existsSync(path.join(distRoot, file)), `dist ${file} exists`);
  }
  const pagesRoot = path.join(distRoot, "pages");
  record(!fs.existsSync(pagesRoot) || listFiles(pagesRoot).length === 0, "prototype route pages are absent");
}

function checkSpaHtml() {
  const html = fs.readFileSync(path.join(distRoot, "index.html"), "utf8");
  record(html.includes('id="root"'), "SPA root exists");
  record(!html.includes("prototype-shell.mjs"), "SPA does not load legacy prototype shell");
  record(!html.includes("/assets/app/"), "SPA does not load legacy assets/app runtime");
  record(!/<script(?![^>]+src=)[^>]*>[\s\S]*<\/script>/i.test(html), "SPA index has no inline scripts");
  record(!/<style\b/i.test(html), "SPA index has no inline styles");
}

function checkAssets() {
  const files = listFiles(path.join(distRoot, "assets"));
  record(files.some((file) => file.endsWith(".js")), "Vite JS asset exists");
  record(files.some((file) => file.endsWith(".css")), "Vite CSS asset exists");
  for (const file of files) {
    const relative = slash(path.relative(distRoot, file));
    record(!relative.startsWith("assets/app/"), `asset is not legacy prototype runtime: ${relative}`);
    record(/\.[A-Za-z0-9_-]{8,}\./.test(path.basename(file)), `asset is hashed: ${relative}`);
  }

  const manifest = JSON.parse(fs.readFileSync(path.join(distRoot, "manifest.json"), "utf8"));
  record(manifest.type === "vite-react-spa", "manifest type is React SPA");
  record(manifest.frontendMode === "spa", "manifest frontendMode is spa");
  record(!("prototypeAssets" in manifest), "manifest has no prototypeAssets");

  const routeManifest = JSON.parse(fs.readFileSync(path.join(distRoot, "routes.json"), "utf8"));
  record(routeManifest.length === appRoutes.length, "routes.json contains all SPA routes");
  record(routeManifest.every((route) => !("source" in route)), "routes.json has no prototype source field");

  const config = JSON.parse(fs.readFileSync(path.join(distRoot, "config.json"), "utf8"));
  for (const key of ["apiBaseUrl", "appEnv", "buildVersion", "sentryDsn", "sentryTracesSampleRate"]) {
    record(Object.prototype.hasOwnProperty.call(config, key), `runtime config contains ${key}`);
  }
  checkNoBusinessReloads();
}

async function checkProductionServer() {
  recordProductionConfigFailure();
  const server = createFrontendServer({
    env: {
      NODE_ENV: "production",
      API_BASE_URL: "https://api.example.test",
      APP_ENV: "test",
      BUILD_VERSION: "frontend-build-test",
      SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
      SENTRY_TRACES_SAMPLE_RATE: "0.1"
    }
  });
  const port = await listen(server);
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    const health = await fetch(`${baseUrl}/frontend-health`);
    const healthPayload = await health.json();
    record(healthPayload.frontendMode === "spa", "health reports SPA mode");

    for (const route of ["/login", "/feed", "/orders/demo", "/jury", "/jury/disputes/demo", "/admin/dashboard"]) {
      const response = await fetch(`${baseUrl}${route}`);
      const html = await response.text();
      record(response.ok && html.includes('id="root"'), `SPA serves React index for ${route}`);
      record(!html.includes("prototype-shell.mjs"), `SPA route does not load prototype shell: ${route}`);
      checkSecurityHeaders(response, "SPA HTML");
    }

    const config = await fetch(`${baseUrl}/config.json`);
    const payload = await config.json();
    record(config.headers.get("cache-control") === "no-cache", "config.json uses no-cache");
    record(payload.apiBaseUrl === "https://api.example.test", "config.json exposes API base URL");
    record(payload.buildVersion === "frontend-build-test", "config.json exposes build version");

    const routeResponse = await fetch(`${baseUrl}/routes.json`);
    const routePayload = await routeResponse.json();
    record(routePayload.length === appRoutes.length, "routes.json contains all routes");

    const hashedAsset = listFiles(path.join(distRoot, "assets")).find((file) => file.endsWith(".js") && /\.[A-Za-z0-9_-]{8,}\./.test(path.basename(file)));
    if (hashedAsset) {
      const assetPath = `/${slash(path.relative(distRoot, hashedAsset))}`;
      const assetResponse = await fetch(`${baseUrl}${assetPath}`);
      record(assetResponse.headers.get("cache-control") === "public, max-age=31536000, immutable", "hashed asset uses immutable cache");
    }

    const legacyResponse = await fetch(`${baseUrl}/screens/feed.html`, { redirect: "manual" });
    record(legacyResponse.status === 302 && legacyResponse.headers.get("location") === "/feed", "legacy HTML URL redirects to production route");

    const apiResponse = await fetch(`${baseUrl}/api/health`);
    record(apiResponse.status === 404, "frontend server excludes /api/* from history fallback");

    const missingStatic = await fetch(`${baseUrl}/assets/missing-build-check.js`);
    record(missingStatic.status === 404, "missing static assets do not fallback");
  } finally {
    await close(server);
  }
}

function recordProductionConfigFailure() {
  try {
    createFrontendServer({ env: { NODE_ENV: "production", APP_ENV: "test" } });
    record(false, "production server rejects missing API_BASE_URL");
  } catch (error) {
    record(/API_BASE_URL/.test(error.message), "production server rejects missing API_BASE_URL");
  }
}

function checkSecurityHeaders(response, label) {
  record(response.headers.get("x-content-type-options") === "nosniff", `${label} sends nosniff`);
  const csp = response.headers.get("content-security-policy") ?? "";
  record(!csp.includes("script-src 'self' 'unsafe-inline'"), `${label} CSP keeps inline scripts disabled`);
  record(csp.includes("style-src 'self' 'unsafe-inline'"), `${label} CSP allows React runtime styles`);
  record(csp.includes("connect-src 'self' https://api.example.test https://example.ingest.sentry.io"), `${label} CSP allows API and Sentry connect-src`);
}

function checkNoBusinessReloads() {
  const files = [
    "frontend/src/spa/pages/AdminPages.tsx",
    "frontend/src/spa/pages/MessagesPages.tsx",
    "frontend/src/spa/pages/OrdersPages.tsx",
    "frontend/src/spa/pages/RequestsPages.tsx",
    "frontend/src/spa/pages/DisputesPages.tsx",
    "frontend/src/spa/pages/ProfilePages.tsx"
  ];
  const content = files.map((file) => fs.readFileSync(path.join(projectRoot, file), "utf8")).join("\n");
  record(!content.includes("window.location.reload()"), "SPA pages do not use business reloads");
  record(!content.includes("window.location.href ="), "SPA pages do not use business href redirects");
  record(!content.includes("new URLSearchParams(window.location.search)"), "SPA pages centralize query parsing");
}

function listFiles(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(root, entry.name);
    return entry.isDirectory() ? listFiles(filePath) : [filePath];
  });
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(server.address().port);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

function slash(value) {
  return value.replace(/\\/g, "/");
}

function record(ok, message) {
  checks.push({ ok: Boolean(ok), message });
}
