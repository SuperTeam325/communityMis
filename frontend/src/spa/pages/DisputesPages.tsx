import React from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { ApiClient } from "../api";
import { FileUpload, Field, PageHeader, StateView, asArray, friendlyError, text, useAsync } from "./shared";

export function DisputeCreatePage({ api }: { api: ApiClient }) {
  const [fileIds, setFileIds] = React.useState<string[]>([]);
  const [error, setError] = React.useState("");
  return (
    <>
      <PageHeader title="发起纠纷" />
      <form className="panel form-grid" onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        try {
          await api.orders.dispute(String(form.get("orderId")), {
            reason: form.get("reason"),
            description: form.get("description"),
            attachments: fileIds.map((fileId) => ({ fileId }))
          });
          window.location.href = "/orders";
        } catch (reason) {
          setError(friendlyError(reason));
        }
      }}>
        <Field label="订单 ID"><input name="orderId" required /></Field>
        <Field label="原因"><input name="reason" required /></Field>
        <Field label="说明"><textarea name="description" rows={5} required /></Field>
        <FileUpload purpose="dispute-evidence" businessType="dispute" visibility="private" onUploaded={async (formData) => {
          const result = await api.files.upload(formData);
          const fileId = text((result.file as Record<string, unknown>)?.fileId ?? result.fileId, "");
          if (fileId) setFileIds((current) => [...current, fileId]);
        }} />
        {error ? <p className="field-error">{error}</p> : null}
        <button className="btn btn--primary">提交纠纷</button>
      </form>
    </>
  );
}

export function DisputeDetailPage({ api }: { api: ApiClient }) {
  const { id = "" } = useParams();
  const state = useAsync(() => api.disputes.detail(id), [api, id]);
  const dispute = (state.data?.dispute ?? state.data) as Record<string, unknown> | null;
  return (
    <>
      <PageHeader title="纠纷详情" />
      <StateView loading={state.loading} error={state.error} empty={!dispute}>
        <article className="panel">
          <h2>纠纷 #{text(dispute?.disputeId ?? id)}</h2>
          <p>{text(dispute?.reason)}</p>
          <p>{text(dispute?.description)}</p>
          <FileUpload purpose="dispute-evidence" businessType="dispute" businessId={id} visibility="private" onUploaded={async (formData) => {
            const result = await api.files.upload(formData);
            const fileId = text((result.file as Record<string, unknown>)?.fileId ?? result.fileId, "");
            await api.disputes.evidence(id, { attachments: [{ fileId }] });
          }} />
        </article>
      </StateView>
    </>
  );
}

export function JuryHallPage({ api }: { api: ApiClient }) {
  const state = useAsync(() => api.jury.disputes(), [api]);
  const disputes = asArray<Record<string, unknown>>(state.data, "disputes");
  return (
    <>
      <PageHeader title="陪审大厅" />
      <StateView loading={state.loading} error={state.error} empty={disputes.length === 0}>
        <div className="card-list">
          {disputes.map((item) => {
            const disputeId = text(item.disputeId, "");
            return (
              <article className="card" key={disputeId}>
                <div className="card-title">纠纷 #{disputeId}</div>
                <p>{text(item.reason)}</p>
                <div className="meta-row">
                  <span>{text(item.statusText ?? item.status)}</span>
                  <span>{text(item.createdAt)}</span>
                </div>
                <div className="action-row">
                  <Link className="btn btn--secondary" to={`/disputes/${encodeURIComponent(disputeId)}`}>查看详情</Link>
                  <Link className="btn btn--primary" to={`/jury/disputes/${encodeURIComponent(disputeId)}`}>参与投票</Link>
                </div>
              </article>
            );
          })}
        </div>
      </StateView>
    </>
  );
}

export function JuryVotingPage({ api }: { api: ApiClient }) {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const disputeId = id || params.get("dispute") || params.get("disputeId") || params.get("id") || "";
  const state = useAsync(() => api.jury.dispute(disputeId), [api, disputeId]);
  const dispute = (state.data?.dispute ?? state.data) as Record<string, unknown> | null;
  return (
    <>
      <PageHeader title="陪审投票" />
      <StateView loading={state.loading} error={state.error} empty={!dispute}>
        <article className="panel">
          <h2>{text(dispute?.reason)}</h2>
          <p>{text(dispute?.description)}</p>
          <div className="action-row">
            {["support_initiator", "support_respondent", "abstain"].map((result) => (
              <button key={result} className="btn btn--secondary" onClick={() => api.jury.vote(disputeId, { result, reason: "前端投票" }).then(() => window.location.reload())}>{result}</button>
            ))}
          </div>
        </article>
      </StateView>
    </>
  );
}
