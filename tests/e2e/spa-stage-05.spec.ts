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
    sessionSecret: "spa-stage05-e2e-secret",
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
      APP_ENV: "spa-stage05-e2e",
      BUILD_VERSION: "spa-stage05-e2e"
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

test("user can chat with AI, send feedback, and open AI filter results", async ({ page }) => {
  await loginUser(page, "user_a", "user123456");

  await page.goto(`${frontendBaseUrl}/ai/assistant`);
  await expect(page.locator("html")).toHaveAttribute("data-route-id", "ai-assistant");
  await expect(page.getByRole("heading", { name: "AI 助手", exact: true })).toBeVisible();

  await page.getByLabel("输入问题").fill("如何发起纠纷？");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.getByRole("button", { name: "有用" }).first()).toBeVisible();
  await page.getByRole("button", { name: "有用" }).first().click();
  await expect(page.getByRole("button", { name: "已有用" }).first()).toBeVisible();

  await page.goto(`${frontendBaseUrl}/ai/results?prompt=${encodeURIComponent("找一个信用高的英语辅导需求")}`);
  await expect(page.locator("html")).toHaveAttribute("data-route-id", "ai-results");
  await expect(page.getByRole("heading", { name: "AI 筛选结果" })).toBeVisible();
  await expect(page.getByText("推荐需求")).toBeVisible();
});

test("admin AI governance pages hydrate and allow core operations", async ({ page }) => {
  await loginAdmin(page, "admin_main", "admin123456");

  await page.goto(`${frontendBaseUrl}/admin/ai/logs`);
  await expect(page.locator("html")).toHaveAttribute("data-route-id", "admin-ai-logs");
  await expect(page.locator(".page-header").getByRole("heading", { name: "AI 日志管理" })).toBeVisible();

  await page.goto(`${frontendBaseUrl}/admin/ai/conversations`);
  await expect(page.locator("html")).toHaveAttribute("data-route-id", "admin-ai-conversations");
  await expect(page.locator(".page-header").getByRole("heading", { name: "AI 会话管理" })).toBeVisible();

  await page.goto(`${frontendBaseUrl}/admin/ai/feedback`);
  await expect(page.locator("html")).toHaveAttribute("data-route-id", "admin-ai-feedback");
  await expect(page.locator(".page-header").getByRole("heading", { name: "AI 用户反馈" })).toBeVisible();
  const reportButton = page.getByRole("button", { name: "生成周报" });
  await reportButton.click();
  await expect(reportButton).toBeEnabled();

  await page.goto(`${frontendBaseUrl}/admin/ai/errors`);
  await expect(page.locator("html")).toHaveAttribute("data-route-id", "admin-ai-errors");
  await expect(page.locator(".page-header").getByRole("heading", { name: "AI 异常调用" })).toBeVisible();
  const incidentButton = page.getByRole("button", { name: "创建事件单" });
  if (await page.getByRole("checkbox").count()) {
    await page.getByRole("checkbox").first().check();
    await incidentButton.click();
    await expect(incidentButton).toBeEnabled();
  }

  await page.goto(`${frontendBaseUrl}/admin/ai/config`);
  await expect(page.locator("html")).toHaveAttribute("data-route-id", "admin-ai-config");
  await expect(page.locator(".page-header").getByRole("heading", { name: "AI 配置管理" })).toBeVisible();
  await page.getByLabel("每小时上限").fill("61");
  await page.getByRole("button", { name: "保存配置" }).click();
  await expect(page.getByRole("button", { name: "保存配置" })).toBeEnabled();
});

async function loginUser(page: Page, username: string, password: string) {
  await page.goto(`${frontendBaseUrl}/login`);
  await page.locator("input[name='username']").fill(username);
  await page.locator("input[name='password']").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/feed$/);
}

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
  const probe = createBackendServer({ sessionSecret: "port-probe-secret" });
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
