import React from "react";
import { Link, useNavigate } from "react-router-dom";
import type { ApiClient } from "../api";
import { Badge, Field, PageHeader, PaginationControls, StateView, asArray, asRecord, dateText, friendlyError, fullDateText, safeInternalHref, text, useAsync, useMutationTracker, useQueryParams } from "./shared";
import { aiRichTextToPlainText, renderAiRichText } from "../../shared/ai-rich-text.mjs";

type AiScene = "all" | "request_filter" | "request_draft" | "rules" | "summary" | "chat";

type AiMessage = {
  messageId: string | number;
  conversationId?: string | number | null;
  senderType?: string;
  role?: "user" | "assistant";
  content: string;
  businessType?: string | null;
  businessId?: string | number | null;
  sensitiveHit?: boolean;
  createdAt?: string;
  error?: boolean;
};

type AiConversation = {
  conversationId: string | number;
  userId?: string | number | null;
  user?: Record<string, unknown> | null;
  roleType?: string;
  scene?: string;
  sceneText?: string;
  status?: string;
  statusText?: string;
  preview?: string;
  messageCount?: number;
  sensitiveHitCount?: number;
  createdAt?: string;
  updatedAt?: string;
  messages?: AiMessage[];
};

type AiCallLog = {
  callId: string | number;
  conversationId?: string | number | null;
  userId?: string | number | null;
  user?: Record<string, unknown> | null;
  scene?: string;
  sceneText?: string;
  requestTokens?: number;
  responseTokens?: number;
  durationMs?: number;
  status?: string;
  statusText?: string;
  errorMessage?: string | null;
  exceptionType?: string | null;
  riskLevel?: string;
  conversation?: AiConversation | null;
  createdAt?: string;
};

type AiFeedback = {
  feedbackId: string | number;
  messageId: string | number;
  userId?: string | number | null;
  user?: Record<string, unknown> | null;
  rating?: string;
  ratingText?: string;
  comment?: string | null;
  status?: string;
  statusText?: string;
  resolved?: boolean;
  resolution?: string | null;
  resolvedBy?: string | number | null;
  resolvedAt?: string | null;
  message?: AiMessage | null;
  conversation?: AiConversation | null;
  createdAt?: string;
};

type AiError = AiCallLog & {
  exceptionType?: string;
  exceptionText?: string;
  reason?: string | null;
};

type AiConfig = {
  enabled?: boolean;
  rateLimitPerHour?: number;
  rateLimitPerMinute?: number;
  rateLimitPerDay?: number;
  concurrencyLimit?: number;
  contextMessages?: number;
  contextTokenLimit?: number;
  logRetentionDays?: number;
  safetyThreshold?: number;
  blockHighRisk?: boolean;
  model?: string;
  timeoutMs?: number;
  maxTokens?: number;
  temperature?: number;
  sceneEnabled?: Record<string, boolean>;
  sensitiveFilterEnabled?: boolean;
  detectionMode?: string;
  requireConfirm?: boolean;
  alertThreshold?: number;
  conversationRetentionDays?: number;
  updatedAt?: string | null;
};

type AiResultsPayload = {
  scene?: string;
  type?: string;
  answer?: string;
  criteria?: Record<string, unknown>;
  recommendations?: Array<Record<string, unknown>>;
  resultCount?: number;
  conversation?: AiConversation;
  message?: AiMessage;
  safety?: Record<string, unknown>;
};

const SCENE_OPTIONS: Array<{ value: AiScene; label: string; prompt: string }> = [
  { value: "all", label: "全部", prompt: "询问平台规则和操作帮助" },
  { value: "request_filter", label: "筛选", prompt: "帮我找一个信用高的英语辅导需求" },
  { value: "request_draft", label: "发布", prompt: "帮我写一段发布代取快递任务的描述" },
  { value: "rules", label: "规则", prompt: "如何发起纠纷？" },
  { value: "summary", label: "摘要", prompt: "帮我总结这个订单" }
];

export function AiAssistantPage({ api }: { api: ApiClient }) {
  const [messages, setMessages] = React.useState<AiMessage[]>([]);
  const [conversationId, setConversationId] = React.useState<string | number | null>(null);
  const [scene, setScene] = React.useState<AiScene>("all");
  const [streaming, setStreaming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [inputValue, setInputValue] = React.useState("");
  const [feedbackState, setFeedbackState] = React.useState<Record<string | number, { value?: string; pending?: boolean; error?: string }>>({});
  const chatRef = React.useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();
  const { params, setParams } = useQueryParams();
  const queryKey = params.toString();
  const listState = useAsync(() => api.ai.conversations({
    page: Number(params.get("page") ?? 1),
    pageSize: 12,
    scene: params.get("scene") || "all"
  }), [api, queryKey]);
  const conversations = asArray<AiConversation>(listState.data, "conversations");

  React.useEffect(() => {
    const el = chatRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, streaming]);

  React.useEffect(() => {
    const nextScene = params.get("scene");
    if (nextScene && ["all", "request_filter", "request_draft", "rules", "summary", "chat"].includes(nextScene)) {
      setScene(nextScene as AiScene);
    }
    const prompt = params.get("prompt");
    if (prompt) {
      setInputValue(prompt);
    }
    const conv = params.get("conversationId");
    if (conv) {
      setConversationId(conv);
      void loadConversation(api, conv, setMessages);
    }
  }, [queryKey, params]);

  const openScene = (value: AiScene, prompt: string) => {
    setScene(value);
    setInputValue(prompt);
    setParams((current) => applyPatch(current, { scene: value, prompt }), { replace: true });
  };

  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    const content = inputValue.trim();
    if (!content || busy) {
      return;
    }
    const history = messages.map((item) => ({ role: item.role ?? (item.senderType === "assistant" ? "assistant" : "user"), content: item.content }));
    const userMessage: AiMessage = { messageId: messageId("user"), role: "user", senderType: "user", content, createdAt: new Date().toISOString(), conversationId };
    const assistantId = messageId("assistant");
    const assistantDraft: AiMessage = { messageId: assistantId, role: "assistant", senderType: "ai", content: "", createdAt: new Date().toISOString(), conversationId };
    setMessages((current) => [...current, userMessage, assistantDraft]);
    setBusy(true);
    setStreaming(true);
    setInputValue("");
    try {
      const payload = {
        message: content,
        scene,
        conversationId,
        messages: [...history, { role: "user", content }]
      };
      let streamed = "";
      let result: Record<string, unknown> | null = null;
      try {
        result = await api.ai.chatStream(payload, {
          onEvent: (event) => {
            if (event.type === "start" && event.conversation && typeof event.conversation === "object") {
              const conv = event.conversation as Record<string, unknown>;
              if (conv.conversationId) {
                setConversationId(conv.conversationId as string | number);
              }
            }
          },
          onDelta: (chunk: string) => {
            streamed += chunk;
            setMessages((current) => current.map((item) => item.messageId === assistantId ? { ...item, content: streamed } : item));
          }
        }) as Record<string, unknown>;
      } catch {
        result = await api.ai.chat(payload);
      }
      if (result && result.conversation && typeof result.conversation === "object") {
        const conv = result.conversation as Record<string, unknown>;
        if (conv.conversationId) {
          setConversationId(conv.conversationId as string | number);
        }
      }
      const finalContent = assistantContent(result, streamed);
      const finalMessage = result?.message && typeof result.message === "object" ? result.message as Record<string, unknown> : null;
      const nextMessageId = toId(finalMessage?.messageId);
      const nextConversationId = toId(finalMessage?.conversationId) ?? (result?.conversation && typeof result.conversation === "object" ? toId((result.conversation as Record<string, unknown>).conversationId) : null) ?? conversationId;
      setMessages((current) => current.map((item) => item.messageId === assistantId ? {
        ...item,
        messageId: nextMessageId ?? assistantId,
        content: finalContent,
        conversationId: nextConversationId,
        businessType: finalMessage?.businessType as string | null ?? null,
        businessId: finalMessage?.businessId as string | number | null ?? null,
        createdAt: finalMessage?.createdAt as string | undefined
      } : item));
      if (finalMessage?.messageId) {
        setFeedbackState((current) => ({ ...current, [finalMessage.messageId as string | number]: { value: undefined, pending: false, error: undefined } }));
      }
    } catch (error) {
      setMessages((current) => current.map((item) => item.messageId === assistantId ? { ...item, content: error instanceof Error ? error.message : "AI 服务请求失败。", error: true } : item));
    } finally {
      setStreaming(false);
      setBusy(false);
      void listState.reload();
    }
  };

  const currentMessages = conversationId
    ? messages.filter((item) => String(item.conversationId ?? conversationId) === String(conversationId))
    : messages;

  return (
    <>
      <PageHeader title="AI 助手" action={
        <div className="ai-page-actions">
          <button className="btn btn--secondary" onClick={() => openScene("request_filter", "帮我找一个信用高的英语辅导需求")}>筛选需求</button>
          <button className="btn btn--secondary" onClick={() => openScene("request_draft", "帮我写一段发布代取快递任务的描述")}>发布辅助</button>
          <button className="btn btn--secondary" onClick={() => openScene("rules", "如何发起纠纷？")}>规则问答</button>
        </div>
      } />
      <section className="panel ai-shell">
        <div className="ai-scene-bar">
          {SCENE_OPTIONS.map((item) => (
            <button key={item.value} type="button" className={`scene-chip${scene === item.value ? " active" : ""}`} onClick={() => openScene(item.value, item.prompt)}>
              {item.label}
            </button>
          ))}
        </div>
        <div className="ai-layout">
          <aside className="ai-sidebar">
            <div className="ai-sidebar-head">
              <h3>历史会话</h3>
              <button className="btn btn--secondary btn--sm" type="button" onClick={() => { setConversationId(null); setMessages([]); setInputValue(""); setScene("all"); }}>新对话</button>
            </div>
            <div className="ai-conversation-list">
              {conversations.length === 0 ? <div className="state-card">暂无历史会话</div> : conversations.map((item) => (
                <button key={String(item.conversationId)} type="button" className={`conversation-card${String(conversationId) === String(item.conversationId) ? " active" : ""}`} onClick={() => {
                  setConversationId(item.conversationId);
                  setScene((item.scene as AiScene) || "chat");
                  void loadConversation(api, item.conversationId, setMessages);
                  setParams((current) => applyPatch(current, { conversationId: String(item.conversationId) }), { replace: true });
                }}>
                  <div className="conversation-title">{text(item.sceneText ?? item.scene ?? "AI 会话")}</div>
                  <div className="conversation-preview">{text(item.preview, "暂无预览")}</div>
                  <div className="conversation-meta">
                    <span>{text(item.statusText ?? item.status)}</span>
                    <span>{text(item.messageCount, "0")} 条</span>
                  </div>
                </button>
              ))}
            </div>
          </aside>
          <div className="ai-chat-column">
            <div className="chat-window" ref={chatRef}>
              {currentMessages.length === 0 ? (
                <div className="ai-empty">
                  <h2>你好，我是邻帮 AI 助手</h2>
                  <p>我可以帮你查找服务、解答规则、筛选需求，以及辅助发布内容。你仍然需要在业务页面完成关键动作。</p>
                  <div className="suggested-qs">
                    {SCENE_OPTIONS.map((item) => (
                      <button key={item.value} type="button" className="sq-btn" onClick={() => openScene(item.value, item.prompt)}>
                        <span className="sq-text">{item.prompt}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : currentMessages.map((item) => (
                <AiBubble
                  key={String(item.messageId)}
                  message={item}
                  feedback={feedbackState[item.messageId]}
                  onFeedback={async (rating) => {
                    if (!item.messageId) return;
                    setFeedbackState((current) => ({ ...current, [item.messageId]: { value: rating, pending: true, error: undefined } }));
                    try {
                      await api.ai.feedback(String(item.messageId), { rating });
                      setFeedbackState((current) => ({ ...current, [item.messageId]: { value: rating, pending: false } }));
                    } catch (error) {
                      setFeedbackState((current) => ({ ...current, [item.messageId]: { value: rating, pending: false, error: friendlyError(error) } }));
                    }
                  }}
                  onApplyFilter={(promptText) => {
                    const params = new URLSearchParams();
                    params.set("prompt", promptText);
                    params.set("scene", "request_filter");
                    navigate(`/ai/results?${params.toString()}`);
                  }}
                  onApplyDraft={(draftText) => {
                    const params = new URLSearchParams();
                    params.set("draft", draftText);
                    navigate(`/post?${params.toString()}`);
                  }}
                />
              ))}
            </div>
            <form className="inline-form ai-input-form" onSubmit={sendMessage}>
              <Field label="输入问题">
                <textarea
                  name="content"
                  rows={3}
                  placeholder="支持 Markdown 和 LaTeX 公式"
                  value={inputValue}
                  onChange={(event) => setInputValue(event.currentTarget.value)}
                  required
                />
              </Field>
              <div className="form-actions">
                <button className="btn btn--secondary" type="button" onClick={() => setInputValue("")}>清空</button>
                <button className="btn btn--primary" type="submit" disabled={busy}>{busy ? "生成中" : "发送"}</button>
              </div>
            </form>
          </div>
        </div>
      </section>
      <section className="panel ai-history-panel">
        <div className="section-heading">
          <h2>最近会话</h2>
          <button className="btn btn--secondary btn--sm" type="button" onClick={() => listState.reload()}>刷新</button>
        </div>
        <StateView loading={listState.loading} error={listState.error} empty={conversations.length === 0}>
          <div className="ai-history-grid">
            {conversations.slice(0, 6).map((item) => (
              <article key={String(item.conversationId)} className="history-card">
                <div className="history-title">{text(item.sceneText ?? item.scene)}</div>
                <div className="history-preview">{text(item.preview, "暂无摘要")}</div>
                <div className="history-meta">
                  <span>{text(item.statusText ?? item.status)}</span>
                  <span>{dateText(item.updatedAt ?? item.createdAt)}</span>
                </div>
              </article>
            ))}
          </div>
          <PaginationControls pagination={listState.data?.pagination} onPageChange={(page) => setParams((current) => applyPatch(current, { page }))} />
        </StateView>
      </section>
    </>
  );
}

export function AiResultsPage({ api }: { api: ApiClient }) {
  const { params, setParams } = useQueryParams();
  const prompt = params.get("prompt") ?? "";
  const [draftPrompt, setDraftPrompt] = React.useState(prompt);
  const state = useAsync(() => prompt ? api.ai.requestFilter({ prompt, scene: "request_filter" }) : (Promise.resolve({}) as Promise<Record<string, unknown>>), [api, prompt]);
  const payload = asRecord(state.data) as AiResultsPayload;
  const recommendations = asArray<Record<string, unknown>>(payload.recommendations, "recommendations");

  React.useEffect(() => {
    setDraftPrompt(prompt);
  }, [prompt]);

  return (
    <>
      <PageHeader title="AI 筛选结果" />
      <section className="panel form-grid">
        <Field label="筛选描述">
          <textarea value={draftPrompt} rows={4} placeholder="例如：找一个信用高、今天发布的电脑维修需求" onChange={(event) => setDraftPrompt(event.currentTarget.value)} />
        </Field>
        <div className="form-actions">
          <button className="btn btn--secondary" type="button" onClick={() => {
            setParams((current) => applyPatch(current, { prompt: draftPrompt, scene: "request_filter" }));
          }}>更新筛选</button>
          <button className="btn btn--primary" type="button" onClick={() => {
            setParams((current) => applyPatch(current, { prompt: draftPrompt, scene: "request_filter" }));
            state.reload();
          }}>筛选</button>
        </div>
      </section>
      <StateView loading={state.loading} error={state.error} empty={!prompt}>
        <section className="panel">
          <div className="section-heading">
            <h2>解析条件</h2>
            <Badge tone="success">{text(payload.type, "filter")}</Badge>
          </div>
          <div className="ai-criteria-grid">
            {Object.entries(payload.criteria ?? {}).map(([key, value]) => (
              <div key={key} className="ai-criteria-card">
                <div className="criteria-key">{key}</div>
                <div className="criteria-value">{typeof value === "object" ? JSON.stringify(value) : text(value)}</div>
              </div>
            ))}
          </div>
          <p className="ai-result-summary">{text(payload.answer, "AI 已完成筛选。")}</p>
        </section>
        <section className="panel">
          <div className="section-heading">
            <h2>推荐需求</h2>
            <span>{text(payload.resultCount, String(recommendations.length))} 条</span>
          </div>
          <div className="ai-result-list">
            {recommendations.length === 0 ? <div className="state-card">没有找到符合条件的需求。</div> : recommendations.map((item) => {
              const category = asRecord(item.category);
              const publisher = asRecord(item.publisher);
              const user = asRecord(item.user);
              const creditSummary = asRecord(item.creditSummary);
              const credit = asRecord(item.credit);
              return (
                <article key={String(item.requestId ?? item.id ?? item.href)} className="ai-result-card">
                  <div className="ai-result-top">
                    <Badge tone="success">{text(category.name ?? item.categoryName ?? "需求")}</Badge>
                    <span className="match-score">{text(item.matchScore ?? item.score, "0")} 分</span>
                  </div>
                  <h3>{text(item.title, "未命名需求")}</h3>
                  <p>{text(item.descriptionSummary ?? item.description, "暂无描述")}</p>
                  <div className="result-meta-row">
                    <span>{text(publisher.displayName ?? publisher.username ?? user.displayName ?? user.username, "未知发布者")}</span>
                    <span>{text(creditSummary.averageRating ?? credit.averageRating, "0")} 信誉</span>
                    <span>{text(item.coinAmount, "0.00")} 时间币</span>
                  </div>
                  <div className="match-reasons">
                    {asArray<string>(item.matchReasons, "matchReasons").map((reason) => <span key={reason} className="match-reason">{reason}</span>)}
                  </div>
                  <div className="form-actions">
                    <Link className="btn btn--secondary" to={safeInternalHref(item.href, `/posts/${encodeURIComponent(String(item.requestId ?? ""))}`)}>查看详情</Link>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </StateView>
    </>
  );
}

export function AdminAiLogsPage({ api }: { api: ApiClient }) {
  const { params, setParams } = useQueryParams();
  const state = useAsync(() => api.admin.aiCallLogs({
    keyword: params.get("keyword") ?? "",
    userId: params.get("userId") ?? "",
    conversationId: params.get("conversationId") ?? "",
    scene: params.get("scene") ?? "all",
    status: params.get("status") ?? "all",
    page: Number(params.get("page") ?? 1),
    pageSize: Number(params.get("pageSize") ?? 20)
  }), [api, params.toString()]);
  const rows = asArray<AiCallLog>(state.data, "callLogs");
  const summary = asRecord(state.data?.summary);
  return (
    <AiAdminPageShell title="AI 日志管理" active="logs">
      <AiAdminSummary summary={summary} />
      <AiAdminFilters params={params} onChange={(patch) => setParams(applyPatch(params, patch))} showStatus showScene />
      <StateView loading={state.loading} error={state.error} empty={rows.length === 0}>
        <AiLogTable rows={rows} />
        <PaginationControls pagination={state.data?.pagination} onPageChange={(page) => setParams(applyPatch(params, { page }))} />
      </StateView>
    </AiAdminPageShell>
  );
}

export function AdminAiConversationsPage({ api }: { api: ApiClient }) {
  const { params, setParams } = useQueryParams();
  const state = useAsync(() => api.admin.aiConversations({
    keyword: params.get("keyword") ?? "",
    userId: params.get("userId") ?? "",
    conversationId: params.get("conversationId") ?? "",
    scene: params.get("scene") ?? "all",
    status: params.get("status") ?? "all",
    page: Number(params.get("page") ?? 1),
    pageSize: Number(params.get("pageSize") ?? 20)
  }), [api, params.toString()]);
  const rows = asArray<AiConversation>(state.data, "conversations");
  const summary = asRecord(state.data?.summary);
  const detail = useAsync(() => {
    const id = params.get("conversationId");
    return id ? api.admin.aiConversation(id) : (Promise.resolve({}) as Promise<Record<string, unknown>>);
  }, [api, params.get("conversationId")]);
  const conversation = asRecord(detail.data?.conversation);
  const messages = asArray<AiMessage>(detail.data?.messages, "messages");
  return (
    <AiAdminPageShell title="AI 会话管理" active="conversations">
      <AiAdminSummary summary={summary} />
      <AiAdminFilters params={params} onChange={(patch) => setParams(applyPatch(params, patch))} showStatus showScene />
      <div className="admin-split">
        <StateView loading={state.loading} error={state.error} empty={rows.length === 0}>
          <AiConversationTable rows={rows} onOpen={(id) => setParams(applyPatch(params, { conversationId: String(id) }))} />
          <PaginationControls pagination={state.data?.pagination} onPageChange={(page) => setParams(applyPatch(params, { page }))} />
        </StateView>
        <aside className="panel">
          <h2>会话详情</h2>
          <StateView loading={detail.loading} error={detail.error} empty={!conversation.conversationId}>
            <div className="detail-list">
              <div className="detail-item"><div className="label">会话</div><div className="value">{text(conversation.sceneText ?? conversation.scene)}</div></div>
              <div className="detail-item"><div className="label">状态</div><div className="value">{text(conversation.statusText ?? conversation.status)}</div></div>
              <div className="detail-item"><div className="label">消息数</div><div className="value">{text(conversation.messageCount, "0")}</div></div>
              <div className="detail-item"><div className="label">脱敏说明</div><div className="value">{text(detail.data?.redaction ? "已应用内容脱敏" : "无")}</div></div>
            </div>
            <div className="ai-message-list">
              {messages.map((item) => (
                <article key={String(item.messageId)} className="ai-message-detail">
                  <div className="detail-top">
                    <strong>{text(item.senderType)}</strong>
                    <span>{fullDateText(item.createdAt)}</span>
                  </div>
                  <p>{text(item.content)}</p>
                </article>
              ))}
            </div>
          </StateView>
        </aside>
      </div>
    </AiAdminPageShell>
  );
}

export function AdminAiFeedbackPage({ api }: { api: ApiClient }) {
  const { params, setParams } = useQueryParams();
  const [selectedIds, setSelectedIds] = React.useState<Array<string | number>>([]);
  const state = useAsync(() => api.admin.aiFeedback({
    keyword: params.get("keyword") ?? "",
    userId: params.get("userId") ?? "",
    conversationId: params.get("conversationId") ?? "",
    scene: params.get("scene") ?? "all",
    status: params.get("status") ?? "all",
    rating: params.get("rating") ?? "all",
    page: Number(params.get("page") ?? 1),
    pageSize: Number(params.get("pageSize") ?? 20)
  }), [api, params.toString()]);
  const rows = asArray<AiFeedback>(state.data, "feedback");
  const summary = asRecord(state.data?.summary);
  const mutation = useMutationTracker();
  return (
    <AiAdminPageShell title="AI 用户反馈" active="feedback">
      <AiAdminSummary summary={summary} />
      <AiAdminFilters params={params} onChange={(patch) => setParams(applyPatch(params, patch))} showStatus showScene showRating />
      <div className="form-actions">
        <button className="btn btn--secondary" type="button" onClick={() => mutation.run(() => api.admin.batchResolveAiFeedback({ feedbackIds: selectedIds, resolution: "批量标记为已处理" }), () => state.reload())} disabled={mutation.busy || selectedIds.length === 0}>批量处理</button>
        <button className="btn btn--primary" type="button" onClick={() => mutation.run(() => api.admin.aiFeedbackReport({
          keyword: params.get("keyword") ?? "",
          userId: params.get("userId") ?? "",
          conversationId: params.get("conversationId") ?? "",
          scene: params.get("scene") ?? "all",
          status: params.get("status") ?? "all",
          rating: params.get("rating") ?? "all"
        }), () => state.reload())}>生成周报</button>
      </div>
      <StateView loading={state.loading} error={state.error} empty={rows.length === 0}>
        <AiFeedbackTable
          rows={rows}
          selectedIds={selectedIds}
          onToggle={(id) => setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])}
          onResolve={(id) => mutation.run(() => api.admin.resolveAiFeedback(String(id), { resolution: "人工复盘完成" }), () => state.reload())}
          onOpenConversation={(id) => setParams(applyPatch(params, { conversationId: String(id) }))}
        />
        <PaginationControls pagination={state.data?.pagination} onPageChange={(page) => setParams(applyPatch(params, { page }))} />
      </StateView>
      {mutation.error ? <p className="field-error">{mutation.error}</p> : null}
    </AiAdminPageShell>
  );
}

export function AdminAiErrorsPage({ api }: { api: ApiClient }) {
  const { params, setParams } = useQueryParams();
  const [selectedIds, setSelectedIds] = React.useState<Array<string | number>>([]);
  const state = useAsync(() => api.admin.aiErrors({
    keyword: params.get("keyword") ?? "",
    userId: params.get("userId") ?? "",
    conversationId: params.get("conversationId") ?? "",
    scene: params.get("scene") ?? "all",
    status: params.get("status") ?? "all",
    type: params.get("type") ?? "all",
    page: Number(params.get("page") ?? 1),
    pageSize: Number(params.get("pageSize") ?? 20)
  }), [api, params.toString()]);
  const rows = asArray<AiError>(state.data, "errors");
  const summary = asRecord(state.data?.summary);
  const mutation = useMutationTracker();
  return (
    <AiAdminPageShell title="AI 异常调用" active="errors">
      <AiAdminSummary summary={summary} />
      <AiAdminFilters params={params} onChange={(patch) => setParams(applyPatch(params, patch))} showStatus showScene showType />
      <div className="form-actions">
        <button className="btn btn--secondary" type="button" onClick={() => mutation.run(() => api.admin.retryAiErrors({ callIds: selectedIds }), () => state.reload())} disabled={mutation.busy || selectedIds.length === 0}>重试低风险失败</button>
        <button className="btn btn--primary" type="button" onClick={() => mutation.run(() => api.admin.createAiIncident({ callIds: selectedIds, title: "AI 异常事件单", note: "管理员从 AI 异常页创建内部事件单" }), () => state.reload())} disabled={mutation.busy || selectedIds.length === 0}>创建事件单</button>
      </div>
      <StateView loading={state.loading} error={state.error} empty={rows.length === 0}>
        <AiErrorTable rows={rows} selectedIds={selectedIds} onToggle={(id) => setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])} />
        <PaginationControls pagination={state.data?.pagination} onPageChange={(page) => setParams(applyPatch(params, { page }))} />
      </StateView>
      {mutation.error ? <p className="field-error">{mutation.error}</p> : null}
    </AiAdminPageShell>
  );
}

export function AdminAiConfigPage({ api }: { api: ApiClient }) {
  const state = useAsync(async () => {
    const payload = await api.admin.aiConfig();
    return payload;
  }, [api]);
  const config = asRecord(state.data?.config) as AiConfig;
  const boundaries = asRecord(state.data?.safetyBoundaries);
  const mutation = useMutationTracker();
  const [sceneKeys, setSceneKeys] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    setSceneKeys((current) => ({ ...current, ...(config.sceneEnabled ?? {}) }));
  }, [config.sceneEnabled]);

  return (
    <AiAdminPageShell title="AI 配置管理" active="config">
      <StateView loading={state.loading} error={state.error}>
        <form className="panel form-grid" onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          await mutation.run(() => api.admin.updateAiConfig({
            enabled: form.get("enabled") === "on",
            rateLimitPerHour: Number(form.get("rateLimitPerHour") ?? 0),
            rateLimitPerMinute: Number(form.get("rateLimitPerMinute") ?? 0),
            rateLimitPerDay: Number(form.get("rateLimitPerDay") ?? 0),
            concurrencyLimit: Number(form.get("concurrencyLimit") ?? 0),
            contextMessages: Number(form.get("contextMessages") ?? 0),
            contextTokenLimit: Number(form.get("contextTokenLimit") ?? 0),
            logRetentionDays: Number(form.get("logRetentionDays") ?? 0),
            safetyThreshold: Number(form.get("safetyThreshold") ?? 0),
            blockHighRisk: form.get("blockHighRisk") === "on",
            model: String(form.get("model") ?? ""),
            timeoutMs: Number(form.get("timeoutMs") ?? 0),
            maxTokens: Number(form.get("maxTokens") ?? 0),
            temperature: Number(form.get("temperature") ?? 0),
            sceneEnabled: { ...(config.sceneEnabled ?? {}), ...sceneKeys },
            sensitiveFilterEnabled: form.get("sensitiveFilterEnabled") === "on",
            detectionMode: String(form.get("detectionMode") ?? "balanced"),
            requireConfirm: form.get("requireConfirm") === "on",
            alertThreshold: Number(form.get("alertThreshold") ?? 0),
            conversationRetentionDays: Number(form.get("conversationRetentionDays") ?? 0)
          }), () => state.reload());
        }}>
          <label className="check-row"><input type="checkbox" name="enabled" defaultChecked={Boolean(config.enabled)} /> 启用 AI</label>
          <Field label="模型"><input name="model" defaultValue={text(config.model, "local-rule-assistant")} /></Field>
          <Field label="每小时上限"><input name="rateLimitPerHour" type="number" defaultValue={text(config.rateLimitPerHour, "60")} /></Field>
          <Field label="每分钟上限"><input name="rateLimitPerMinute" type="number" defaultValue={text(config.rateLimitPerMinute, "20")} /></Field>
          <Field label="每日上限"><input name="rateLimitPerDay" type="number" defaultValue={text(config.rateLimitPerDay, "200")} /></Field>
          <Field label="并发上限"><input name="concurrencyLimit" type="number" defaultValue={text(config.concurrencyLimit, "30")} /></Field>
          <Field label="上下文条数"><input name="contextMessages" type="number" defaultValue={text(config.contextMessages, "12")} /></Field>
          <Field label="上下文 token"><input name="contextTokenLimit" type="number" defaultValue={text(config.contextTokenLimit, "4000")} /></Field>
          <Field label="日志保留天数"><input name="logRetentionDays" type="number" defaultValue={text(config.logRetentionDays, "180")} /></Field>
          <Field label="安全阈值"><input name="safetyThreshold" type="number" defaultValue={text(config.safetyThreshold, "80")} /></Field>
          <Field label="超时 ms"><input name="timeoutMs" type="number" defaultValue={text(config.timeoutMs, "15000")} /></Field>
          <Field label="最大输出 token"><input name="maxTokens" type="number" defaultValue={text(config.maxTokens, "1024")} /></Field>
          <Field label="温度"><input name="temperature" type="number" step="0.05" defaultValue={text(config.temperature, "0.3")} /></Field>
          <Field label="检测模式"><input name="detectionMode" defaultValue={text(config.detectionMode, "balanced")} /></Field>
          <Field label="告警阈值"><input name="alertThreshold" type="number" defaultValue={text(config.alertThreshold, "90")} /></Field>
          <Field label="会话保留天数"><input name="conversationRetentionDays" type="number" defaultValue={text(config.conversationRetentionDays, "180")} /></Field>
          <label className="check-row"><input type="checkbox" name="blockHighRisk" defaultChecked={Boolean(config.blockHighRisk)} /> 拦截高风险请求</label>
          <label className="check-row"><input type="checkbox" name="sensitiveFilterEnabled" defaultChecked={Boolean(config.sensitiveFilterEnabled)} /> 敏感词检测</label>
          <label className="check-row"><input type="checkbox" name="requireConfirm" defaultChecked={Boolean(config.requireConfirm)} /> AI 生成内容须人工确认</label>
          <section className="ai-config-section">
            <h3>场景开关</h3>
            <div className="scene-grid">
              {Object.entries(config.sceneEnabled ?? {}).map(([key, value]) => (
                <label key={key} className="scene-card">
                  <input type="checkbox" checked={sceneKeys[key] ?? Boolean(value)} onChange={(event) => setSceneKeys((current) => ({ ...current, [key]: event.currentTarget.checked }))} />
                  <div className="sc-info">
                    <div className="sc-name">{key}</div>
                    <div className="sc-desc">{String(value ? "已启用" : "已关闭")}</div>
                  </div>
                </label>
              ))}
            </div>
          </section>
          <section className="ai-config-section">
            <h3>安全边界</h3>
            <div className="detail-list">
              <div className="detail-item"><div className="label">AI 可做</div><div className="value">{joinList(asArray<string>(boundaries.aiCan, "aiCan"))}</div></div>
              <div className="detail-item"><div className="label">AI 不可做</div><div className="value">{joinList(asArray<string>(boundaries.aiCannot, "aiCannot"))}</div></div>
              <div className="detail-item"><div className="label">需审计</div><div className="value">{joinList(asArray<string>(boundaries.auditRequired, "auditRequired"))}</div></div>
            </div>
          </section>
          {mutation.error ? <p className="field-error" role="alert">{mutation.error}</p> : null}
          <button className="btn btn--primary" type="submit" disabled={mutation.busy}>{mutation.busy ? "保存中..." : "保存配置"}</button>
        </form>
      </StateView>
    </AiAdminPageShell>
  );
}

function AiBubble({
  message,
  feedback,
  onFeedback,
  onApplyFilter,
  onApplyDraft
}: {
  message: AiMessage;
  feedback?: { value?: string; pending?: boolean; error?: string };
  onFeedback: (rating: string) => Promise<void>;
  onApplyFilter: (prompt: string) => void;
  onApplyDraft: (draft: string) => void;
}) {
  const isAssistant = message.role === "assistant" || message.senderType === "ai";
  const rendered = renderAiRichText(message.content || (message.sensitiveHit ? "内容已脱敏" : "正在生成...")) || "&nbsp;";
  const promptText = message.content || "";
  return (
    <article className={`chat-bubble chat-bubble--${isAssistant ? "assistant" : "user"}${message.error ? " chat-bubble--error" : ""}`} aria-live={isAssistant ? "polite" : undefined}>
      <div className="chat-markdown prose" dangerouslySetInnerHTML={{ __html: rendered }} />
      {isAssistant ? (
        <div className="chat-actions">
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => copyRichMessage(message.content)}>复制</button>
          <button type="button" className="btn btn--secondary btn--sm" disabled={feedback?.pending} onClick={() => onFeedback("useful")}>{feedback?.value === "useful" ? "已有用" : "有用"}</button>
          <button type="button" className="btn btn--secondary btn--sm" disabled={feedback?.pending} onClick={() => onFeedback("useless")}>{feedback?.value === "useless" ? "已无用" : "无用"}</button>
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => onApplyFilter(promptText)}>查看匹配结果</button>
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => onApplyDraft(promptText)}>生成草稿</button>
        </div>
      ) : null}
      {feedback?.error ? <p className="field-error">{feedback.error}</p> : null}
    </article>
  );
}

function AiAdminPageShell({
  title,
  active,
  children
}: {
  title: string;
  active: "logs" | "conversations" | "feedback" | "errors" | "config";
  children: React.ReactNode;
}) {
  const tabs = [
    { id: "logs", label: "AI 日志", href: "/admin/ai/logs" },
    { id: "conversations", label: "AI 会话", href: "/admin/ai/conversations" },
    { id: "feedback", label: "AI 反馈", href: "/admin/ai/feedback" },
    { id: "errors", label: "AI 异常", href: "/admin/ai/errors" },
    { id: "config", label: "AI 配置", href: "/admin/ai/config" }
  ] as const;
  return (
    <>
      <PageHeader title={title} />
      <nav className="ai-subnav" aria-label="AI 管理子页">
        {tabs.map((item) => <Link key={item.id} className={item.id === active ? "active" : ""} to={item.href}>{item.label}</Link>)}
      </nav>
      {children}
    </>
  );
}

function AiAdminSummary({ summary }: { summary: Record<string, unknown> }) {
  const rows = Object.entries(summary).slice(0, 4);
  if (rows.length === 0) return null;
  return (
    <section className="metric-grid">
      {rows.map(([key, value]) => (
        <div key={key} className="metric-card">
          <span>{key}</span>
          <strong>{text(value)}</strong>
        </div>
      ))}
    </section>
  );
}

function AiAdminFilters({
  params,
  onChange,
  showScene = false,
  showStatus = false,
  showRating = false,
  showType = false
}: {
  params: URLSearchParams;
  onChange: (patch: Record<string, unknown>) => void;
  showScene?: boolean;
  showStatus?: boolean;
  showRating?: boolean;
  showType?: boolean;
}) {
  return (
    <section className="panel form-grid ai-filter-panel">
      <div className="compact-filter">
        <input value={params.get("keyword") ?? ""} placeholder="搜索关键词" onChange={(event) => onChange({ keyword: event.currentTarget.value, page: 1 })} />
        <input value={params.get("userId") ?? ""} placeholder="用户 ID" onChange={(event) => onChange({ userId: event.currentTarget.value, page: 1 })} />
        <input value={params.get("conversationId") ?? ""} placeholder="会话 ID" onChange={(event) => onChange({ conversationId: event.currentTarget.value, page: 1 })} />
        {showScene ? <select value={params.get("scene") ?? "all"} onChange={(event) => onChange({ scene: event.currentTarget.value, page: 1 })}>
          <option value="all">全部场景</option>
          <option value="chat">通用问答</option>
          <option value="request_filter">需求筛选</option>
          <option value="request_draft">发布草稿</option>
          <option value="order_summary">订单摘要</option>
          <option value="dispute_summary">纠纷摘要</option>
          <option value="rules">规则问答</option>
        </select> : null}
        {showStatus ? <select value={params.get("status") ?? "all"} onChange={(event) => onChange({ status: event.currentTarget.value, page: 1 })}>
          <option value="all">全部状态</option>
          <option value="success">成功</option>
          <option value="failed">失败</option>
          <option value="blocked">已拦截</option>
          <option value="active">进行中</option>
          <option value="closed">已关闭</option>
          <option value="error">异常</option>
          <option value="review">需复核</option>
          <option value="resolved">已处理</option>
          <option value="pending">待处理</option>
        </select> : null}
        {showRating ? <select value={params.get("rating") ?? "all"} onChange={(event) => onChange({ rating: event.currentTarget.value, page: 1 })}>
          <option value="all">全部反馈</option>
          <option value="useful">有用</option>
          <option value="useless">无用</option>
          <option value="wrong">错误</option>
          <option value="unsafe">不安全</option>
        </select> : null}
        {showType ? <select value={params.get("type") ?? "all"} onChange={(event) => onChange({ type: event.currentTarget.value, page: 1 })}>
          <option value="all">全部类型</option>
          <option value="timeout">超时</option>
          <option value="failed">模型失败</option>
          <option value="sensitive_hit">敏感词命中</option>
          <option value="unauthorized">越权尝试</option>
          <option value="high_risk">高风险请求</option>
        </select> : null}
      </div>
    </section>
  );
}

function AiLogTable({ rows }: { rows: AiCallLog[] }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>会话</th>
            <th>用户</th>
            <th>场景</th>
            <th>状态</th>
            <th>耗时</th>
            <th>令牌</th>
            <th>风险</th>
            <th>时间</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => (
            <tr key={String(item.callId)}>
              <td>
                <div className="mono">#{text(item.conversationId ?? item.callId)}</div>
                <div className="muted small">{text(item.callId)}</div>
              </td>
              <td>{text(item.user?.displayName ?? item.user?.username ?? item.userId)}</td>
              <td>{text(item.sceneText ?? item.scene)}</td>
              <td><Badge tone={item.status === "success" ? "success" : item.status === "blocked" ? "danger" : "warning"}>{text(item.statusText ?? item.status)}</Badge></td>
              <td>{text(item.durationMs, "0")} ms</td>
              <td>{text(item.requestTokens, "0")} / {text(item.responseTokens, "0")}</td>
              <td>{text(item.riskLevel, "low")}</td>
              <td>{fullDateText(item.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AiConversationTable({ rows, onOpen }: { rows: AiConversation[]; onOpen: (id: string | number) => void }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>会话</th>
            <th>用户</th>
            <th>场景</th>
            <th>状态</th>
            <th>消息数</th>
            <th>敏感命中</th>
            <th>更新时间</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => (
            <tr key={String(item.conversationId)} onClick={() => onOpen(item.conversationId)} className="clickable-row">
              <td>
                <div className="mono">#{text(item.conversationId)}</div>
                <div className="muted small">{text(item.preview, "暂无预览")}</div>
              </td>
              <td>{text(item.user?.displayName ?? item.user?.username ?? item.userId)}</td>
              <td>{text(item.sceneText ?? item.scene)}</td>
              <td><Badge tone={item.status === "active" ? "success" : item.status === "review" ? "warning" : "neutral"}>{text(item.statusText ?? item.status)}</Badge></td>
              <td>{text(item.messageCount, "0")}</td>
              <td>{text(item.sensitiveHitCount, "0")}</td>
              <td>{fullDateText(item.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AiFeedbackTable({
  rows,
  selectedIds,
  onToggle,
  onResolve,
  onOpenConversation
}: {
  rows: AiFeedback[];
  selectedIds: Array<string | number>;
  onToggle: (id: string | number) => void;
  onResolve: (id: string | number) => void;
  onOpenConversation: (id: string | number) => void;
}) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>选择</th>
            <th>反馈</th>
            <th>用户</th>
            <th>场景</th>
            <th>状态</th>
            <th>时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => (
            <tr key={String(item.feedbackId)}>
              <td><input type="checkbox" checked={selectedIds.includes(item.feedbackId)} onChange={() => onToggle(item.feedbackId)} /></td>
              <td>
                <div>{text(item.ratingText ?? item.rating)}</div>
                <div className="muted small">{text(item.comment, "无文字反馈")}</div>
              </td>
              <td>{text(item.user?.displayName ?? item.user?.username ?? item.userId)}</td>
              <td>{text(item.conversation?.sceneText ?? item.conversation?.scene)}</td>
              <td><Badge tone={item.resolved ? "success" : "warning"}>{text(item.statusText ?? item.status)}</Badge></td>
              <td>{fullDateText(item.createdAt)}</td>
              <td>
                <div className="row-actions">
                  <button className="link-btn" type="button" onClick={() => onResolve(item.feedbackId)} disabled={item.resolved}>标记已处理</button>
                  {item.conversation?.conversationId ? <button className="link-btn" type="button" onClick={() => onOpenConversation(item.conversation!.conversationId!)}>查看会话</button> : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AiErrorTable({ rows, selectedIds, onToggle }: { rows: AiError[]; selectedIds: Array<string | number>; onToggle: (id: string | number) => void }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>选择</th>
            <th>异常</th>
            <th>用户</th>
            <th>类型</th>
            <th>状态</th>
            <th>风险</th>
            <th>时间</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => (
            <tr key={String(item.callId)}>
              <td><input type="checkbox" checked={selectedIds.includes(item.callId)} onChange={() => onToggle(item.callId)} /></td>
              <td>
                <div className="mono">#{text(item.callId)}</div>
                <div className="muted small">{text(item.reason ?? item.errorMessage)}</div>
              </td>
              <td>{text(item.user?.displayName ?? item.user?.username ?? item.userId)}</td>
              <td>{text(item.exceptionText ?? item.exceptionType ?? item.sceneText)}</td>
              <td><Badge tone={item.status === "blocked" ? "danger" : item.status === "success" ? "success" : "warning"}>{text(item.statusText ?? item.status)}</Badge></td>
              <td>{text(item.riskLevel, "low")}</td>
              <td>{fullDateText(item.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function applyPatch(params: URLSearchParams, patch: Record<string, unknown>) {
  const next = new URLSearchParams(params);
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null || value === "") {
      next.delete(key);
    } else {
      next.set(key, String(value));
    }
  }
  return next;
}

function joinList(items: string[]) {
  return items.length ? items.join("，") : "-";
}

function toId(value: unknown): string | number | null {
  return typeof value === "string" || typeof value === "number" ? value : null;
}

function messageId(prefix: string) {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function assistantContent(payload: unknown, fallback = "") {
  if (!payload || typeof payload !== "object") {
    return fallback || "AI 已返回结果。";
  }
  const record = payload as Record<string, unknown>;
  const message = record.message && typeof record.message === "object" ? record.message as Record<string, unknown> : null;
  return String(record.answer ?? message?.content ?? record.content ?? (fallback || "AI 已返回结果。"));
}

async function copyRichMessage(markdown: string) {
  const html = wrapClipboardHtml(renderAiRichText(markdown));
  const plain = aiRichTextToPlainText(markdown);
  if (navigator.clipboard && typeof ClipboardItem !== "undefined") {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([plain], { type: "text/plain" })
      })
    ]);
    return;
  }
  await navigator.clipboard?.writeText(plain);
}

function wrapClipboardHtml(html: string) {
  return `<article class="ai-rich-content">${html}</article>`;
}

async function loadConversation(api: ApiClient, conversationId: string | number, setMessages: React.Dispatch<React.SetStateAction<AiMessage[]>>) {
  const payload = await api.ai.conversation(String(conversationId));
  const conversation = asRecord(payload.conversation);
  const messages = asArray<AiMessage>(conversation.messages, "messages");
  setMessages(messages.map((item) => ({ ...item, role: item.senderType === "ai" ? "assistant" : "user" })));
}
