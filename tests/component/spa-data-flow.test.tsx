// @vitest-environment jsdom
import React from "react";
import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MessagesPage } from "../../frontend/src/spa/pages/MessagesPages";
import { useAsync, useMutationTracker, useQueryParams } from "../../frontend/src/spa/pages/shared";

describe("SPA data flow helpers", () => {
  test("useAsync reloads data and ignores stale requests", async () => {
    let resolvers: Array<(value: string) => void> = [];
    const loader = vi.fn(() => new Promise<string>((resolve) => {
      resolvers.push(resolve);
    }));

    function Probe() {
      const state = useAsync(loader, []);
      return (
        <div>
          <span data-testid="value">{state.data ?? "empty"}</span>
          <button onClick={state.reload}>reload</button>
        </div>
      );
    }

    render(<Probe />);
    fireEvent.click(screen.getByRole("button", { name: "reload" }));
    expect(loader).toHaveBeenCalledTimes(2);

    resolvers[1]?.("fresh");
    await screen.findByText("fresh");
    resolvers[0]?.("stale");

    await waitFor(() => {
      expect(screen.getByTestId("value").textContent).toBe("fresh");
    });
  });

  test("useMutationTracker reports failures without throwing away local state", async () => {
    function Probe() {
      const mutation = useMutationTracker();
      return (
        <div>
          <button onClick={() => mutation.run(() => Promise.reject(new Error("保存失败"))).catch(() => {})}>save</button>
          <span role="alert">{mutation.error}</span>
        </div>
      );
    }

    render(<Probe />);
    fireEvent.click(screen.getByRole("button", { name: "save" }));

    expect((await screen.findByRole("alert")).textContent).toContain("保存失败");
  });

  test("useQueryParams reads and updates query state through history", async () => {
    window.history.replaceState({}, "", "/credit?userId=42");

    function Probe() {
      const { params, setParams } = useQueryParams();
      return (
        <div>
          <span data-testid="user-id">{params.get("userId")}</span>
          <button onClick={() => setParams((current) => {
            current.set("userId", "99");
            return current;
          })}>change</button>
        </div>
      );
    }

    render(<Probe />);
    expect(screen.getByTestId("user-id").textContent).toBe("42");
    fireEvent.click(screen.getByRole("button", { name: "change" }));
    expect(screen.getByTestId("user-id").textContent).toBe("99");
    expect(window.location.search).toBe("?userId=99");
  });
});

describe("SPA page mutations", () => {
  test("messages page refreshes its list locally after sending a message", async () => {
    const api = {
      messages: {
        list: vi.fn()
          .mockResolvedValueOnce({ messages: [{ messageId: 1, createdAt: "2026-01-01T00:00:00Z", senderName: "A", receiverName: "B", content: "旧消息" }] })
          .mockResolvedValueOnce({ messages: [{ messageId: 2, createdAt: "2026-01-01T00:01:00Z", senderName: "A", receiverName: "B", content: "新消息" }] }),
        send: vi.fn().mockResolvedValue({ message: { messageId: 2 } })
      }
    };

    render(
      <MemoryRouter>
        <MessagesPage api={api as any} />
      </MemoryRouter>
    );

    await screen.findByText("旧消息");
    fireEvent.change(screen.getByPlaceholderText("用户 ID"), { target: { value: "2" } });
    fireEvent.change(screen.getByPlaceholderText("消息内容"), { target: { value: "你好" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await screen.findByText("新消息");
    expect(api.messages.send).toHaveBeenCalledWith({ receiverId: 2, content: "你好" });
    expect(api.messages.list).toHaveBeenCalledTimes(2);
  });
});
