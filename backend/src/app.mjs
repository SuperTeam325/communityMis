import http from "node:http";
import { healthPayload } from "./routes/health.mjs";

export function createBackendServer(options = {}) {
  const startedAt = options.startedAt ?? new Date();

  return http.createServer((request, response) => {
    response.setHeader("access-control-allow-origin", "*");
    response.setHeader("access-control-allow-methods", "GET,HEAD,OPTIONS");
    response.setHeader("access-control-allow-headers", "content-type,authorization");

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    const url = new URL(request.url, `http://${request.headers.host ?? "127.0.0.1"}`);

    if (url.pathname === "/api/health" && ["GET", "HEAD"].includes(request.method)) {
      sendJson(response, 200, healthPayload(startedAt), request.method === "HEAD");
      return;
    }

    sendJson(response, 404, {
      error: {
        code: "NOT_FOUND",
        message: "The requested API endpoint does not exist."
      }
    });
  });
}

function sendJson(response, status, payload, isHead = false) {
  const body = JSON.stringify(payload, null, 2);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(isHead ? undefined : body);
}
