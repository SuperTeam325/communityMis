// @vitest-environment jsdom
import React from "react";
import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { MessagesPage, NotificationsPage } from "../../frontend/src/spa/pages/MessagesPages";
import { WalletFreezePage, WalletPage } from "../../frontend/src/spa/pages/WalletPages";
import { DisputeDetailPage, JuryVotingPage } from "../../frontend/src/spa/pages/DisputesPages";

describe("stage 04 SPA support domains", () => {
  test("messages page supports conversations, search, and local reload after send", async () => {
    const api = apiStub();
    window.history.replaceState({}, "", "/messages?userId=1002");
    render(<MemoryRouter><MessagesPage api={api as any} /></MemoryRouter>);

    await screen.findAllByText("小王维修");
    fireEvent.change(screen.getByPlaceholderText("搜索会话、用户或消息内容"), { target: { value: "维修" } });
    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    expect(window.location.search).toContain("keyword=%E7%BB%B4%E4%BF%AE");

    fireEvent.change(await screen.findByPlaceholderText("消息内容"), { target: { value: "你好" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => expect(api.messages.send).toHaveBeenCalledWith({ receiverId: 1002, content: "你好" }));
    await waitFor(() => expect(api.messages.list.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  test("notifications page filters, reads one, and reads all", async () => {
    const api = apiStub();
    window.history.replaceState({}, "", "/notifications");
    render(<MemoryRouter><NotificationsPage api={api as any} /></MemoryRouter>);

    await screen.findAllByText("订单更新");
    fireEvent.click(screen.getByRole("button", { name: "纠纷" }));
    expect(window.location.search).toContain("type=dispute");

    fireEvent.click(await screen.findByRole("button", { name: "标为已读" }));
    await waitFor(() => expect(api.notifications.read).toHaveBeenCalledWith("7001"));

    fireEvent.click(screen.getByRole("button", { name: "全部已读" }));
    await waitFor(() => expect(api.notifications.readAll).toHaveBeenCalled());
  });

  test("wallet page filters transaction type, paginates, and links business records", async () => {
    const api = apiStub();
    window.history.replaceState({}, "", "/wallet");
    render(<MemoryRouter><WalletPage api={api as any} /></MemoryRouter>);

    await screen.findAllByText("订单结算收入");
    fireEvent.click(screen.getByRole("button", { name: "收入" }));
    expect(window.location.search).toContain("type=income");
    expect((await screen.findByRole("link", { name: "查看关联业务" })).getAttribute("href")).toBe("/orders/3001");
  });

  test("wallet freeze page filters status and reason and renders timeline", async () => {
    const api = apiStub();
    window.history.replaceState({}, "", "/wallet/freeze");
    render(<MemoryRouter><WalletFreezePage api={api as any} /></MemoryRouter>);

    await screen.findAllByText("纠纷处理中，相关时间币保持冻结");
    fireEvent.click(screen.getByRole("button", { name: "纠纷中" }));
    fireEvent.click(screen.getByRole("button", { name: "纠纷" }));
    expect(window.location.search).toContain("status=dispute");
    expect(window.location.search).toContain("reasonType=dispute");
    expect(await screen.findByText("冻结创建")).toBeTruthy();
  });

  test("dispute detail submits supplemental evidence with attachment metadata and reloads", async () => {
    const api = apiStub();
    render(
      <MemoryRouter initialEntries={["/disputes/8001"]}>
        <Routes><Route path="/disputes/:id" element={<DisputeDetailPage api={api as any} />} /></Routes>
      </MemoryRouter>
    );

    await screen.findAllByText("服务质量争议");
    fireEvent.change(screen.getByLabelText("证据说明"), { target: { value: "补充聊天记录说明" } });
    fireEvent.click(screen.getByRole("button", { name: "提交证据" }));

    await waitFor(() => expect(api.disputes.evidence).toHaveBeenCalledWith("8001", {
      evidenceType: "text",
      content: "补充聊天记录说明",
      attachments: []
    }));
    await waitFor(() => expect(api.disputes.detail.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  test("jury voting uses publisher provider mediate and shows existing vote state", async () => {
    const api = apiStub();
    render(
      <MemoryRouter initialEntries={["/jury/disputes/8001"]}>
        <Routes><Route path="/jury/disputes/:id" element={<JuryVotingPage api={api as any} />} /></Routes>
      </MemoryRouter>
    );

    await screen.findByText("待投票");
    expect(screen.getByLabelText("投票理由")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("建议调解"));
    fireEvent.change(screen.getByLabelText("投票理由"), { target: { value: "双方证据都需要进一步核验" } });
    fireEvent.click(screen.getByRole("button", { name: "提交投票" }));

    await waitFor(() => expect(api.jury.vote).toHaveBeenCalledWith("8001", {
      vote: "mediate",
      reason: "双方证据都需要进一步核验"
    }));
    await screen.findAllByText(/已投票/);
  });
});

function apiStub() {
  const dispute = disputeFixture();
  return {
    messages: {
      list: vi.fn().mockResolvedValue({
        conversations: [{
          conversationId: "direct:1002",
          title: "小王维修",
          participant: { userId: 1002, displayName: "小王维修", username: "user_b" },
          preview: "旧消息",
          unreadCount: 1,
          href: "/orders/3001",
          updatedAt: "2026-06-01T10:00:00.000Z"
        }],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1, hasNext: false, hasPrev: false }
      }),
      send: vi.fn().mockResolvedValue({ message: { messageId: 1 } })
    },
    notifications: {
      list: vi.fn().mockResolvedValue({
        notifications: [{
          notificationId: 7001,
          type: "order",
          title: "订单更新",
          content: "你的订单状态已更新。",
          href: "/orders/3001",
          isRead: false,
          createdAt: "2026-06-01T10:00:00.000Z"
        }],
        summaries: { unread: 1, order: 1, dispute: 0, social: 0 },
        unreadTotal: 1,
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1, hasNext: false, hasPrev: false }
      }),
      read: vi.fn().mockResolvedValue({ notification: { notificationId: 7001, isRead: true } }),
      readAll: vi.fn().mockResolvedValue({ updated: 1 })
    },
    settings: {
      me: vi.fn().mockResolvedValue({ settings: { notifications: {} } }),
      updateMe: vi.fn().mockResolvedValue({ ok: true })
    },
    wallet: {
      me: vi.fn().mockResolvedValue({ wallet: { balance: 100, frozenBalance: 40 } }),
      transactions: vi.fn().mockResolvedValue({
        transactions: [{
          logId: 4001,
          type: "income",
          amount: 18,
          balanceAfter: 118,
          remark: "订单结算收入",
          relatedTitle: "订单结算收入",
          href: "/orders/3001",
          createdAt: "2026-06-01T10:00:00.000Z"
        }],
        pagination: { page: 1, pageSize: 8, total: 1, totalPages: 1, hasNext: false, hasPrev: false }
      }),
      freezes: vi.fn().mockResolvedValue({
        freezes: [{
          freezeId: 4601,
          status: "dispute",
          reasonType: "dispute",
          amount: 40,
          reason: "纠纷处理中，相关时间币保持冻结",
          releaseCondition: "管理员终审后释放",
          href: "/disputes/8001",
          createdAt: "2026-06-01T10:00:00.000Z",
          timeline: [{ title: "冻结创建", detail: "订单进入纠纷", createdAt: "2026-06-01T10:00:00.000Z" }]
        }],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1, hasNext: false, hasPrev: false }
      })
    },
    disputes: {
      detail: vi.fn().mockResolvedValue({ dispute }),
      my: vi.fn().mockResolvedValue({ disputes: [dispute], pagination: { page: 1, pageSize: 6, total: 1, totalPages: 1, hasNext: false, hasPrev: false } }),
      evidence: vi.fn().mockResolvedValue({ evidence: { evidenceId: 9001 }, dispute })
    },
    jury: {
      dispute: vi.fn().mockResolvedValue({ dispute, juryResult: dispute.juryResult }),
      vote: vi.fn().mockResolvedValue({
        vote: { voteId: 1, vote: "mediate", reason: "双方证据都需要进一步核验" },
        juryResult: { ...dispute.juryResult, myVote: { vote: "mediate", reason: "双方证据都需要进一步核验" }, total: 1, counts: { publisher: 0, provider: 0, mediate: 1 } },
        dispute: { ...dispute, juryResult: { ...dispute.juryResult, myVote: { vote: "mediate", reason: "双方证据都需要进一步核验" }, total: 1, counts: { publisher: 0, provider: 0, mediate: 1 } } }
      })
    },
    files: {
      upload: vi.fn().mockResolvedValue({ file: { fileId: "file-1", originalName: "evidence.png", mimeType: "image/png", sizeBytes: 123 } })
    }
  };
}

function disputeFixture() {
  return {
    disputeId: 8001,
    orderId: 3003,
    status: "jury_voting",
    type: "quality_issue",
    reason: "服务质量争议",
    description: "需求方认为辅导内容与约定不一致，请核对证据。",
    descriptionSummary: "需求方认为辅导内容与约定不一致",
    coinAmount: 40,
    refundAmount: 12,
    request: { title: "数学辅导" },
    publisher: { userId: 1001, displayName: "张叔" },
    provider: { userId: 1003, displayName: "李老师" },
    progress: { steps: [{ key: "created", title: "纠纷创建", detail: "用户发起纠纷", state: "done" }] },
    evidence: [{ evidenceId: 8101, evidenceType: "text", content: "课堂内容不一致", uploaderId: 1001, createdAt: "2026-06-01T10:00:00.000Z", attachments: [] }],
    freeze: { freezeId: 4601, status: "dispute", amount: 40, reason: "纠纷冻结", releaseCondition: "终审后释放" },
    juryResult: { total: 0, counts: { publisher: 0, provider: 0, mediate: 0 }, votes: [], myVote: null },
    href: "/disputes/8001",
    createdAt: "2026-06-01T10:00:00.000Z"
  };
}
