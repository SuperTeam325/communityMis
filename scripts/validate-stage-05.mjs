import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createBackendServer } from "../backend/src/app.mjs";
import { createApiClient } from "../frontend/src/api/client.mjs";
import { routeById } from "../frontend/src/spa/route-data.mjs";

const checks = [];

await run();

async function run() {
  await checkStaticWiring();
  await checkAiApiLoop();
  await runCommand("npm", ["run", "typecheck"], "typecheck passes for stage 05 SPA AI pages");
  await runCommand("npm", ["run", "test:component"], "component tests pass including stage 05 AI coverage");
  await runCommand("npm", ["run", "build"], "frontend build passes for stage 05");

  const failed = checks.filter((item) => !item.ok);
  for (const item of checks) {
    console.log(`${item.ok ? "ok" : "fail"} - ${item.message}`);
  }

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

async function checkStaticWiring() {
  const aiPages = await readFile(new URL("../frontend/src/spa/pages/AiPages.tsx", import.meta.url), "utf8");
  const app = await readFile(new URL("../frontend/src/spa/App.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../frontend/src/spa/styles.css", import.meta.url), "utf8");
  const componentTest = await readFile(new URL("../tests/component/spa-stage-05.test.tsx", import.meta.url), "utf8");

  for (const id of ["ai-assistant", "ai-results", "admin-ai-logs", "admin-ai-conversations", "admin-ai-feedback", "admin-ai-errors", "admin-ai-config"]) {
    const route = routeById(id);
    record(Boolean(route), `${id} route is registered`);
    record(route && !("source" in route), `${id} route is SPA metadata without prototype source`);
  }

  for (const symbol of ["AiAssistantPage", "AiResultsPage", "AdminAiLogsPage", "AdminAiConversationsPage", "AdminAiFeedbackPage", "AdminAiErrorsPage", "AdminAiConfigPage"]) {
    record(aiPages.includes(`export function ${symbol}`), `${symbol} is implemented as an explicit SPA page`);
    record(app.includes(symbol), `${symbol} is wired into App route switch`);
  }

  for (const apiName of ["chatStream", "requestFilter", "feedback", "aiCallLogs", "aiConversations", "resolveAiFeedback", "retryAiErrors", "updateAiConfig"]) {
    record(aiPages.includes(apiName), `AI page uses ${apiName} API`);
  }

  for (const forbidden of ["window.location.reload()", "window.location.href =", "frontend/public/ui/js/ai-modal.js"]) {
    record(!aiPages.includes(forbidden), `AI SPA pages do not use forbidden ${forbidden}`);
  }

  record(app.includes('to="/ai/assistant"'), "user shell exposes a persistent AI assistant entry");
  record(styles.includes(".ai-layout") && styles.includes(".ai-subnav") && styles.includes(".admin-split"), "AI user and admin layouts have SPA styling");
  record(componentTest.includes("AiAssistantPage") && componentTest.includes("AdminAiConfigPage"), "stage 05 component tests cover user and admin AI pages");
}

async function checkAiApiLoop() {
  const server = createBackendServer({
    sessionSecret: "stage05-ai-test-secret",
    env: { NODE_ENV: "test" }
  });
  const port = await listen(server);
  const baseUrl = `http://127.0.0.1:${port}`;
  const cookieRuntime = createCookieRuntime(fetch);
  const api = createApiClient({
    baseUrl,
    fetchImpl: cookieRuntime.fetch,
    readCookie: cookieRuntime.readCookie,
    allowBearer: true
  });

  try {
    const login = await api.auth.login({ username: "user_a", password: "user123456" });
    record(Boolean(login.token), "stage 05 user can log in");

    const chat = await api.ai.chat(login.token, {
      message: "如何发起纠纷？",
      scene: "rules"
    });
    record(Boolean(chat.message?.messageId), "AI chat returns persisted assistant message");
    record(Boolean(chat.conversation?.conversationId), "AI chat returns conversation context");

    const conversations = await api.ai.conversations(login.token, { page: 1, pageSize: 5 });
    record(Array.isArray(conversations.conversations) && conversations.conversations.length > 0, "AI conversations endpoint lists user history");

    const conversation = await api.ai.conversation(login.token, chat.conversation.conversationId);
    record(Array.isArray(conversation.conversation?.messages) || Array.isArray(conversation.messages), "AI conversation detail returns message history");

    const feedback = await api.ai.feedback(login.token, chat.message.messageId, {
      rating: "useful",
      comment: "阶段五校验反馈"
    });
    record(feedback.feedback?.rating === "useful", "AI message feedback can be submitted");

    const filter = await api.ai.requestFilter(login.token, {
      prompt: "找一个信用高的英语辅导需求",
      scene: "request_filter"
    });
    record(Array.isArray(filter.recommendations), "AI request filter returns recommendations array");

    const adminLogin = await api.adminAuth.login({ username: "admin_main", password: "admin123456" });
    record(Boolean(adminLogin.token), "stage 05 admin can log in");

    const logs = await api.admin.aiCallLogs(adminLogin.token, { page: 1, pageSize: 5, scene: "all", status: "all" });
    record(Array.isArray(logs.callLogs), "admin AI call logs are queryable");

    const adminConversations = await api.admin.aiConversations(adminLogin.token, { page: 1, pageSize: 5, scene: "all", status: "all" });
    record(Array.isArray(adminConversations.conversations), "admin AI conversations are queryable");

    const adminFeedback = await api.admin.aiFeedback(adminLogin.token, { page: 1, pageSize: 5, scene: "all", status: "all", rating: "all" });
    record(adminFeedback.feedback?.some?.((item) => String(item.feedbackId) === String(feedback.feedback.feedbackId)), "admin AI feedback sees user feedback");

    const resolved = await api.admin.resolveAiFeedback(adminLogin.token, feedback.feedback.feedbackId, {
      resolution: "阶段五校验已处理"
    });
    record(resolved.feedback?.resolved === true, "admin can resolve AI feedback");

    const report = await api.admin.aiFeedbackReport(adminLogin.token, { scene: "all", status: "all", rating: "all" });
    record(Boolean(report.report), "admin can generate AI feedback report");

    const errors = await api.admin.aiErrors(adminLogin.token, { page: 1, pageSize: 5, type: "all", status: "all" });
    record(Array.isArray(errors.errors), "admin AI errors endpoint is queryable");

    const retry = await api.admin.retryAiErrors(adminLogin.token, { filters: { type: "all", status: "all" } });
    record(Array.isArray(retry.retries) && retry.summary?.retryCount !== undefined, "admin AI error retry endpoint returns queued retries summary");

    const incident = await api.admin.createAiIncident(adminLogin.token, {
      callIds: [],
      title: "阶段五 AI 异常事件单",
      note: "阶段五校验创建"
    });
    record(Boolean(incident.incident?.incidentId), "admin can create AI incident");

    const config = await api.admin.aiConfig(adminLogin.token);
    record(Boolean(config.config), "admin AI config is readable");

    const updatedConfig = await api.admin.updateAiConfig(adminLogin.token, {
      ...config.config,
      rateLimitPerHour: Number(config.config.rateLimitPerHour ?? 60) + 1
    });
    record(updatedConfig.config?.rateLimitPerHour === Number(config.config.rateLimitPerHour ?? 60) + 1, "admin can update AI config");
  } finally {
    await close(server);
  }
}

function runCommand(command, args, message) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: new URL("..", import.meta.url),
      stdio: "inherit",
      shell: process.platform === "win32"
    });
    child.on("exit", (code) => {
      record(code === 0, message);
      resolve();
    });
    child.on("error", () => {
      record(false, message);
      resolve();
    });
  });
}

function createCookieRuntime(fetchImpl) {
  const jar = new Map();
  return {
    fetch: async (url, options = {}) => {
      const headers = new Headers(options.headers ?? {});
      const cookie = Array.from(jar.entries()).map(([key, value]) => `${key}=${value}`).join("; ");
      if (cookie && !headers.has("cookie")) {
        headers.set("cookie", cookie);
      }
      const response = await fetchImpl(url, {
        ...options,
        headers
      });
      for (const value of setCookieHeaders(response)) {
        const [pair] = value.split(";");
        const index = pair.indexOf("=");
        if (index > 0) {
          jar.set(pair.slice(0, index), pair.slice(index + 1));
        }
      }
      return response;
    },
    readCookie: (name) => {
      const value = jar.get(name);
      return value ? decodeURIComponent(value) : null;
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
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

function record(ok, message) {
  checks.push({ ok: Boolean(ok), message });
}
