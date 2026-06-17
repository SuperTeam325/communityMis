export const SPA_ROOT: string;
export const FRONTEND_SRC_ROOT: string;
export const FRONTEND_ROOT: string;
export const PROJECT_ROOT: string;
export const DIST_ROOT: string;
export function createRuntimeConfig(options?: {
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  mode?: string;
}): {
  apiBaseUrl: string;
  appEnv: string;
  buildVersion: string;
  sentryDsn: string;
  sentryTracesSampleRate: number;
  sentryIngestOrigin: string;
};
