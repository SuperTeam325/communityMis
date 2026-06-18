import { createBackendServer } from "../backend/src/app.mjs";
import { createFrontendServer } from "../frontend/server.mjs";
import { appRoutes, responsiveViewports, routePath } from "../frontend/src/spa/route-data.mjs";
import { chromium } from "playwright";

const checks = [];
const publicRoutes = visualRoutesFor("none");
const userRoutes = visualRoutesFor("user");
const adminRoutes = visualRoutesFor("admin");

await run();

async function run() {
  const frontendPort = await reservePort();
  const frontendOrigin = `http://127.0.0.1:${frontendPort}`;
  const backend = createBackendServer({
    sessionSecret: "visual-test-secret",
    env: {
      NODE_ENV: "test",
      CORS_ORIGIN: frontendOrigin
    }
  });
  const backendPort = await listen(backend);
  const frontend = createFrontendServer({
    env: {
      NODE_ENV: "production",
      API_BASE_URL: `http://127.0.0.1:${backendPort}`,
      APP_ENV: "visual",
      BUILD_VERSION: "visual"
    }
  });
  await listen(frontend, frontendPort);
  const baseUrl = frontendOrigin;

  try {
    await runVisualSmoke(baseUrl);
  } finally {
    await close(frontend);
    await close(backend);
  }

  for (const item of checks) {
    console.log(`${item.ok ? "ok" : "fail"} - ${item.message}`);
  }
  if (checks.some((item) => !item.ok)) {
    process.exitCode = 1;
  }
}

async function runVisualSmoke(baseUrl) {
  const browser = await chromium.launch();
  try {
    for (const viewport of responsiveViewports) {
      const publicPage = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
      const userPage = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
      const adminPage = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
      try {
        await loginUser(userPage, baseUrl);
        await loginAdmin(adminPage, baseUrl);
        await scanRouteGroup(publicPage, baseUrl, publicRoutes, viewport);
        await scanRouteGroup(userPage, baseUrl, userRoutes, viewport);
        await scanRouteGroup(adminPage, baseUrl, adminRoutes, viewport);
      } finally {
        await publicPage.close().catch(() => {});
        await userPage.close().catch(() => {});
        await adminPage.close().catch(() => {});
      }
    }
  } finally {
    await browser.close();
  }
}

async function scanRouteGroup(page, baseUrl, routes, viewport) {
  for (const route of routes) {
    await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });
    const result = await page.evaluate(() => ({
      title: document.title,
      routeId: document.documentElement.dataset.routeId,
      runtimeError: document.documentElement.dataset.runtimeError ?? null,
      horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth) > 0,
      bodyWidth: document.documentElement.scrollWidth,
      viewport: window.innerWidth
    }));
    record(result.runtimeError === null, `${route} has no runtime error at ${viewport.width}x${viewport.height}`);
    record(result.horizontalOverflow === false, `${route} has no horizontal overflow at ${viewport.width}x${viewport.height}`);
  }
}

async function loginUser(page, baseUrl) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
  await page.locator("#login-username").fill("user_a");
  await page.locator("#login-password").fill("user123456");
  await page.locator("#login-submit").click();
  await page.waitForURL(/\/feed$/);
}

async function loginAdmin(page, baseUrl) {
  await page.goto(`${baseUrl}/admin/login`, { waitUntil: "networkidle" });
  await page.locator("#admin-account").fill("admin_main");
  await page.locator("#admin-password").fill("admin123456");
  await page.locator("#login-submit").click();
  await page.waitForURL(/\/admin\/dashboard$/);
}

function record(ok, message) {
  checks.push({ ok: Boolean(ok), message });
}

function visualRoutesFor(auth) {
  return [...new Set(appRoutes.filter((route) => route.auth === auth).map(routePath))];
}

function listen(server, port = 0) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(server.address().port);
    });
  });
}

function reservePort() {
  const probe = createBackendServer({ sessionSecret: "visual-port-probe" });
  return new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      probe.off("error", reject);
      const address = probe.address();
      probe.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        if (typeof address === "object" && address?.port) {
          resolve(address.port);
        } else {
          reject(new Error("Port probe did not expose a port."));
        }
      });
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}
