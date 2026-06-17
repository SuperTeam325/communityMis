import React from "react";
import { Link, useParams } from "react-router-dom";
import type { ApiClient } from "../api";
import {
  asArray,
  asRecord,
  Badge,
  dateText,
  Field,
  numberValue,
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

const ORDER_ROLE_FILTERS = [
  ["all", "全部"],
  ["posted", "我发布的"],
  ["accepted", "我接单的"]
] as const;

const ORDER_STATUS_FILTERS = [
  ["all", "全部状态"],
  ["active", "进行中"],
  ["settlement_ready", "待结算"],
  ["completed", "已完成"],
  ["disputed", "纠纷中"]
] as const;

export function OrdersPage({ api }: { api: ApiClient }) {
  const { params, setParams } = useQueryParams();
  const query = {
    page: Number(params.get("page") || 1),
    pageSize: 20,
    role: params.get("role") || "all",
    status: params.get("status") || "all",
    sort: params.get("sort") || "latest"
  };
  const state = useAsync(() => api.orders.list(query), [api, params.toString()]);
  const orders = asArray<Record<string, unknown>>(state.data, "orders");
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
      <PageHeader title="我的订单" />
      <section className="panel filter-panel">
        <div className="filter-row" aria-label="订单角色">
          {ORDER_ROLE_FILTERS.map(([value, label]) => (
            <button key={value} className={`chip ${query.role === value ? "active" : ""}`} onClick={() => updateQuery({ role: value, page: 1 })}>{label}</button>
          ))}
        </div>
        <div className="filter-row" aria-label="订单状态">
          {ORDER_STATUS_FILTERS.map(([value, label]) => (
            <button key={value} className={`chip ${query.status === value ? "active" : ""}`} onClick={() => updateQuery({ status: value, page: 1 })}>{label}</button>
          ))}
        </div>
      </section>
      <StateView loading={state.loading} error={state.error} empty={orders.length === 0}>
        <div className="card-list">{orders.map((order) => <OrderCard key={text(order.orderId)} order={order} />)}</div>
      </StateView>
      <PaginationControls pagination={pagination} onPageChange={(page) => updateQuery({ page })} />
    </>
  );
}

export function OrderDetailPage({ api }: { api: ApiClient }) {
  const { id = "" } = useParams();
  const state = useAsync(() => api.orders.detail(id), [api, id]);
  const order = asRecord(state.data?.order ?? state.data);
  const request = asRecord(order.request);
  const publisher = asRecord(order.publisher);
  const provider = asRecord(order.provider);
  const confirmation = asRecord(order.confirmation);
  const reviewState = asRecord(order.reviewState);
  const confirmMutation = useMutationTracker();

  return (
    <>
      <PageHeader title="订单详情" action={<Link className="btn btn--secondary" to="/orders">返回订单</Link>} />
      <StateView loading={state.loading} error={state.error} empty={!order.orderId}>
        <article className="panel detail-panel">
          <div className="section-heading">
            <h2>{text(request.title, `订单 #${text(order.orderId ?? id)}`)}</h2>
            <Badge tone={statusTone(order.status)}>{statusLabel(order.status)}</Badge>
          </div>
          <p>{text(request.description, "暂无需求描述")}</p>
          <div className="metric-grid">
            <div className="metric-card"><span>时间币</span><strong>{text(order.coinAmount)}</strong></div>
            <div className="metric-card"><span>我的角色</span><strong>{myRoleLabel(order.myRole)}</strong></div>
            <div className="metric-card"><span>需求方确认</span><strong>{confirmation.payerConfirmed ? "已确认" : "未确认"}</strong></div>
            <div className="metric-card"><span>服务方确认</span><strong>{confirmation.providerConfirmed ? "已确认" : "未确认"}</strong></div>
          </div>
          <section className="panel nested-panel">
            <h3>参与方</h3>
            <div className="meta-row">
              <Link to={`/users/${text(publisher.userId)}`}>需求方：{text(publisher.displayName ?? publisher.username)}</Link>
              <Link to={`/users/${text(provider.userId)}`}>服务方：{text(provider.displayName ?? provider.username)}</Link>
            </div>
          </section>
          <section className="panel nested-panel">
            <h3>订单时间线</h3>
            <ol className="timeline-list">
              <li><strong>创建订单</strong><span>{dateText(order.createdAt)}</span></li>
              {order.payerConfirmed ? <li><strong>需求方确认</strong><span>已完成</span></li> : null}
              {order.providerConfirmed ? <li><strong>服务方确认</strong><span>已完成</span></li> : null}
              {order.completedAt ? <li><strong>订单完成</strong><span>{dateText(order.completedAt)}</span></li> : null}
            </ol>
          </section>
          <div className="action-row">
            <button
              className="btn btn--primary"
              disabled={confirmMutation.busy || !order.canConfirm}
              onClick={() => confirmMutation.run(() => api.orders.confirm(id), () => state.reload()).catch(() => {})}
            >
              {confirmMutation.busy ? "确认中..." : order.canConfirm ? "确认完成" : "无需确认"}
            </button>
            {reviewState.canReview ? (
              <Link className="btn btn--secondary" to={`/reviews/new?orderId=${encodeURIComponent(text(order.orderId ?? id))}`}>评价</Link>
            ) : null}
            {reviewState.hasReviewed ? <span className="chip active">已评价</span> : null}
            {order.canDispute ? <Link className="btn btn--secondary" to={`/disputes/new?orderId=${encodeURIComponent(text(order.orderId ?? id))}`}>发起纠纷</Link> : null}
            {order.disputeId ? <Link className="btn btn--secondary" to={`/disputes/${text(order.disputeId)}`}>查看纠纷</Link> : null}
          </div>
          {confirmMutation.error ? <p className="field-error">{confirmMutation.error}</p> : null}
        </article>
      </StateView>
    </>
  );
}

export function ReviewPage({ api }: { api: ApiClient }) {
  const { params } = useQueryParams();
  const orderId = params.get("orderId") || "";
  const state = useAsync(() => orderId ? api.orders.detail(orderId) : Promise.resolve({ order: null }), [api, orderId]);
  const mutation = useMutationTracker();
  const [submitted, setSubmitted] = React.useState(false);
  const order = asRecord(state.data?.order);
  const request = asRecord(order.request);
  const reviewState = asRecord(order.reviewState);
  const targetId = text(reviewState.targetId, "");

  return (
    <>
      <PageHeader title="订单评价" action={orderId ? <Link className="btn btn--secondary" to={`/orders/${encodeURIComponent(orderId)}`}>返回订单</Link> : null} />
      {!orderId ? <div className="state-card state-card--error">缺少订单 ID，请从订单详情进入评价。</div> : null}
      {submitted ? (
        <section className="panel" role="status">
          <h2>评价已提交</h2>
          <p>评价会同步到对方公开主页和信用详情。</p>
          <div className="action-row">
            <Link className="btn btn--primary" to={`/orders/${encodeURIComponent(orderId)}`}>返回订单详情</Link>
            <Link className="btn btn--secondary" to="/orders">查看我的订单</Link>
          </div>
        </section>
      ) : (
        <StateView loading={state.loading} error={state.error} empty={Boolean(orderId) && !order.orderId}>
          <form className="panel form-grid" onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            await mutation.run(() => api.orders.review(orderId, {
              targetId: numberValue(targetId),
              rating: Number(form.get("rating")),
              tags: String(form.get("tags") ?? "").split(/[，,]/).map((item) => item.trim()).filter(Boolean),
              comment: form.get("comment")
            }), () => {
              setSubmitted(true);
            }).catch(() => {});
          }}>
            <section className="panel nested-panel">
              <h3>{text(request.title, `订单 #${orderId}`)}</h3>
              <p>{statusLabel(order.status)} · {text(order.coinAmount)} 时间币</p>
            </section>
            {!reviewState.canReview ? (
              <div className="state-card">当前订单暂不可评价，可能尚未完成或已经评价。</div>
            ) : null}
            <Field label="评分"><input name="rating" type="number" min="1" max="5" defaultValue={5} required disabled={!reviewState.canReview} /></Field>
            <Field label="评价标签"><input name="tags" placeholder="专业、准时、沟通顺畅" disabled={!reviewState.canReview} /></Field>
            <Field label="评价内容"><textarea name="comment" rows={5} required minLength={5} disabled={!reviewState.canReview} /></Field>
            {mutation.error ? <p className="field-error" role="alert">{mutation.error}</p> : null}
            <button className="btn btn--primary" disabled={mutation.busy || !reviewState.canReview}>{mutation.busy ? "提交中..." : "提交评价"}</button>
          </form>
        </StateView>
      )}
    </>
  );
}

function OrderCard({ order }: { order: Record<string, unknown> }) {
  const request = asRecord(order.request);
  const reviewState = asRecord(order.reviewState);
  return (
    <Link className="card interactive" to={`/orders/${text(order.orderId)}`}>
      <div className="section-heading">
        <div className="card-title">{text(request.title, `订单 #${text(order.orderId)}`)}</div>
        <Badge tone={statusTone(order.status)}>{statusLabel(order.status)}</Badge>
      </div>
      <p>{text(request.descriptionSummary ?? request.description, "暂无需求描述")}</p>
      <div className="meta-row">
        <span>{text(order.coinAmount)} 时间币</span>
        <span>{myRoleLabel(order.myRole)}</span>
        <span>{dateText(order.createdAt)}</span>
        {order.canConfirm ? <span className="chip active">待我确认</span> : null}
        {reviewState.canReview ? <span className="chip active">待评价</span> : null}
      </div>
    </Link>
  );
}

function myRoleLabel(role: unknown) {
  if (role === "posted") return "需求方";
  if (role === "accepted") return "服务方";
  return "参与方";
}
