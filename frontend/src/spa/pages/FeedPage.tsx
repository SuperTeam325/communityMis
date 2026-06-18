import { Link } from "react-router-dom";
import type { ApiClient } from "../api";
import {
  asArray,
  asRecord,
  Badge,
  dateText,
  PageHeader,
  PaginationControls,
  PostCard,
  SearchBar,
  StateView,
  statusLabel,
  statusTone,
  text,
  useAsync,
  useQueryParams
} from "./shared";

export function FeedPage({ api }: { api: ApiClient }) {
  const { params, setParams } = useQueryParams();
  const query = {
    page: Number(params.get("page") || 1),
    pageSize: 12,
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
      <section className="feed-header">
        <PageHeader title="首页信息流" description="发现社区里的真实互助需求和邻里动态。" action={<Link className="btn btn--primary" to="/post">发布需求</Link>} />
        <SearchBar
          placeholder="搜索需求、地点或标签"
          defaultValue={query.keyword}
          action={<Link className="ai-filter-btn" to={`/ai/results?prompt=${encodeURIComponent(query.keyword || "帮我筛选附近可接的高信用需求")}&scene=request_filter`}>AI 筛选</Link>}
          onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          updateQuery({ keyword: form.get("keyword"), page: 1 });
        }}
        />
        <div className="category-tabs filter-row" aria-label="需求状态">
          {[
            ["open", "待接单"],
            ["accepted", "已接单"],
            ["completed", "已完成"],
            ["all", "全部"]
          ].map(([value, label]) => (
            <button key={value} className={`chip ${query.status === value ? "active" : ""}`} aria-label={`筛选${label}`} onClick={() => updateQuery({ status: value, page: 1 })}>{label}</button>
          ))}
        </div>
        <div className="category-tabs filter-row" aria-label="服务类别">
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
      </section>
      <StateView loading={state.loading} error={state.error} empty={requests.length === 0}>
        <div className="card-list feed-content">
          {requests.map((item) => (
            <PostCard key={text(item.requestId)} item={item} href={`/posts/${text(item.requestId)}`} />
          ))}
        </div>
      </StateView>
      <PaginationControls pagination={pagination} onPageChange={(page) => updateQuery({ page })} />
    </>
  );
}
