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
    sessionSecret: "spa-stage03-e2e-secret",
    env: {
      NODE_ENV: "test",
      CORS_ORIGIN: frontendBaseUrl
    }
  });
  const backendPort = await listen(backend);

  frontend = createFrontendServer({
    env: {
      NODE_ENV: "production",
      FRONTEND_MODE: "spa",
      API_BASE_URL: `http://127.0.0.1:${backendPort}`,
      APP_ENV: "spa-stage03-e2e",
      BUILD_VERSION: "spa-stage03-e2e"
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

test("SPA user loop can publish, accept, confirm, and review", async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  const title = `SPA 闭环 ${Date.now()}`;

  try {
    await loginUser(pageA, "user_a", "user123456");
    await loginUser(pageB, "user_b", "user123456");

    await pageA.goto(`${frontendBaseUrl}/post`);
    await pageA.locator("#task-title").fill(title);
    await pageA.locator("#task-description").fill("用于验证阶段 3 的 SPA 闭环：发布、接单、确认完成、评价。");
    await pageA.locator("select[name='categoryId']").selectOption("11");
    await pageA.locator("#task-hours").fill("1");
    await pageA.locator("#task-coins").fill("5");
    await pageA.locator("#task-location").fill("测试社区");
    await pageA.locator("#submit-btn").click();
    await expect(pageA.locator("#publish-success-panel")).toContainText("需求已发布");

    await pageB.goto(`${frontendBaseUrl}/tasks`);
    await expect(pageB.getByText(title)).toBeVisible();
    await pageB.getByRole("link", { name: title }).click();
    await expect(pageB).toHaveURL(/\/posts\/\d+$/);
    await pageB.getByRole("button", { name: "接单" }).click();
    await expect(pageB).toHaveURL(/\/orders\/\d+$/);

    const orderId = extractOrderId(pageB.url());
    await expect(pageB.getByRole("button", { name: "确认完成" })).toBeVisible();
    await pageB.getByRole("button", { name: "确认完成" }).click();
    await expect(pageB.locator("html")).toHaveAttribute("data-route-id", "order-detail");

    await pageA.goto(`${frontendBaseUrl}/orders/${orderId}`);
    await expect(pageA.getByRole("button", { name: "确认完成" })).toBeVisible();
    await pageA.getByRole("button", { name: "确认完成" }).click();
    await expect(pageA.getByRole("link", { name: "评价" })).toBeVisible();

    await pageA.getByRole("link", { name: "评价" }).click();
    await expect(pageA).toHaveURL(/\/reviews\/new\?orderId=\d+$/);
    await pageA.locator("input[name='rating']").fill("5");
    await pageA.locator("input[name='tags']").fill("专业,准时");
    await pageA.locator("textarea[name='comment']").fill("SPA 闭环评价通过。");
    await pageA.getByRole("button", { name: "提交评价" }).click();
    await expect(pageA.getByRole("heading", { name: "评价已提交" })).toBeVisible();
  } finally {
    await contextA.close().catch(() => {});
    await contextB.close().catch(() => {});
  }
});

async function loginUser(page: Page, username: string, password: string) {
  await page.goto(`${frontendBaseUrl}/login`);
  await page.locator("input[name='username']").fill(username);
  await page.locator("input[name='password']").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/feed$/);
}

function extractOrderId(url: string) {
  const match = url.match(/\/orders\/(\d+)$/);
  if (!match) {
    throw new Error(`Could not extract order id from ${url}`);
  }
  return match[1];
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
