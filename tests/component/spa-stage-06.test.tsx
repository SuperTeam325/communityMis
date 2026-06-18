// @vitest-environment jsdom
import React from "react";
import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  AdminAuditLogPage,
  AdminCategoriesPage,
  AdminDisputesPage,
  AdminDisputeFinalPage,
  AdminRiskContentPage,
  AdminSensitiveWordsPage,
  AdminSystemPage,
  AdminTransactionsPage,
  AdminUsersPage
} from "../../frontend/src/spa/pages/AdminPages";

describe("stage 06 admin SPA pages", () => {
  test("users page filters and toggles user status without full reload", async () => {
    const api = apiStub();
    window.history.replaceState({}, "", "/admin/users");
    render(<MemoryRouter><AdminUsersPage api={api as any} /></MemoryRouter>);

    await screen.findByText("用户管理");
    fireEvent.change(screen.getByLabelText("关键词"), { target: { value: "张" } });
    await waitFor(() => expect(window.location.search).toContain("keyword=%E5%BC%A0"));

    fireEvent.click(screen.getByRole("button", { name: "禁用" }));
    await waitFor(() => expect(api.admin.updateUserStatus).toHaveBeenCalledWith("1001", { status: "disabled", reason: "管理员禁用账号" }));
  });

  test("transactions page supports type filter and business links", async () => {
    const api = apiStub();
    window.history.replaceState({}, "", "/admin/transactions");
    render(<MemoryRouter><AdminTransactionsPage api={api as any} /></MemoryRouter>);

    await screen.findByText("交易流水");
    expect((await screen.findByRole("link", { name: "订单 #3001" })).getAttribute("href")).toBe("/orders/3001");
    fireEvent.change(screen.getByLabelText("类型"), { target: { value: "freeze" } });
    await waitFor(() => expect(window.location.search).toContain("type=freeze"));
  });

  test("dispute final page submits valid final payload", async () => {
    const api = apiStub();
    window.history.replaceState({}, "", "/admin/disputes/final?disputeId=5001");
    render(<MemoryRouter><AdminDisputeFinalPage api={api as any} /></MemoryRouter>);

    await screen.findByText("纠纷终审");
    fireEvent.change(screen.getByLabelText("终审结果"), { target: { value: "provider_win" } });
    fireEvent.change(screen.getByLabelText("退款金额"), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("终审理由"), { target: { value: "证据完整，支持服务方。" } });
    fireEvent.click(screen.getByRole("button", { name: "提交终审" }));

    await waitFor(() => expect(api.admin.finalizeDispute).toHaveBeenCalledWith("5001", {
      finalResult: "provider_win",
      refundAmount: 0,
      reason: "证据完整，支持服务方。"
    }));
  });

  test("dispute admin pages show unique status filters and decision basis", async () => {
    const api = apiStub();
    window.history.replaceState({}, "", "/admin/disputes");
    render(<MemoryRouter><AdminDisputesPage api={api as any} /></MemoryRouter>);

    await screen.findByText("争议处理");
    const statusOptions = Array.from((screen.getByLabelText("状态") as HTMLSelectElement).options).map((option) => option.textContent);
    expect(statusOptions.filter((label) => label === "处理中")).toHaveLength(1);

    window.history.replaceState({}, "", "/admin/disputes/final?disputeId=5001");
    render(<MemoryRouter><AdminDisputeFinalPage api={api as any} /></MemoryRouter>);

    await screen.findByText("裁决依据");
    expect(await screen.findByText(/需求方 1，服务方 0，调解 1/)).toBeTruthy();
    expect(await screen.findByText(/需求方证据/)).toBeTruthy();
    expect(await screen.findByText(/服务方证据/)).toBeTruthy();
  });

  test("risk content supports single resolve and batch review", async () => {
    const api = apiStub();
    window.history.replaceState({}, "", "/admin/risk-content");
    render(<MemoryRouter><AdminRiskContentPage api={api as any} /></MemoryRouter>);

    await screen.findByText("内容风险审核");
    fireEvent.click(screen.getByRole("button", { name: "复核" }));
    await waitFor(() => expect(api.admin.resolveRiskContent).toHaveBeenCalledWith("9001", { status: "reviewing", note: "进入人工复核" }));

    await screen.findByRole("button", { name: "批量复核" });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "批量复核" }));
    await waitFor(() => expect(api.admin.batchReviewRiskContent).toHaveBeenCalledWith({ riskIds: ["9001"], note: "批量进入人工复核" }));
  });

  test("categories page creates categories and tags", async () => {
    const api = apiStub();
    window.history.replaceState({}, "", "/admin/categories");
    render(<MemoryRouter><AdminCategoriesPage api={api as any} /></MemoryRouter>);

    await screen.findByText("标签/类别管理");
    fireEvent.change(screen.getByLabelText("类别名称"), { target: { value: "社区服务" } });
    fireEvent.change(screen.getByLabelText("类别编码"), { target: { value: "community_service" } });
    fireEvent.change(screen.getByLabelText("说明"), { target: { value: "社区互助服务" } });
    fireEvent.click(screen.getByRole("button", { name: "添加类别" }));
    await waitFor(() => expect(api.admin.createCategory).toHaveBeenCalledWith({
      name: "社区服务",
      code: "community_service",
      sortOrder: 0,
      description: "社区互助服务",
      status: "active"
    }));

    fireEvent.change(screen.getByLabelText("标签名称"), { target: { value: "跑腿" } });
    fireEvent.change(screen.getByLabelText("所属类别"), { target: { value: "11" } });
    fireEvent.change(screen.getAllByLabelText("排序")[1], { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "添加标签" }));
    await waitFor(() => expect(api.admin.createTag).toHaveBeenCalledWith({
      name: "跑腿",
      categoryId: 11,
      sortOrder: 3,
      status: "active"
    }));
  });

  test("sensitive words import and disable use admin APIs", async () => {
    const api = apiStub();
    window.history.replaceState({}, "", "/admin/sensitive-words");
    render(<MemoryRouter><AdminSensitiveWordsPage api={api as any} /></MemoryRouter>);

    await screen.findByText("敏感词管理");
    fireEvent.change(screen.getByLabelText("导入内容"), { target: { value: "测试词" } });
    fireEvent.click(screen.getByRole("button", { name: "导入敏感词" }));
    await waitFor(() => expect(api.admin.importSensitiveWords).toHaveBeenCalledWith(expect.objectContaining({ content: "测试词" })));

    await screen.findByRole("button", { name: "停用" });
    fireEvent.click(screen.getByRole("button", { name: "停用" }));
    fireEvent.change(screen.getByLabelText("确认短语"), { target: { value: "停用敏感词" } });
    fireEvent.click(screen.getByRole("button", { name: "确认" }));
    await waitFor(() => expect(api.admin.updateSensitiveWord).toHaveBeenCalledWith("8001", { status: "disabled" }));
  });

  test("system page uses confirmation dialog for backup and message cleanup", async () => {
    const api = apiStub();
    window.history.replaceState({}, "", "/admin/system");
    const promptSpy = vi.spyOn(window, "prompt").mockImplementation(() => "恢复备份");
    render(<MemoryRouter><AdminSystemPage api={api as any} /></MemoryRouter>);

    await screen.findByText("系统设置");
    fireEvent.click(screen.getByRole("button", { name: "恢复" }));
    expect(screen.getByRole("dialog", { name: "恢复" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("确认短语"), { target: { value: "恢复备份" } });
    fireEvent.click(screen.getByRole("button", { name: "确认" }));
    await waitFor(() => expect(api.admin.restoreBackup).toHaveBeenCalledWith("bk-1", expect.objectContaining({ confirmText: "恢复备份" })));
    expect(promptSpy).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole("button", { name: "执行清理" }));
    fireEvent.change(screen.getByLabelText("确认短语"), { target: { value: "清理归档消息" } });
    fireEvent.click(screen.getByRole("button", { name: "确认" }));
    await waitFor(() => expect(api.admin.messageCleanup).toHaveBeenCalledWith(expect.objectContaining({ mode: "execute", confirmText: "清理归档消息" })));
    promptSpy.mockRestore();
  });

  test("audit log marks high risk actions", async () => {
    const api = apiStub();
    window.history.replaceState({}, "", "/admin/audit-log");
    render(<MemoryRouter><AdminAuditLogPage api={api as any} /></MemoryRouter>);

    await screen.findByText("审计日志");
    expect(await screen.findByText("admin.dispute.finalize")).toBeTruthy();
    expect(screen.getByText("高风险")).toBeTruthy();
  });
});

function apiStub() {
  const pagination = { page: 1, pageSize: 20, total: 1, totalPages: 1, hasNext: false, hasPrev: false };
  return {
    admin: {
      users: vi.fn().mockResolvedValue({ users: [{ userId: 1001, username: "zhang", displayName: "张叔", status: "active", creditScore: 4.8, orderCount: 3, createdAt: "2026-06-01T10:00:00.000Z" }], pagination }),
      updateUserStatus: vi.fn().mockResolvedValue({ user: { userId: 1001, status: "disabled" } }),
      transactions: vi.fn().mockResolvedValue({ transactions: [{ transactionId: 1, user: { username: "zhang", displayName: "张叔" }, type: "freeze", amount: -10, balanceAfter: 20, orderId: 3001, createdAt: "2026-06-01T10:00:00.000Z", remark: "订单冻结" }], pagination }),
      disputes: vi.fn().mockResolvedValue({ disputes: [{ disputeId: 5001, orderId: 3001, status: "admin_review", reason: "质量争议", amount: 20, updatedAt: "2026-06-01T10:00:00.000Z" }], pagination }),
      dispute: vi.fn().mockResolvedValue({ dispute: { disputeId: 5001, orderId: 3001, status: "admin_review", statusText: "待终审", reason: "质量争议", description: "证据说明", amount: 20, publisher: { userId: 1001, username: "publisher" }, provider: { userId: 1003, username: "provider" }, evidence: [{ evidenceId: 1, uploaderId: 1001, evidenceType: "text", content: "需求方聊天记录" }, { evidenceId: 2, uploaderId: 1003, evidenceType: "image", content: "服务方课堂截图" }], juryResult: { total: 2, counts: { publisher: 1, provider: 0, mediate: 1 }, leader: "mediate", leaderText: "建议调解处理" }, createdAt: "2026-06-01T10:00:00.000Z" } }),
      finalizeDispute: vi.fn().mockResolvedValue({ dispute: { disputeId: 5001, finalResult: "provider_win" } }),
      categories: vi.fn().mockResolvedValue({ categories: [{ categoryId: 11, name: "家政维修", code: "home_repair", status: "active", sortOrder: 1, description: "家庭维修" }], tags: [{ tagId: 21, categoryId: 11, categoryName: "家政维修", name: "维修", status: "active", sortOrder: 1 }] }),
      createCategory: vi.fn().mockResolvedValue({ category: { categoryId: 12, name: "社区服务" } }),
      createTag: vi.fn().mockResolvedValue({ tag: { tagId: 22, name: "跑腿" } }),
      riskContent: vi.fn().mockResolvedValue({ riskContents: [{ riskId: 9001, title: "风险帖子", status: "pending", riskLevel: "high", sourceType: "post", createdAt: "2026-06-01T10:00:00.000Z" }], pagination }),
      resolveRiskContent: vi.fn().mockResolvedValue({ riskContent: { riskId: 9001, status: "reviewing" } }),
      batchReviewRiskContent: vi.fn().mockResolvedValue({ summary: { updatedCount: 1 } }),
      sensitiveWords: vi.fn().mockResolvedValue({ sensitiveWords: [{ wordId: 8001, word: "测试词", level: "review", category: "验证", status: "active", replacement: "***" }], pagination }),
      importSensitiveWords: vi.fn().mockResolvedValue({ sensitiveWords: [] }),
      updateSensitiveWord: vi.fn().mockResolvedValue({ sensitiveWord: { wordId: 8001 } }),
      system: vi.fn().mockResolvedValue({ settings: { freezeDays: 3, autoArchiveDays: 30, newUserCoin: 5, autoBackup: true, aiHighRiskBlock: true, safetyNotice: "notice" } }),
      updateSystem: vi.fn().mockResolvedValue({ settings: {} }),
      backups: vi.fn().mockResolvedValue({ backups: [{ backupId: "bk-1", label: "快照", status: "ready", sizeBytes: 1024, createdAt: "2026-06-01T10:00:00.000Z" }] }),
      createBackup: vi.fn().mockResolvedValue({ backup: { backupId: "bk-2" } }),
      restoreBackup: vi.fn().mockResolvedValue({ backup: { backupId: "bk-1" } }),
      deleteBackup: vi.fn().mockResolvedValue({ backup: { backupId: "bk-1" } }),
      messageCleanup: vi.fn().mockResolvedValue({ mode: "execute" }),
      auditLogs: vi.fn().mockResolvedValue({ auditLogs: [{ auditId: 1, actorId: 1, action: "admin.dispute.finalize", targetType: "dispute", targetId: 5001, detail: { reason: "done" }, createdAt: "2026-06-01T10:00:00.000Z" }], pagination })
    }
  };
}
