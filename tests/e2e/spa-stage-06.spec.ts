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
    sessionSecret: "spa-stage06-e2e-secret",
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
      APP_ENV: "spa-stage06-e2e",
      BUILD_VERSION: "spa-stage06-e2e"
    }
  });
  await listen(frontend, frontendPort);
});

test.afterAll(async () => {
  await Promise.all([close(frontend), close(backend)]);
});

test("admin core pages hydrate and expose explicit management UI", async ({ page }) => {
  await loginAdmin(page, "admin_main", "admin123456");

  await page.goto(`${frontendBaseUrl}/admin/users`);
  await expect(page.locator("html")).toHaveAttribute("data-route-id", "admin-users");
  await expect(page.locator(".page-header").getByRole("heading", { name: "用户管理" })).toBeVisible();
  await page.getByLabel("关键词").fill("user");
  await expect(page).toHaveURL(/keyword=user/);

  await page.goto(`${frontendBaseUrl}/admin/transactions`);
  await expect(page.locator("html")).toHaveAttribute("data-route-id", "admin-transactions");
  await expect(page.locator(".page-header").getByRole("heading", { name: "交易流水" })).toBeVisible();
  await page.getByLabel("类型").selectOption("freeze");
  await expect(page).toHaveURL(/type=freeze/);

  await page.goto(`${frontendBaseUrl}/admin/risk-content`);
  await expect(page.locator("html")).toHaveAttribute("data-route-id", "admin-risk-content");
  await expect(page.locator(".page-header").getByRole("heading", { name: "内容风险审核" })).toBeVisible();
  const singleReview = page.locator("tbody").getByRole("button", { name: "复核" }).first();
  if (await singleReview.count()) {
    await expect(singleReview).toBeEnabled();
  }

  await page.goto(`${frontendBaseUrl}/admin/audit-log`);
  await expect(page.locator("html")).toHaveAttribute("data-route-id", "admin-audit-log");
  await expect(page.locator(".page-header").getByRole("heading", { name: "审计日志" })).toBeVisible();

  await page.goto(`${frontendBaseUrl}/admin/system`);
  await expect(page.locator("html")).toHaveAttribute("data-route-id", "admin-system");
  await expect(page.locator(".page-header").getByRole("heading", { name: "系统设置" })).toBeVisible();
  await expect(page.getByRole("button", { name: "预览清理" })).toBeVisible();
});

async function loginAdmin(page: Page, username: string, password: string) {
  await page.goto(`${frontendBaseUrl}/admin/login`);
  await page.locator("input[name='username']").fill(username);
  await page.locator("input[name='password']").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
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
  const probe = createBackendServer({ sessionSecret: "port-probe-secret-stage06" });
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
