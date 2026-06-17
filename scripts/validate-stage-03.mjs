import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createBackendServer } from "../backend/src/app.mjs";

const projectRoot = process.cwd();
const checks = [];

await run();

async function run() {
  checkFiles();
  checkSourceConstraints();
  await checkCoreApiLoop();
  await runCommandCheck("npm", ["run", "typecheck"], "typecheck passes", 120000);
  await runCommandCheck("npm", ["run", "test:component"], "component tests pass", 120000);
  await runCommandCheck("npm", ["run", "build"], "frontend build passes", 120000);

  const failed = checks.filter((item) => !item.ok);
  for (const item of checks) {
    console.log(`${item.ok ? "ok" : "fail"} - ${item.message}`);
  }
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

function checkFiles() {
  for (const file of [
    "frontend/src/spa/pages/FeedPage.tsx",
    "frontend/src/spa/pages/RequestsPages.tsx",
    "frontend/src/spa/pages/OrdersPages.tsx",
    "frontend/src/spa/pages/ProfilePages.tsx",
    "frontend/src/spa/pages/shared.tsx",
    "tests/component/spa-stage-03.test.tsx"
  ]) {
    record(fs.existsSync(path.join(projectRoot, file)), `stage 03 file exists: ${file}`);
  }
}

function checkSourceConstraints() {
  const sources = {
    "FeedPage.tsx": read("frontend/src/spa/pages/FeedPage.tsx"),
    "RequestsPages.tsx": read("frontend/src/spa/pages/RequestsPages.tsx"),
    "OrdersPages.tsx": read("frontend/src/spa/pages/OrdersPages.tsx"),
    "ProfilePages.tsx": read("frontend/src/spa/pages/ProfilePages.tsx")
  };
  const userCore = Object.values(sources).join("\n");

  record(sources["FeedPage.tsx"].includes("PaginationControls") && sources["FeedPage.tsx"].includes("useQueryParams"), "feed has query filters and pagination");
  record(sources["RequestsPages.tsx"].includes("api.categories.list()") && sources["RequestsPages.tsx"].includes("api.tags.list()"), "post page loads categories and tags");
  record(sources["RequestsPages.tsx"].includes("api.requests.accept(id)") && sources["RequestsPages.tsx"].includes("api.requestComments.create"), "request detail supports accept and comments");
  record(sources["OrdersPages.tsx"].includes("api.orders.confirm(id)") && sources["OrdersPages.tsx"].includes("reviewState.canReview"), "order detail supports confirm and review state");
  record(sources["OrdersPages.tsx"].includes("orderId = params.get(\"orderId\")"), "review page reads orderId from query");
  record(!userCore.includes("window.location.reload()"), "stage 03 user pages do not use business reloads");
  record(!userCore.includes("window.location.href ="), "stage 03 user pages do not use business href redirects");
  record(!userCore.includes("new URLSearchParams(window.location.search)"), "stage 03 query parsing remains centralized");
}

async function checkCoreApiLoop() {
  const backend = createBackendServer({ sessionSecret: "stage03-spa-loop-secret" });
  const port = await listen(backend);
  const baseUrl = `http://127.0.0.1:${port}`;
  const userA = createCookieJarClient(baseUrl);
  const userB = createCookieJarClient(baseUrl);
  const suffix = Date.now();

  try {
    await userA.request("POST", "/api/auth/login", { username: "user_a", password: "user123456" });
    await userB.request("POST", "/api/auth/login", { username: "user_b", password: "user123456" });

    const request = await userA.request("POST", "/api/requests", {
      title: `阶段3闭环 ${suffix}`,
      description: "阶段 3 SPA 验证使用的核心交易闭环需求。",
      categoryId: 11,
      estimatedHours: 1,
      coinAmount: 5,
      location: "阶段3测试社区",
      tags: ["维修"]
    });
    const requestId = request.body.request?.requestId;
    record(Boolean(requestId), "core loop can publish a request");

    const list = await userB.request("GET", `/api/requests?keyword=${encodeURIComponent(`阶段3闭环 ${suffix}`)}&status=open&page=1&pageSize=5`);
    record(list.body.requests?.some((item) => item.requestId === requestId), "core loop request appears in filtered task list");

    const accepted = await userB.request("POST", `/api/requests/${encodeURIComponent(requestId)}/accept`);
    const orderId = accepted.body.order?.orderId;
    record(Boolean(orderId), "core loop can accept request and create order");

    const payerConfirm = await userA.request("POST", `/api/orders/${encodeURIComponent(orderId)}/confirm`);
    record(["payer_confirmed", "completed"].includes(String(payerConfirm.body.order?.status)), "publisher can confirm order");

    const providerConfirm = await userB.request("POST", `/api/orders/${encodeURIComponent(orderId)}/confirm`);
    record(providerConfirm.body.order?.status === "completed", "provider can confirm order completion");

    const reviewTarget = providerConfirm.body.order?.provider?.userId;
    const review = await userA.request("POST", `/api/orders/${encodeURIComponent(orderId)}/reviews`, {
      targetId: reviewTarget,
      rating: 5,
      tags: ["专业"],
      comment: "阶段 3 SPA 闭环评价内容完整。"
    });
    record(review.status === 201 && review.body.review?.rating === 5, "publisher can submit order review");
  } catch (error) {
    record(false, `core loop API validation failed: ${error.message}`);
  } finally {
    await close(backend);
  }
}

async function runCommandCheck(command, args, message, timeoutMs) {
  const result = await runCommand(command, args, { timeoutMs });
  record(result.code === 0, message);
  if (result.code !== 0) {
    record(false, result.stderr.slice(0, 800) || result.stdout.slice(0, 800));
  }
}

function createCookieJarClient(baseUrl) {
  const jar = new Map();
  return {
    async request(method, requestPath, body = null) {
      const headers = new Headers({ accept: "application/json" });
      const cookie = Array.from(jar.entries()).map(([key, value]) => `${key}=${value}`).join("; ");
      if (cookie) headers.set("cookie", cookie);
      if (body !== null) headers.set("content-type", "application/json");
      if (jar.has("csrf_token") && ["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
        headers.set("x-csrf-token", decodeURIComponent(jar.get("csrf_token")));
      }
      const response = await fetch(`${baseUrl}${requestPath}`, {
        method,
        headers,
        body: body === null ? undefined : JSON.stringify(body)
      });
      for (const value of setCookieHeaders(response)) {
        const [pair] = value.split(";");
        const index = pair.indexOf("=");
        if (index > 0) jar.set(pair.slice(0, index), pair.slice(index + 1));
      }
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }
      return { status: response.status, body: payload };
    }
  };
}

function setCookieHeaders(response) {
  if (typeof response.headers.getSetCookie === "function") {
    return response.headers.getSetCookie();
  }
  const value = response.headers.get("set-cookie");
  return value ? [value] : [];
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: true
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => child.kill(), options.timeoutMs ?? 30000);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ code: code ?? 1, stdout, stderr });
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      resolve({ code: 1, stdout, stderr: stderr + error.message });
    });
  });
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(server.address().port);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

function read(file) {
  return fs.readFileSync(path.join(projectRoot, file), "utf8");
}

function record(ok, message) {
  checks.push({ ok: Boolean(ok), message });
}
