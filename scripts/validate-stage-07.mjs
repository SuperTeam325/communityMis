import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createFrontendServer } from "../frontend/server.mjs";
import { appRoutes, routePayload } from "../frontend/src/spa/route-data.mjs";
import { DIST_ROOT } from "../frontend/src/spa/server-runtime.mjs";

const projectRoot = process.cwd();
const distRoot = DIST_ROOT;
const checks = [];

await run();

async function run() {
  checkStaticSource();
  runCommand("npm", ["run", "build"], "frontend build passes");
  checkBuildOutput();
  await checkFrontendServer();

  const failed = checks.filter((item) => !item.ok);
  for (const item of checks) {
    console.log(`${item.ok ? "ok" : "fail"} - ${item.message}`);
  }
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

function checkStaticSource() {
  for (const removed of [
    "frontend/src/prototypeRenderer.mjs",
    "frontend/src/prototype-shell.mjs",
    "frontend/src/app/main.mjs",
    "frontend/src/routes.mjs",
    "frontend/prototype-shell.mjs"
  ]) {
    record(!fs.existsSync(path.join(projectRoot, removed)), `legacy prototype source removed: ${removed}`);
  }

  for (const file of [
    "scripts/build-frontend.mjs",
    "frontend/server.mjs",
    "scripts/preview-frontend.mjs",
    "frontend/src/spa/styles.css"
  ]) {
    const source = read(file);
    for (const forbidden of [
      "prototypeRenderer",
      "renderPrototypeHtml",
      "buildRouteIndexHtml",
      "prototype-shell",
      "UISource",
      "PRODUCTION_UI_ROOT",
      "UI_SOURCE_ROOT",
      "frontend/public/ui",
      "public/ui",
      "/assets/app/"
    ]) {
      record(!source.includes(forbidden), `${file} does not reference ${forbidden}`);
    }
  }

  const buildSource = read("scripts/build-frontend.mjs");
  record(!buildSource.includes("emitPrototypePages"), "build script removed emitPrototypePages");
  record(!buildSource.includes("emitPrototypeRuntimeAssets"), "build script removed emitPrototypeRuntimeAssets");
  record(read("vite.config.ts").includes("publicDir: false"), "Vite publicDir is disabled for explicit SPA assets");
  record(routePayload().length === appRoutes.length, "SPA route payload covers all app routes");
}

function checkBuildOutput() {
  for (const file of ["index.html", "config.json", "config.template.json", "manifest.json", "routes.json"]) {
    record(fs.existsSync(path.join(distRoot, file)), `dist ${file} exists`);
  }

  const pagesRoot = path.join(distRoot, "pages");
  record(!fs.existsSync(pagesRoot) || listFiles(pagesRoot).length === 0, "dist pages directory is absent or empty");
  record(!fs.existsSync(path.join(distRoot, "assets", "app", "prototype-shell.mjs")), "dist does not include assets/app/prototype-shell.mjs");
  record(!fs.existsSync(path.join(distRoot, "ui")), "dist does not include copied prototype UI tree");
  record(!fs.existsSync(path.join(distRoot, "styles")), "dist does not include copied prototype styles tree");

  const htmlFiles = listFiles(distRoot).filter((file) => file.endsWith(".html")).map((file) => slash(path.relative(distRoot, file)));
  record(htmlFiles.length === 1 && htmlFiles[0] === "index.html", "index.html is the only built HTML file");

  const indexHtml = readDist("index.html");
  record(indexHtml.includes('id="root"'), "SPA index contains React root");
  record(!indexHtml.includes("prototype-shell"), "SPA index does not load prototype shell");
  record(!indexHtml.includes("/assets/app/"), "SPA index does not load legacy assets/app runtime");

  const manifest = JSON.parse(readDist("manifest.json"));
  record(manifest.type === "vite-react-spa", "deployment manifest type marks React SPA");
  record(manifest.frontendMode === "spa", "deployment manifest frontendMode is spa");
  record(!("prototypeAssets" in manifest), "deployment manifest has no prototypeAssets");
  record(Object.values(manifest.routes ?? {}).every((route) => !String(route.file ?? "").startsWith("/pages/")), "manifest routes do not point to pages html");

  const routes = JSON.parse(readDist("routes.json"));
  record(routes.length === appRoutes.length, "routes.json contains all SPA routes");
  record(routes.every((route) => !("source" in route)), "routes.json does not expose prototype source files");

  const distText = listFiles(distRoot)
    .filter((file) => [".html", ".json", ".js", ".css"].includes(path.extname(file)))
    .map((file) => fs.readFileSync(file, "utf8"))
    .join("\n");
  record(!distText.includes("prototype-shell.mjs"), "dist text artifacts do not reference prototype-shell.mjs");
  record(!distText.includes("/assets/app/"), "dist text artifacts do not reference /assets/app/");
}

async function checkFrontendServer() {
  const server = createFrontendServer({
    env: {
      NODE_ENV: "production",
      API_BASE_URL: "https://api.example.test",
      APP_ENV: "stage07",
      BUILD_VERSION: "stage07"
    }
  });
  const port = await listen(server);
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    const health = await fetch(`${baseUrl}/frontend-health`);
    const healthPayload = await health.json();
    record(healthPayload.frontendMode === "spa", "frontend health reports spa mode");

    const config = await fetch(`${baseUrl}/config.json`);
    const configPayload = await config.json();
    record(config.headers.get("cache-control") === "no-cache", "config.json uses no-cache");
    record(configPayload.apiBaseUrl === "https://api.example.test", "config.json exposes configured API base URL");

    const manifest = await fetch(`${baseUrl}/manifest.json`);
    const manifestPayload = await manifest.json();
    record(manifestPayload.type === "vite-react-spa", "served manifest marks React SPA");

    const routes = await fetch(`${baseUrl}/routes.json`);
    const routeItems = await routes.json();
    record(routeItems.length === appRoutes.length, "frontend service exposes SPA route manifest");

    for (const route of ["/", "/feed", "/orders/demo", "/jury/disputes/demo", "/admin/dashboard"]) {
      const response = await fetch(`${baseUrl}${route}`);
      const html = await response.text();
      record(response.ok && html.includes('id="root"'), `SPA fallback serves index for ${route}`);
      record(!html.includes("prototype-shell"), `SPA fallback omits prototype shell for ${route}`);
    }

    const legacyFeed = await fetch(`${baseUrl}/screens/feed.html`, { redirect: "manual" });
    record(legacyFeed.status === 302 && legacyFeed.headers.get("location") === "/feed", "legacy /screens/feed.html redirects to /feed");

    const legacyPost = await fetch(`${baseUrl}/community-posts/42`, { redirect: "manual" });
    record(legacyPost.status === 302 && legacyPost.headers.get("location") === "/posts/42", "legacy community post URL redirects to SPA post route");

    const legacyJury = await fetch(`${baseUrl}/jury/voting?disputeId=99`, { redirect: "manual" });
    record(legacyJury.status === 302 && legacyJury.headers.get("location") === "/jury/disputes/99", "legacy jury voting query redirects to SPA dispute voting route");

    const apiResponse = await fetch(`${baseUrl}/api/health`);
    record(apiResponse.status === 404, "frontend service excludes /api/* from SPA fallback");

    const missingStatic = await fetch(`${baseUrl}/assets/missing-stage07.js`);
    record(missingStatic.status === 404, "missing static asset returns 404");
  } finally {
    await close(server);
  }
}

function runCommand(command, args, message) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" });
  record(result.status === 0, message);
}

function read(relativePath) {
  return fs.existsSync(path.join(projectRoot, relativePath)) ? fs.readFileSync(path.join(projectRoot, relativePath), "utf8") : "";
}

function readDist(relativePath) {
  return fs.readFileSync(path.join(distRoot, relativePath), "utf8");
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
