import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createBackendServer } from "../backend/src/app.mjs";
import { ACTIVE_STATUS, createMemoryAuthStore, defaultSeedUsers } from "../backend/src/auth/store.mjs";

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
    "frontend/src/spa/pages/MessagesPages.tsx",
    "frontend/src/spa/pages/WalletPages.tsx",
    "frontend/src/spa/pages/DisputesPages.tsx",
    "frontend/src/spa/pages/ProfilePages.tsx",
    "frontend/src/spa/pages/shared.tsx",
    "tests/component/spa-stage-04.test.tsx",
    "tests/e2e/spa-stage-04.spec.ts"
  ]) {
    record(fs.existsSync(path.join(projectRoot, file)), `stage 04 file exists: ${file}`);
  }
}

function checkSourceConstraints() {
  const sources = {
    messages: read("frontend/src/spa/pages/MessagesPages.tsx"),
    wallet: read("frontend/src/spa/pages/WalletPages.tsx"),
    disputes: read("frontend/src/spa/pages/DisputesPages.tsx"),
    profile: read("frontend/src/spa/pages/ProfilePages.tsx"),
    shared: read("frontend/src/spa/pages/shared.tsx"),
    api: read("frontend/src/spa/api.ts"),
    backendRequests: read("backend/src/requests/routes.mjs"),
    componentTest: read("tests/component/spa-stage-04.test.tsx"),
    e2eTest: read("tests/e2e/spa-stage-04.spec.ts")
  };
  const stagePages = [sources.messages, sources.wallet, sources.disputes, sources.profile].join("\n");

  record(sources.messages.includes("api.messages.list") && sources.messages.includes("api.messages.send"), "messages page uses list and send APIs");
  record(sources.messages.includes("api.notifications.list") && sources.messages.includes("api.notifications.read(") && sources.messages.includes("api.notifications.readAll"), "notifications page uses list, single read, and read-all APIs");
  record(sources.wallet.includes("api.wallet.me()") && sources.wallet.includes("api.wallet.transactions") && sources.wallet.includes("api.wallet.freezes"), "wallet pages use summary, transaction, and freeze APIs");
  record(sources.disputes.includes("api.orders.dispute") && sources.disputes.includes("api.disputes.detail") && sources.disputes.includes("api.disputes.my") && sources.disputes.includes("api.disputes.evidence"), "dispute pages use create, detail, my-list, and evidence APIs");
  record(sources.disputes.includes("api.jury.disputes") && sources.disputes.includes("api.jury.dispute") && sources.disputes.includes("api.jury.vote"), "jury pages use hall, detail, and vote APIs");
  record(sources.disputes.includes("api.files.upload") && sources.profile.includes("api.users.credit"), "stage 04 keeps file upload and credit detail integration");
  record(sources.api.includes("messages:") && sources.api.includes("send: (payload") && sources.backendRequests.includes("MESSAGE_READ_RE"), "message send/read API is wired end-to-end");
  record(sources.disputes.includes('"publisher"') && sources.disputes.includes('"provider"') && sources.disputes.includes('"mediate"'), "jury voting page exposes backend-supported vote values");
  record(sources.messages.includes("useQueryParams") && sources.wallet.includes("useQueryParams") && sources.disputes.includes("useQueryParams"), "stage 04 filters are query-parameter driven");
  record(sources.messages.includes("safeInternalHref") && sources.wallet.includes("safeInternalHref"), "business links use safe internal href helper");
  record(sources.componentTest.includes("MessagesPage") && sources.componentTest.includes("JuryVotingPage"), "stage 04 component coverage exists");
  record(sources.e2eTest.includes("/messages") && sources.e2eTest.includes("/jury"), "stage 04 e2e coverage exists");
  record(!stagePages.includes("window.location.reload()"), "stage 04 pages do not use business reloads");
  record(!/window\.location\.href\s*=/.test(stagePages), "stage 04 pages do not use hard href redirects");
  record(!stagePages.includes("new URLSearchParams(window.location.search)"), "stage 04 page query parsing remains centralized");
}

async function checkCoreApiLoop() {
  const store = createMemoryAuthStore({
    seedUsers: [
      ...defaultSeedUsers(),
      {
        userId: 1104,
        username: "stage04_jury",
        password: "user123456",
        phone: "13900001104",
        displayName: "阶段四陪审员",
        skillTags: ["陪审"],
        isJury: true,
        role: "user",
        status: ACTIVE_STATUS,
        initialBalance: 20
      }
    ],
    seedJuryVotes: []
  });
  const backend = createBackendServer({
    authStore: store,
    sessionSecret: "stage04-spa-loop-secret"
  });
  const port = await listen(backend);
  const baseUrl = `http://127.0.0.1:${port}`;
  const userA = createCookieJarClient(baseUrl);
  const userB = createCookieJarClient(baseUrl);
  const jury = createCookieJarClient(baseUrl);
  const suffix = Date.now();

  try {
    await userA.request("POST", "/api/auth/login", { username: "user_a", password: "user123456" });
    await userB.request("POST", "/api/auth/login", { username: "user_b", password: "user123456" });
    await jury.request("POST", "/api/auth/login", { username: "stage04_jury", password: "user123456" });

    const sentMessage = await userA.request("POST", "/api/messages", {
      receiverId: 1002,
      content: `阶段4消息闭环 ${suffix}`
    });
    record(sentMessage.status === 201 && sentMessage.body.message?.messageId, "core loop can send a direct message");

    const messageList = await userA.request("GET", `/api/messages?keyword=${encodeURIComponent(`阶段4消息闭环 ${suffix}`)}&page=1&pageSize=5`);
    record(messageList.body.conversations?.length >= 1, "core loop can list message conversations with keyword");

    const messageForReceiver = await userB.request("POST", `/api/messages/${encodeURIComponent(sentMessage.body.message.messageId)}/read`);
    record(messageForReceiver.body.message?.isRead === true, "core loop can mark one message read");

    const notifications = await userA.request("GET", "/api/notifications?type=all&read=all&page=1&pageSize=5");
    record(Array.isArray(notifications.body.notifications), "core loop can list notifications");
    const unread = notifications.body.notifications?.find((item) => !item.isRead);
    if (unread) {
      const readOne = await userA.request("POST", `/api/notifications/${encodeURIComponent(unread.notificationId)}/read`);
      record(readOne.body.notification?.isRead === true, "core loop can mark one notification read");
    } else {
      record(true, "core loop notification single-read skipped because seed has no unread item");
    }
    const readAll = await userA.request("POST", "/api/notifications/read-all");
    record(Number.isFinite(Number(readAll.body.unreadTotal)), "core loop can mark all notifications read");

    const wallet = await userA.request("GET", "/api/wallet/me");
    const transactions = await userA.request("GET", "/api/wallet/me/transactions?type=all&page=1&pageSize=5");
    const freezes = await userA.request("GET", "/api/wallet/me/freezes?status=all&reasonType=all&page=1&pageSize=5");
    record(wallet.body.wallet?.availableBalance !== undefined, "core loop can load wallet summary");
    record(Array.isArray(transactions.body.transactions), "core loop can list wallet transactions");
    record(Array.isArray(freezes.body.freezes), "core loop can list wallet freezes");

    const request = await userA.request("POST", "/api/requests", {
      title: `阶段4纠纷闭环 ${suffix}`,
      description: "阶段 4 SPA 验证使用的纠纷创建需求。",
      categoryId: 11,
      estimatedHours: 1,
      coinAmount: 5,
      location: "阶段4测试社区",
      tags: ["维修"]
    });
    const requestId = request.body.request?.requestId;
    record(Boolean(requestId), "core loop can publish a request for dispute flow");

    const accepted = await userB.request("POST", `/api/requests/${encodeURIComponent(requestId)}/accept`);
    const orderId = accepted.body.order?.orderId;
    record(Boolean(orderId), "core loop can accept request before dispute");

    const createdDispute = await userA.request("POST", `/api/orders/${encodeURIComponent(orderId)}/disputes`, {
      type: "quality_issue",
      reason: "阶段4验证纠纷",
      description: "阶段四验证纠纷描述内容足够完整。",
      evidence: [{
        evidenceType: "text",
        content: "阶段四初始证据内容"
      }]
    });
    const disputeId = createdDispute.body.dispute?.disputeId;
    record(createdDispute.status === 201 && disputeId, "core loop can create dispute with initial evidence");

    const evidence = await userA.request("POST", `/api/disputes/${encodeURIComponent(disputeId)}/evidence`, {
      evidenceType: "text",
      content: "阶段四追加证据内容"
    });
    record(evidence.status === 201 && evidence.body.evidence?.evidenceId, "core loop can submit supplemental dispute evidence");

    const juryDetail = await jury.request("GET", `/api/jury/disputes/${encodeURIComponent(disputeId)}`);
    record(juryDetail.body.dispute?.disputeId === disputeId, "core loop can load jury dispute detail");

    const vote = await jury.request("POST", `/api/jury/disputes/${encodeURIComponent(disputeId)}/votes`, {
      vote: "mediate",
      reason: "阶段四验证陪审投票理由"
    });
    record(vote.status === 201 && vote.body.juryResult?.myVote?.vote === "mediate", "core loop can submit backend-supported jury vote");
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
    record(false, result.stderr.slice(0, 1000) || result.stdout.slice(0, 1000));
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
