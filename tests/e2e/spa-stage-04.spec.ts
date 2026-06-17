import { expect, test } from "@playwright/test";
import type { Browser, Page } from "@playwright/test";
import { createBackendServer } from "../../backend/src/app.mjs";
import { createFrontendServer } from "../../frontend/server.mjs";

let backend: ReturnType<typeof createBackendServer>;
let frontend: ReturnType<typeof createFrontendServer>;
let frontendBaseUrl: string;

test.beforeAll(async () => {
  const frontendPort = await freePort();
  frontendBaseUrl = `http://127.0.0.1:${frontendPort}`;
  backend = createBackendServer({
    sessionSecret: "spa-stage04-e2e-secret",
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
      APP_ENV: "spa-stage04-e2e",
      BUILD_VERSION: "spa-stage04-e2e"
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

test("messages and notifications hydrate and mutate locally", async ({ page }) => {
  await loginUser(page, "user_a", "user123456");

  await page.goto(`${frontendBaseUrl}/messages?userId=1002`);
  await expect(page.locator("html")).toHaveAttribute("data-route-id", "messages");
  await expect(page.getByRole("heading", { name: "消息中心" })).toBeVisible();
  await page.getByRole("textbox", { name: "消息内容", exact: true }).fill(`阶段4消息 ${Date.now()}`);
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.getByText(/发送中/)).toHaveCount(0);

  await page.goto(`${frontendBaseUrl}/notifications`);
  await expect(page.locator("html")).toHaveAttribute("data-route-id", "notifications");
  await expect(page.getByText("未读通知")).toBeVisible();
  const readButton = page.getByRole("button", { name: "标为已读" }).first();
  if (await readButton.count()) {
    await readButton.click();
  }
  await page.getByRole("button", { name: "全部已读" }).click();
  await expect(page.getByText("全部未读数量")).toBeVisible();
});

test("dispute detail accepts evidence and jury vote shows voted state", async ({ browser, page }) => {
  await loginUser(page, "user_a", "user123456");
  await page.goto(`${frontendBaseUrl}/disputes/8001`);
  await expect(page.locator("html")).toHaveAttribute("data-route-id", "dispute-detail");
  await expect(page.getByText("证据列表")).toBeVisible();
  await page.getByLabel("证据说明").fill("阶段 4 补充证据说明");
  await page.getByRole("button", { name: "提交证据" }).click();
  await expect(page.getByText("阶段 4 补充证据说明")).toBeVisible();

  const juryPage = await newPage(browser);
  try {
    await loginUser(juryPage, "user_b", "user123456");
    await juryPage.goto(`${frontendBaseUrl}/jury`);
    await expect(juryPage.locator("html")).toHaveAttribute("data-route-id", "jury-hall");
    await juryPage.getByRole("link", { name: "进入投票" }).first().click();
    await expect(juryPage.locator("html")).toHaveAttribute("data-route-id", "jury-dispute-voting");
    const submitVote = juryPage.getByRole("button", { name: "提交投票" });
    if (await submitVote.count()) {
      await juryPage.getByLabel("建议调解").check();
      await juryPage.getByLabel("投票理由").fill("双方证据都需要继续核验");
      await submitVote.click();
    }
    await expect(juryPage.getByText(/已投票/).first()).toBeVisible();
  } finally {
    await juryPage.context().close().catch(() => {});
  }
});

test("wallet and freeze records link to business pages", async ({ page }) => {
  await loginUser(page, "user_a", "user123456");

  await page.goto(`${frontendBaseUrl}/wallet`);
  await expect(page.locator("html")).toHaveAttribute("data-route-id", "wallet");
  await expect(page.getByText("可用余额")).toBeVisible();
  const walletLink = page.getByRole("link", { name: "查看关联业务" }).first();
  if (await walletLink.count()) {
    await walletLink.click();
    await expect(page).toHaveURL(/\/(orders|disputes)\//);
  }

  await page.goto(`${frontendBaseUrl}/wallet/freeze`);
  await expect(page.locator("html")).toHaveAttribute("data-route-id", "wallet-freeze");
  await expect(page.getByText("释放条件")).toBeVisible();
  await page.getByRole("link", { name: "查看关联业务" }).first().click();
  await expect(page).toHaveURL(/\/(orders|disputes)\//);
});

async function loginUser(page: Page, username: string, password: string) {
  await page.goto(`${frontendBaseUrl}/login`);
  await page.locator("input[name='username']").fill(username);
  await page.locator("input[name='password']").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/feed$/);
}

async function newPage(browser: Browser) {
  const context = await browser.newContext();
  return context.newPage();
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
