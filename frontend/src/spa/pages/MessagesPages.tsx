import React from "react";
import { Link } from "react-router-dom";
import type { ApiClient } from "../api";
import {
  Badge,
  PageHeader,
  PaginationControls,
  StateView,
  asArray,
  asRecord,
  dateText,
  fullDateText,
  labelFromMap,
  pageFromParams,
  safeInternalHref,
  SearchBar,
  text,
  useAsync,
  useMutationTracker,
  useQueryParams
} from "./shared";

const NOTIFICATION_TYPES = [
  ["all", "全部"],
  ["system", "系统"],
  ["order", "订单"],
  ["wallet", "钱包"],
  ["review", "评价"],
  ["dispute", "纠纷"],
  ["ai", "AI"],
  ["social", "互动"]
] as const;

const READ_FILTERS = [
  ["all", "全部"],
  ["unread", "未读"],
  ["read", "已读"]
] as const;

const TYPE_LABELS: Record<string, string> = Object.fromEntries(NOTIFICATION_TYPES);
const READ_LABELS: Record<string, string> = Object.fromEntries(READ_FILTERS);

export function MessagesPage({ api }: { api: ApiClient }) {
  const { params, setParams } = useQueryParams();
  const keyword = params.get("keyword") ?? "";
  const page = pageFromParams(params);
  const prefillUserId = params.get("userId") ?? "";
  const state = useAsync(() => api.messages.list({ keyword, page, pageSize: 20 }), [api, keyword, page]);
  const conversations = asArray<Record<string, unknown>>(state.data, "conversations");
  const [activeId, setActiveId] = React.useState("");

  React.useEffect(() => {
    if (!activeId && conversations.length > 0) {
      setActiveId(conversationKey(conversations[0]));
    }
  }, [activeId, conversations]);

  const active = conversations.find((item) => conversationKey(item) === activeId) ?? conversations[0] ?? null;
  const participant = asRecord(active?.participant);
  const activeUserId = text(participant.userId ?? active?.participantId ?? active?.userId ?? prefillUserId, "");
  const businessHref = safeInternalHref(active?.href, "");

  const updateFilter = (key: string, value: string) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set(key, value);
      else next.delete(key);
      next.set("page", "1");
      return next;
    });
  };

  return (
    <>
      <section className="messages-header">
        <PageHeader title="消息中心" description="会话、系统通知和业务更新集中处理。" />
        <SearchBar placeholder="搜索会话、用户或消息内容" defaultValue={keyword} onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          updateFilter("keyword", text(form.get("keyword"), ""));
        }} />
      </section>

      <StateView loading={state.loading} error={state.error} empty={conversations.length === 0 && !prefillUserId}>
        <div className="message-shell">
          <aside className="message-list conv-list" aria-label="会话列表">
            {conversations.map((item) => {
              const key = conversationKey(item);
              const href = safeInternalHref(item.href, "");
              const unreadCount = Number(item.unreadCount ?? 0);
              return (
                <button
                  className={`conversation-card conv-item${key === conversationKey(active) ? " active" : ""}`}
                  key={key}
                  type="button"
                  onClick={() => setActiveId(key)}
                >
                  <span className="conv-avatar"><span className="avatar avatar-initial">{text(item.title, "邻").slice(0, 1)}</span></span>
                  <span className="conv-body">
                    <span className="conv-top"><span className="conversation-title conv-name">{text(item.title)}</span><span className="conv-time">{dateText(item.updatedAt)}</span></span>
                    <span className="conversation-preview conv-preview">{text(item.preview, "暂无消息内容")}</span>
                  </span>
                  <span className="conv-right">{unreadCount > 0 ? <span className="unread-badge">{String(unreadCount)}</span> : <Badge>已读</Badge>}</span>
                  {href ? <Link className="conversation-link" to={href}>关联业务</Link> : null}
                </button>
              );
            })}
          </aside>

          <section className="message-detail chat-view">
            <div className="chat-header section-heading">
              <div>
                <h2>{active ? text(active.title) : prefillUserId ? `发送给用户 #${prefillUserId}` : "选择会话"}</h2>
                <p className="muted">
                  {active ? `更新于 ${fullDateText(active.updatedAt)}` : "输入用户 ID 可直接发送私信"}
                </p>
              </div>
              {businessHref ? <Link className="btn btn--secondary" to={businessHref}>查看关联业务</Link> : null}
            </div>
            {active ? (
              <div className="message-thread chat-messages">
                <div className="chat-bubble chat-bubble--assistant">
                  <strong>{text(participant.displayName ?? participant.username ?? active.title)}</strong>
                  <p>{text(active.preview, "暂无消息内容")}</p>
                </div>
              </div>
            ) : null}
            <MessageForm api={api} defaultReceiverId={activeUserId || prefillUserId} onSent={state.reload} />
          </section>
        </div>
        <PaginationControls pagination={state.data?.pagination} onPageChange={(nextPage) => {
          setParams((current) => {
            const next = new URLSearchParams(current);
            next.set("page", String(nextPage));
            return next;
          });
        }} />
      </StateView>
    </>
  );
}

function MessageForm({ api, defaultReceiverId, onSent }: { api: ApiClient; defaultReceiverId?: string; onSent: () => void }) {
  const mutation = useMutationTracker();
  const receiverRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (receiverRef.current && defaultReceiverId) {
      receiverRef.current.value = defaultReceiverId;
    }
  }, [defaultReceiverId]);

  return (
    <form className="inline-form chat-input-bar" onSubmit={async (event) => {
      event.preventDefault();
      const formElement = event.currentTarget;
      const form = new FormData(formElement);
      await mutation.run(
        () => api.messages.send({ receiverId: Number(form.get("receiverId")), content: form.get("content") }),
        () => {
          const receiverId = text(form.get("receiverId"), "");
          formElement.reset();
          if (receiverRef.current) receiverRef.current.value = receiverId;
          onSent();
        }
      ).catch(() => {});
    }}>
      <input ref={receiverRef} name="receiverId" placeholder="用户 ID" inputMode="numeric" defaultValue={defaultReceiverId} required />
      <input name="content" placeholder="消息内容" required />
      <button className="btn btn--primary" disabled={mutation.busy}>{mutation.busy ? "发送中..." : "发送"}</button>
      {mutation.error ? <span className="field-error" role="alert">{mutation.error}</span> : null}
    </form>
  );
}

export function NotificationsPage({ api }: { api: ApiClient }) {
  const { params, setParams } = useQueryParams();
  const type = sanitizeOption(params.get("type"), TYPE_LABELS, "all");
  const read = sanitizeOption(params.get("read"), READ_LABELS, "all");
  const page = pageFromParams(params);
  const state = useAsync(() => api.notifications.list({ type, read, page, pageSize: 20 }), [api, type, read, page]);
  const settingsState = useAsync(() => api.settings.me(), [api]);
  const readAllMutation = useMutationTracker();
  const readMutation = useMutationTracker();
  const rows = asArray<Record<string, unknown>>(state.data, "notifications");
  const summaries = asRecord(state.data?.summaries);
  const settings = asRecord(settingsState.data?.settings);
  const savedPrefs = asRecord(settings.notifications) as Record<string, boolean>;

  const [prefs, setPrefs] = React.useState<Record<string, boolean>>({
    orderStatus: true,
    newMessages: true,
    interactions: true,
    announcements: false
  });

  React.useEffect(() => {
    if (settingsState.data) {
      setPrefs({
        orderStatus: savedPrefs.orderStatus ?? true,
        newMessages: savedPrefs.newMessages ?? true,
        interactions: savedPrefs.interactions ?? true,
        announcements: savedPrefs.announcements ?? false
      });
    }
  }, [settingsState.data]);

  const updateParam = (key: string, value: string) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value === "all") next.delete(key);
      else next.set(key, value);
      next.set("page", "1");
      return next;
    });
  };

  const togglePref = (key: string) => {
    const currentPrefs = prefs;
    const next = { ...currentPrefs, [key]: !currentPrefs[key] };
    setPrefs(next);
    api.settings.updateMe({ notifications: next }).catch(() => {
      setPrefs(currentPrefs);
    });
  };

  return (
    <>
      <PageHeader
        title="通知中心"
        description="按类型和状态筛选来自订单、钱包、互动和 AI 的提醒。"
        action={<button className="btn btn--secondary" disabled={readAllMutation.busy} onClick={() => readAllMutation.run(() => api.notifications.readAll(), () => state.reload()).catch(() => {})}>{readAllMutation.busy ? "处理中..." : "全部已读"}</button>}
      />

      <section className="filter-panel notif-filter-panel">
        <div className="filter-row" aria-label="通知类型筛选">
          {NOTIFICATION_TYPES.map(([value, label]) => (
            <button key={value} type="button" className={`chip${type === value ? " active" : ""}`} onClick={() => updateParam("type", value)}>{label}</button>
          ))}
        </div>
        <div className="filter-row" aria-label="读取状态筛选">
          {READ_FILTERS.map(([value, label]) => (
            <button key={value} type="button" className={`chip${read === value ? " active" : ""}`} onClick={() => updateParam("read", value)}>{label}</button>
          ))}
        </div>
      </section>

      <StateView loading={state.loading || settingsState.loading} error={state.error || settingsState.error} empty={rows.length === 0}>
        {readAllMutation.error || readMutation.error ? <p className="field-error" role="alert">{readAllMutation.error || readMutation.error}</p> : null}
        <div className="notif-shell">
          <section className="summary-grid" aria-label="通知概览">
            <div className="summary-card"><strong>{String(summaries.unread ?? 0)}</strong><span>未读通知</span></div>
            <div className="summary-card"><strong>{String(summaries.order ?? 0)}</strong><span>订单更新</span></div>
            <div className="summary-card"><strong>{String(summaries.dispute ?? 0)}</strong><span>纠纷更新</span></div>
            <div className="summary-card"><strong>{String(summaries.social ?? 0)}</strong><span>互动提醒</span></div>
          </section>

          <section aria-label="通知列表">
            <div className="card-list">{rows.map((item) => {
              const notificationId = text(item.notificationId, "");
              const href = safeInternalHref(item.href, "");
              const isRead = Boolean(item.isRead ?? item.readAt);
              return (
                <article className={`notif-card${isRead ? "" : " unread"}`} key={notificationId}>
                  <div className="notif-main">
                    <div className="card-title">{text(item.title)}</div>
                    <p className="notif-desc">{text(item.content)}</p>
                    <div className="notif-meta">
                      <span className="badge-state">{labelFromMap(item.type, TYPE_LABELS)}</span>
                      <span className="notif-time">{fullDateText(item.createdAt)}</span>
                      <span className="notif-time">{isRead ? "已读" : "未读"}</span>
                    </div>
                  </div>
                  <div className="action-row">
                    {href ? <Link className="btn btn--secondary" to={href}>查看业务</Link> : null}
                    {!isRead ? (
                      <button className="btn btn--secondary" disabled={readMutation.busy} onClick={() => readMutation.run(() => api.notifications.read(notificationId), () => state.reload()).catch(() => {})}>标为已读</button>
                    ) : null}
                  </div>
                </article>
              );
            })}</div>
            <PaginationControls pagination={state.data?.pagination} onPageChange={(nextPage) => {
              setParams((current) => {
                const next = new URLSearchParams(current);
                next.set("page", String(nextPage));
                return next;
              });
            }} />
          </section>

          <aside className="side-stack">
            <section className="panel">
              <h2>筛选状态</h2>
              <div className="digest-list">
                <div className="digest-row"><strong>{labelFromMap(type, TYPE_LABELS)}</strong><span>当前类型筛选</span></div>
                <div className="digest-row"><strong>{labelFromMap(read, READ_LABELS)}</strong><span>当前读取状态</span></div>
                <div className="digest-row"><strong>{String(state.data?.unreadTotal ?? summaries.unread ?? 0)}</strong><span>全部未读数量</span></div>
              </div>
            </section>

            <section className="panel">
              <h2>通知偏好</h2>
              <PreferenceSwitch label="订单进度" desc="接单、截止、确认完成" active={prefs.orderStatus} onClick={() => togglePref("orderStatus")} />
              <PreferenceSwitch label="纠纷与陪审" desc="证据、投票、裁决更新" active={prefs.newMessages} onClick={() => togglePref("newMessages")} />
              <PreferenceSwitch label="互动提醒" desc="点赞、评论、关注" active={prefs.interactions} onClick={() => togglePref("interactions")} />
              <PreferenceSwitch label="AI 反馈" desc="筛选结果、草稿生成" active={prefs.announcements} onClick={() => togglePref("announcements")} />
            </section>
          </aside>
        </div>
      </StateView>
    </>
  );
}

function PreferenceSwitch({ label, desc, active, onClick }: { label: string; desc: string; active: boolean; onClick: () => void }) {
  return (
    <div className="setting-row">
      <div><strong>{label}</strong><span>{desc}</span></div>
      <button className={`switch${active ? " on" : ""}`} aria-label={label} onClick={onClick} />
    </div>
  );
}

function conversationKey(item: Record<string, unknown> | null | undefined) {
  return text(item?.conversationId ?? item?.participantId ?? item?.userId ?? item?.title, "");
}

function sanitizeOption(value: string | null, labels: Record<string, string>, fallback: string) {
  const key = value ?? fallback;
  return Object.prototype.hasOwnProperty.call(labels, key) ? key : fallback;
}
