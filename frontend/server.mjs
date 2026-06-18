import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { resolveLegacyRedirect, routePayload } from "./src/spa/route-data.mjs";
import { createRuntimeConfig, DIST_ROOT, PROJECT_ROOT } from "./src/spa/server-runtime.mjs";

const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".map", "application/json; charset=utf-8"]
]);

export function createFrontendServer(options = {}) {
  const runtime = createServerRuntime(options);
  return http.createServer((request, response) => {
    handleRequest(request, response, runtime);
  });
}

export function handleRequest(request, response, runtime = createServerRuntime()) {
  const url = new URL(request.url, `http://${request.headers.host ?? "127.0.0.1"}`);
  const isHead = request.method === "HEAD";

  if (!["GET", "HEAD"].includes(request.method)) {
    sendText(response, 405, "Method Not Allowed", isHead, runtime);
    return;
  }

  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
    sendText(response, 404, "Not Found", isHead, runtime);
    return;
  }

  const legacyTarget = resolveLegacyRedirect(url.pathname, url.searchParams);
  if (legacyTarget && legacyTarget !== url.pathname) {
    response.writeHead(302, {
      ...securityHeaders(runtime),
      "cache-control": "no-cache",
      location: legacyTarget
    });
    response.end();
    return;
  }

  if (url.pathname === "/config.json") {
    sendJson(response, 200, runtime.config, isHead, runtime);
    return;
  }

  if (url.pathname === "/frontend-health") {
    sendJson(response, 200, frontendHealthPayload(runtime), isHead, runtime);
    return;
  }

  if (url.pathname === "/routes.json") {
    sendJson(response, 200, routePayload(), isHead, runtime);
    return;
  }

  if (url.pathname === "/manifest.json") {
    serveFile(response, path.join(runtime.distRoot, "manifest.json"), isHead, runtime, "no-cache");
    return;
  }

  const staticFile = resolveStaticFile(runtime, url.pathname);
  if (staticFile) {
    serveFile(response, staticFile, isHead, runtime, staticCacheControl(staticFile));
    return;
  }

  if (isStaticPath(url.pathname)) {
    sendText(response, 404, "Not Found", isHead, runtime);
    return;
  }

  sendIndex(response, isHead, runtime);
}

function createServerRuntime(options = {}) {
  const env = options.env ?? process.env;
  const mode = options.mode ?? env.NODE_ENV ?? "development";
  const config = options.runtimeConfig ?? createRuntimeConfig({ env, mode });
  return {
    config,
    distRoot: options.distRoot ?? DIST_ROOT,
    mode,
    frontendMode: "spa",
    isProduction: mode === "production"
  };
}

function frontendHealthPayload(runtime) {
  return {
    status: "ok",
    service: "community-mis-frontend",
    version: runtime.config.buildVersion,
    appEnv: runtime.config.appEnv,
    frontendMode: runtime.frontendMode,
    timestamp: new Date().toISOString()
  };
}

function resolveStaticFile(runtime, pathname) {
  const decoded = decodeURIComponent(pathname);
  const target = safeJoin(runtime.distRoot, decoded.slice(1));
  if (target && fs.existsSync(target) && fs.statSync(target).isFile()) {
    return target;
  }
  return null;
}

function sendIndex(response, isHead, runtime) {
  const indexPath = path.join(runtime.distRoot, "index.html");
  if (!fs.existsSync(indexPath)) {
    sendText(response, 503, "Frontend build not found. Run npm run build.", isHead, runtime);
    return;
  }
  serveFile(response, indexPath, isHead, runtime, "no-cache");
}

function serveFile(response, filePath, isHead, runtime, cacheControl) {
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    sendText(response, 404, "Not Found", isHead, runtime);
    return;
  }
  const contentType = MIME_TYPES.get(path.extname(filePath)) ?? "application/octet-stream";
  response.writeHead(200, {
    ...securityHeaders(runtime),
    "content-type": contentType,
    "cache-control": cacheControl
  });
  response.end(isHead ? undefined : fs.readFileSync(filePath));
}

function safeJoin(root, relativePath) {
  const target = path.resolve(root, relativePath);
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }
  return target;
}

function sendJson(response, status, payload, isHead = false, runtime = createServerRuntime()) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    ...securityHeaders(runtime),
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-cache"
  });
  response.end(isHead ? undefined : body);
}

function sendText(response, status, body, isHead = false, runtime = createServerRuntime()) {
  response.writeHead(status, {
    ...securityHeaders(runtime),
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-cache"
  });
  response.end(isHead ? undefined : body);
}

function staticCacheControl(filePath) {
  return isHashedAsset(filePath) ? "public, max-age=31536000, immutable" : "no-cache";
}

function isStaticPath(pathname) {
  return ["/assets/", "/css/", "/js/", "/ui/", "/styles/"].some((prefix) => pathname.startsWith(prefix))
    || /\.[A-Za-z0-9]{2,8}$/.test(pathname);
}

function isHashedAsset(filePath) {
  return /\.[A-Za-z0-9_-]{8,}\./.test(path.basename(filePath));
}

function securityHeaders(runtime) {
  return {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Content-Security-Policy": contentSecurityPolicy(runtime.config)
  };
}

export function contentSecurityPolicy(config) {
  const connectSources = ["'self'", originOrSelf(config.apiBaseUrl)];
  const imageSources = ["'self'", "data:", "blob:", originOrSelf(config.apiBaseUrl)];
  if (config.sentryIngestOrigin) {
    connectSources.push(originOrSelf(config.sentryIngestOrigin));
  }
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `img-src ${Array.from(new Set(imageSources)).join(" ")}`,
    "font-src 'self' data:",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `connect-src ${Array.from(new Set(connectSources)).join(" ")}`
  ].join("; ");
}

function originOrSelf(value) {
  try {
    return new URL(value).origin;
  } catch {
    return "'self'";
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.FRONTEND_PORT ?? 5173);
  const host = process.env.BIND_HOST ?? process.env.FRONTEND_BIND_HOST ?? "127.0.0.1";
  try {
    createFrontendServer().listen(port, host, () => {
      console.log(`Frontend SPA: http://${host}:${port}`);
      console.log(`Mode: ${process.env.NODE_ENV === "production" ? "production" : "development"}`);
      console.log(`Project root: ${PROJECT_ROOT}`);
    });
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
