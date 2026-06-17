import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { appRoutes, routePath, routePayload } from "../frontend/src/spa/route-data.mjs";
import { createRuntimeConfig, DIST_ROOT } from "../frontend/src/spa/server-runtime.mjs";

const projectRoot = process.cwd();
const distRoot = DIST_ROOT;

const viteBin = path.join(projectRoot, "node_modules", "vite", "bin", "vite.js");
const result = spawnSync(process.execPath, [viteBin, "build"], {
  cwd: projectRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    BUILD_VERSION: process.env.BUILD_VERSION ?? "dev"
  }
});

if (result.status !== 0) {
  if (result.error) {
    console.error(result.error.message);
  }
  process.exit(result.status ?? 1);
}

emitRuntimeConfigFiles();
emitRouteManifest();
emitDeploymentManifest();

console.log(`Built React SPA frontend in ${path.relative(projectRoot, distRoot)}`);

function emitRuntimeConfigFiles() {
  const mode = process.env.NODE_ENV ?? "development";
  const config = createRuntimeConfig({
    env: {
      ...process.env,
      API_BASE_URL: process.env.API_BASE_URL ?? (mode === "production" ? "" : "http://127.0.0.1:3001"),
      APP_ENV: process.env.APP_ENV ?? (mode === "production" ? "production" : "development"),
      BUILD_VERSION: process.env.BUILD_VERSION ?? "dev",
      SENTRY_DSN: process.env.SENTRY_DSN ?? "",
      SENTRY_TRACES_SAMPLE_RATE: process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0",
      SENTRY_INGEST_ORIGIN: process.env.SENTRY_INGEST_ORIGIN ?? ""
    },
    mode
  });
  fs.writeFileSync(path.join(distRoot, "config.json"), `${JSON.stringify(config, null, 2)}\n`);
  fs.writeFileSync(path.join(distRoot, "config.template.json"), `${JSON.stringify({
    apiBaseUrl: "${API_BASE_URL}",
    appEnv: "${APP_ENV}",
    buildVersion: "${BUILD_VERSION}",
    sentryDsn: "${SENTRY_DSN}",
    sentryTracesSampleRate: "${SENTRY_TRACES_SAMPLE_RATE}",
    sentryIngestOrigin: "${SENTRY_INGEST_ORIGIN}"
  }, null, 2)}\n`);
}

function emitRouteManifest() {
  fs.writeFileSync(path.join(distRoot, "routes.json"), `${JSON.stringify(routePayload(), null, 2)}\n`);
}

function emitDeploymentManifest() {
  const viteManifestPath = path.join(distRoot, ".vite", "manifest.json");
  const viteManifest = fs.existsSync(viteManifestPath)
    ? JSON.parse(fs.readFileSync(viteManifestPath, "utf8"))
    : {};
  const assets = {};
  for (const file of listFiles(path.join(distRoot, "assets"))) {
    const relative = slash(path.relative(distRoot, file));
    assets[`/${relative}`] = `/${relative}`;
  }
  fs.writeFileSync(path.join(distRoot, "manifest.json"), `${JSON.stringify({
    buildVersion: process.env.BUILD_VERSION ?? "dev",
    environment: process.env.APP_ENV ?? (process.env.NODE_ENV === "production" ? "production" : "development"),
    builtAt: new Date().toISOString(),
    type: "vite-react-spa",
    frontendMode: "spa",
    assets,
    vite: viteManifest,
    routes: Object.fromEntries(appRoutes.map((route) => [route.id, {
      path: route.path,
      entryPath: routePath(route),
      auth: route.auth,
      nav: route.nav
    }]))
  }, null, 2)}\n`);
}

function listFiles(root) {
  if (!fs.existsSync(root)) return [];
  const entries = fs.readdirSync(root, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const filePath = path.join(root, entry.name);
    return entry.isDirectory() ? listFiles(filePath) : [filePath];
  });
}

function slash(value) {
  return value.replace(/\\/g, "/");
}
