import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildRouteIndexHtml, PROJECT_ROOT, renderPrototypeHtml, UI_SOURCE_ROOT } from "./src/prototypeRenderer.mjs";
import { resolveRoute, routePath, routes } from "./src/routes.mjs";

const CURRENT_FILE = fileURLToPath(import.meta.url);
const FRONTEND_ROOT = path.dirname(CURRENT_FILE);

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
  [".webp", "image/webp"]
]);

const staticMounts = [
  { prefix: "/css/", root: path.join(UI_SOURCE_ROOT, "css") },
  { prefix: "/js/", root: path.join(UI_SOURCE_ROOT, "js") },
  { prefix: "/assets/styles/", root: path.join(FRONTEND_ROOT, "public", "styles") },
  { prefix: "/assets/app/", root: path.join(FRONTEND_ROOT, "src") }
];

export function createFrontendServer() {
  return http.createServer((request, response) => {
    handleRequest(request, response);
  });
}

export function handleRequest(request, response) {
  const url = new URL(request.url, `http://${request.headers.host ?? "127.0.0.1"}`);

  if (!["GET", "HEAD"].includes(request.method)) {
    sendText(response, 405, "Method Not Allowed", request.method === "HEAD");
    return;
  }

  if (serveStatic(url.pathname, response, request.method === "HEAD")) {
    return;
  }

  if (url.pathname === "/routes.json") {
    sendJson(response, 200, routes.map((item) => ({
      id: item.id,
      title: item.title,
      source: item.source,
      path: item.path,
      entryPath: routePath(item),
      surface: item.surface,
      layout: item.layout
    })), request.method === "HEAD");
    return;
  }

  const { route, redirectTo } = resolveRoute(url.pathname);
  if (redirectTo) {
    response.writeHead(302, { location: redirectTo });
    response.end();
    return;
  }

  if (route) {
    sendHtml(response, 200, renderPrototypeHtml(route), request.method === "HEAD");
    return;
  }

  sendHtml(response, 404, buildRouteIndexHtml(), request.method === "HEAD");
}

function serveStatic(pathname, response, isHead) {
  for (const mount of staticMounts) {
    if (!pathname.startsWith(mount.prefix)) {
      continue;
    }

    const relativePath = pathname.slice(mount.prefix.length);
    const filePath = safeJoin(mount.root, relativePath);
    if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      sendText(response, 404, "Not Found", isHead);
      return true;
    }

    const contentType = MIME_TYPES.get(path.extname(filePath)) ?? "application/octet-stream";
    response.writeHead(200, {
      "content-type": contentType,
      "cache-control": "no-store"
    });
    if (!isHead) {
      response.end(fs.readFileSync(filePath));
    } else {
      response.end();
    }
    return true;
  }

  return false;
}

function safeJoin(root, relativePath) {
  const decoded = decodeURIComponent(relativePath);
  const target = path.resolve(root, decoded);
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }
  return target;
}

function sendJson(response, status, payload, isHead = false) {
  const body = JSON.stringify(payload, null, 2);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(isHead ? undefined : body);
}

function sendHtml(response, status, body, isHead = false) {
  response.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(isHead ? undefined : body);
}

function sendText(response, status, body, isHead = false) {
  response.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(isHead ? undefined : body);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.FRONTEND_PORT ?? 5173);
  createFrontendServer().listen(port, "127.0.0.1", () => {
    console.log(`Frontend routes: http://127.0.0.1:${port}`);
    console.log(`Project root: ${PROJECT_ROOT}`);
  });
}
