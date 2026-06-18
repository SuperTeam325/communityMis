import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { createBackendServer } from "../../backend/src/app.mjs";
import { createFrontendServer } from "../../frontend/server.mjs";

let backend: ReturnType<typeof createBackendServer>;
let frontend: ReturnType<typeof createFrontendServer>;
let frontendBaseUrl: string;

test.beforeAll(async () => {
  const frontendPort = await freePort();
  frontendBaseUrl = `http://127.0.0.1:${frontendPort}`;
  backend = createBackendServer({
    sessionSecret: "spa-runtime-navigation-secret",
    env: {
      NODE_ENV: "test",
      CORS_ORIGIN: frontendBaseUrl
    }
  });
  const backendPort = await listen(backend);

  frontend = createFrontendServer({
    env: {
      NODE_ENV: "production",
      API_BASE_URL: `http://127.0.0.1:${backendPort}`,
      APP_ENV: "spa-runtime-navigation",
      BUILD_VERSION: "spa-runtime-navigation"
    }
  });
  await listen(frontend, frontendPort);
});

test.afterAll(async () => {
  await Promise.all([
    close(frontend),
    close(backend)
  ]);
});

test("direct dynamic route refreshes render through the SPA", async ({ browser }) => {
  const userContext = await browser.newContext();
  const juryContext = await browser.newContext();
  const userPage = await userContext.newPage();
  const juryPage = await juryContext.newPage();

  try {
    await loginUser(userPage, "user_a", "user123456");
    for (const [route, routeId] of [
      ["/posts/2001", "post-detail"],
      ["/orders/3001", "order-detail"],
      ["/disputes/8001", "dispute-detail"]
    ] as const) {
      await userPage.goto(`${frontendBaseUrl}${route}`, { waitUntil: "networkidle" });
      await expect(userPage.locator("html")).toHaveAttribute("data-route-id", routeId);
      await expect(userPage.locator("html")).not.toHaveAttribute("data-runtime-error", "true");
      await userPage.reload({ waitUntil: "networkidle" });
      await expect(userPage.locator("html")).toHaveAttribute("data-route-id", routeId);
    }

    await loginUser(juryPage, "user_b", "user123456");
    await juryPage.goto(`${frontendBaseUrl}/jury/disputes/8001`, { waitUntil: "networkidle" });
    await expect(juryPage.locator("html")).toHaveAttribute("data-route-id", "jury-dispute-voting");
    await juryPage.reload({ waitUntil: "networkidle" });
    await expect(juryPage.locator("html")).toHaveAttribute("data-route-id", "jury-dispute-voting");
  } finally {
    await userContext.close().catch(() => {});
    await juryContext.close().catch(() => {});
  }
});

test("React Router navigation preserves the current document", async ({ page }) => {
  await loginUser(page, "user_a", "user123456");
  await page.goto(`${frontendBaseUrl}/feed`, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    (window as any).__spaNavigationMarker = `marker-${Date.now()}`;
  });
  const beforeNavigationCount = await page.evaluate(() => performance.getEntriesByType("navigation").length);

  await page.locator(".feed-content .card").first().click();
  await expect(page).toHaveURL(/\/posts\/\d+$/);
  await expect(page.locator("html")).toHaveAttribute("data-route-id", "post-detail");
  await expect.poll(() => page.evaluate(() => (window as any).__spaNavigationMarker as string)).toMatch(/^marker-/);
  await expect.poll(() => page.evaluate(() => performance.getEntriesByType("navigation").length)).toBe(beforeNavigationCount);
});

test("protected route guards stay inside the SPA", async ({ page }) => {
  await page.goto(`${frontendBaseUrl}/orders/3001`, { waitUntil: "networkidle" });
  await expect(page).toHaveURL(/\/login\?redirect=%2Forders%2F3001$/);
  await expect(page.locator("html")).toHaveAttribute("data-route-id", "login");

  await loginUser(page, "user_a", "user123456");
  await page.goto(`${frontendBaseUrl}/admin/dashboard`, { waitUntil: "networkidle" });
  await expect(page).toHaveURL(/\/admin\/login\?redirect=%2Fadmin%2Fdashboard$/);
  await expect(page.locator("html")).toHaveAttribute("data-route-id", "admin-login");
});

test("local mutations refresh only the affected SPA data", async ({ page }) => {
  await loginUser(page, "user_a", "user123456");

  await page.goto(`${frontendBaseUrl}/messages?userId=1002`, { waitUntil: "networkidle" });
  const message = `SPA 局部刷新消息 ${Date.now()}`;
  await page.locator("input[placeholder='消息内容']").fill(message);
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.getByText(message)).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-route-id", "messages");

  await page.goto(`${frontendBaseUrl}/notifications`, { waitUntil: "networkidle" });
  const unreadCards = page.locator(".notif-card.unread");
  const unreadCount = await unreadCards.count();
  if (unreadCount > 0) {
    await page.getByRole("button", { name: "标为已读" }).first().click();
    await expect(unreadCards).toHaveCount(unreadCount - 1);
  }
  await expect(page.locator("html")).toHaveAttribute("data-route-id", "notifications");
});

async function loginUser(page: Page, username: string, password: string) {
  await page.goto(`${frontendBaseUrl}/login`, { waitUntil: "networkidle" });
  await page.locator("input[name='username']").fill(username);
  await page.locator("input[name='password']").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/feed$/);
}

function listen(server: ReturnType<typeof createBackendServer>, port = 0) {
  return new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();
      if (typeof address === "object" && address?.port) {
        resolve(address.port);
      } else {
        reject(new Error("Server did not expose a port."));
      }
    });
  });
}

function freePort() {
  const probe = createBackendServer({ sessionSecret: "spa-runtime-navigation-port-probe" });
  return new Promise<number>((resolve, reject) => {
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

function close(server: ReturnType<typeof createBackendServer> | undefined) {
  return new Promise<void>((resolve, reject) => {
    if (!server?.listening) {
      resolve();
      return;
    }
    server.close((error) => error ? reject(error) : resolve());
  });
}
