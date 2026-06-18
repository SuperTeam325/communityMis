import React, { Suspense } from "react";
import { Link, NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { ApiClient } from "./api";
import { avatarImageUrl } from "./avatar";
import { useAuth } from "./auth";
import { setMonitoringUser } from "./monitoring";
import { adminNav, appRoutes, routeById, userNav } from "./routes";
import type { AppRoute, RuntimeConfig } from "./types";
import aiIconUrl from "./assets/ai-icon.png";
import { EntryPage } from "./pages/EntryPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { LoginPage, RegisterPage } from "./pages/AuthPages";
import { FeedPage } from "./pages/FeedPage";
import { TasksPage, RequestDetailPage, PostPage } from "./pages/RequestsPages";
import { OrdersPage, OrderDetailPage, ReviewPage } from "./pages/OrdersPages";
import { DisputeCreatePage, DisputeDetailPage, JuryHallPage, JuryVotingPage } from "./pages/DisputesPages";
import { WalletPage, WalletFreezePage } from "./pages/WalletPages";
import { MessagesPage, NotificationsPage } from "./pages/MessagesPages";
import { AiAssistantPage, AiResultsPage, AdminAiConfigPage, AdminAiConversationsPage, AdminAiErrorsPage, AdminAiFeedbackPage, AdminAiLogsPage } from "./pages/AiPages";
import { ProfilePage, SettingsPage, UserPublicPage, CreditPage, HelpPage } from "./pages/ProfilePages";
import {
  AdminAuditLogPage,
  AdminCategoriesPage,
  AdminDashboardPage,
  AdminDisputeFinalPage,
  AdminDisputesPage,
  AdminRiskContentPage,
  AdminSensitiveWordsPage,
  AdminStatsPage,
  AdminSystemPage,
  AdminTransactionsPage,
  AdminUsersPage
} from "./pages/AdminPages";

type PageProps = {
  api: ApiClient;
  config: RuntimeConfig;
  route: AppRoute;
};

export function App({ api, config }: { api: ApiClient; config: RuntimeConfig }) {
  return (
    <Routes>
      {appRoutes.map((route) => (
        <Route
          key={route.id}
          path={route.path}
          element={<RouteFrame api={api} config={config} route={route} />}
        />
      ))}
      <Route path="*" element={<NotFoundPage routes={appRoutes} />} />
    </Routes>
  );
}

function RouteFrame(props: PageProps) {
  const { route } = props;
  const auth = useAuth();
  const location = useLocation();

  React.useEffect(() => {
    document.title = `${route.title} - 邻帮`;
    document.documentElement.dataset.routeId = route.id;
    document.documentElement.dataset.routeSurface = route.surface;
    setMonitoringUser(auth.session?.user ?? null);
  }, [auth.session?.user, route.id, route.surface, route.title]);

  if (auth.loading && route.surface !== "launcher") {
    return <LoadingScreen />;
  }
  if (route.auth === "user" && !auth.session) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }
  if (route.auth === "admin" && (!auth.session || !["admin", "super_admin"].includes(auth.session.user.role))) {
    return <Navigate to={`/admin/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }
  if (route.surface === "userAuth" && auth.session?.user.role === "user") {
    return <Navigate to="/feed" replace />;
  }
  if (route.surface === "adminAuth" && auth.session && ["admin", "super_admin"].includes(auth.session.user.role)) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  const page = (
    <Suspense fallback={<LoadingScreen />}>
      <PageSwitch {...props} />
    </Suspense>
  );

  if (route.layout === "adminShell") {
    return <AdminShell route={route}>{page}</AdminShell>;
  }
  if (route.layout === "userShell") {
    return <UserShell api={props.api} route={route}>{page}</UserShell>;
  }
  return page;
}

function PageSwitch(props: PageProps) {
  switch (props.route.id) {
    case "entry": return <EntryPage />;
    case "login": return <LoginPage api={props.api} />;
    case "register": return <RegisterPage api={props.api} />;
    case "feed": return <FeedPage api={props.api} />;
    case "tasks": return <TasksPage api={props.api} />;
    case "post": return <PostPage api={props.api} />;
    case "post-detail": return <RequestDetailPage api={props.api} />;
    case "orders": return <OrdersPage api={props.api} />;
    case "order-detail": return <OrderDetailPage api={props.api} />;
    case "review": return <ReviewPage api={props.api} />;
    case "dispute-create": return <DisputeCreatePage api={props.api} />;
    case "dispute-detail": return <DisputeDetailPage api={props.api} />;
    case "jury-hall": return <JuryHallPage api={props.api} />;
    case "jury-voting": return <JuryVotingPage api={props.api} />;
    case "jury-dispute-voting": return <JuryVotingPage api={props.api} />;
    case "wallet": return <WalletPage api={props.api} />;
    case "wallet-freeze": return <WalletFreezePage api={props.api} />;
    case "messages": return <MessagesPage api={props.api} />;
    case "notifications": return <NotificationsPage api={props.api} />;
    case "ai-assistant": return <AiAssistantPage api={props.api} />;
    case "ai-results": return <AiResultsPage api={props.api} />;
    case "profile": return <ProfilePage api={props.api} />;
    case "settings": return <SettingsPage api={props.api} />;
    case "user-public": return <UserPublicPage api={props.api} />;
    case "credit": return <CreditPage api={props.api} />;
    case "help": return <HelpPage />;
    case "admin-dashboard": return <AdminDashboardPage api={props.api} />;
    case "admin-users": return <AdminUsersPage api={props.api} />;
    case "admin-transactions": return <AdminTransactionsPage api={props.api} />;
    case "admin-disputes": return <AdminDisputesPage api={props.api} />;
    case "admin-dispute-final": return <AdminDisputeFinalPage api={props.api} />;
    case "admin-stats": return <AdminStatsPage api={props.api} />;
    case "admin-ai-logs": return <AdminAiLogsPage api={props.api} />;
    case "admin-ai-conversations": return <AdminAiConversationsPage api={props.api} />;
    case "admin-ai-feedback": return <AdminAiFeedbackPage api={props.api} />;
    case "admin-ai-errors": return <AdminAiErrorsPage api={props.api} />;
    case "admin-ai-config": return <AdminAiConfigPage api={props.api} />;
    case "admin-categories": return <AdminCategoriesPage api={props.api} />;
    case "admin-sensitive-words": return <AdminSensitiveWordsPage api={props.api} />;
    case "admin-risk-content": return <AdminRiskContentPage api={props.api} />;
    case "admin-audit-log": return <AdminAuditLogPage api={props.api} />;
    case "admin-system": return <AdminSystemPage api={props.api} />;
    case "admin-login": return <LoginPage api={props.api} admin />;
    default: return <NotFoundPage routes={appRoutes} />;
  }
}

function UserShell({ api, route, children }: { api: ApiClient; route: AppRoute; children: React.ReactNode }) {
  const auth = useAuth();
  const avatarUrl = avatarImageUrl(auth.session?.user, api);
  return (
    <div className="app-shell user-shell">
      <header className="top-nav">
        <Link className="logo" to="/feed">邻<span>帮</span></Link>
        <nav aria-label="主导航">{userNav.map((item) => (
          <NavLink key={item.id} className={({ isActive }) => isActive || route.id === item.id ? "active" : ""} to={item.path}>
            <NavIcon id={item.id} />
            <span>{item.label}</span>
          </NavLink>
        ))}</nav>
        <div className="nav-right">
          <Link className="ai-fab-link" to="/ai/assistant" aria-label="AI 助手"><img src={aiIconUrl} alt="" /></Link>
          <Link className="nav-avatar" to="/profile">
            {avatarUrl ? <img src={avatarUrl} alt="" /> : <span className="nav-avatar-placeholder">{(auth.session?.user.displayName ?? auth.session?.user.username ?? "").slice(0, 1)}</span>}
            <span>{auth.session?.user.displayName ?? auth.session?.user.username}</span>
          </Link>
        </div>
      </header>
      <main className="page">{children}</main>
      <Link className="ai-fab" to="/ai/assistant" aria-label="AI 助手">
        <img src={aiIconUrl} alt="" />
        <span className="fab-pulse" />
      </Link>
      <nav className="bottom-nav" aria-label="底部导航">{userNav.map((item) => (
        <NavLink
          key={item.id}
          className={({ isActive }) => `${item.id === "post" ? "publish-btn" : ""}${isActive || route.id === item.id ? " active" : ""}`.trim()}
          to={item.path}
          aria-label={item.label}
        >
          <NavIcon id={item.id} />
          {item.id === "post" ? <span className="sr-only">{item.label}</span> : <span>{item.label}</span>}
        </NavLink>
      ))}</nav>
    </div>
  );
}

function AdminShell({ route, children }: { route: AppRoute; children: React.ReactNode }) {
  const auth = useAuth();
  return (
    <div className="admin-page">
      <header className="mobile-admin-bar">
        <div className="mobile-admin-top">
          <Link className="mobile-admin-title" to="/admin/dashboard"><span className="shield">⏂</span><span>邻帮 MIS</span></Link>
          <Link className="mobile-admin-home" to="/feed">返回社区</Link>
        </div>
        <nav className="mobile-admin-links" aria-label="移动端管理导航">
          {adminNav.map((item) => <NavLink key={item.id} className={({ isActive }) => isActive || route.id === item.id ? "active" : ""} to={item.path}>{item.label}</NavLink>)}
        </nav>
      </header>
      <aside className="admin-sidebar">
        <Link className="sb-brand" to="/admin/dashboard"><span className="shield">⏂</span><span>邻帮 MIS</span></Link>
        <nav aria-label="管理导航">
          {adminNav.map((item) => (
            <NavLink key={item.id} className={({ isActive }) => isActive || route.id === item.id ? "active" : ""} to={item.path}>
              <AdminNavIcon id={item.id} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sb-footer">
          <Link className="sb-back" to="/feed">← 返回社区首页</Link>
        </div>
      </aside>
      <main className="admin-main">
        <div className="admin-user-chip">{auth.session?.user.displayName ?? auth.session?.user.username}</div>
        {children}
      </main>
    </div>
  );
}

function LoadingScreen() {
  return <main className="page"><div className="state-card">正在加载...</div></main>;
}

function NavIcon({ id }: { id: string }) {
  const common = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (id) {
    case "feed":
      return <svg {...common}><path d="M4 11.5 12 4l8 7.5" /><path d="M6.5 10.5V20h11v-9.5" /><path d="M10 20v-5h4v5" /></svg>;
    case "tasks":
      return <svg {...common}><rect x="4" y="5" width="16" height="15" rx="3" /><path d="M8 9h8M8 13h8M8 17h5" /></svg>;
    case "post":
      return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;
    case "messages":
      return <svg {...common}><path d="M5 6.5h14v9H9l-4 3v-12Z" /><path d="M8.5 10h7M8.5 13h4" /></svg>;
    case "profile":
      return <svg {...common}><circle cx="12" cy="8" r="3.5" /><path d="M5 20c1.2-4 4-6 7-6s5.8 2 7 6" /></svg>;
    default:
      return <svg {...common}><circle cx="12" cy="12" r="8" /></svg>;
  }
}

function AdminNavIcon({ id }: { id: string }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (id.includes("users")) return <svg {...common}><circle cx="9" cy="8" r="3" /><path d="M3.5 20c.8-4 3-6 5.5-6" /><circle cx="17" cy="10" r="2.5" /><path d="M14 20c.5-2.8 2-4.2 4-4.2" /></svg>;
  if (id.includes("transaction")) return <svg {...common}><path d="M4 7h16v10H4z" /><path d="M8 17v2h8v-2M8 11h.01M16 13h.01" /></svg>;
  if (id.includes("dispute")) return <svg {...common}><path d="M12 4v16M6 7h12M8 7l-4 6h8L8 7Zm8 0-4 6h8l-4-6Z" /></svg>;
  if (id.includes("ai")) return <svg {...common}><path d="M12 3v3M12 18v3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M3 12h3M18 12h3" /><circle cx="12" cy="12" r="4" /></svg>;
  if (id.includes("risk") || id.includes("sensitive")) return <svg {...common}><path d="M12 3 4 7v5c0 4.5 3.2 7.4 8 9 4.8-1.6 8-4.5 8-9V7l-8-4Z" /><path d="M12 8v4M12 16h.01" /></svg>;
  if (id.includes("stats")) return <svg {...common}><path d="M5 19V9M12 19V5M19 19v-7" /></svg>;
  if (id.includes("audit") || id.includes("system")) return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" /></svg>;
  if (id.includes("categories")) return <svg {...common}><path d="M4 6h7v7H4zM13 6h7v7h-7zM4 15h7v3H4zM13 15h7v3h-7z" /></svg>;
  return <svg {...common}><path d="M4 13h6V4H4zM14 20h6V4h-6zM4 20h6v-3H4z" /></svg>;
}
