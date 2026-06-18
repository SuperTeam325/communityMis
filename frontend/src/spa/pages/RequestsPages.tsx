import React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { ApiClient } from "../api";
import { fileAssetUrl } from "../avatar";
import {
  AttachmentPreviewList,
  asArray,
  asRecord,
  Badge,
  dateText,
  FileUpload,
  Field,
  friendlyError,
  PageHeader,
  PaginationControls,
  StateView,
  statusLabel,
  statusTone,
  text,
  useAsync,
  useMutationTracker,
  useQueryParams
} from "./shared";

const REQUEST_STATUS_FILTERS = [
  ["open", "待接单"],
  ["accepted", "已接单"],
  ["completed", "已完成"],
  ["all", "全部"]
] as const;

const REQUEST_SORTS = [
  ["latest", "最新"],
  ["coin_desc", "报酬高"],
  ["hours_asc", "耗时少"],
  ["credit_desc", "信誉高"]
] as const;

type UploadedAttachment = {
  fileId: string;
  name: string;
  originalName?: string;
  mimeType?: string;
  type?: string;
  size?: number;
  sizeBytes?: number;
  url?: string;
};

export function TasksPage({ api }: { api: ApiClient }) {
  const { params, setParams } = useQueryParams();
  const query = {
    page: Number(params.get("page") || 1),
    pageSize: 20,
    status: params.get("status") || "open",
    categoryId: params.get("categoryId") || "",
    keyword: params.get("keyword") || "",
    sort: params.get("sort") || "latest"
  };
  const state = useAsync(() => api.requests.list(query), [api, params.toString()]);
  const categoriesState = useAsync(() => api.categories.list(), [api]);
  const requests = asArray<Record<string, unknown>>(state.data, "requests");
  const categories = asArray<Record<string, unknown>>(categoriesState.data, "categories");
  const pagination = asRecord(state.data?.pagination);
  const updateQuery = (patch: Record<string, unknown>) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === null || value === "" || value === "all") {
          next.delete(key);
        } else {
          next.set(key, String(value));
        }
      }
      if (!Object.prototype.hasOwnProperty.call(patch, "page")) next.set("page", "1");
      if (next.get("page") === "1") next.delete("page");
      return next;
    });
  };

  return (
    <>
      <PageHeader title="任务市场" action={<Link className="btn btn--primary" to="/post">发布</Link>} />
      <section className="panel filter-panel">
        <form className="inline-form" onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          updateQuery({ keyword: form.get("keyword"), page: 1 });
        }}>
          <input name="keyword" placeholder="搜索任务" defaultValue={query.keyword} />
          <button className="btn btn--secondary">搜索</button>
        </form>
        <div className="filter-row" aria-label="任务状态">
          {REQUEST_STATUS_FILTERS.map(([value, label]) => (
            <button key={value} className={`chip ${query.status === value ? "active" : ""}`} onClick={() => updateQuery({ status: value, page: 1 })}>{label}</button>
          ))}
        </div>
        <div className="filter-row" aria-label="任务类别">
          <button className={`chip ${!query.categoryId ? "active" : ""}`} onClick={() => updateQuery({ categoryId: "", page: 1 })}>全部类别</button>
          {categories.map((category) => (
            <button
              key={text(category.categoryId)}
              className={`chip ${query.categoryId === text(category.categoryId, "") ? "active" : ""}`}
              onClick={() => updateQuery({ categoryId: category.categoryId, page: 1 })}
            >
              {text(category.name)}
            </button>
          ))}
        </div>
        <div className="filter-row" aria-label="排序">
          {REQUEST_SORTS.map(([value, label]) => (
            <button key={value} className={`chip ${query.sort === value ? "active" : ""}`} onClick={() => updateQuery({ sort: value, page: 1 })}>{label}</button>
          ))}
        </div>
      </section>
      <StateView loading={state.loading} error={state.error} empty={requests.length === 0}>
        <div className="card-list">
          {requests.map((item) => (
            <RequestCard key={text(item.requestId)} item={item} api={api} />
          ))}
        </div>
      </StateView>
      <PaginationControls pagination={pagination} onPageChange={(page) => updateQuery({ page })} />
    </>
  );
}

export function PostPage({ api }: { api: ApiClient }) {
  const navigate = useNavigate();
  const mutation = useMutationTracker();
  const { params } = useQueryParams();
  const initialDraft = React.useMemo(() => draftDescriptionFromQuery(params.get("draft")), []);
  const categoriesState = useAsync(() => api.categories.list(), [api]);
  const tagsState = useAsync(() => api.tags.list(), [api]);
  const categories = asArray<Record<string, unknown>>(categoriesState.data, "categories");
  const tags = asArray<Record<string, unknown>>(tagsState.data, "tags");
  const [draft, setDraft] = React.useState(initialDraft);
  const [files, setFiles] = React.useState<UploadedAttachment[]>([]);
  const [selectedTags, setSelectedTags] = React.useState<string[]>([]);
  const [draftBusy, setDraftBusy] = React.useState(false);
  const [draftError, setDraftError] = React.useState("");
  const [published, setPublished] = React.useState<{ requestId: string; title: string } | null>(null);
  const [publishTab] = React.useState<"task">("task");

  const toggleTag = (tag: string) => {
    setSelectedTags((current) => current.includes(tag)
      ? current.filter((item) => item !== tag)
      : [...current, tag].slice(0, 8));
  };

  return (
    <>
      <PageHeader title="发布需求" />
      <section className="panel publish-tabs" aria-label="发布类型">
        <button className={`chip active`} type="button" data-tab="task">{publishTab === "task" ? "需求发布" : "发布"}</button>
      </section>
      <form className="panel form-grid" onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        await mutation.run(async () => {
          const payload = await api.requests.create({
            title: form.get("title"),
            description: form.get("description"),
            categoryId: form.get("categoryId"),
            estimatedHours: Number(form.get("estimatedHours") || 0),
            coinAmount: Number(form.get("coinAmount") || 0),
            location: form.get("location"),
            tags: selectedTags.length > 0 ? selectedTags : String(form.get("tags") ?? "").split(/[，,]/).map((item) => item.trim()).filter(Boolean),
            attachments: files.map(attachmentPayload)
          });
          const request = asRecord(payload.request ?? payload);
          const requestId = text(request.requestId ?? payload.requestId, "");
          if (requestId) {
            setPublished({ requestId, title: text(request.title ?? form.get("title")) });
            setDraft("");
            setFiles([]);
            setSelectedTags([]);
          }
          return payload;
        });
      }}>
        <Field label="标题"><input id="task-title" name="title" required minLength={2} maxLength={100} /></Field>
        <Field label="描述"><textarea id="task-description" name="description" rows={6} required minLength={5} maxLength={2000} value={draft} onChange={(event) => setDraft(event.currentTarget.value)} /></Field>
        <Field label="类别">
          <select name="categoryId" required defaultValue="">
            <option value="" disabled>请选择类别</option>
            {categories.map((category) => <option key={text(category.categoryId)} value={text(category.categoryId)}>{text(category.name)}</option>)}
          </select>
        </Field>
        <div className="form-two-col">
          <Field label="预计耗时"><input id="task-hours" name="estimatedHours" type="number" min="0.5" step="0.5" required /></Field>
          <Field label="时间币报酬"><input id="task-coins" name="coinAmount" type="number" min="1" step="0.01" required /></Field>
        </div>
        <Field label="服务地点"><input id="task-location" name="location" maxLength={120} placeholder="如 2 号楼 802" /></Field>
        <Field label="标签">
          <input name="tags" placeholder="可手动输入，多个标签用逗号分隔" />
        </Field>
        <div id="task-tags" className="filter-row" aria-label="推荐标签">
          {tags.slice(0, 16).map((tag) => {
            const name = text(tag.name, "");
            return <button key={name} type="button" className={`chip tag-chip ${selectedTags.includes(name) ? "active" : ""}`} onClick={() => toggleTag(name)}>{name}</button>;
          })}
        </div>
        <div className="action-row">
          <button className="btn btn--secondary" type="button" disabled={draftBusy} onClick={async (event) => {
            setDraftBusy(true);
            setDraftError("");
            try {
              const form = new FormData(event.currentTarget.form ?? undefined);
              const title = text(form.get("title"), "");
              const description = text(form.get("description"), "");
              const result = await api.ai.requestDraft({
                prompt: [title, description].filter(Boolean).join("\n") || "帮我写一个社区互助需求草稿",
                title,
                description,
                categoryId: form.get("categoryId"),
                estimatedHours: Number(form.get("estimatedHours") || 0) || undefined,
                coinAmount: Number(form.get("coinAmount") || 0) || undefined,
                location: form.get("location"),
                tags: selectedTags.length > 0 ? selectedTags : String(form.get("tags") ?? "").split(/[，,]/).map((item) => item.trim()).filter(Boolean)
              });
              setDraft(draftDescription(result));
            } catch (reason) {
              setDraftError(friendlyError(reason));
            } finally {
              setDraftBusy(false);
            }
          }}>{draftBusy ? "生成中..." : "AI 草稿"}</button>
        </div>
        <FileUpload purpose="request-image" businessType="request" visibility="public" onUploaded={async (formData) => {
          const result = await api.files.upload(formData);
          const file = asRecord(result.file ?? result);
          const fileId = text(file.fileId ?? result.fileId, "");
          if (fileId) {
            setFiles((current) => [...current, {
              fileId,
              name: text(file.originalName ?? file.filename ?? file.name, fileId),
              originalName: text(file.originalName ?? file.filename ?? file.name, ""),
              mimeType: text(file.mimeType, ""),
              type: text(file.mimeType, "file"),
              size: Number(file.size ?? file.sizeBytes ?? 0),
              sizeBytes: Number(file.sizeBytes ?? file.size ?? 0),
              url: fileAssetUrl({ ...file, fileId }, api)
            }]);
          }
        }} />
        <AttachmentPreviewList attachments={files} api={api} />
        {draftError || mutation.error ? <p className="field-error" role="alert">{draftError || mutation.error}</p> : null}
        <button id="submit-btn" className="btn btn--primary" disabled={mutation.busy}>{mutation.busy ? "发布中..." : "发布需求"}</button>
      </form>
      {published ? (
        <section id="publish-success-panel" className="panel" role="status">
          <h2>需求已发布</h2>
          <p>{published.title} 已进入任务市场。</p>
          <div className="action-row">
            <Link className="btn btn--primary" to={`/posts/${encodeURIComponent(published.requestId)}`}>查看详情</Link>
            <Link className="btn btn--secondary" to="/feed">返回信息流</Link>
          </div>
        </section>
      ) : null}
    </>
  );
}

function draftDescription(value: unknown): string {
  if (typeof value === "string") return value;
  const record = asRecord(value);
  const draft = asRecord(record.draft);
  const message = asRecord(record.message);
  return text(
    draft.description ?? draft.content ?? draft.answer ?? record.description ?? record.content ?? record.answer ?? message.content ?? record.message,
    ""
  );
}

function draftDescriptionFromQuery(value: string | null): string {
  if (!value) return "";
  try {
    return draftDescription(JSON.parse(value));
  } catch {
    return value;
  }
}

export function RequestDetailPage({ api }: { api: ApiClient }) {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const detail = useAsync(() => api.requests.detail(id), [api, id]);
  const commentsState = useAsync(() => api.requestComments.list(id), [api, id]);
  const request = asRecord(detail.data?.request ?? detail.data);
  const publisher = asRecord(request.publisher);
  const credit = asRecord(publisher.credit ?? request.creditSummary);
  const category = asRecord(request.category);
  const comments = asArray<Record<string, unknown>>(commentsState.data, "comments");
  const acceptMutation = useMutationTracker();
  const commentMutation = useMutationTracker();

  return (
    <>
      <PageHeader title="帖子详情" action={<Link className="btn btn--secondary" to="/tasks">返回任务市场</Link>} />
      <StateView loading={detail.loading} error={detail.error} empty={!request.requestId}>
        <article className="panel detail-panel">
          <div className="section-heading">
            <h2>{text(request.title)}</h2>
            <Badge tone={statusTone(request.status)}>{statusLabel(request.status)}</Badge>
          </div>
          <p>{text(request.description || request.content)}</p>
          <AttachmentPreviewList attachments={asArray<Record<string, unknown>>(request.attachments, "")} api={api} />
          <div className="metric-grid">
            <div className="metric-card"><span>时间币</span><strong>{text(request.coinAmount)}</strong></div>
            <div className="metric-card"><span>预计耗时</span><strong>{text(request.estimatedHours)} 小时</strong></div>
            <div className="metric-card"><span>类别</span><strong>{text(category.name)}</strong></div>
            <div className="metric-card"><span>地点</span><strong>{text(request.location, "未填写")}</strong></div>
          </div>
          <div className="meta-row">
            <Link to={`/users/${text(publisher.userId)}`}>{text(publisher.displayName ?? publisher.username, "发布者")}</Link>
            <span>信誉 {text(credit.averageRating, "0")}</span>
            <span>{dateText(request.createdAt)}</span>
          </div>
          <div className="meta-row">
            {asArray<string>(request.tags, "").map((tag) => <span key={tag} className="chip">{tag}</span>)}
          </div>
          <div className="action-row">
            <button
              className="btn btn--primary"
              disabled={acceptMutation.busy || String(request.status) !== "open"}
              onClick={() => acceptMutation.run(() => api.requests.accept(id), (payload) => {
                const order = asRecord(payload.order);
                const orderId = text(order.orderId ?? payload.orderId, "");
                detail.reload();
                if (orderId) navigate(`/orders/${encodeURIComponent(orderId)}`);
              }).catch(() => {})}
            >
              {acceptMutation.busy ? "接单中..." : String(request.status) === "open" ? "接单" : "当前不可接单"}
            </button>
            <Link className="btn btn--secondary" to={`/users/${text(publisher.userId)}`}>查看发布者</Link>
            <Link className="btn btn--secondary" to={`/messages?userId=${encodeURIComponent(text(publisher.userId, ""))}`}>联系用户</Link>
          </div>
          {acceptMutation.error ? <p className="field-error">{acceptMutation.error}</p> : null}
        </article>
      </StateView>
      <section className="panel">
        <h2>评论</h2>
        <StateView loading={commentsState.loading} error={commentsState.error} empty={comments.length === 0}>
          <div className="comment-list">{comments.map((comment) => (
            <article className="card" key={text(comment.commentId)}>
              <p>{text(comment.content)}</p>
              <div className="meta-row"><span>{text((comment.author as Record<string, unknown>)?.displayName ?? comment.authorName, "邻居")}</span><span>{dateText(comment.createdAt)}</span></div>
            </article>
          ))}</div>
        </StateView>
        <form className="inline-form" onSubmit={async (event) => {
          event.preventDefault();
          const formElement = event.currentTarget;
          const form = new FormData(formElement);
          await commentMutation.run(
            () => api.requestComments.create(id, { content: form.get("content") }),
            () => {
              formElement.reset();
              commentsState.reload();
            }
          ).catch(() => {});
        }}>
          <input name="content" placeholder="写评论" required />
          <button className="btn btn--primary" disabled={commentMutation.busy}>{commentMutation.busy ? "发送中..." : "发送"}</button>
          {commentMutation.error ? <span className="field-error" role="alert">{commentMutation.error}</span> : null}
        </form>
      </section>
    </>
  );
}

function RequestCard({ item, api }: { item: Record<string, unknown>; api: ApiClient }) {
  const category = asRecord(item.category);
  const publisher = asRecord(item.publisher);
  const credit = asRecord(item.creditSummary);
  return (
    <article className="card">
      <div className="section-heading">
        <Link className="card-title" to={`/posts/${text(item.requestId)}`}>{text(item.title)}</Link>
        <Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge>
      </div>
      <p>{text(item.descriptionSummary || item.description || item.content)}</p>
      <AttachmentPreviewList attachments={asArray<Record<string, unknown>>(item.attachments, "")} api={api} compact />
      <div className="meta-row">
        <span>{text(category.name)}</span>
        <span>{text(item.coinAmount)} 时间币</span>
        <span>{text(item.estimatedHours)} 小时</span>
        <span>{text(item.location, "未填写地点")}</span>
      </div>
      <div className="meta-row">
        <Link to={`/users/${text(publisher.userId)}`}>{text(publisher.displayName ?? publisher.username, "匿名邻居")}</Link>
        <span>信誉 {text(credit.averageRating, "0")}</span>
        <span>{dateText(item.createdAt)}</span>
      </div>
      <div className="action-row"><Link className="btn btn--secondary" to={`/posts/${text(item.requestId)}`}>查看详情</Link></div>
    </article>
  );
}

function attachmentPayload(file: UploadedAttachment) {
  return {
    fileId: file.fileId,
    name: file.name,
    originalName: file.originalName || file.name,
    mimeType: file.mimeType || file.type || "file",
    type: file.type || file.mimeType || "file",
    size: Number(file.size ?? file.sizeBytes ?? 0),
    sizeBytes: Number(file.sizeBytes ?? file.size ?? 0),
    url: file.url
  };
}
