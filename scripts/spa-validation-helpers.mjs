import fs from "node:fs";
import path from "node:path";
import { createFrontendServer } from "../frontend/server.mjs";
import { appRoutes, matchRoute, responsiveViewports, routePayload, routeById } from "../frontend/src/spa/route-data.mjs";
import { DIST_ROOT } from "../frontend/src/spa/server-runtime.mjs";

export { appRoutes, matchRoute, responsiveViewports, routePayload, routeById };
export const projectRoot = process.cwd();
export const distRoot = DIST_ROOT;

export function readProject(relativePath) {
  const filePath = path.join(projectRoot, relativePath);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

export function listFiles(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(root, entry.name);
    return entry.isDirectory() ? listFiles(filePath) : [filePath];
  });
}

export function assertSpaRouteBaseline(record, ids = []) {
  const payload = routePayload();
  record(appRoutes.length > 0, "SPA routes are registered");
  record(payload.length === appRoutes.length, "SPA route payload covers all app routes");
  record(appRoutes.every((route) => !("source" in route)), "SPA route metadata has no prototype source field");
  record(payload.every((route) => !("source" in route)), "served SPA route payload has no prototype source field");
  record(fs.existsSync(path.join(projectRoot, "frontend", "src", "spa", "routes.ts")), "SPA route facade exists");
  record(fs.existsSync(path.join(projectRoot, "frontend", "src", "spa", "route-data.mjs")), "SPA route data exists");

  for (const id of ids) {
    record(Boolean(routeById(id)), `SPA route is registered: ${id}`);
  }
}

export function assertSpaRouteMatches(record, entries) {
  for (const [pathname, expectedId] of entries) {
    record(matchRoute(pathname)?.id === expectedId, `SPA route ${expectedId} matches ${pathname}`);
  }
}

export function assertAppRouteCases(record, ids) {
  const appSource = readProject("frontend/src/spa/App.tsx");
  for (const id of ids) {
    record(appSource.includes(`case "${id}"`), `App.tsx dispatches SPA route: ${id}`);
  }
}

export function assertPageSource(record, relativePath, expectedTokens, label = relativePath) {
  const source = readProject(relativePath);
  record(source.length > 0, `${label} source exists`);
  for (const expected of expectedTokens) {
    record(source.includes(expected), `${label} contains ${expected}`);
  }
}

export function assertSourceOmits(record, relativePath, forbiddenTokens, label = relativePath) {
  const source = readProject(relativePath);
  record(source.length > 0, `${label} source exists`);
  for (const forbidden of forbiddenTokens) {
    record(!source.includes(forbidden), `${label} omits ${forbidden}`);
  }
}

export function assertResponsiveViewports(record) {
  for (const [width, height] of [[390, 844], [820, 1180], [1440, 900], [1920, 1080]]) {
    record(responsiveViewports.some((item) => item.width === width && item.height === height), `responsive viewport registered: ${width}x${height}`);
  }
}

export function assertLegacyPrototypeSourcesRemoved(record) {
  for (const removed of [
    "frontend/src/prototypeRenderer.mjs",
    "frontend/src/prototype-shell.mjs",
    "frontend/src/app/main.mjs",
    "frontend/src/routes.mjs",
    "frontend/prototype-shell.mjs"
  ]) {
    record(!fs.existsSync(path.join(projectRoot, removed)), `legacy prototype source removed: ${removed}`);
  }
}

export function assertNoPrototypeTestDependencies(record) {
  const roots = ["scripts", "tests", "frontend/src"];
  const forbidden = [
    "renderPrototypeHtml",
    "prototypeRenderer",
    "prototype-shell.mjs",
    "frontend/src/routes.mjs",
    "frontend/public/ui/screens",
    "UISource/screens"
  ];
  const allowedFiles = new Set([
    "scripts/spa-validation-helpers.mjs",
    "scripts/validate-stage-01.mjs",
    "scripts/validate-stage-07.mjs",
    "scripts/validate-stage-08.mjs",
    "scripts/validate-frontend-build.mjs"
  ]);
  const offenders = [];
  for (const root of roots) {
    for (const file of listFiles(path.join(projectRoot, root))) {
      if (![".js", ".mjs", ".ts", ".tsx"].includes(path.extname(file))) continue;
      const relative = slash(path.relative(projectRoot, file));
      const source = fs.readFileSync(file, "utf8");
      for (const token of forbidden) {
        if (source.includes(token) && !allowedFiles.has(relative)) {
          offenders.push(`${relative}: ${token}`);
        }
      }
    }
  }
  record(offenders.length === 0, offenders.length === 0
    ? "test and SPA source dependencies no longer import prototype runtime"
    : `prototype runtime dependencies remain: ${offenders.slice(0, 8).join("; ")}`);
}

export function assertDistSpaOnly(record) {
  if (!fs.existsSync(distRoot)) {
    record(false, "frontend/dist exists for SPA artifact checks");
    return;
  }
  const htmlFiles = listFiles(distRoot).filter((file) => file.endsWith(".html")).map((file) => slash(path.relative(distRoot, file)));
  record(htmlFiles.length === 1 && htmlFiles[0] === "index.html", "production build has index.html as the only HTML entry");
  record(!fs.existsSync(path.join(distRoot, "pages")) || listFiles(path.join(distRoot, "pages")).length === 0, "production build has no prototype pages directory");
  record(!fs.existsSync(path.join(distRoot, "assets", "app", "prototype-shell.mjs")), "production build has no legacy prototype shell asset");
  record(!fs.existsSync(path.join(distRoot, "ui")), "production build has no copied public UI tree");
  record(!fs.existsSync(path.join(distRoot, "styles")), "production build has no copied prototype styles tree");

  const indexHtml = readDist("index.html");
  record(indexHtml.includes('id="root"'), "production index contains React root");
  record(!indexHtml.includes("prototype-shell"), "production index omits prototype shell");
  record(!indexHtml.includes("/assets/app/"), "production index omits legacy assets/app runtime");
}

export async function assertFrontendServerSpaRuntime(record, env = {}) {
  const server = createFrontendServer({
    env: {
      NODE_ENV: "production",
      API_BASE_URL: "https://api.example.test",
      APP_ENV: "spa-validation",
      BUILD_VERSION: "spa-validation",
      ...env
    }
  });
  const port = await listen(server);
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    const routeResponse = await fetch(`${baseUrl}/routes.json`);
    const routes = await routeResponse.json();
    record(routeResponse.ok && routes.length === appRoutes.length, "frontend server serves SPA route manifest");
    record(routes.every((route) => !("source" in route)), "frontend server route manifest has no source field");

    for (const route of ["/", "/feed", "/posts/demo", "/orders/demo", "/disputes/demo", "/jury/disputes/demo", "/admin/dashboard"]) {
      const response = await fetch(`${baseUrl}${route}`);
      const html = await response.text();
      record(response.ok && html.includes('id="root"'), `frontend server returns React index for ${route}`);
      record(!html.includes("prototype-shell"), `frontend server omits prototype shell for ${route}`);
    }

    const legacyFeed = await fetch(`${baseUrl}/screens/feed.html`, { redirect: "manual" });
    record(legacyFeed.status === 302 && legacyFeed.headers.get("location") === "/feed", "legacy screen URL redirects to SPA route");

    const legacyPost = await fetch(`${baseUrl}/community-posts/42`, { redirect: "manual" });
    record(legacyPost.status === 302 && legacyPost.headers.get("location") === "/posts/42", "legacy post URL redirects to SPA detail route");

    const legacyJury = await fetch(`${baseUrl}/jury/voting?disputeId=99`, { redirect: "manual" });
    record(legacyJury.status === 302 && legacyJury.headers.get("location") === "/jury/disputes/99", "legacy jury voting URL redirects to SPA dispute route");

    const apiResponse = await fetch(`${baseUrl}/api/health`);
    record(apiResponse.status === 404, "frontend server excludes /api/* from history fallback");

    const missingStatic = await fetch(`${baseUrl}/assets/missing-spa-validation.js`);
    record(missingStatic.status === 404, "missing static asset returns 404 instead of SPA fallback");
  } finally {
    await close(server);
  }
}

export function readDist(relativePath) {
  return fs.readFileSync(path.join(distRoot, relativePath), "utf8");
}

export function slash(value) {
  return value.replace(/\\/g, "/");
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
