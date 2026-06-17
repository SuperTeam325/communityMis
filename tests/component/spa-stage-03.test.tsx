// @vitest-environment jsdom
import React from "react";
import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { FeedPage } from "../../frontend/src/spa/pages/FeedPage";
import { OrderDetailPage, ReviewPage } from "../../frontend/src/spa/pages/OrdersPages";
import { PostPage, RequestDetailPage, TasksPage } from "../../frontend/src/spa/pages/RequestsPages";
import { useQueryParams } from "../../frontend/src/spa/pages/shared";

describe("stage 03 user flow surfaces", () => {
  test("query helper updates URL state", () => {
    function Probe() {
      const { params, setParams } = useQueryParams();
      return (
        <div>
          <span data-testid="value">{params.get("status") ?? "all"}</span>
          <button onClick={() => setParams((current) => {
            current.set("status", "accepted");
            return current;
          })}>set</button>
        </div>
      );
    }

    window.history.replaceState({}, "", "/orders");
    render(<MemoryRouter><Probe /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "set" }));
    expect(screen.getByTestId("value").textContent).toBe("accepted");
    expect(window.location.search).toContain("status=accepted");
  });

  test("feed and task pages expose filters and pagination", async () => {
    const api = apiStub();
    window.history.replaceState({}, "", "/feed");
    render(
      <MemoryRouter>
        <FeedPage api={api} />
        <TasksPage api={api} />
      </MemoryRouter>
    );

    await screen.findAllByText("测试任务");
    expect(screen.getAllByText("搜索").length).toBeGreaterThan(0);
    expect(screen.getAllByText("全部类别").length).toBeGreaterThan(0);
    expect(screen.getAllByText("上一页").length).toBeGreaterThan(0);
  });

  test("post page can draft and submit request data", async () => {
    const api = apiStub();
    window.history.replaceState({}, "", "/post");
    render(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<PostPage api={api} />} />
          <Route path="/posts/:id" element={<div data-testid="detail">detail</div>} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findAllByText("维修");
    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "新需求" } });
    fireEvent.change(screen.getByLabelText("描述"), { target: { value: "需要修灯并调试" } });
    fireEvent.click(screen.getByRole("button", { name: "AI 草稿" }));
    await waitFor(() => expect(api.ai.requestDraft).toHaveBeenCalled());
    expect(api.ai.requestDraft.mock.calls[0][0]).toMatchObject({
      prompt: "新需求\n需要修灯并调试",
      title: "新需求",
      description: "需要修灯并调试"
    });
    expect((screen.getByLabelText("描述") as HTMLTextAreaElement).value).toBe("AI 生成的真实任务描述");
    fireEvent.change(screen.getByLabelText("类别"), { target: { value: "11" } });
    fireEvent.change(screen.getByLabelText("预计耗时"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("时间币报酬"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("服务地点"), { target: { value: "测试社区" } });
    fireEvent.change(screen.getByLabelText("标签"), { target: { value: "维修" } });
    fireEvent.click(screen.getByRole("button", { name: "发布需求" }));

    await waitFor(() => expect(api.requests.create).toHaveBeenCalled());
    expect(api.requests.create.mock.calls[0][0].title).toBe("新需求");
  });

  test("request detail accepts and refreshes locally", async () => {
    const api = apiStub();
    render(
      <MemoryRouter initialEntries={["/posts/3001"]}>
        <Routes>
          <Route path="/posts/:id" element={<RequestDetailPage api={api} />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText("测试任务");
    fireEvent.click(screen.getByRole("button", { name: "接单" }));
    await waitFor(() => expect(api.requests.accept).toHaveBeenCalledWith("3001"));
  });

  test("order detail can confirm and review page can submit", async () => {
    const api = apiStub();
    render(
      <MemoryRouter initialEntries={["/orders/4001"]}>
        <Routes>
          <Route path="/orders/:id" element={<OrderDetailPage api={api} />} />
          <Route path="/reviews/new" element={<ReviewPage api={api} />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText("订单详情");
    fireEvent.click(screen.getByRole("button", { name: "确认完成" }));
    await waitFor(() => expect(api.orders.confirm).toHaveBeenCalledWith("4001"));
  });
});

function apiStub() {
  const request = {
    requestId: 3001,
    title: "测试任务",
    description: "测试任务描述",
    descriptionSummary: "测试任务描述",
    estimatedHours: 1,
    coinAmount: 5,
    location: "测试社区",
    status: "open",
    category: { categoryId: 11, name: "维修" },
    publisher: { userId: 1001, displayName: "user_a", username: "user_a" },
    creditSummary: { averageRating: 4.8 }
  };
  const order = {
    orderId: 4001,
    requestId: 3001,
    status: "accepted",
    coinAmount: 5,
    myRole: "posted",
    canConfirm: true,
    canDispute: true,
    reviewState: { canReview: false, hasReviewed: false, targetId: 1002 },
    confirmation: { payerConfirmed: false, providerConfirmed: false },
    request,
    publisher: { userId: 1001, displayName: "user_a", username: "user_a" },
    provider: { userId: 1002, displayName: "user_b", username: "user_b" }
  };

  return {
    categories: { list: vi.fn().mockResolvedValue({ categories: [{ categoryId: 11, name: "维修" }] }) },
    tags: { list: vi.fn().mockResolvedValue({ tags: [{ name: "维修" }] }) },
    ai: { requestDraft: vi.fn().mockResolvedValue({ draft: { title: "AI 草稿", description: "AI 生成的真实任务描述" } }) },
    files: { upload: vi.fn().mockResolvedValue({ file: { fileId: "f1", originalName: "demo.png" } }) },
    requests: {
      list: vi.fn().mockResolvedValue({ requests: [request], pagination: { page: 1, pageSize: 12, total: 24, totalPages: 2, hasNext: true, hasPrev: false } }),
      create: vi.fn().mockResolvedValue({ request }),
      detail: vi.fn().mockResolvedValue({ request }),
      accept: vi.fn().mockResolvedValue({ order })
    },
    requestComments: {
      list: vi.fn().mockResolvedValue({ comments: [] }),
      create: vi.fn().mockResolvedValue({ comment: { commentId: 1 } })
    },
    orders: {
      list: vi.fn().mockResolvedValue({ orders: [order], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1, hasNext: false, hasPrev: false } }),
      detail: vi.fn().mockResolvedValue({ order }),
      confirm: vi.fn().mockResolvedValue({ order }),
      review: vi.fn().mockResolvedValue({ review: { reviewId: 1 } })
    },
    users: {
      me: vi.fn().mockResolvedValue({ user: { userId: 1001, username: "user_a", displayName: "user_a" }, wallet: { balance: 10 }, credit: { averageRating: 4.8, reviewCount: 2 } }),
      public: vi.fn().mockResolvedValue({ user: { userId: 1001, username: "user_a", displayName: "user_a" }, viewer: { isSelf: true }, credit: { averageRating: 4.8 } }),
      credit: vi.fn().mockResolvedValue({ credit: { averageRating: 4.8, reviewCount: 2 }, reviews: [] }),
      avatar: vi.fn().mockResolvedValue({ ok: true }),
      follow: vi.fn().mockResolvedValue({ ok: true }),
      unfollow: vi.fn().mockResolvedValue({ ok: true })
    },
    collections: { me: vi.fn().mockResolvedValue({ collections: [] }) },
    settings: {
      me: vi.fn().mockResolvedValue({ settings: { notifications: {}, privacy: {}, preferences: {} } }),
      updateMe: vi.fn().mockResolvedValue({ ok: true })
    },
    auth: { logout: vi.fn().mockResolvedValue({ ok: true }) }
  } as any;
}
