import path from "node:path";
import { fileURLToPath } from "node:url";

const CURRENT_FILE = fileURLToPath(import.meta.url);
export const SPA_ROOT = path.dirname(CURRENT_FILE);
export const FRONTEND_SRC_ROOT = path.resolve(SPA_ROOT, "..");
export const FRONTEND_ROOT = path.resolve(FRONTEND_SRC_ROOT, "..");
export const PROJECT_ROOT = path.resolve(FRONTEND_ROOT, "..");
export const DIST_ROOT = path.join(FRONTEND_ROOT, "dist");

export function createRuntimeConfig(options = {}) {
  const env = options.env ?? process.env;
  const mode = options.mode ?? env.NODE_ENV ?? "development";
  const isProduction = mode === "production";
  const apiBaseUrl = env.API_BASE_URL ?? (isProduction ? "" : `http://127.0.0.1:${env.BACKEND_PORT ?? "3001"}`);
  const sentryDsn = env.SENTRY_DSN ?? "";

  if (isProduction && !apiBaseUrl) {
    throw new Error("API_BASE_URL is required when NODE_ENV=production.");
  }
  if (apiBaseUrl && !isHttpUrl(apiBaseUrl)) {
    throw new Error("API_BASE_URL must be an absolute http(s) URL.");
  }
  if (sentryDsn && !isHttpUrl(sentryDsn)) {
    throw new Error("SENTRY_DSN must be an absolute http(s) URL when configured.");
  }

  return {
    apiBaseUrl,
    appEnv: env.APP_ENV ?? (isProduction ? "production" : "development"),
    buildVersion: env.BUILD_VERSION ?? "dev",
    sentryDsn,
    sentryTracesSampleRate: numberValue(env.SENTRY_TRACES_SAMPLE_RATE, 0),
    sentryIngestOrigin: env.SENTRY_INGEST_ORIGIN ?? (sentryDsn ? new URL(sentryDsn).origin : "")
  };
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function numberValue(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
