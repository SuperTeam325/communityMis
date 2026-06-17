import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createBackendServer } from "../backend/src/app.mjs";
import { createFrontendServer } from "../frontend/server.mjs";
import { appRoutes as routes, responsiveViewports, routePath } from "../frontend/src/spa/route-data.mjs";

const projectRoot = process.cwd();
const checks = [];

await run();

async function run() {
  checkFileLayout();
  checkRouteCoverage();
  await checkServers();

  const failed = checks.filter((item) => !item.ok);
  for (const item of checks) {
    console.log(`${item.ok ? "ok" : "fail"} - ${item.message}`);
  }

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

function checkFileLayout() {
  for (const requiredPath of [
    "frontend/server.mjs",
    "frontend/src/spa/route-data.mjs",
    "frontend/src/spa/App.tsx",
    "frontend/src/spa/routes.ts",
    "frontend/src/spa/main.tsx",
    "backend/server.mjs",
    "backend/src/app.mjs",
    "scripts/start-local.mjs"
  ]) {
    record(fs.existsSync(path.join(projectRoot, requiredPath)), `required SPA skeleton file exists: ${requiredPath}`);
  }
}

function checkRouteCoverage() {
  const routePaths = new Set(routes.map((item) => item.path));
  const entryPaths = new Set(routes.map((item) => routePath(item)));
  const routeIds = new Set(routes.map((item) => item.id));
  const spaRoutes = fs.readFileSync(path.join(projectRoot, "frontend", "src", "spa", "routes.ts"), "utf8");
  const appSource = fs.readFileSync(path.join(projectRoot, "frontend", "src", "spa", "App.tsx"), "utf8");

  for (const expected of [
    "/",
    "/feed",
    "/tasks",
    "/orders/:id",
    "/jury",
    "/jury/voting",
    "/admin/login",
    "/admin/dashboard",
    "/admin/ai/config"
  ]) {
    record(routePaths.has(expected), `legacy route pattern exists: ${expected}`);
  }

  for (const expected of ["/orders/demo", "/posts/demo", "/users/demo", "/disputes/demo"]) {
    record(entryPaths.has(expected), `dynamic route entry path exists: ${expected}`);
  }

  for (const expectedId of ["jury-hall", "jury-voting"]) {
    record(routeIds.has(expectedId), `legacy route id exists: ${expectedId}`);
    record(spaRoutes.includes(`id: "${expectedId}"`), `SPA route metadata exists: ${expectedId}`);
  }
  record(spaRoutes.includes('path: "/jury/disputes/:id"'), "SPA route metadata includes jury dispute voting deep link");
  record(appSource.includes("NavLink") && appSource.includes("Link"), "SPA shell uses React Router navigation primitives");

  record(new Set(routes.map((item) => item.id)).size === routes.length, "SPA route ids are unique");
  record(routes.every((item) => !("source" in item)), "SPA route metadata has no prototype source field");
  record(responsiveViewports.some((item) => item.width === 390), "mobile validation viewport is registered");
  record(responsiveViewports.some((item) => item.width === 820), "tablet validation viewport is registered");
  record(responsiveViewports.some((item) => item.width === 1440), "desktop validation viewport is registered");
}

async function checkServers() {
  const backend = createBackendServer();
  const frontend = createFrontendServer({
    env: {
      NODE_ENV: "development",
      FRONTEND_MODE: "spa",
      API_BASE_URL: "http://127.0.0.1:3001",
      APP_ENV: "stage01",
      BUILD_VERSION: "stage01"
    }
  });
  const backendPort = await listen(backend);
  const frontendPort = await listen(frontend);
  const baseUrl = `http://127.0.0.1:${frontendPort}`;

  try {
    const health = await fetchJson(`http://127.0.0.1:${backendPort}/api/health`);
    record(health.status === "ok", "backend health check returns ok");

    const frontendHealth = await fetchJson(`${baseUrl}/frontend-health`);
    record(frontendHealth.frontendMode === "spa", "frontend health reports SPA mode");

    const routesResponse = await fetchJson(`${baseUrl}/routes.json`);
    record(routesResponse.length === routes.length, "frontend exposes route manifest");
    record(routesResponse.some((item) => item.id === "jury-hall" && item.auth === "user"), "route manifest exposes jury hall metadata");

    for (const expectedPath of ["/", "/feed", "/tasks", "/orders/demo", "/disputes/demo", "/jury", "/jury/disputes/demo", "/admin/dashboard"]) {
      const response = await fetch(`${baseUrl}${expectedPath}`);
      const html = await response.text();
      record(response.ok && html.includes('id="root"'), `SPA fallback serves index for ${expectedPath}`);
      record(!html.includes("prototype-shell.mjs"), `SPA fallback does not load prototype shell for ${expectedPath}`);
    }

    const legacyResponse = await fetch(`${baseUrl}/screens/feed.html`, { redirect: "manual" });
    record(legacyResponse.status === 302 && legacyResponse.headers.get("location") === "/feed", "legacy prototype URL redirects to production route");

    const apiResponse = await fetch(`${baseUrl}/api/health`);
    record(apiResponse.status === 404, "frontend server does not swallow /api/* paths with SPA fallback");

    const missingStatic = await fetch(`${baseUrl}/assets/missing-stage01.js`);
    record(missingStatic.status === 404, "missing static asset returns 404 instead of SPA fallback");
  } finally {
    await close(backend);
    await close(frontend);
  }
}

function record(ok, message) {
  checks.push({ ok: Boolean(ok), message });
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

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${url} ${response.status}`);
  }
  return response.json();
}
