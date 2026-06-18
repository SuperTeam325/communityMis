import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../auth";

export function EntryPage() {
  const auth = useAuth();

  // 已登录用户根据角色跳转：管理员 → 管理后台，普通用户 → 社区首页
  if (!auth.loading && auth.session) {
    const isAdmin = auth.session.user.role === "admin" || auth.session.user.role === "super_admin";
    return <Navigate to={isAdmin ? "/admin/dashboard" : "/feed"} replace />;
  }

  return (
    <main className="entry-page" aria-label="邻帮入口">
      {/* 环境光晕 */}
      <div className="ambient-glow ambient-glow-1" aria-hidden="true" />
      <div className="ambient-glow ambient-glow-2" aria-hidden="true" />

      <div className="entry-card">
        {/* 品牌区域 */}
        <div className="brand">
          <div className="brand-mark-wrapper">
            <div className="brand-mark" aria-hidden="true">
              <svg
                width="34"
                height="34"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 11.5 12 4l9 7.5" />
                <path d="M5 10.5V20h14v-9.5" />
                <path d="M9 20v-5.5h6V20" />
              </svg>
            </div>
            <span className="status-badge" aria-hidden="true" />
          </div>
          <h1>邻帮</h1>
          <p className="subtitle">
            邻里互助时间银行
            <br />
            存储时间 · 交换温暖
          </p>

          {/* 特性标签 */}
          <div className="features" aria-label="平台特性">
            <span className="feature-tag">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              时间存取
            </span>
            <span className="feature-tag">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              双向互助
            </span>
            <span className="feature-tag">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              信用闭环
            </span>
          </div>
        </div>

        {/* 操作区域 */}
        <div className="actions">
          <Link className="home-button" to="/feed" aria-label="进入首页">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 11.5 12 4l9 7.5" />
              <path d="M5 10.5V20h14v-9.5" />
            </svg>
            首页
          </Link>
          <p className="guest-hint">未登录时点击首页将以游客身份浏览</p>

          <div className="auth-links">
            <Link to="/login">登录</Link>
            <span className="divider-dot" aria-hidden="true" />
            <Link to="/register">注册</Link>
          </div>

          <div className="admin-section">
            <Link to="/admin/login" className="admin-link" title="管理后台入口">
              管理员入口
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
