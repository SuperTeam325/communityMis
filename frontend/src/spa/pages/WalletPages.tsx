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
  moneyText,
  pageFromParams,
  safeInternalHref,
  signedMoneyText,
  text,
  useAsync,
  useQueryParams
} from "./shared";

const TRANSACTION_TYPES = [
  ["all", "全部"],
  ["income", "收入"],
  ["expense", "支出"],
  ["freeze", "冻结"],
  ["release", "释放"],
  ["refund", "退款"]
] as const;

const FREEZE_STATUSES = [
  ["all", "全部"],
  ["active", "冻结中"],
  ["dispute", "纠纷中"],
  ["released", "已释放"]
] as const;

const FREEZE_REASONS = [
  ["all", "全部原因"],
  ["order", "订单"],
  ["dispute", "纠纷"]
] as const;

const TRANSACTION_LABELS: Record<string, string> = Object.fromEntries(TRANSACTION_TYPES);
const FREEZE_STATUS_LABELS: Record<string, string> = Object.fromEntries(FREEZE_STATUSES);
const FREEZE_REASON_LABELS: Record<string, string> = Object.fromEntries(FREEZE_REASONS);

export function WalletPage({ api }: { api: ApiClient }) {
  const { params, setParams } = useQueryParams();
  const type = option(params.get("type"), TRANSACTION_LABELS, "all");
  const page = pageFromParams(params);
  const state = useAsync(async () => {
    const [wallet, transactions] = await Promise.all([
      api.wallet.me(),
      api.wallet.transactions({ type, page, pageSize: 8 })
    ]);
    return { wallet, transactions };
  }, [api, type, page]);
  const tx = asArray<Record<string, unknown>>(state.data?.transactions, "transactions");
  const wallet = asRecord(asRecord(state.data?.wallet).wallet ?? state.data?.wallet);
  const available = Number(wallet.balance ?? 0) - Number(wallet.frozenBalance ?? 0);
  const income = tx.filter((item) => ["income", "release", "refund"].includes(String(item.type))).reduce((sum, item) => sum + Math.abs(Number(item.amount) || 0), 0);
  const expense = tx.filter((item) => ["expense", "freeze"].includes(String(item.type))).reduce((sum, item) => sum + Math.abs(Number(item.amount) || 0), 0);

  return (
    <>
      <StateView loading={state.loading} error={state.error}>
        <section className="wallet-header">
          <PageHeader title="时间币钱包" action={<Link className="btn btn--secondary" to="/wallet/freeze">冻结明细</Link>} />
          <div className="balance-section">
            <div className="balance-label">当前余额</div>
            <div className="balance-amount"><span className="unit">⏂</span>{moneyText(wallet.balance)}</div>
            <div className="balance-sub">可用余额 {moneyText(available)} · 冻结 {moneyText(wallet.frozenBalance)}</div>
          </div>
          <div className="quick-stats">
            <div className="quick-stat"><div className="qs-val income">+ {moneyText(income)}</div><div className="qs-lbl">本页收入</div></div>
            <div className="qs-divider" />
            <div className="quick-stat"><div className="qs-val expense">- {moneyText(expense)}</div><div className="qs-lbl">本页支出</div></div>
          </div>
          <div className="wallet-actions-row">
            <Link className="wallet-action-btn" to="/profile">个人中心</Link>
            <Link className="wallet-action-btn freeze-link" to="/wallet/freeze">冻结明细</Link>
            <Link className="wallet-action-btn primary-action" to="/tasks">去赚时间币</Link>
          </div>
        </section>
        <section className="tx-section">
          <div className="tx-section-header">
            <h2>交易明细</h2>
            <div className="tx-filter-tabs filter-row compact-filter" aria-label="交易类型筛选">
              {TRANSACTION_TYPES.map(([value, label]) => (
                <button key={value} type="button" className={`chip${type === value ? " active" : ""}`} onClick={() => setWalletParam(setParams, "type", value)}>{label}</button>
              ))}
            </div>
          </div>
        <StateView empty={tx.length === 0}>
          <div className="finance-list tx-list">
            {tx.map((item) => (
              <FinanceRecord key={text(item.logId)} item={item} type="transaction" />
            ))}
          </div>
          <PaginationControls pagination={state.data?.transactions?.pagination} onPageChange={(nextPage) => setWalletPage(setParams, nextPage)} />
        </StateView>
        </section>
      </StateView>
    </>
  );
}

export function WalletFreezePage({ api }: { api: ApiClient }) {
  const { params, setParams } = useQueryParams();
  const status = option(params.get("status"), FREEZE_STATUS_LABELS, "all");
  const reasonType = option(params.get("reasonType"), FREEZE_REASON_LABELS, "all");
  const page = pageFromParams(params);
  const state = useAsync(() => api.wallet.freezes({ status, reasonType, page, pageSize: 20 }), [api, status, reasonType, page]);
  const rows = asArray<Record<string, unknown>>(state.data, "freezes");
  return (
    <>
      <PageHeader title="冻结明细" description="查看时间币冻结原因、解冻规则和相关业务。" action={<Link className="btn btn--secondary" to="/wallet">返回钱包</Link>} />
      <section className="filter-panel">
        <div className="filter-row" aria-label="冻结状态筛选">
          {FREEZE_STATUSES.map(([value, label]) => (
            <button key={value} type="button" className={`chip${status === value ? " active" : ""}`} onClick={() => setWalletParam(setParams, "status", value)}>{label}</button>
          ))}
        </div>
        <div className="filter-row" aria-label="冻结原因筛选">
          {FREEZE_REASONS.map(([value, label]) => (
            <button key={value} type="button" className={`chip${reasonType === value ? " active" : ""}`} onClick={() => setWalletParam(setParams, "reasonType", value)}>{label}</button>
          ))}
        </div>
      </section>
      <StateView loading={state.loading} error={state.error} empty={rows.length === 0}>
        <div className="finance-list">
          {rows.map((item) => (
            <FinanceRecord key={text(item.freezeId)} item={item} type="freeze" />
          ))}
        </div>
        <PaginationControls pagination={state.data?.pagination} onPageChange={(nextPage) => setWalletPage(setParams, nextPage)} />
      </StateView>
    </>
  );
}

function FinanceRecord({ item, type }: { item: Record<string, unknown>; type: "transaction" | "freeze" }) {
  const href = safeInternalHref(item.href, "");
  const timeline = asArray<Record<string, unknown>>(item.timeline, "");
  return (
    <article className="finance-card tx-item">
      <div className={`tx-icon ${String(item.type ?? item.status ?? "neutral")}`}>{type === "freeze" ? "⏸" : financeIcon(item.type)}</div>
      <div className="tx-body">
        <div className="tx-title card-title">{text(item.relatedTitle ?? item.reason ?? item.remark ?? item.description, type === "freeze" ? "冻结记录" : "钱包流水")}</div>
        <div className="tx-order-id">
          {type === "freeze" ? labelFromMap(item.status, FREEZE_STATUS_LABELS) : labelFromMap(item.type, TRANSACTION_LABELS)}
          {" · "}
          {labelFromMap(item.reasonType ?? item.businessType, FREEZE_REASON_LABELS, text(item.businessType, "业务"))}
        </div>
        <div className="tx-time">{fullDateText(item.createdAt)}</div>
      </div>
      <div className="tx-amount-cell">
        <strong className={`finance-amount tx-amount ${String(item.type ?? item.status)}`}>{type === "freeze" ? moneyText(item.amount) : signedMoneyText(item.amount, item.type)}</strong>
        <div className="tx-balance">{type === "transaction" ? `余额 ${moneyText(item.balanceAfter, "-")}` : dateText(item.releasedAt, "未释放")}</div>
      </div>
      <p className="muted tx-note">{text(item.remark ?? item.reason ?? item.releaseCondition, "暂无说明")}</p>
      {type === "transaction" ? (
        <div className="meta-row">
          <span>余额变动后: {moneyText(item.balanceAfter, "-")}</span>
          <span>关联: {text(item.businessId ?? item.orderId ?? item.disputeId, "-")}</span>
        </div>
      ) : (
        <div className="meta-row">
          <span>释放条件: {text(item.releaseCondition)}</span>
          <span>释放时间: {dateText(item.releasedAt, "未释放")}</span>
        </div>
      )}
      {timeline.length > 0 ? (
        <ol className="timeline-list">
          {timeline.map((step, index) => (
            <li key={text(step.key ?? index)}>
              <strong>{text(step.title ?? step.label ?? step.status)}</strong>
              <span>{text(step.detail ?? step.description, "")}</span>
              <span>{dateText(step.createdAt ?? step.time, "")}</span>
            </li>
          ))}
        </ol>
      ) : null}
      {href ? <Link className="btn btn--secondary" to={href}>查看关联业务</Link> : null}
    </article>
  );
}

function setWalletParam(setParams: ReturnType<typeof useQueryParams>["setParams"], key: string, value: string) {
  setParams((current) => {
    const next = new URLSearchParams(current);
    if (value === "all") next.delete(key);
    else next.set(key, value);
    next.set("page", "1");
    return next;
  });
}

function setWalletPage(setParams: ReturnType<typeof useQueryParams>["setParams"], page: number) {
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

function toneForFinance(value: unknown) {
  const key = String(value ?? "");
  if (["income", "release", "refund", "released"].includes(key)) return "success";
  if (["freeze", "active", "dispute"].includes(key)) return "warning";
  if (["expense"].includes(key)) return "danger";
  return "neutral";
}

function financeIcon(value: unknown) {
  const key = String(value ?? "");
  if (["income", "release", "refund"].includes(key)) return "+";
  if (["expense", "freeze"].includes(key)) return "-";
  return "⏂";
}
