import React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { ApiClient } from "../api";
import { Field, PageHeader, StateView, asArray, friendlyError, text, useAsync, useMutationTracker } from "./shared";

export function OrdersPage({ api }: { api: ApiClient }) {
  const state = useAsync(() => api.orders.list({ page: 1, pageSize: 20 }), [api]);
  const orders = asArray<Record<string, unknown>>(state.data, "orders");
  return (
    <>
      <PageHeader title="我的订单" />
      <StateView loading={state.loading} error={state.error} empty={orders.length === 0}>
        <div className="card-list">{orders.map((order) => (
          <Link className="card interactive" key={text(order.orderId)} to={`/orders/${text(order.orderId)}`}>
            <div className="card-title">订单 #{text(order.orderId)}</div>
            <p>{text(order.statusText ?? order.status)}</p>
          </Link>
        ))}</div>
      </StateView>
    </>
  );
}

export function OrderDetailPage({ api }: { api: ApiClient }) {
  const { id = "" } = useParams();
  const state = useAsync(() => api.orders.detail(id), [api, id]);
  const order = (state.data?.order ?? state.data) as Record<string, unknown> | null;
  const confirmMutation = useMutationTracker();
  return (
    <>
      <PageHeader title="订单详情" />
      <StateView loading={state.loading} error={state.error} empty={!order}>
        <article className="panel">
          <h2>订单 #{text(order?.orderId ?? id)}</h2>
          <p>{text(order?.statusText ?? order?.status)}</p>
          <div className="action-row">
            <button className="btn btn--primary" disabled={confirmMutation.busy} onClick={() => confirmMutation.run(() => api.orders.confirm(id), () => state.reload()).catch(() => {})}>{confirmMutation.busy ? "确认中..." : "确认完成"}</button>
            <Link className="btn btn--secondary" to="/reviews/new">评价</Link>
            <Link className="btn btn--secondary" to="/disputes/new">发起纠纷</Link>
          </div>
          {confirmMutation.error ? <p className="field-error">{confirmMutation.error}</p> : null}
        </article>
      </StateView>
    </>
  );
}

export function ReviewPage({ api }: { api: ApiClient }) {
  const navigate = useNavigate();
  return (
    <>
      <PageHeader title="订单评价" />
      <form className="panel form-grid" onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        await api.orders.review(String(form.get("orderId")), {
          rating: Number(form.get("rating")),
          content: form.get("content")
        });
        navigate("/orders", { replace: true });
      }}>
        <Field label="订单 ID"><input name="orderId" required /></Field>
        <Field label="评分"><input name="rating" type="number" min="1" max="5" required /></Field>
        <Field label="评价内容"><textarea name="content" rows={5} required /></Field>
        <button className="btn btn--primary">提交评价</button>
      </form>
    </>
  );
}
