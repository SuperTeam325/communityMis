// @vitest-environment jsdom
import React from "react";
import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  AiAssistantPage,
  AiResultsPage,
  AdminAiConfigPage,
  AdminAiErrorsPage,
  AdminAiFeedbackPage,
  AdminAiLogsPage
} from "../../frontend/src/spa/pages/AiPages";

describe("stage 05 SPA AI user and admin surfaces", () => {
  test("AI assistant streams a reply, refreshes conversations, and records feedback", async () => {
    const api = apiStub();
    window.history.replaceState({}, "", "/ai/assistant");
    render(<MemoryRouter><AiAssistantPage api={api as any} /></MemoryRouter>);

    await screen.findAllByText("英语辅导需求");
    fireEvent.change(screen.getByLabelText("输入问题"), { target: { value: "帮我找信用高的英语需求" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await screen.findByText(/推荐信用高的英语辅导需求/);
    await waitFor(() => expect(api.ai.chatStream).toHaveBeenCalled());
    await waitFor(() => expect(api.ai.conversations.mock.calls.length).toBeGreaterThanOrEqual(2));

    fireEvent.click(await screen.findByRole("button", { name: "有用" }));
    await waitFor(() => expect(api.ai.feedback).toHaveBeenCalledWith("9001", { rating: "useful" }));
  });

  test("AI assistant loads messages when opened with a conversation query", async () => {
    const api = apiStub();
    window.history.replaceState({}, "", "/ai/assistant?conversationId=conv-1");
    render(<MemoryRouter><AiAssistantPage api={api as any} /></MemoryRouter>);

    await screen.findByText("规则问题");
    await screen.findByText("规则回答");
    expect(api.ai.conversation).toHaveBeenCalledWith("conv-1");
  });

  test("AI assistant history scene chips reload conversations with the selected scene", async () => {
    const api = apiStub();
    window.history.replaceState({}, "", "/ai/assistant");
    render(<MemoryRouter><AiAssistantPage api={api as any} /></MemoryRouter>);

    await screen.findAllByText("英语辅导需求");
    fireEvent.click(screen.getByRole("button", { name: "发布" }));

    await waitFor(() => expect(api.ai.conversations).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 12,
      scene: "request_draft"
    }));
    expect(window.location.search).toContain("scene=request_draft");
  });

  test("AI results page hydrates from query and renders safe business links", async () => {
    const api = apiStub();
    window.history.replaceState({}, "", "/ai/results?prompt=%E8%8B%B1%E8%AF%AD");
    render(<MemoryRouter><AiResultsPage api={api as any} /></MemoryRouter>);

    await screen.findByText("小学英语陪练");
    expect(api.ai.requestFilter).toHaveBeenCalledWith({ prompt: "英语", scene: "request_filter" });
    expect(screen.getByRole("link", { name: "查看详情" }).getAttribute("href")).toBe("/posts/5101");
  });

  test("admin AI logs support filters and list metrics", async () => {
    const api = apiStub();
    window.history.replaceState({}, "", "/admin/ai/logs");
    render(<MemoryRouter><AdminAiLogsPage api={api as any} /></MemoryRouter>);

    await screen.findByText("AI 日志管理");
    await screen.findAllByText("规则问答");
    fireEvent.change(screen.getByPlaceholderText("搜索关键词"), { target: { value: "英语" } });

    await waitFor(() => expect(window.location.search).toContain("keyword=%E8%8B%B1%E8%AF%AD"));
  });

  test("admin AI feedback resolves one item and can generate a report", async () => {
    const api = apiStub();
    window.history.replaceState({}, "", "/admin/ai/feedback");
    render(<MemoryRouter><AdminAiFeedbackPage api={api as any} /></MemoryRouter>);

    await screen.findByText("回答不准确");
    fireEvent.click(screen.getByRole("button", { name: "标记已处理" }));
    await waitFor(() => expect(api.admin.resolveAiFeedback).toHaveBeenCalledWith("7001", { resolution: "人工复盘完成" }));

    fireEvent.click(screen.getByRole("button", { name: "生成周报" }));
    await waitFor(() => expect(api.admin.aiFeedbackReport).toHaveBeenCalled());
    await screen.findByText("AI 用户反馈周报");
    await waitFor(() => expect(screen.getAllByText(/回答不准确/).length).toBeGreaterThanOrEqual(2));

    fireEvent.click(screen.getByRole("button", { name: "查看会话" }));
    await waitFor(() => expect(api.admin.aiConversation).toHaveBeenCalledWith("conv-1"));
    await screen.findByText("管理员查看的会话消息");
  });

  test("admin AI errors batch retry and incident creation use selected call ids", async () => {
    const api = apiStub();
    window.history.replaceState({}, "", "/admin/ai/errors");
    render(<MemoryRouter><AdminAiErrorsPage api={api as any} /></MemoryRouter>);

    await screen.findAllByText("模型超时");
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "重试低风险失败" }));
    await waitFor(() => expect(api.admin.retryAiErrors).toHaveBeenCalledWith({ callIds: ["call-2"] }));

    fireEvent.click(screen.getByRole("button", { name: "创建事件单" }));
    await waitFor(() => expect(api.admin.createAiIncident).toHaveBeenCalledWith({
      callIds: ["call-2"],
      title: "AI 异常事件单",
      note: "管理员从 AI 异常页创建内部事件单"
    }));
  });

  test("admin AI config saves rate limits and scene switches", async () => {
    const api = apiStub();
    window.history.replaceState({}, "", "/admin/ai/config");
    render(<MemoryRouter><AdminAiConfigPage api={api as any} /></MemoryRouter>);

    await screen.findByDisplayValue("local-rule-assistant");
    fireEvent.change(screen.getByLabelText("每小时上限"), { target: { value: "88" } });
    fireEvent.click(screen.getByRole("button", { name: "保存配置" }));

    await waitFor(() => expect(api.admin.updateAiConfig).toHaveBeenCalledWith(expect.objectContaining({
      rateLimitPerHour: 88,
      model: "local-rule-assistant",
      sceneEnabled: expect.objectContaining({ chat: true, request_filter: true })
    })));
  });
});

function apiStub() {
  const conversation = {
    conversationId: "conv-1",
    scene: "rules",
    sceneText: "规则问答",
    status: "active",
    statusText: "进行中",
    preview: "英语辅导需求",
    messageCount: 2,
    sensitiveHitCount: 0,
    updatedAt: "2026-06-01T10:00:00.000Z"
  };
  return {
    ai: {
      conversations: vi.fn().mockResolvedValue({
        conversations: [conversation],
        pagination: { page: 1, pageSize: 12, total: 1, totalPages: 1, hasNext: false, hasPrev: false }
      }),
      conversation: vi.fn().mockResolvedValue({
        conversation,
        messages: [
          { messageId: "m-1", conversationId: "conv-1", senderType: "user", content: "规则问题", createdAt: "2026-06-01T10:00:00.000Z" },
          { messageId: "m-2", conversationId: "conv-1", senderType: "ai", content: "规则回答", createdAt: "2026-06-01T10:01:00.000Z" }
        ]
      }),
      chatStream: vi.fn(async (_payload, handlers) => {
        handlers.onEvent?.({ type: "start", conversation: { conversationId: "conv-2" } });
        handlers.onDelta?.("推荐信用高的英语辅导需求");
        return {
          answer: "推荐信用高的英语辅导需求",
          conversation: { conversationId: "conv-2" },
          message: { messageId: "9001", conversationId: "conv-2", content: "推荐信用高的英语辅导需求" }
        };
      }),
      chat: vi.fn().mockResolvedValue({ answer: "备用回答", message: { messageId: "9001" } }),
      feedback: vi.fn().mockResolvedValue({ feedback: { feedbackId: "fb-1" } }),
      requestFilter: vi.fn().mockResolvedValue({
        type: "filter",
        answer: "找到 1 条匹配需求",
        criteria: { keyword: "英语" },
        resultCount: 1,
        recommendations: [{
          requestId: 5101,
          title: "小学英语陪练",
          descriptionSummary: "每周两次口语练习",
          category: { name: "学习辅导" },
          publisher: { displayName: "陈阿姨" },
          creditSummary: { averageRating: 4.9 },
          coinAmount: 12,
          matchScore: 96,
          matchReasons: ["信用高", "近期发布"],
          href: "/posts/5101"
        }]
      })
    },
    admin: {
      aiCallLogs: vi.fn().mockResolvedValue({
        summary: { total: 1, success: 1 },
        callLogs: [{
          callId: "call-1",
          conversationId: "conv-1",
          userId: 1001,
          user: { displayName: "张叔" },
          scene: "rules",
          sceneText: "规则问答",
          status: "success",
          statusText: "成功",
          requestTokens: 12,
          responseTokens: 24,
          durationMs: 88,
          riskLevel: "low",
          createdAt: "2026-06-01T10:00:00.000Z"
        }],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1, hasNext: false, hasPrev: false }
      }),
      aiConversations: vi.fn().mockResolvedValue({ conversations: [conversation], summary: { total: 1 }, pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1, hasNext: false, hasPrev: false } }),
      aiConversation: vi.fn().mockResolvedValue({
        conversation,
        messages: [
          { messageId: "admin-m-1", conversationId: "conv-1", senderType: "ai", content: "管理员查看的会话消息", createdAt: "2026-06-01T10:02:00.000Z" }
        ]
      }),
      aiFeedback: vi.fn().mockResolvedValue({
        summary: { pending: 1 },
        feedback: [{
          feedbackId: "7001",
          messageId: "9001",
          userId: 1001,
          user: { displayName: "张叔" },
          rating: "useless",
          ratingText: "无用",
          comment: "回答不准确",
          status: "pending",
          statusText: "待处理",
          resolved: false,
          conversation,
          createdAt: "2026-06-01T10:00:00.000Z"
        }],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1, hasNext: false, hasPrev: false }
      }),
      resolveAiFeedback: vi.fn().mockResolvedValue({ feedback: { feedbackId: "7001", resolved: true } }),
      batchResolveAiFeedback: vi.fn().mockResolvedValue({ updated: 1 }),
      aiFeedbackReport: vi.fn().mockResolvedValue({
        report: {
          title: "AI 用户反馈周报",
          content: "AI 用户反馈周报\n回答不准确",
          rows: [{ feedbackId: "7001", rating: "useless" }]
        },
        summary: { total: 1, negativeCount: 1, pendingCount: 1 },
        generatedAt: "2026-06-01T11:00:00.000Z"
      }),
      aiErrors: vi.fn().mockResolvedValue({
        summary: { failed: 1 },
        errors: [{
          callId: "call-2",
          conversationId: "conv-2",
          user: { displayName: "李老师" },
          scene: "chat",
          sceneText: "通用问答",
          status: "failed",
          statusText: "失败",
          exceptionType: "timeout",
          exceptionText: "模型超时",
          reason: "模型超时",
          riskLevel: "low",
          createdAt: "2026-06-01T10:00:00.000Z"
        }],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1, hasNext: false, hasPrev: false }
      }),
      retryAiErrors: vi.fn().mockResolvedValue({ retried: 1 }),
      createAiIncident: vi.fn().mockResolvedValue({ incident: { incidentId: "inc-1" } }),
      aiConfig: vi.fn().mockResolvedValue({
        config: {
          enabled: true,
          model: "local-rule-assistant",
          rateLimitPerHour: 60,
          rateLimitPerMinute: 20,
          rateLimitPerDay: 200,
          concurrencyLimit: 30,
          contextMessages: 12,
          contextTokenLimit: 4000,
          logRetentionDays: 180,
          safetyThreshold: 80,
          blockHighRisk: true,
          timeoutMs: 15000,
          maxTokens: 1024,
          temperature: 0.3,
          sensitiveFilterEnabled: true,
          detectionMode: "balanced",
          requireConfirm: true,
          alertThreshold: 90,
          conversationRetentionDays: 180,
          sceneEnabled: { chat: true, request_filter: true }
        },
        safetyBoundaries: {
          aiCan: ["解释规则"],
          aiCannot: ["代替用户下单"],
          auditRequired: ["高风险回答"]
        }
      }),
      updateAiConfig: vi.fn().mockResolvedValue({ config: { rateLimitPerHour: 88 } })
    }
  };
}
