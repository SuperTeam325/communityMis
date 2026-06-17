import type { AppRoute } from "./types";

export const appRoutes: AppRoute[];
export const userNav: Array<{ id: string; label: string; path: string }>;
export const adminNav: Array<{ id: string; label: string; path: string }>;
export const responsiveViewports: Array<{ name: string; width: number; height: number }>;
export const legacyRedirects: Map<string, string>;
export function routeById(id: string): AppRoute | undefined;
export function routePath(route?: AppRoute | null): string;
export function titleForPath(pathname: string): string;
export function routePayload(): Array<{
  id: string;
  title: string;
  path: string;
  entryPath: string;
  surface: string;
  layout: string;
  auth?: string;
  nav?: string;
}>;
export function normalizePathname(pathname: string): string;
export function resolveLegacyRedirect(pathname: string, searchParams?: URLSearchParams): string | null;
export function matchRoute(pathname: string): AppRoute | null;
