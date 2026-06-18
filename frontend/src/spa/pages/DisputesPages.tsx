import React from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { ApiClient } from "../api";
import { fileAssetUrl } from "../avatar";
import {
  AttachmentPreviewList,
  Badge,
  FileUpload,
  Field,
  PageHeader,
  PaginationControls,
  StateView,
  asArray,
  asRecord,
  dateText,
  friendlyError,
  fullDateText,
  labelFromMap,
  moneyText,
  pageFromParams,
  safeInternalHref,
  text,
  useAsync,
  useMutationTracker,
  useQueryParams
} from "./shared";

type EvidenceAttachment = {
  fileId?: string;
  name: string;
  originalName?: string;
  mimeType?: string;
  type?: string;
  size?: number;
  url?: string;
};

const DISPUTE_TYPES = [
  ["quality_issue", "服务质量"],
  ["not_completed", "未完成"],
  ["communication", "沟通争议"],
  ["other", "其他"]
] as const;

const DISPUTE_STATUSES = [
  ["all", "全部"],
  ["pending", "待受理"],
  ["evidence_collecting", "举证中"],
  ["jury_voting", "陪审中"],
  ["admin_review", "管理员复核"],
  ["resolved", "已裁决"],
  ["cancelled", "已取消"]
] as const;

const DISPUTE_ROLES = [
  ["all", "全部角色"],
  ["initiator", "我发起"],
  ["respondent", "我响应"]
] as const;

const JURY_VOTES = [
  ["publisher", "支持需求方"],
  ["provider", "支持服务方"],
  ["mediate", "建议调解"]
] as const;

const DISPUTE_TYPE_LABELS: Record<string, string> = Object.fromEntries(DISPUTE_TYPES);
const DISPUTE_STATUS_LABELS: Record<string, string> = Object.fromEntries(DISPUTE_STATUSES);
const DISPUTE_ROLE_LABELS: Record<string, string> = Object.fromEntries(DISPUTE_ROLES);
const JURY_VOTE_LABELS: Record<string, string> = Object.fromEntries(JURY_VOTES);

export function DisputeCreatePage({ api }: { api: ApiClient }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const orderId = params.get("order") ?? params.get("orderId") ?? "";
  const [attachments, setAttachments] = React.useState<EvidenceAttachment[]>([]);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  return (
    <>
      <PageHeader title="发起纠纷" />
      <form className="panel form-grid" onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError("");
        const form = new FormData(event.currentTarget);
        const targetOrderId = text(form.get("orderId"), "");
        try {
          const result = await api.orders.dispute(targetOrderId, {
            type: form.get("type"),
            reason: form.get("reason"),
            description: form.get("description"),
            evidence: [{
              evidenceType: attachments.length > 0 ? "file" : "text",
              content: text(form.get("evidenceContent"), ""),
              attachments
            }]
          });
          const dispute = asRecord(result.dispute);
          navigate(`/disputes/${encodeURIComponent(text(dispute.disputeId, ""))}`, { replace: true });
        } catch (reason) {
          setError(friendlyError(reason));
        } finally {
          setBusy(false);
        }
      }}>
        <Field label="订单 ID"><input name="orderId" defaultValue={orderId} required /></Field>
        <Field label="纠纷类型">
          <select name="type" defaultValue="quality_issue">
            {DISPUTE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </Field>
        <Field label="原因"><input name="reason" required /></Field>
        <Field label="说明"><textarea name="description" rows={5} required /></Field>
        <Field label="初始证据说明"><textarea name="evidenceContent" rows={3} placeholder="补充聊天记录、完成情况或现场说明" /></Field>
        <FileUpload purpose="dispute-evidence" businessType="dispute" visibility="private" onUploaded={async (formData) => {
          const result = await api.files.upload(formData);
          const attachment = attachmentFromUpload(result, api);
          if (attachment) setAttachments((current) => [...current, attachment]);
        }} />
        <AttachmentPreviewList attachments={attachments} api={api} />
        {error ? <p className="field-error" role="alert">{error}</p> : null}
        <button className="btn btn--primary" disabled={busy}>{busy ? "提交中..." : "提交纠纷"}</button>
      </form>
    </>
  );
}

export function DisputeDetailPage({ api }: { api: ApiClient }) {
  const { id = "" } = useParams();
  const listParams = useQueryParams();
  const status = option(listParams.params.get("status"), DISPUTE_STATUS_LABELS, "all");
  const role = option(listParams.params.get("role"), DISPUTE_ROLE_LABELS, "all");
  const page = pageFromParams(listParams.params);
  const state = useAsync(() => api.disputes.detail(id), [api, id]);
  const myState = useAsync(() => api.disputes.my({ status, role, page, pageSize: 6 }), [api, status, role, page]);
  const dispute = asRecord(state.data?.dispute ?? state.data);
  const myDisputes = asArray<Record<string, unknown>>(myState.data, "disputes");
  const juryResult = asRecord(dispute.juryResult);

  return (
    <>
      <PageHeader title="纠纷详情" action={<Link className="btn btn--secondary" to="/jury">陪审大厅</Link>} />
      <StateView loading={state.loading} error={state.error} empty={!dispute.disputeId}>
        <article className="panel detail-panel">
          <div className="section-heading">
            <div>
              <h2>纠纷 #{text(dispute.disputeId ?? id)}</h2>
              <p className="muted">{text(asRecord(dispute.request).title, "邻里互助订单")} · 订单 #{text(dispute.orderId)}</p>
            </div>
            <Badge tone={statusTone(dispute.status)}>{labelFromMap(dispute.status, DISPUTE_STATUS_LABELS)}</Badge>
          </div>
          <div className="metric-grid">
            <div className="metric-card"><span>类型</span><strong>{labelFromMap(dispute.type, DISPUTE_TYPE_LABELS)}</strong></div>
            <div className="metric-card"><span>金额</span><strong>{moneyText(dispute.coinAmount ?? asRecord(dispute.order).coinAmount)}</strong></div>
            <div className="metric-card"><span>退款建议</span><strong>{moneyText(dispute.refundAmount, "-")}</strong></div>
            <div className="metric-card"><span>陪审票数</span><strong>{String(juryResult.total ?? 0)}</strong></div>
          </div>
          <section className="nested-panel panel">
            <h3>{text(dispute.reason)}</h3>
            <p>{text(dispute.description)}</p>
            {dispute.finalResult ? <p><strong>最终结果:</strong> {text(dispute.finalResult)}</p> : null}
            {dispute.resolutionNote ? <p><strong>处理说明:</strong> {text(dispute.resolutionNote)}</p> : null}
          </section>
          <div className="form-two-col">
            <PartyPanel title="需求方" party={asRecord(dispute.publisher ?? dispute.initiator)} />
            <PartyPanel title="服务方" party={asRecord(dispute.provider ?? dispute.respondent)} />
          </div>
          <FreezePanel freeze={asRecord(dispute.freeze)} />
          <ProgressPanel progress={asRecord(dispute.progress)} />
          <EvidenceList evidence={asArray<Record<string, unknown>>(dispute.evidence, "")} api={api} />
          <JuryResultPanel juryResult={juryResult} />
          <EvidenceForm api={api} disputeId={id} onSubmitted={state.reload} />
        </article>
      </StateView>

      <section className="panel">
        <div className="section-heading">
          <h2>我的纠纷</h2>
          <div className="meta-row">
            <FilterButtons items={DISPUTE_STATUSES} value={status} onChange={(value) => setListParam(listParams.setParams, "status", value)} />
            <FilterButtons items={DISPUTE_ROLES} value={role} onChange={(value) => setListParam(listParams.setParams, "role", value)} />
          </div>
        </div>
        <StateView loading={myState.loading} error={myState.error} empty={myDisputes.length === 0}>
          <div className="card-list">
            {myDisputes.map((item) => <DisputeSummaryCard key={text(item.disputeId)} item={item} />)}
          </div>
          <PaginationControls pagination={myState.data?.pagination} onPageChange={(nextPage) => setListPage(listParams.setParams, nextPage)} />
        </StateView>
      </section>
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
                <div className="section-heading">
                  <div>
                    <div className="card-title">纠纷 #{disputeId}</div>
                    <p>{text(item.reason)}</p>
                  </div>
                  <Badge tone={statusTone(item.status)}>{labelFromMap(item.status, DISPUTE_STATUS_LABELS)}</Badge>
                </div>
                <div className="meta-row">
                  <span>{labelFromMap(item.type, DISPUTE_TYPE_LABELS)}</span>
                  <span>{fullDateText(item.createdAt)}</span>
                  {item.isParty ? <Badge tone="warning">当事人</Badge> : null}
                </div>
                <div className="action-row">
                  <Link className="btn btn--secondary" to={`/disputes/${encodeURIComponent(disputeId)}`}>查看详情</Link>
                  <Link className="btn btn--primary" to={`/jury/disputes/${encodeURIComponent(disputeId)}`}>进入投票</Link>
                </div>
              </article>
            );
          })}
        </div>
        <PaginationControls pagination={state.data?.pagination} onPageChange={() => {}} />
      </StateView>
    </>
  );
}

export function JuryVotingPage({ api }: { api: ApiClient }) {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const disputeId = id || params.get("dispute") || params.get("disputeId") || params.get("id") || "";
  const state = useAsync(() => api.jury.dispute(disputeId), [api, disputeId]);
  const dispute = asRecord(state.data?.dispute ?? state.data);
  const juryResult = asRecord(state.data?.juryResult ?? dispute.juryResult);
  const myVote = asRecord(juryResult.myVote);
  const voteMutation = useMutationTracker();
  const [voteValue, setVoteValue] = React.useState("publisher");

  React.useEffect(() => {
    if (myVote.vote) {
      setVoteValue(text(myVote.vote, "publisher"));
    }
  }, [myVote.vote]);

  return (
    <>
      <PageHeader title="陪审投票" action={<Link className="btn btn--secondary" to="/jury">返回大厅</Link>} />
      <StateView loading={state.loading} error={state.error} empty={!dispute.disputeId}>
        <article className="panel detail-panel">
          <div className="section-heading">
            <div>
              <h2>{text(dispute.reason)}</h2>
              <p className="muted">纠纷 #{text(dispute.disputeId ?? disputeId)} · {labelFromMap(dispute.status, DISPUTE_STATUS_LABELS)}</p>
            </div>
            {myVote.vote ? <Badge tone="success">已投票: {labelFromMap(myVote.vote, JURY_VOTE_LABELS)}</Badge> : <Badge tone="warning">待投票</Badge>}
          </div>
          <p>{text(dispute.description)}</p>
          <div className="form-two-col">
            <PartyPanel title="需求方主张" party={asRecord(dispute.publisher ?? dispute.initiator)} />
            <PartyPanel title="服务方主张" party={asRecord(dispute.provider ?? dispute.respondent)} />
          </div>
          <EvidenceList evidence={asArray<Record<string, unknown>>(dispute.evidence, "")} api={api} />
          <JuryResultPanel juryResult={juryResult} />
          <section className="nested-panel panel">
            <h3>投票意见</h3>
            <form className="form-grid" onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              await voteMutation.run(
                () => api.jury.vote(disputeId, { vote: form.get("vote"), reason: form.get("reason") }),
                (result) => {
                  const payload = asRecord(result);
                  state.setData({
                    dispute: payload.dispute ?? dispute,
                    juryResult: payload.juryResult ?? asRecord(payload.dispute).juryResult ?? juryResult
                  });
                }
              ).catch(() => {});
            }}>
              <div className="filter-row" role="radiogroup" aria-label="投票方向">
                {JURY_VOTES.map(([value, label]) => (
                  <label key={value} className={`chip${voteValue === value ? " active" : ""}`}>
                    <input type="radio" name="vote" value={value} checked={voteValue === value} onChange={() => setVoteValue(value)} disabled={Boolean(myVote.vote)} />
                    {label}
                  </label>
                ))}
              </div>
              <Field label="投票理由"><textarea name="reason" rows={4} minLength={5} defaultValue={text(myVote.reason, "")} disabled={Boolean(myVote.vote)} required /></Field>
              {voteMutation.error ? <p className="field-error" role="alert">{voteMutation.error}</p> : null}
              <button className="btn btn--primary" disabled={voteMutation.busy || Boolean(myVote.vote)}>{myVote.vote ? "已投票" : voteMutation.busy ? "提交中..." : "提交投票"}</button>
            </form>
          </section>
        </article>
      </StateView>
    </>
  );
}

function EvidenceForm({ api, disputeId, onSubmitted }: { api: ApiClient; disputeId: string; onSubmitted: () => void }) {
  const mutation = useMutationTracker();
  const [attachments, setAttachments] = React.useState<EvidenceAttachment[]>([]);
  return (
    <section className="nested-panel panel">
      <h3>补充证据</h3>
      <form className="form-grid" onSubmit={async (event) => {
        event.preventDefault();
        const formElement = event.currentTarget;
        const form = new FormData(formElement);
        await mutation.run(
          () => api.disputes.evidence(disputeId, {
            evidenceType: attachments.length > 0 ? "file" : "text",
            content: form.get("content"),
            attachments
          }),
          () => {
            formElement.reset();
            setAttachments([]);
            onSubmitted();
          }
        ).catch(() => {});
      }}>
        <Field label="证据说明"><textarea name="content" rows={3} placeholder="说明补充证据与纠纷的关联" /></Field>
        <FileUpload purpose="dispute-evidence" businessType="dispute" businessId={disputeId} visibility="private" onUploaded={async (formData) => {
          const result = await api.files.upload(formData);
          const attachment = attachmentFromUpload(result, api);
          if (attachment) setAttachments((current) => [...current, attachment]);
        }} />
        <AttachmentPreviewList attachments={attachments} api={api} />
        {mutation.error ? <p className="field-error" role="alert">{mutation.error}</p> : null}
        <button className="btn btn--primary" disabled={mutation.busy}>{mutation.busy ? "提交中..." : "提交证据"}</button>
      </form>
    </section>
  );
}

function PartyPanel({ title, party }: { title: string; party: Record<string, unknown> }) {
  return (
    <section className="nested-panel panel">
      <h3>{title}</h3>
      <strong>{text(party.displayName ?? party.username, "未知用户")}</strong>
      <p className="muted">{text(party.bio, "暂无公开简介")}</p>
      <div className="meta-row">
        {asArray<string>(party.skillTags, "").slice(0, 4).map((tag) => <Badge key={tag}>{tag}</Badge>)}
      </div>
    </section>
  );
}

function FreezePanel({ freeze }: { freeze: Record<string, unknown> }) {
  if (!freeze.freezeId) return null;
  return (
    <section className="nested-panel panel">
      <div className="section-heading">
        <h3>冻结信息</h3>
        <Badge tone={statusTone(freeze.status)}>{labelFromMap(freeze.status, { active: "冻结中", dispute: "纠纷中", released: "已释放" })}</Badge>
      </div>
      <div className="metric-grid">
        <div className="metric-card"><span>冻结金额</span><strong>{moneyText(freeze.amount)}</strong></div>
        <div className="metric-card"><span>原因</span><strong>{text(freeze.reason)}</strong></div>
        <div className="metric-card"><span>释放条件</span><strong>{text(freeze.releaseCondition)}</strong></div>
      </div>
      <Timeline items={asArray<Record<string, unknown>>(freeze.timeline, "")} />
    </section>
  );
}

function ProgressPanel({ progress }: { progress: Record<string, unknown> }) {
  const steps = asArray<Record<string, unknown>>(progress.steps, "");
  if (steps.length === 0) return null;
  return (
    <section className="nested-panel panel">
      <h3>进度时间线</h3>
      <Timeline items={steps} />
    </section>
  );
}

function Timeline({ items }: { items: Record<string, unknown>[] }) {
  if (items.length === 0) return null;
  return (
    <ol className="timeline-list">
      {items.map((item, index) => (
        <li key={text(item.key ?? item.title ?? index)}>
          <strong>{text(item.title ?? item.label ?? item.state)}</strong>
          <span>{text(item.detail ?? item.description, "")}</span>
          <span>{dateText(item.createdAt ?? item.time, "")}</span>
        </li>
      ))}
    </ol>
  );
}

function EvidenceList({ evidence, api }: { evidence: Record<string, unknown>[]; api: ApiClient }) {
  return (
    <section className="nested-panel panel">
      <h3>证据列表</h3>
      <StateView empty={evidence.length === 0}>
        <div className="card-list">
          {evidence.map((item) => {
            const uploader = asRecord(item.uploader);
            const attachments = asArray<Record<string, unknown>>(item.attachments, "");
            return (
              <article className="card" key={text(item.evidenceId)}>
                <div className="section-heading">
                  <strong>{labelFromMap(item.evidenceType, { text: "文字证据", image: "图片证据", file: "文件证据", chat: "聊天记录" })}</strong>
                  <span className="muted">{fullDateText(item.createdAt)}</span>
                </div>
                <p>{text(item.content, "未填写文字说明")}</p>
                <p className="muted">提交人: {text(uploader.displayName ?? uploader.username ?? item.uploaderId)}</p>
                <AttachmentPreviewList attachments={attachments} api={api} />
              </article>
            );
          })}
        </div>
      </StateView>
    </section>
  );
}

function JuryResultPanel({ juryResult }: { juryResult: Record<string, unknown> }) {
  const counts = asRecord(juryResult.counts);
  const votes = asArray<Record<string, unknown>>(juryResult.votes, "");
  return (
    <section className="nested-panel panel">
      <div className="section-heading">
        <h3>陪审统计</h3>
        <Badge>{String(juryResult.total ?? 0)} 票</Badge>
      </div>
      <div className="metric-grid">
        {JURY_VOTES.map(([value, label]) => (
          <div className="metric-card" key={value}><span>{label}</span><strong>{String(counts[value] ?? 0)}</strong></div>
        ))}
      </div>
      {votes.length > 0 ? (
        <div className="card-list">
          {votes.map((vote) => (
            <article className="card" key={text(vote.voteId)}>
              <div className="section-heading">
                <strong>{text(vote.label ?? labelFromMap(vote.vote, JURY_VOTE_LABELS))}</strong>
                {vote.isMine ? <Badge tone="success">我的投票</Badge> : null}
              </div>
              <p>{text(vote.reason, "未填写理由")}</p>
              <span className="muted">{fullDateText(vote.createdAt)}</span>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function DisputeSummaryCard({ item }: { item: Record<string, unknown> }) {
  const href = safeInternalHref(item.href, `/disputes/${encodeURIComponent(text(item.disputeId, ""))}`);
  return (
    <Link className="card interactive" to={href}>
      <div className="section-heading">
        <span className="card-title">{text(item.reason)}</span>
        <Badge tone={statusTone(item.status)}>{labelFromMap(item.status, DISPUTE_STATUS_LABELS)}</Badge>
      </div>
      <p>{text(item.descriptionSummary)}</p>
      <div className="meta-row">
        <span>订单 #{text(item.orderId)}</span>
        <span>{text(asRecord(item.request).title)}</span>
        <span>{fullDateText(item.createdAt)}</span>
      </div>
    </Link>
  );
}

function FilterButtons({ items, value, onChange }: { items: readonly (readonly [string, string])[]; value: string; onChange: (value: string) => void }) {
  return (
    <span className="filter-row compact-filter">
      {items.map(([nextValue, label]) => (
        <button key={nextValue} type="button" className={`chip${value === nextValue ? " active" : ""}`} onClick={() => onChange(nextValue)}>{label}</button>
      ))}
    </span>
  );
}

function attachmentFromUpload(result: Record<string, unknown>, api: ApiClient): EvidenceAttachment | null {
  const file = asRecord(result.file ?? result);
  const fileId = text(file.fileId, "");
  const name = text(file.originalName ?? file.name ?? file.fileName, "");
  if (!fileId && !name) return null;
  return {
    fileId: fileId || undefined,
    name: name || fileId,
    originalName: name || undefined,
    mimeType: text(file.mimeType, ""),
    type: text(file.mimeType, "file"),
    size: Number(file.size ?? file.sizeBytes ?? 0),
    url: fileAssetUrl({ ...file, fileId }, api)
  };
}

function setListParam(setParams: ReturnType<typeof useQueryParams>["setParams"], key: string, value: string) {
  setParams((current) => {
    const next = new URLSearchParams(current);
    if (value === "all") next.delete(key);
    else next.set(key, value);
    next.set("page", "1");
    return next;
  });
}

function setListPage(setParams: ReturnType<typeof useQueryParams>["setParams"], page: number) {
  setParams((current) => {
    const next = new URLSearchParams(current);
    next.set("page", String(page));
    return next;
  });
}

function option(value: string | null, labels: Record<string, string>, fallback: string) {
  const key = value ?? fallback;
  return Object.prototype.hasOwnProperty.call(labels, key) ? key : fallback;
}

function statusTone(status: unknown) {
  const value = String(status ?? "");
  if (["resolved", "released"].includes(value)) return "success";
  if (["jury_voting", "admin_review", "evidence_collecting", "active", "dispute"].includes(value)) return "warning";
  if (["cancelled"].includes(value)) return "danger";
  return "neutral";
}
