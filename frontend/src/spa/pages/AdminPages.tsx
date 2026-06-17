import React from "react";
import { Link } from "react-router-dom";
import type { ApiClient } from "../api";
import type { AppRoute } from "../types";
import {
  Badge,
  DataTable,
  Field,
  PageHeader,
  PaginationControls,
  StateView,
  asArray,
  asRecord,
  dateText,
  fullDateText,
  labelFromMap,
  moneyText,
  safeInternalHref,
  signedMoneyText,
  text,
  useAsync,
  useMutationTracker,
  useQueryParams
} from "./shared";

type Row = Record<string, unknown>;
type Option = readonly [string, string];
type QueryState = Record<string, string>;

const USER_STATUS_OPTIONS: readonly Option[] = [["all", "全部状态"], ["active", "启用"], ["disabled", "禁用"]];
const TRANSACTION_TYPE_OPTIONS: readonly Option[] = [["all", "全部类型"], ["income", "收入"], ["expense", "支出"], ["freeze", "冻结"], ["release", "解冻"], ["refund", "退款"], ["system_fee", "平台费用"]];
const DISPUTE_STATUS_OPTIONS: readonly Option[] = [["all", "全部"], ["pending", "待受理"], ["todo", "待处理"], ["in_progress", "处理中"], ["processing", "处理中"], ["reviewing", "复核中"], ["resolved", "已结案"], ["ruled", "已裁决"], ["closed", "已关闭"]];
const SENSITIVE_LEVEL_OPTIONS: readonly Option[] = [["all", "全部等级"], ["block", "阻断"], ["warn", "警告"], ["review", "复核"]];
const RISK_STATUS_OPTIONS: readonly Option[] = [["all", "全部状态"], ["pending", "待处理"], ["reviewing", "复核中"], ["approved", "已通过"], ["removed", "已移除"], ["ignored", "已忽略"], ["resolved", "已处理"]];
const RISK_LEVEL_OPTIONS: readonly Option[] = [["all", "全部风险"], ["high", "高风险"], ["medium", "中风险"], ["low", "低风险"]];
const FINAL_RESULT_OPTIONS: readonly Option[] = [["publisher_win", "支持需求方"], ["provider_win", "支持服务方"], ["mediate", "调解处理"]];
const ACTIVE_OPTIONS: readonly Option[] = [["all", "全部状态"], ["active", "启用"], ["disabled", "禁用"]];

const HIGH_RISK_AUDITS = new Set([
  "admin.user.status",
  "admin.dispute.finalize",
  "admin.risk_content.resolve",
  "admin.system.update",
  "admin.backup.restore",
  "admin.backup.delete",
  "admin.maintenance.message_cleanup.execute"
]);

export function AdminDashboardPage({ api }: { api: ApiClient }) {
  const state = useAsync(() => api.admin.dashboard(), [api]);
  const metrics = asRecord(asRecord(state.data).metrics);
  const alerts = asArray<Row>(asRecord(state.data).alerts ?? asRecord(state.data).highlights ?? asRecord(state.data).recentItems, "items");
  return (
    <>
      <PageHeader title="管理仪表盘" />
      <StateView loading={state.loading} error={state.error} empty={!Object.keys(metrics).length && !alerts.length}>
        <section className="metric-grid admin-metric-grid">
          {[
            ["用户", metrics.userCount],
            ["订单", metrics.orderCount],
            ["纠纷", metrics.disputeCount],
            ["流通时间币", metrics.circulatingCoins],
            ["待审核内容", metrics.pendingRiskCount],
            ["高风险请求", metrics.highRiskCount]
          ].map(([label, value]) => <div className="metric-card" key={String(label)}><span>{String(label)}</span><strong>{text(value, "0")}</strong></div>)}
        </section>
        <section className="panel">
          <h2>后台快捷入口</h2>
          <div className="action-row">
            <Link className="btn btn--secondary" to="/admin/users">用户管理</Link>
            <Link className="btn btn--secondary" to="/admin/transactions">交易流水</Link>
            <Link className="btn btn--secondary" to="/admin/disputes">争议处理</Link>
            <Link className="btn btn--secondary" to="/admin/risk-content">内容风险</Link>
            <Link className="btn btn--secondary" to="/admin/system">系统设置</Link>
          </div>
        </section>
        {alerts.length ? (
          <section className="panel">
            <h2>最近动态</h2>
            <DataTable columns={["时间", "标题", "状态", "入口"]} rows={alerts.slice(0, 6).map((item) => [
              dateText(item.createdAt ?? item.updatedAt),
              text(item.title ?? item.name ?? item.action),
              text(item.statusText ?? item.status),
              linkedBusiness(item)
            ])} />
          </section>
        ) : null}
      </StateView>
    </>
  );
}

export function AdminUsersPage({ api }: { api: ApiClient }) {
  const { params, setParams } = useQueryParams();
  const query = listQuery(params, { status: "all", keyword: "", minCredit: "", maxCredit: "", pageSize: "20" });
  const state = useAsync(() => api.admin.users(query), [api, query.status, query.keyword, query.minCredit, query.maxCredit, query.page, query.pageSize]);
  const users = asArray<Row>(state.data, "users");
  return (
    <AdminPage title="用户管理" filters={
      <FilterBar>
        <SelectFilter label="状态" value={query.status} options={USER_STATUS_OPTIONS} onChange={(value) => updateQuery(setParams, { status: value })} />
        <TextFilter label="最低信用" value={query.minCredit} onChange={(value) => updateQuery(setParams, { minCredit: value })} />
        <TextFilter label="最高信用" value={query.maxCredit} onChange={(value) => updateQuery(setParams, { maxCredit: value })} />
        <TextFilter label="关键词" value={query.keyword} placeholder="用户名 / 昵称 / 手机" onChange={(value) => updateQuery(setParams, { keyword: value })} />
      </FilterBar>
    }>
      <StateView loading={state.loading} error={state.error} empty={!users.length}>
        <DataTable columns={["用户", "状态", "信用", "订单", "注册时间", "操作"]} rows={users.map((item) => [
          userCell(item),
          statusBadge(item.status),
          text(item.creditScore ?? nested(item, "credit").averageRating ?? nested(item, "credit").score),
          text(nested(item, "summary").orderCount ?? item.orderCount),
          dateText(item.createdAt ?? item.registeredAt),
          <UserStatusActions key="actions" api={api} user={item} onDone={state.reload} />
        ])} />
        <PaginationControls pagination={asRecord(state.data).pagination} onPageChange={(page) => updateQuery(setParams, { page: String(page) }, false)} />
      </StateView>
    </AdminPage>
  );
}

export function AdminTransactionsPage({ api }: { api: ApiClient }) {
  const { params, setParams } = useQueryParams();
  const query = listQuery(params, { type: "all", keyword: "", userId: "", orderId: "", pageSize: "20" });
  const state = useAsync(() => api.admin.transactions(query), [api, query.type, query.keyword, query.userId, query.orderId, query.page, query.pageSize]);
  const rows = asArray<Row>(state.data, "transactions");
  return (
    <AdminPage title="交易流水" filters={
      <FilterBar>
        <SelectFilter label="类型" value={query.type} options={TRANSACTION_TYPE_OPTIONS} onChange={(value) => updateQuery(setParams, { type: value })} />
        <TextFilter label="用户ID" value={query.userId} onChange={(value) => updateQuery(setParams, { userId: value })} />
        <TextFilter label="订单ID" value={query.orderId} onChange={(value) => updateQuery(setParams, { orderId: value })} />
        <TextFilter label="关键词" value={query.keyword} onChange={(value) => updateQuery(setParams, { keyword: value })} />
      </FilterBar>
    }>
      <StateView loading={state.loading} error={state.error} empty={!rows.length}>
        <DataTable columns={["时间", "用户", "类型", "金额", "余额", "关联业务", "备注"]} rows={rows.map((item) => [
          dateText(item.createdAt),
          userCell(nested(item, "user").userId ? nested(item, "user") : item),
          transactionBadge(item.type),
          signedMoneyText(item.amount, item.type),
          moneyText(item.balanceAfter ?? item.balance),
          linkedBusiness(nested(item, "order").orderId ? nested(item, "order") : item),
          text(item.remark ?? item.note ?? item.description)
        ])} />
        <PaginationControls pagination={asRecord(state.data).pagination} onPageChange={(page) => updateQuery(setParams, { page: String(page) }, false)} />
      </StateView>
    </AdminPage>
  );
}

export function AdminDisputesPage({ api }: { api: ApiClient }) {
  const { params, setParams } = useQueryParams();
  const query = listQuery(params, { status: "all", keyword: "", pageSize: "20" });
  const [selectedId, setSelectedId] = React.useState(params.get("disputeId") ?? "");
  const state = useAsync(() => api.admin.disputes(query), [api, query.status, query.keyword, query.page, query.pageSize]);
  const rows = asArray<Row>(state.data, "disputes");
  React.useEffect(() => {
    if (!selectedId && rows[0]?.disputeId) setSelectedId(text(rows[0].disputeId));
  }, [rows, selectedId]);
  const detail = useAsync(() => selectedId ? api.admin.dispute(selectedId) : Promise.resolve({}), [api, selectedId]);
  return (
    <AdminPage title="争议处理" filters={
      <FilterBar>
        <SelectFilter label="状态" value={query.status} options={DISPUTE_STATUS_OPTIONS} onChange={(value) => updateQuery(setParams, { status: value })} />
        <TextFilter label="关键词" value={query.keyword} onChange={(value) => updateQuery(setParams, { keyword: value })} />
      </FilterBar>
    }>
      <div className="admin-split">
        <StateView loading={state.loading} error={state.error} empty={!rows.length}>
          <DataTable columns={["纠纷", "状态", "原因", "金额", "更新时间", "操作"]} rows={rows.map((item) => [
            text(item.disputeId),
            disputeBadge(item.status),
            text(item.reason),
            moneyText(item.amount),
            dateText(item.updatedAt ?? item.createdAt),
            <div key="actions" className="action-row">
              <button className="btn btn--secondary btn--sm" onClick={() => setSelectedId(text(item.disputeId))}>查看</button>
              <Link className="btn btn--secondary btn--sm" to={`/admin/disputes/final?disputeId=${encodeURIComponent(text(item.disputeId))}`}>终审</Link>
            </div>
          ])} />
          <PaginationControls pagination={asRecord(state.data).pagination} onPageChange={(page) => updateQuery(setParams, { page: String(page) }, false)} />
        </StateView>
        <StateView loading={detail.loading} error={detail.error} empty={!selectedId}>
          <DetailPanel title="纠纷详情" rows={disputeRows(detail.data)} />
        </StateView>
      </div>
    </AdminPage>
  );
}

export function AdminDisputeFinalPage({ api }: { api: ApiClient }) {
  const { params, setParams } = useQueryParams();
  const [disputeId, setDisputeId] = React.useState(params.get("disputeId") ?? "");
  const [finalResult, setFinalResult] = React.useState("publisher_win");
  const [refundAmount, setRefundAmount] = React.useState("");
  const [reason, setReason] = React.useState("管理员根据双方证据作出终审处理。");
  const detail = useAsync(() => disputeId ? api.admin.dispute(disputeId) : Promise.resolve({}), [api, disputeId]);
  const mutation = useMutationTracker();
  return (
    <AdminPage title="纠纷终审">
      <div className="admin-split">
        <StateView loading={detail.loading} error={detail.error} empty={!disputeId}>
          <DetailPanel title="纠纷资金与证据" rows={disputeRows(detail.data)} />
        </StateView>
        <section className="panel form-grid">
          <h2>终审表单</h2>
          <TextFilter label="纠纷ID" value={disputeId} onChange={(value) => {
            setDisputeId(value);
            updateQuery(setParams, { disputeId: value }, false);
          }} />
          <SelectFilter label="终审结果" value={finalResult} options={FINAL_RESULT_OPTIONS} onChange={setFinalResult} />
          <TextFilter label="退款金额" value={refundAmount} placeholder="留空由后端规则计算" onChange={setRefundAmount} />
          <Field label="终审理由"><textarea rows={4} value={reason} onChange={(event) => setReason(event.currentTarget.value)} /></Field>
          <button className="btn btn--primary" disabled={!disputeId || mutation.busy} onClick={async () => {
            await mutation.run(() => api.admin.finalizeDispute(disputeId, {
              finalResult,
              refundAmount: refundAmount ? Number(refundAmount) : undefined,
              reason
            }), () => detail.reload());
          }}>{mutation.busy ? "提交中..." : "提交终审"}</button>
          {mutation.error ? <p className="field-error" role="alert">{mutation.error}</p> : null}
        </section>
      </div>
    </AdminPage>
  );
}

export function AdminStatsPage({ api }: { api: ApiClient }) {
  const state = useAsync(() => api.admin.stats(), [api]);
  const payload = asRecord(state.data);
  const metrics = asRecord(payload.summary ?? payload.metrics ?? payload);
  return (
    <AdminPage title="平台统计">
      <StateView loading={state.loading} error={state.error} empty={!Object.keys(payload).length}>
        <section className="metric-grid admin-metric-grid">
          {Object.entries(metrics).slice(0, 8).map(([key, value]) => (
            <div className="metric-card" key={key}><span>{key}</span><strong>{text(metricValue(value), "0")}</strong></div>
          ))}
        </section>
        {looseTable(payload.byDay ?? payload.series ?? payload.rows, "统计明细")}
      </StateView>
    </AdminPage>
  );
}

export function AdminCategoriesPage({ api }: { api: ApiClient }) {
  const state = useAsync(() => api.admin.categories(), [api]);
  const categories = asArray<Row>(state.data, "categories");
  const tags = asArray<Row>(state.data, "tags");
  return (
    <AdminPage title="标签/类别管理">
      <div className="admin-split admin-split--stacked">
        <section className="panel">
          <h2>类别</h2>
          <StateView loading={state.loading} error={state.error} empty={!categories.length}>
            <DataTable columns={["名称", "编码", "状态", "排序", "说明", "操作"]} rows={categories.map((item) => [
              text(item.name),
              text(item.code),
              statusBadge(item.status),
              text(item.sortOrder),
              text(item.description),
              <CategoryActions key="actions" api={api} item={item} onDone={state.reload} />
            ])} />
          </StateView>
        </section>
        <section className="panel">
          <h2>标签</h2>
          <StateView loading={state.loading} error={state.error} empty={!tags.length}>
            <DataTable columns={["名称", "类别", "状态", "排序", "操作"]} rows={tags.map((item) => [
              text(item.name),
              text(item.categoryName ?? nested(item, "category").name),
              statusBadge(item.status),
              text(item.sortOrder),
              <TagActions key="actions" api={api} item={item} onDone={state.reload} />
            ])} />
          </StateView>
        </section>
      </div>
    </AdminPage>
  );
}

export function AdminSensitiveWordsPage({ api }: { api: ApiClient }) {
  const { params, setParams } = useQueryParams();
  const query = listQuery(params, { level: "all", status: "all", keyword: "", pageSize: "20" });
  const state = useAsync(() => api.admin.sensitiveWords(query), [api, query.level, query.status, query.keyword, query.page, query.pageSize]);
  const rows = asArray<Row>(state.data, "sensitiveWords");
  return (
    <AdminPage title="敏感词管理" filters={
      <FilterBar>
        <SelectFilter label="等级" value={query.level} options={SENSITIVE_LEVEL_OPTIONS} onChange={(value) => updateQuery(setParams, { level: value })} />
        <SelectFilter label="状态" value={query.status} options={ACTIVE_OPTIONS} onChange={(value) => updateQuery(setParams, { status: value })} />
        <TextFilter label="关键词" value={query.keyword} onChange={(value) => updateQuery(setParams, { keyword: value })} />
      </FilterBar>
    }>
      <StateView loading={state.loading} error={state.error} empty={!rows.length}>
        <DataTable columns={["词条", "等级", "类别", "状态", "替换", "操作"]} rows={rows.map((item) => [
          text(item.word),
          text(item.level),
          text(item.category),
          statusBadge(item.status),
          text(item.replacement),
          <SensitiveWordActions key="actions" api={api} item={item} onDone={state.reload} />
        ])} />
        <PaginationControls pagination={asRecord(state.data).pagination} onPageChange={(page) => updateQuery(setParams, { page: String(page) }, false)} />
      </StateView>
      <section className="panel">
        <h2>批量导入</h2>
        <SensitiveImportForm api={api} onDone={state.reload} />
      </section>
    </AdminPage>
  );
}

export function AdminRiskContentPage({ api }: { api: ApiClient }) {
  const { params, setParams } = useQueryParams();
  const query = listQuery(params, { status: "all", riskLevel: "all", sourceType: "", keyword: "", pageSize: "20" });
  const state = useAsync(() => api.admin.riskContent(query), [api, query.status, query.riskLevel, query.sourceType, query.keyword, query.page, query.pageSize]);
  const rows = asArray<Row>(state.data, "riskContents");
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const mutation = useMutationTracker();
  return (
    <AdminPage title="内容风险审核" filters={
      <FilterBar>
        <SelectFilter label="状态" value={query.status} options={RISK_STATUS_OPTIONS} onChange={(value) => updateQuery(setParams, { status: value })} />
        <SelectFilter label="风险等级" value={query.riskLevel} options={RISK_LEVEL_OPTIONS} onChange={(value) => updateQuery(setParams, { riskLevel: value })} />
        <TextFilter label="来源" value={query.sourceType} onChange={(value) => updateQuery(setParams, { sourceType: value })} />
        <TextFilter label="关键词" value={query.keyword} onChange={(value) => updateQuery(setParams, { keyword: value })} />
      </FilterBar>
    }>
      <StateView loading={state.loading} error={state.error} empty={!rows.length}>
        <div className="bulk-bar">
          <span>已选择 {selectedIds.length} 条</span>
          <button className="btn btn--secondary" disabled={!selectedIds.length || mutation.busy} onClick={async () => {
            await mutation.run(() => api.admin.batchReviewRiskContent({ riskIds: selectedIds, note: "批量进入人工复核" }), () => {
              setSelectedIds([]);
              state.reload();
            });
          }}>批量复核</button>
          {mutation.error ? <span className="field-error">{mutation.error}</span> : null}
        </div>
        <DataTable columns={["选择", "内容", "状态", "风险", "来源", "时间", "操作"]} rows={rows.map((item) => {
          const id = text(item.riskId ?? item.id);
          return [
            <input key="check" type="checkbox" checked={selectedIds.includes(id)} onChange={() => setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])} />,
            riskCell(item),
            statusBadge(item.status),
            text(item.riskLevel),
            text(item.sourceType ?? item.source),
            dateText(item.createdAt),
            <RiskContentActions key="actions" api={api} item={item} onDone={state.reload} />
          ];
        })} />
        <PaginationControls pagination={asRecord(state.data).pagination} onPageChange={(page) => updateQuery(setParams, { page: String(page) }, false)} />
      </StateView>
    </AdminPage>
  );
}

export function AdminAuditLogPage({ api }: { api: ApiClient }) {
  const { params, setParams } = useQueryParams();
  const query = listQuery(params, { actorId: "", action: "", targetType: "", targetId: "", keyword: "", pageSize: "20" });
  const state = useAsync(() => api.admin.auditLogs(query), [api, query.actorId, query.action, query.targetType, query.targetId, query.keyword, query.page, query.pageSize]);
  const rows = asArray<Row>(state.data, "auditLogs");
  return (
    <AdminPage title="审计日志" filters={
      <FilterBar>
        <TextFilter label="操作者" value={query.actorId} onChange={(value) => updateQuery(setParams, { actorId: value })} />
        <TextFilter label="动作" value={query.action} onChange={(value) => updateQuery(setParams, { action: value })} />
        <TextFilter label="对象类型" value={query.targetType} onChange={(value) => updateQuery(setParams, { targetType: value })} />
        <TextFilter label="对象ID" value={query.targetId} onChange={(value) => updateQuery(setParams, { targetId: value })} />
        <TextFilter label="关键词" value={query.keyword} onChange={(value) => updateQuery(setParams, { keyword: value })} />
      </FilterBar>
    }>
      <StateView loading={state.loading} error={state.error} empty={!rows.length}>
        <DataTable columns={["时间", "操作者", "动作", "对象", "详情", "风险"]} rows={rows.map((item) => [
          dateText(item.createdAt),
          text(nested(item, "actor").displayName ?? nested(item, "actor").username ?? item.actorId),
          text(item.action),
          `${text(item.targetType)} #${text(item.targetId)}`,
          <pre key="detail" className="inline-json">{JSON.stringify(item.detail ?? {}, null, 0)}</pre>,
          <Badge key="risk" tone={HIGH_RISK_AUDITS.has(text(item.action)) ? "warning" : "neutral"}>{HIGH_RISK_AUDITS.has(text(item.action)) ? "高风险" : "一般"}</Badge>
        ])} />
        <PaginationControls pagination={asRecord(state.data).pagination} onPageChange={(page) => updateQuery(setParams, { page: String(page) }, false)} />
      </StateView>
    </AdminPage>
  );
}

export function AdminSystemPage({ api }: { api: ApiClient }) {
  const state = useAsync(async () => {
    const [system, backups, audit, maintenance] = await Promise.all([
      api.admin.system(),
      api.admin.backups(),
      api.admin.auditLogs({ page: 1, pageSize: 6, targetType: "system" }),
      api.admin.auditLogs({ page: 1, pageSize: 6, action: "admin.maintenance.message_cleanup.execute" })
    ]);
    return { system, backups, audit, maintenance };
  }, [api]);
  const settings = asRecord(asRecord(state.data?.system).settings ?? state.data?.system);
  const backups = asArray<Row>(state.data?.backups, "backups");
  const audits = asArray<Row>(state.data?.audit, "auditLogs");
  const maintenance = asArray<Row>(state.data?.maintenance, "auditLogs");
  const saveMutation = useMutationTracker();
  return (
    <AdminPage title="系统设置">
      <StateView loading={state.loading} error={state.error}>
        <div className="admin-split admin-split--stacked">
          <section className="panel form-grid">
            <h2>系统配置</h2>
            <form className="form-grid" onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              await saveMutation.run(() => api.admin.updateSystem({
                freezeDays: Number(form.get("freezeDays")),
                autoArchiveDays: Number(form.get("autoArchiveDays")),
                newUserCoin: Number(form.get("newUserCoin")),
                maintenanceMode: form.get("maintenanceMode") === "on",
                autoBackup: form.get("autoBackup") === "on",
                aiHighRiskBlock: form.get("aiHighRiskBlock") === "on",
                safetyNotice: text(form.get("safetyNotice"), "")
              }), () => state.reload());
            }}>
              <div className="form-two-col">
                <TextField label="冻结天数" name="freezeDays" defaultValue={text(settings.freezeDays, "3")} />
                <TextField label="自动归档天数" name="autoArchiveDays" defaultValue={text(settings.autoArchiveDays, "30")} />
                <TextField label="新用户赠币" name="newUserCoin" defaultValue={text(settings.newUserCoin, "5")} />
                <label className="check-row"><input type="checkbox" name="maintenanceMode" defaultChecked={Boolean(settings.maintenanceMode)} /> 维护模式</label>
                <label className="check-row"><input type="checkbox" name="autoBackup" defaultChecked={Boolean(settings.autoBackup)} /> 自动备份</label>
                <label className="check-row"><input type="checkbox" name="aiHighRiskBlock" defaultChecked={Boolean(settings.aiHighRiskBlock)} /> AI 高风险阻断</label>
              </div>
              <Field label="安全公告"><textarea name="safetyNotice" rows={3} defaultValue={text(settings.safetyNotice, "")} /></Field>
              {saveMutation.error ? <p className="field-error" role="alert">{saveMutation.error}</p> : null}
              <button className="btn btn--primary" disabled={saveMutation.busy}>{saveMutation.busy ? "保存中..." : "保存系统设置"}</button>
            </form>
          </section>
          <section className="panel">
            <div className="section-heading">
              <h2>系统快照</h2>
              <BackupCreateButton api={api} onDone={state.reload} />
            </div>
            <DataTable columns={["快照", "状态", "大小", "时间", "操作"]} rows={backups.map((item) => [
              text(item.label ?? item.backupId),
              statusBadge(item.status),
              text(item.sizeBytes),
              dateText(item.createdAt),
              <BackupActions key="actions" api={api} item={item} onDone={state.reload} />
            ])} />
          </section>
          <section className="panel">
            <h2>消息清理</h2>
            <MaintenanceActions api={api} onDone={state.reload} />
            <DataTable columns={["时间", "动作", "详情"]} rows={maintenance.map((item) => [dateText(item.createdAt), text(item.action), text(item.detail)])} />
          </section>
          <section className="panel">
            <h2>系统审计</h2>
            <DataTable columns={["时间", "动作", "对象", "详情"]} rows={audits.map((item) => [dateText(item.createdAt), text(item.action), text(item.targetType), text(item.detail)])} />
          </section>
        </div>
      </StateView>
    </AdminPage>
  );
}

export function AdminPageByRoute({ api, route }: { api: ApiClient; route: AppRoute }) {
  switch (route.id) {
    case "admin-dashboard": return <AdminDashboardPage api={api} />;
    case "admin-users": return <AdminUsersPage api={api} />;
    case "admin-transactions": return <AdminTransactionsPage api={api} />;
    case "admin-disputes": return <AdminDisputesPage api={api} />;
    case "admin-dispute-final": return <AdminDisputeFinalPage api={api} />;
    case "admin-stats": return <AdminStatsPage api={api} />;
    case "admin-categories": return <AdminCategoriesPage api={api} />;
    case "admin-sensitive-words": return <AdminSensitiveWordsPage api={api} />;
    case "admin-risk-content": return <AdminRiskContentPage api={api} />;
    case "admin-audit-log": return <AdminAuditLogPage api={api} />;
    case "admin-system": return <AdminSystemPage api={api} />;
    default:
      return <StateView empty loading={false} error={null}><div /></StateView>;
  }
}

function AdminPage({ title, filters, children }: { title: string; filters?: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      <PageHeader title={title} />
      {filters}
      {children}
    </>
  );
}

function FilterBar({ children }: { children: React.ReactNode }) {
  return <section className="panel filter-panel admin-filter-panel">{children}</section>;
}

function TextFilter({ label, value, onChange, placeholder = "" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="field"><span>{label}</span><input value={value} placeholder={placeholder} onChange={(event) => onChange(event.currentTarget.value)} /></label>;
}

function TextField({ label, name, defaultValue }: { label: string; name: string; defaultValue: string }) {
  return <label className="field"><span>{label}</span><input name={name} defaultValue={defaultValue} /></label>;
}

function SelectFilter({ label, value, options, onChange }: { label: string; value: string; options: readonly Option[]; onChange: (value: string) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.currentTarget.value)}>
        {options.map(([key, labelText]) => <option key={key} value={key}>{labelText}</option>)}
      </select>
    </label>
  );
}

function DetailPanel({ title, rows }: { title: string; rows: Array<[string, React.ReactNode]> }) {
  return (
    <section className="panel detail-panel admin-detail-panel">
      <h2>{title}</h2>
      <div className="detail-list">
        {rows.map(([label, value]) => <div key={label} className="detail-item"><div className="label">{label}</div><div className="value">{value}</div></div>)}
      </div>
    </section>
  );
}

function BackupCreateButton({ api, onDone }: { api: ApiClient; onDone: () => void }) {
  const mutation = useMutationTracker();
  return (
    <ConfirmActionButton
      className="btn btn--primary"
      label={mutation.busy ? "生成中..." : "立即备份"}
      confirmText="立即备份"
      reasonLabel="备份原因"
      reasonDefault="手动创建系统快照"
      action={(payload) => api.admin.createBackup({ ...payload, label: `手动快照 ${new Date().toISOString()}` })}
      onDone={onDone}
      mutation={mutation}
    />
  );
}

function BackupActions({ api, item, onDone }: { api: ApiClient; item: Row; onDone: () => void }) {
  const mutation = useMutationTracker();
  const id = text(item.backupId ?? item.id, "");
  return (
    <div className="action-row">
      <ConfirmActionButton className="btn btn--secondary btn--sm" label="恢复" confirmText="恢复备份" reasonLabel="恢复原因" reasonDefault="手动恢复系统快照" action={(payload) => api.admin.restoreBackup(id, payload)} onDone={onDone} mutation={mutation} />
      <ConfirmActionButton className="btn btn--secondary btn--sm" label="删除" confirmText="删除备份" reasonLabel="删除原因" reasonDefault="手动删除系统快照" action={(payload) => api.admin.deleteBackup(id, payload)} onDone={onDone} mutation={mutation} />
      {mutation.error ? <span className="field-error">{mutation.error}</span> : null}
    </div>
  );
}

function MaintenanceActions({ api, onDone }: { api: ApiClient; onDone: () => void }) {
  const mutation = useMutationTracker();
  return (
    <div className="action-row">
      <button className="btn btn--secondary" disabled={mutation.busy} onClick={() => mutation.run(() => api.admin.messageCleanup({ mode: "preview", days: 90 }), onDone)}>预览清理</button>
      <ConfirmActionButton className="btn btn--primary" label="执行清理" confirmText="清理归档消息" reasonLabel="清理原因" reasonDefault="手动清理归档消息" extraFields={[{ name: "days", label: "保留天数", defaultValue: "90" }]} action={(payload) => api.admin.messageCleanup({ ...payload, mode: "execute" })} onDone={onDone} mutation={mutation} />
      {mutation.error ? <span className="field-error">{mutation.error}</span> : null}
    </div>
  );
}

function ConfirmActionButton({ className, label, confirmText, reasonLabel, reasonDefault, extraFields = [], action, onDone, mutation }: {
  className: string;
  label: string;
  confirmText: string;
  reasonLabel: string;
  reasonDefault: string;
  extraFields?: Array<{ name: string; label: string; defaultValue: string }>;
  action: (payload: Row) => Promise<unknown>;
  onDone: () => void;
  mutation: ReturnType<typeof useMutationTracker>;
}) {
  const [open, setOpen] = React.useState(false);
  const [typed, setTyped] = React.useState("");
  const [reason, setReason] = React.useState(reasonDefault);
  const [values, setValues] = React.useState<Row>(() => Object.fromEntries(extraFields.map((item) => [item.name, item.defaultValue])));
  return (
    <>
      <button className={className} disabled={mutation.busy} onClick={() => setOpen(true)}>{label}</button>
      {open ? (
        <div className="ui-confirm" role="dialog" aria-modal="true" aria-label={label}>
          <div className="ui-confirm__panel panel">
            <h2>{label}</h2>
            <p className="muted">请输入确认短语 <strong>{confirmText}</strong> 后继续。</p>
            <Field label="确认短语"><input value={typed} onChange={(event) => setTyped(event.currentTarget.value)} /></Field>
            {extraFields.map((item) => (
              <Field key={item.name} label={item.label}><input value={text(values[item.name], item.defaultValue)} onChange={(event) => setValues((current) => ({ ...current, [item.name]: event.currentTarget.value }))} /></Field>
            ))}
            <Field label={reasonLabel}><textarea rows={3} value={reason} onChange={(event) => setReason(event.currentTarget.value)} /></Field>
            <div className="action-row">
              <button className="btn btn--secondary" onClick={() => setOpen(false)}>取消</button>
              <button className="btn btn--primary" disabled={typed !== confirmText || mutation.busy} onClick={async () => {
                await mutation.run(() => action({ ...values, confirmText, reason }), onDone);
                setOpen(false);
              }}>确认</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function UserStatusActions({ api, user, onDone }: { api: ApiClient; user: Row; onDone: () => void }) {
  const mutation = useMutationTracker();
  const active = normalizeStatus(user.status) === "active";
  return (
    <div className="action-row">
      <button className="btn btn--secondary btn--sm" disabled={mutation.busy} onClick={() => mutation.run(() => api.admin.updateUserStatus(text(user.userId), {
        status: active ? "disabled" : "active",
        reason: active ? "管理员禁用账号" : "管理员启用账号"
      }), onDone)}>{active ? "禁用" : "启用"}</button>
      {mutation.error ? <span className="field-error">{mutation.error}</span> : null}
    </div>
  );
}

function CategoryActions({ api, item, onDone }: { api: ApiClient; item: Row; onDone: () => void }) {
  const mutation = useMutationTracker();
  const id = text(item.categoryId ?? item.id);
  const active = normalizeStatus(item.status) === "active";
  return (
    <div className="action-row">
      <button className="btn btn--secondary btn--sm" disabled={mutation.busy} onClick={() => mutation.run(() => api.admin.updateCategory(id, { status: active ? "disabled" : "active" }), onDone)}>切换状态</button>
      <ConfirmActionButton className="btn btn--secondary btn--sm" label="停用" confirmText="停用类别" reasonLabel="停用原因" reasonDefault="管理员停用类别" action={() => api.admin.updateCategory(id, { status: "disabled" })} onDone={onDone} mutation={mutation} />
      {mutation.error ? <span className="field-error">{mutation.error}</span> : null}
    </div>
  );
}

function TagActions({ api, item, onDone }: { api: ApiClient; item: Row; onDone: () => void }) {
  const mutation = useMutationTracker();
  const id = text(item.tagId ?? item.id);
  const active = normalizeStatus(item.status) === "active";
  return (
    <div className="action-row">
      <button className="btn btn--secondary btn--sm" disabled={mutation.busy} onClick={() => mutation.run(() => api.admin.updateTag(id, { status: active ? "disabled" : "active" }), onDone)}>切换状态</button>
      <ConfirmActionButton className="btn btn--secondary btn--sm" label="停用" confirmText="停用标签" reasonLabel="停用原因" reasonDefault="管理员停用标签" action={() => api.admin.updateTag(id, { status: "disabled" })} onDone={onDone} mutation={mutation} />
      {mutation.error ? <span className="field-error">{mutation.error}</span> : null}
    </div>
  );
}

function SensitiveWordActions({ api, item, onDone }: { api: ApiClient; item: Row; onDone: () => void }) {
  const mutation = useMutationTracker();
  const id = text(item.wordId ?? item.sensitiveWordId ?? item.id);
  const active = normalizeStatus(item.status) === "active";
  return (
    <div className="action-row">
      <button className="btn btn--secondary btn--sm" disabled={mutation.busy} onClick={() => mutation.run(() => api.admin.updateSensitiveWord(id, { status: active ? "disabled" : "active" }), onDone)}>切换状态</button>
      <ConfirmActionButton className="btn btn--secondary btn--sm" label="停用" confirmText="停用敏感词" reasonLabel="停用原因" reasonDefault="管理员停用敏感词" action={() => api.admin.updateSensitiveWord(id, { status: "disabled" })} onDone={onDone} mutation={mutation} />
      {mutation.error ? <span className="field-error">{mutation.error}</span> : null}
    </div>
  );
}

function SensitiveImportForm({ api, onDone }: { api: ApiClient; onDone: () => void }) {
  const mutation = useMutationTracker();
  const [content, setContent] = React.useState("");
  const [replacement, setReplacement] = React.useState("***");
  const [level, setLevel] = React.useState("review");
  return (
    <div className="form-grid">
      <Field label="导入内容"><textarea rows={5} value={content} onChange={(event) => setContent(event.currentTarget.value)} placeholder="每行一个词条，最多 200 条" /></Field>
      <div className="form-two-col">
        <Field label="默认替换"><input value={replacement} onChange={(event) => setReplacement(event.currentTarget.value)} /></Field>
        <SelectFilter label="默认等级" value={level} options={SENSITIVE_LEVEL_OPTIONS.filter(([value]) => value !== "all")} onChange={setLevel} />
      </div>
      <button className="btn btn--primary" disabled={mutation.busy || !content.trim()} onClick={() => mutation.run(() => api.admin.importSensitiveWords({
        content,
        replacement,
        level,
        category: "批量导入",
        reason: "批量导入敏感词规则"
      }), onDone)}>导入敏感词</button>
      {mutation.error ? <p className="field-error" role="alert">{mutation.error}</p> : null}
    </div>
  );
}

function RiskContentActions({ api, item, onDone }: { api: ApiClient; item: Row; onDone: () => void }) {
  const mutation = useMutationTracker();
  const id = text(item.riskId ?? item.id);
  return (
    <div className="action-row">
      <button className="btn btn--secondary btn--sm" disabled={mutation.busy} onClick={() => mutation.run(() => api.admin.resolveRiskContent(id, { status: "reviewing", note: "进入人工复核" }), onDone)}>复核</button>
      <button className="btn btn--secondary btn--sm" disabled={mutation.busy} onClick={() => mutation.run(() => api.admin.resolveRiskContent(id, { status: "approved", note: "人工审核通过" }), onDone)}>通过</button>
      <button className="btn btn--secondary btn--sm" disabled={mutation.busy} onClick={() => mutation.run(() => api.admin.resolveRiskContent(id, { status: "removed", note: "人工审核移除" }), onDone)}>移除</button>
      {mutation.error ? <span className="field-error">{mutation.error}</span> : null}
    </div>
  );
}

function listQuery(params: URLSearchParams, defaults: Record<string, string>): QueryState {
  const values: Record<string, string> = {};
  for (const key of Object.keys(defaults)) {
    values[key] = params.get(key) ?? defaults[key];
  }
  return {
    ...values,
    page: params.get("page") ?? defaults.page ?? "1",
    pageSize: params.get("pageSize") ?? defaults.pageSize ?? "20"
  } as QueryState;
}

function updateQuery(setParams: ReturnType<typeof useQueryParams>["setParams"], patch: Record<string, string>, resetPage = true) {
  setParams((current) => {
    const next = new URLSearchParams(current);
    Object.entries(patch).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
    if (resetPage) next.set("page", "1");
    return next;
  });
}

function userCell(item: Row) {
  return (
    <div className="stack-cell">
      <strong>{text(item.displayName ?? item.username ?? item.userId)}</strong>
      <span className="muted">{text(item.username ?? item.phone ?? item.userId)}</span>
    </div>
  );
}

function riskCell(item: Row) {
  return (
    <div className="stack-cell">
      <strong>{text(item.title ?? item.summary ?? item.content)}</strong>
      <span className="muted">{text(item.reason ?? item.sourceId ?? item.hitWords)}</span>
    </div>
  );
}

function linkedBusiness(item: Row) {
  const href = safeInternalHref(item.href ?? item.path ?? item.link, "");
  if (href) return <Link to={href}>{text(item.title ?? item.name ?? item.label ?? "查看")}</Link>;
  if (item.orderId) return <Link to={`/orders/${text(item.orderId)}`}>订单 #{text(item.orderId)}</Link>;
  if (item.disputeId) return <Link to={`/disputes/${text(item.disputeId)}`}>纠纷 #{text(item.disputeId)}</Link>;
  return text(item.title ?? item.name ?? item.targetType);
}

function transactionBadge(value: unknown) {
  const map: Record<string, string> = { income: "收入", expense: "支出", freeze: "冻结", release: "解冻", refund: "退款", system_fee: "平台费用" };
  const key = String(value ?? "");
  return <Badge tone={["income", "release", "refund"].includes(key) ? "success" : ["expense", "freeze", "system_fee"].includes(key) ? "warning" : "neutral"}>{labelFromMap(value, map)}</Badge>;
}

function statusBadge(value: unknown) {
  const normalized = normalizeStatus(value);
  const tone = ["active", "approved", "resolved", "ready"].includes(normalized) ? "success" : ["disabled", "removed", "failed"].includes(normalized) ? "danger" : "warning";
  return <Badge tone={tone}>{labelFromMap(normalized, {
    active: "启用",
    disabled: "禁用",
    pending: "待处理",
    reviewing: "复核中",
    approved: "已通过",
    removed: "已移除",
    ignored: "已忽略",
    resolved: "已处理",
    ready: "就绪",
    failed: "失败"
  })}</Badge>;
}

function disputeBadge(value: unknown) {
  const key = String(value ?? "");
  return <Badge tone={["resolved", "ruled", "closed"].includes(key) ? "success" : "warning"}>{labelFromMap(key, {
    pending: "待受理",
    todo: "待处理",
    in_progress: "处理中",
    processing: "处理中",
    reviewing: "复核中",
    resolved: "已结案",
    ruled: "已裁决",
    closed: "已关闭"
  })}</Badge>;
}

function disputeRows(payload: unknown): Array<[string, React.ReactNode]> {
  const dispute = asRecord(asRecord(payload).dispute ?? payload);
  if (!Object.keys(dispute).length) return [["状态", "暂无纠纷详情"]];
  return [
    ["纠纷ID", text(dispute.disputeId)],
    ["订单ID", text(dispute.orderId)],
    ["状态", text(dispute.statusText ?? dispute.status)],
    ["原因", text(dispute.reason)],
    ["描述", text(dispute.description)],
    ["金额", moneyText(dispute.amount)],
    ["终审结果", text(dispute.finalResultText ?? dispute.finalResult)],
    ["退款金额", moneyText(dispute.refundAmount)],
    ["服务方实得", moneyText(dispute.providerPayout)],
    ["创建时间", fullDateText(dispute.createdAt)],
    ["更新时间", fullDateText(dispute.updatedAt ?? dispute.resolvedAt)]
  ];
}

function looseTable(data: unknown, title: string) {
  const rows = Array.isArray(data) ? data as Row[] : asArray<Row>(data, "items");
  if (!rows.length) return null;
  const columns = Object.keys(rows[0]).slice(0, 6);
  return (
    <section className="panel">
      <h2>{title}</h2>
      <DataTable columns={columns} rows={rows.map((row) => columns.map((column) => text(row[column])))} />
    </section>
  );
}

function metricValue(value: unknown) {
  return value && typeof value === "object" && "value" in value ? (value as { value?: unknown }).value : value;
}

function nested(item: Row, key: string): Row {
  return asRecord(item[key]);
}

function normalizeStatus(value: unknown) {
  if (value === 1 || value === "1") return "active";
  if (value === 0 || value === "0") return "disabled";
  return String(value ?? "");
}
