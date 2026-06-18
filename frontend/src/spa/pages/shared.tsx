import React from "react";
import type { ApiClient } from "../api";
import { ApiError } from "../api";
import { fileAssetUrl, isImageAsset } from "../avatar";

export function useAsync<T>(loader: (signal?: AbortSignal) => Promise<T>, deps: React.DependencyList = []) {
  const [data, setData] = React.useState<T | null>(null);
  const [error, setError] = React.useState<Error | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [version, setVersion] = React.useState(0);

  React.useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    loader(controller.signal)
      .then((value) => {
        if (!cancelled) {
          setData(value);
          setError(null);
        }
      })
      .catch((reason) => {
        if (!cancelled && !isAbortError(reason)) setError(reason instanceof Error ? reason : new Error(String(reason)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [...deps, version]);

  return { data, error, loading, setData, reload: () => setVersion((value) => value + 1) };
}

export function StateView({ loading, error, empty, children }: {
  loading?: boolean;
  error?: Error | null;
  empty?: boolean;
  children: React.ReactNode;
}) {
  if (loading) return <div className="state-card" role="status">正在加载...</div>;
  if (error) return <div className="state-card state-card--error" role="alert">{friendlyError(error)}</div>;
  if (empty) return <div className="state-card">暂无数据</div>;
  return <>{children}</>;
}

export function PageHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <header className="page-header">
      <h1>{title}</h1>
      {action}
    </header>
  );
}

export type PaginationData = {
  page?: number;
  pageSize?: number;
  total?: number;
  totalPages?: number;
  hasNext?: boolean;
  hasPrev?: boolean;
};

export function PaginationControls({ pagination, onPageChange }: {
  pagination?: unknown;
  onPageChange: (page: number) => void;
}) {
  const pageInfo = asRecord(pagination);
  if (Number(pageInfo.totalPages ?? 0) <= 1) return null;
  const page = Number(pageInfo.page ?? 1);
  const totalPages = Number(pageInfo.totalPages ?? 1);
  return (
    <nav className="pagination-row" aria-label="分页">
      <button className="btn btn--secondary" disabled={!pageInfo.hasPrev} onClick={() => onPageChange(Math.max(1, page - 1))}>上一页</button>
      <span>第 {page} / {totalPages} 页，共 {Number(pageInfo.total ?? 0)} 条</span>
      <button className="btn btn--secondary" disabled={!pageInfo.hasNext} onClick={() => onPageChange(Math.min(totalPages, page + 1))}>下一页</button>
    </nav>
  );
}

export function DataTable({ columns, rows }: { columns: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, i) => <td key={i}>{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: string }) {
  return <span className={`badge-state badge-state--${tone}`}>{children}</span>;
}

export function AttachmentPreviewList({ attachments, api, compact = false }: {
  attachments: Record<string, unknown>[];
  api: Pick<ApiClient, "files">;
  compact?: boolean;
}) {
  if (attachments.length === 0) return null;
  return (
    <div className={`attachment-preview-list${compact ? " attachment-preview-list--compact" : ""}`}>
      {attachments.map((file, index) => {
        const name = text(file.name ?? file.originalName ?? file.fileId ?? index);
        const url = fileAssetUrl(file, api);
        if (url && isImageAsset(file)) {
          return (
            <a className="attachment-preview" href={url} target="_blank" rel="noreferrer" key={text(file.fileId ?? file.url ?? name ?? index)}>
              <img src={url} alt={name} />
            </a>
          );
        }
        return <Badge key={text(file.fileId ?? file.url ?? name ?? index)}>{name}</Badge>;
      })}
    </div>
  );
}

export function FileUpload({ purpose, businessType, businessId, visibility, onUploaded }: {
  purpose: string;
  businessType?: string;
  businessId?: string | number | null;
  visibility: "public" | "private";
  onUploaded: (formData: FormData) => Promise<void>;
}) {
  const [fileName, setFileName] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  return (
    <div className="upload-box">
      <input
        type="file"
        onChange={async (event) => {
          const file = event.currentTarget.files?.[0];
          if (!file) return;
          if (file.size > 10 * 1024 * 1024) {
            setError("文件不能超过 10MB。");
            return;
          }
          setBusy(true);
          setError("");
          setFileName(file.name);
          const formData = new FormData();
          formData.set("file", file);
          formData.set("purpose", purpose);
          formData.set("visibility", visibility);
          if (businessType) formData.set("businessType", businessType);
          if (businessId !== undefined && businessId !== null) formData.set("businessId", String(businessId));
          try {
            await onUploaded(formData);
          } catch (reason) {
            setError(friendlyError(reason));
          } finally {
            setBusy(false);
          }
        }}
      />
      <small>{busy ? "上传中..." : fileName || "支持图片、PDF、文本和 Office 文档"}</small>
      {error ? <small className="field-error">{error}</small> : null}
    </div>
  );
}

export function friendlyError(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "操作失败，请稍后重试。";
}

export function asArray<T = Record<string, unknown>>(value: unknown, key: string): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object" && Array.isArray((value as Record<string, unknown>)[key])) {
    return (value as Record<string, unknown>)[key] as T[];
  }
  return [];
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function numberValue(value: unknown, fallback = 0): number {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

export function text(value: unknown, fallback = "-"): string {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value);
}

export function dateText(value: unknown, fallback = "-"): string {
  if (!value) return fallback;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function fullDateText(value: unknown, fallback = "-"): string {
  if (!value) return fallback;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleString("zh-CN");
}

export function moneyText(value: unknown, fallback = "0.00"): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return fallback;
  return amount.toFixed(2);
}

export function signedMoneyText(value: unknown, type?: unknown): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return moneyText(value);
  const absolute = Math.abs(amount).toFixed(2);
  const kind = String(type ?? "").toLowerCase();
  if (amount < 0 || ["expense", "freeze"].includes(kind)) return `-${absolute}`;
  if (amount > 0 || ["income", "release", "refund"].includes(kind)) return `+${absolute}`;
  return absolute;
}

export function safeInternalHref(value: unknown, fallback = ""): string {
  const href = text(value, "").trim();
  if (!href || href.startsWith("//")) return fallback;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return fallback;
  return href.startsWith("/") ? href : fallback;
}

export function pageFromParams(params: URLSearchParams, fallback = 1): number {
  const value = Number(params.get("page") ?? fallback);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export function statusLabel(status: unknown): string {
  const map: Record<string, string> = {
    open: "待接单",
    accepted: "已接单",
    payer_confirmed: "需求方已确认",
    provider_confirmed: "服务方已确认",
    both_confirmed: "待结算",
    completed: "已完成",
    disputed: "纠纷中",
    cancelled: "已取消"
  };
  return map[String(status ?? "")] ?? text(status);
}

export function labelFromMap(value: unknown, map: Record<string, string>, fallback = "-"): string {
  const key = String(value ?? "");
  return map[key] ?? text(value, fallback);
}

export function statusTone(status: unknown): string {
  const value = String(status ?? "");
  if (["completed"].includes(value)) return "success";
  if (["accepted", "payer_confirmed", "provider_confirmed", "both_confirmed"].includes(value)) return "warning";
  if (["disputed", "cancelled"].includes(value)) return "danger";
  return "neutral";
}

export function useQueryParams() {
  const [params, setParams] = React.useState(() => new URLSearchParams(window.location.search));

  React.useEffect(() => {
    const onPopState = () => setParams(new URLSearchParams(window.location.search));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const updateParams = React.useCallback((next: URLSearchParams | ((current: URLSearchParams) => URLSearchParams), options: { replace?: boolean } = {}) => {
    const resolved = typeof next === "function" ? next(new URLSearchParams(window.location.search)) : next;
    const query = resolved.toString();
    const url = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    window.history[options.replace ? "replaceState" : "pushState"]({}, "", url);
    setParams(new URLSearchParams(resolved));
  }, []);

  return { params, setParams: updateParams };
}

export function useMutationTracker() {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>("");

  const run = React.useCallback(async <T,>(mutation: () => Promise<T>, onSuccess?: (value: T) => void | Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      const value = await mutation();
      await onSuccess?.(value);
      return value;
    } catch (reason) {
      const message = friendlyError(reason);
      setError(message);
      throw reason;
    } finally {
      setBusy(false);
    }
  }, []);

  return { busy, error, setError, run };
}

export function isAbortError(error: unknown) {
  return Boolean(error && typeof error === "object" && "name" in error && (error as { name?: string }).name === "AbortError");
}
