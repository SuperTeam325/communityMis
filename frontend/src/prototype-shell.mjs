import { createApiClient } from "/assets/app/api-client.mjs";

const route = window.__NEIGHBOR_ROUTE__ ?? {
  id: "unknown",
  currentPath: window.location.pathname,
  surface: "unknown"
};

document.documentElement.dataset.routeId = route.id;
document.documentElement.dataset.routeSurface = route.surface;

window.NeighborApp = {
  route,
  api: createApiClient({
    baseUrl: window.__API_BASE_URL__ ?? "http://127.0.0.1:3001"
  })
};

for (const link of document.querySelectorAll("a[href]")) {
  const url = new URL(link.getAttribute("href"), window.location.href);
  if (url.origin === window.location.origin && normalizePath(url.pathname) === normalizePath(window.location.pathname)) {
    link.dataset.currentRoute = "true";
    if (!link.hasAttribute("aria-current")) {
      link.setAttribute("aria-current", "page");
    }
  }
}

function normalizePath(pathname) {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}
