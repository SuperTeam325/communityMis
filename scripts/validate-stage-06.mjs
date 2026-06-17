import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createBackendServer } from "../backend/src/app.mjs";
import { createMemoryAuthStore } from "../backend/src/auth/store.mjs";
import { createApiClient } from "../frontend/src/api/client.mjs";

const checks = [];

await run();

async function run() {
  checkStaticFiles();
  await checkAdminApiLoop();
  runCommand("npm", ["run", "typecheck"], "typecheck passes");
  runCommand("npm", ["run", "test:component"], "component tests pass");
  runCommand("npm", ["run", "build"], "frontend build passes");

  for (const item of checks) {
    console.log(`${item.ok ? "ok" : "fail"} - ${item.message}`);
  }
  if (checks.some((item) => !item.ok)) process.exitCode = 1;
}

function checkStaticFiles() {
  const adminPages = read("frontend/src/spa/pages/AdminPages.tsx");
  const app = read("frontend/src/spa/App.tsx");
  const api = read("frontend/src/spa/api.ts");
  const componentTest = read("tests/component/spa-stage-06.test.tsx");
  const e2eTest = read("tests/e2e/spa-stage-06.spec.ts");

  [
    "AdminUsersPage",
    "AdminTransactionsPage",
    "AdminDisputesPage",
    "AdminDisputeFinalPage",
    "AdminStatsPage",
    "AdminCategoriesPage",
    "AdminSensitiveWordsPage",
    "AdminRiskContentPage",
    "AdminAuditLogPage",
    "AdminSystemPage"
  ].forEach((name) => record(adminPages.includes(`function ${name}`) || adminPages.includes(`export function ${name}`), `${name} exists`));

  record(!app.includes("AdminGenericPage"), "App no longer imports or renders AdminGenericPage");
  record(!adminPages.includes("window.prompt"), "admin pages do not use window.prompt");
  record(!adminPages.includes("window.location.href"), "admin pages do not hard navigate with window.location.href");
  record(!adminPages.includes("window.location.reload"), "admin pages do not reload the whole page");
  record(api.includes("messageCleanup"), "SPA api exposes admin.messageCleanup");
  record(componentTest.includes("AdminUsersPage") && componentTest.includes("AdminRiskContentPage"), "stage 06 component test covers admin pages");
  record(e2eTest.includes("/admin/users") && e2eTest.includes("/admin/system"), "stage 06 e2e test covers admin shell pages");
}

async function checkAdminApiLoop() {
  const store = createMemoryAuthStore();
  const server = createBackendServer({ authStore: store, sessionSecret: "stage06-admin-secret" });
  const port = await listen(server);
  const baseUrl = `http://127.0.0.1:${port}`;
  const api = createApiClient({ baseUrl, fetchImpl: fetch, allowBearer: true });

  try {
    const login = await api.adminAuth.login({ username: "admin_main", password: "admin123456" });
    const token = login.token;
    record(Boolean(token), "admin can login");

    const dashboard = await api.admin.dashboard(token);
    record(Boolean(dashboard.metrics), "dashboard returns metrics");

    const users = await api.admin.users(token, { page: 1, pageSize: 5 });
    const targetUser = users.users?.find((item) => item.role === "user") ?? users.users?.[0];
    record(Boolean(targetUser?.userId), "admin users list returns users");
    if (targetUser?.userId) {
      const status = await api.admin.updateUserStatus(token, targetUser.userId, { status: "active", reason: "stage06 validation" });
      record(Boolean(status.user), "admin can update user status");
    }

    const transactions = await api.admin.transactions(token, { page: 1, pageSize: 5 });
    record(Array.isArray(transactions.transactions), "admin transactions list works");

    const disputes = await api.admin.disputes(token, { page: 1, pageSize: 5 });
    const dispute = disputes.disputes?.[0];
    record(Boolean(dispute?.disputeId), "admin disputes list works");
    if (dispute?.disputeId) {
      const detail = await api.admin.dispute(token, dispute.disputeId);
      record(Boolean(detail.dispute), "admin dispute detail works");
      const finalized = await api.admin.finalizeDispute(token, dispute.disputeId, {
        finalResult: "mediate",
        refundAmount: 0,
        reason: "阶段六验证终审理由"
      });
      record(Boolean(finalized.dispute?.finalResult), "admin can finalize dispute");
    }

    const stats = await api.admin.stats(token);
    record(Boolean(stats), "admin stats endpoint works");

    const category = await api.admin.createCategory(token, { name: "阶段六类别", code: "stage06_category", status: "active" });
    record(Boolean(category.category?.categoryId), "admin can create category");
    if (category.category?.categoryId) {
      await api.admin.updateCategory(token, category.category.categoryId, { description: "stage06 updated" });
      const tag = await api.admin.createTag(token, { name: "阶段六标签", categoryId: category.category.categoryId, status: "active" });
      record(Boolean(tag.tag?.tagId), "admin can create tag");
      if (tag.tag?.tagId) {
        await api.admin.updateTag(token, tag.tag.tagId, { sortOrder: 2, status: "disabled" });
        record(true, "admin can update and disable tag");
      }
      await api.admin.updateCategory(token, category.category.categoryId, { status: "disabled" });
      record(true, "admin can update and disable category");
    }

    const word = await api.admin.createSensitiveWord(token, { word: "stage06敏感词", level: "review", category: "验证", reason: "stage06" });
    record(Boolean(word.sensitiveWord?.wordId), "admin can create sensitive word");
    await api.admin.importSensitiveWords(token, { content: "stage06批量词", level: "review", category: "验证", reason: "stage06 import" });
    record(true, "admin can import sensitive words");
    if (word.sensitiveWord?.wordId) {
      await api.admin.updateSensitiveWord(token, word.sensitiveWord.wordId, { status: "disabled" });
      record(true, "admin can update and disable sensitive word");
    }

    const risks = await api.admin.riskContent(token, { page: 1, pageSize: 5 });
    const risk = risks.riskContents?.[0];
    record(Array.isArray(risks.riskContents), "admin risk content list works");
    if (risk?.riskId) {
      await api.admin.resolveRiskContent(token, risk.riskId, { status: "reviewing", note: "stage06 review" });
      await api.admin.batchReviewRiskContent(token, { riskIds: [risk.riskId], note: "stage06 batch review" });
      record(true, "admin can resolve and batch review risk content");
    }

    const audit = await api.admin.auditLogs(token, { page: 1, pageSize: 5 });
    record(Array.isArray(audit.auditLogs), "admin audit log list works");

    const system = await api.admin.system(token);
    record(Boolean(system.settings ?? system.system), "admin system endpoint works");
    await api.admin.updateSystem(token, { freezeDays: 3, autoArchiveDays: 30, newUserCoin: 5, maintenanceMode: false, autoBackup: true, aiHighRiskBlock: true, safetyNotice: "stage06" });
    record(true, "admin can update system settings");

    const backup = await api.admin.createBackup(token, { confirmText: "立即备份", reason: "stage06 backup", label: "stage06 validation" });
    record(Boolean(backup.backup?.backupId), "admin can create backup");
    if (backup.backup?.backupId) {
      await api.admin.restoreBackup(token, backup.backup.backupId, { confirmText: "恢复备份", reason: "stage06 restore" });
      await api.admin.deleteBackup(token, backup.backup.backupId, { confirmText: "删除备份", reason: "stage06 delete" });
      record(true, "admin can restore and delete backup");
    }

    await api.admin.messageCleanup(token, { mode: "preview", days: 90 });
    await api.admin.messageCleanup(token, { mode: "execute", days: 90, confirmText: "清理归档消息" });
    record(true, "admin message cleanup preview and execute work");
  } finally {
    await close(server);
  }
}

function runCommand(command, args, message) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" });
  record(result.status === 0, message);
}

function read(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function record(ok, message) {
  checks.push({ ok: Boolean(ok), message });
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
