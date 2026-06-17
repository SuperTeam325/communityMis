import {
  adminNav,
  appRoutes as rawAppRoutes,
  responsiveViewports,
  routeById as findRouteById,
  titleForPath,
  userNav
} from "./route-data.mjs";
import type { AppRoute } from "./types";

export const appRoutes = rawAppRoutes as AppRoute[];
export { adminNav, responsiveViewports, titleForPath, userNav };

export function routeById(id: string): AppRoute | undefined {
  return findRouteById(id) as AppRoute | undefined;
}
