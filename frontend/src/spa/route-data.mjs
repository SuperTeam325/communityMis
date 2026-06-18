export const appRoutes = [
  defineRoute({ id: "entry", title: "邻帮入口", path: "/", entryPath: "/", surface: "launcher", layout: "entry", legacyPaths: ["/index.html", "/screens/index.html"] }),
  defineRoute({ id: "login", title: "登录", path: "/login", entryPath: "/login", surface: "userAuth", layout: "auth", legacyPaths: screenPaths("login.html") }),
  defineRoute({ id: "register", title: "注册", path: "/register", entryPath: "/register", surface: "userAuth", layout: "auth", legacyPaths: screenPaths("register.html") }),
  defineRoute({ id: "feed", title: "首页信息流", path: "/feed", entryPath: "/feed", surface: "public", layout: "userShell", nav: "user", legacyPaths: screenPaths("feed.html") }),
  defineRoute({ id: "tasks", title: "任务市场", path: "/tasks", entryPath: "/tasks", surface: "user", layout: "userShell", nav: "user", legacyPaths: screenPaths("tasks.html") }),
  defineRoute({ id: "post", title: "发布", path: "/post", entryPath: "/post", surface: "user", layout: "userShell", nav: "user", legacyPaths: screenPaths("post.html") }),
  defineRoute({ id: "messages", title: "消息中心", path: "/messages", entryPath: "/messages", surface: "user", layout: "userShell", nav: "user", legacyPaths: screenPaths("messages.html") }),
  defineRoute({ id: "profile", title: "个人中心", path: "/profile", entryPath: "/profile", surface: "user", layout: "userShell", nav: "user", legacyPaths: screenPaths("profile.html") }),
  defineRoute({ id: "post-detail", title: "帖子详情", path: "/posts/:id", entryPath: "/posts/demo", surface: "user", layout: "userShell", legacyPaths: screenPaths("post-detail.html") }),
  defineRoute({ id: "credit", title: "信用详情", path: "/users/:id/credit", entryPath: "/users/demo/credit", surface: "user", layout: "userShell", legacyPaths: screenPaths("credit.html") }),
  defineRoute({ id: "user-public", title: "服务者公开主页", path: "/users/:id", entryPath: "/users/demo", surface: "user", layout: "userShell", legacyPaths: screenPaths("user-public.html") }),
  defineRoute({ id: "notifications", title: "通知中心", path: "/notifications", entryPath: "/notifications", surface: "user", layout: "userShell", legacyPaths: screenPaths("notifications.html") }),
  defineRoute({ id: "settings", title: "设置", path: "/settings", entryPath: "/settings", surface: "user", layout: "userShell", legacyPaths: screenPaths("settings.html") }),
  defineRoute({ id: "wallet", title: "时间币钱包", path: "/wallet", entryPath: "/wallet", surface: "user", layout: "userShell", legacyPaths: screenPaths("wallet.html") }),
  defineRoute({ id: "wallet-freeze", title: "冻结明细", path: "/wallet/freeze", entryPath: "/wallet/freeze", surface: "user", layout: "userShell", legacyPaths: screenPaths("wallet-freeze.html") }),
  defineRoute({ id: "orders", title: "我的订单", path: "/orders", entryPath: "/orders", surface: "user", layout: "userShell", legacyPaths: screenPaths("orders.html") }),
  defineRoute({ id: "order-detail", title: "订单详情", path: "/orders/:id", entryPath: "/orders/demo", surface: "user", layout: "userShell", legacyPaths: screenPaths("order-detail.html") }),
  defineRoute({ id: "review", title: "订单评价", path: "/reviews/new", entryPath: "/reviews/new", surface: "user", layout: "userShell", legacyPaths: screenPaths("review.html") }),
  defineRoute({ id: "dispute-create", title: "发起纠纷", path: "/disputes/new", entryPath: "/disputes/new", surface: "user", layout: "userShell", legacyPaths: screenPaths("dispute-create.html") }),
  defineRoute({ id: "dispute-detail", title: "纠纷详情", path: "/disputes/:id", entryPath: "/disputes/demo", surface: "user", layout: "userShell", legacyPaths: screenPaths("dispute-detail.html") }),
  defineRoute({ id: "jury-hall", title: "陪审大厅", path: "/jury", entryPath: "/jury", surface: "user", layout: "userShell", nav: "user", legacyPaths: ["/jury.html", "/screens/jury.html", "/jury-hall.html", "/screens/jury-hall.html"] }),
  defineRoute({ id: "jury-voting", title: "陪审投票", path: "/jury/voting", entryPath: "/jury/voting", surface: "user", layout: "userShell", legacyPaths: screenPaths("jury-voting.html") }),
  defineRoute({ id: "jury-dispute-voting", title: "陪审投票", path: "/jury/disputes/:id", entryPath: "/jury/disputes/demo", surface: "user", layout: "userShell" }),
  defineRoute({ id: "help", title: "帮助与规则", path: "/help", entryPath: "/help", surface: "public", layout: "userShell", legacyPaths: screenPaths("help.html") }),
  defineRoute({ id: "ai-assistant", title: "AI 助手", path: "/ai/assistant", entryPath: "/ai/assistant", surface: "user", layout: "userShell", legacyPaths: screenPaths("ai-assistant.html") }),
  defineRoute({ id: "ai-results", title: "AI 筛选结果", path: "/ai/results", entryPath: "/ai/results", surface: "user", layout: "userShell", legacyPaths: screenPaths("ai-results.html") }),
  defineRoute({ id: "admin-login", title: "管理员登录", path: "/admin/login", entryPath: "/admin/login", surface: "adminAuth", layout: "adminAuth", legacyPaths: screenPaths("admin-login.html") }),
  defineRoute({ id: "admin-dashboard", title: "管理仪表盘", path: "/admin/dashboard", entryPath: "/admin/dashboard", surface: "admin", layout: "adminShell", nav: "admin", legacyPaths: screenPaths("admin-dashboard.html") }),
  defineRoute({ id: "admin-users", title: "用户管理", path: "/admin/users", entryPath: "/admin/users", surface: "admin", layout: "adminShell", nav: "admin", legacyPaths: screenPaths("admin-users.html") }),
  defineRoute({ id: "admin-transactions", title: "交易流水", path: "/admin/transactions", entryPath: "/admin/transactions", surface: "admin", layout: "adminShell", nav: "admin", legacyPaths: screenPaths("admin-transactions.html") }),
  defineRoute({ id: "admin-disputes", title: "争议处理", path: "/admin/disputes", entryPath: "/admin/disputes", surface: "admin", layout: "adminShell", nav: "admin", legacyPaths: screenPaths("admin-disputes.html") }),
  defineRoute({ id: "admin-dispute-final", title: "纠纷终审", path: "/admin/disputes/final", entryPath: "/admin/disputes/final", surface: "admin", layout: "adminShell", legacyPaths: screenPaths("admin-dispute-final.html") }),
  defineRoute({ id: "admin-stats", title: "平台统计", path: "/admin/stats", entryPath: "/admin/stats", surface: "admin", layout: "adminShell", nav: "admin", legacyPaths: screenPaths("admin-stats.html") }),
  defineRoute({ id: "admin-ai-logs", title: "AI 日志", path: "/admin/ai/logs", entryPath: "/admin/ai/logs", surface: "admin", layout: "adminShell", nav: "admin", legacyPaths: screenPaths("admin-ai-logs.html") }),
  defineRoute({ id: "admin-ai-conversations", title: "AI 会话管理", path: "/admin/ai/conversations", entryPath: "/admin/ai/conversations", surface: "admin", layout: "adminShell", nav: "admin", legacyPaths: screenPaths("admin-ai-conversations.html") }),
  defineRoute({ id: "admin-ai-feedback", title: "AI 用户反馈", path: "/admin/ai/feedback", entryPath: "/admin/ai/feedback", surface: "admin", layout: "adminShell", nav: "admin", legacyPaths: screenPaths("admin-ai-feedback.html") }),
  defineRoute({ id: "admin-ai-errors", title: "AI 异常调用", path: "/admin/ai/errors", entryPath: "/admin/ai/errors", surface: "admin", layout: "adminShell", nav: "admin", legacyPaths: screenPaths("admin-ai-errors.html") }),
  defineRoute({ id: "admin-ai-config", title: "AI 配置管理", path: "/admin/ai/config", entryPath: "/admin/ai/config", surface: "admin", layout: "adminShell", nav: "admin", legacyPaths: screenPaths("admin-ai-config.html") }),
  defineRoute({ id: "admin-categories", title: "标签/类别管理", path: "/admin/categories", entryPath: "/admin/categories", surface: "admin", layout: "adminShell", nav: "admin", legacyPaths: screenPaths("admin-categories.html") }),
  defineRoute({ id: "admin-sensitive-words", title: "敏感词管理", path: "/admin/sensitive-words", entryPath: "/admin/sensitive-words", surface: "admin", layout: "adminShell", nav: "admin", legacyPaths: screenPaths("admin-sensitive-words.html") }),
  defineRoute({ id: "admin-risk-content", title: "内容风险审核", path: "/admin/risk-content", entryPath: "/admin/risk-content", surface: "admin", layout: "adminShell", nav: "admin", legacyPaths: screenPaths("admin-risk-content.html") }),
  defineRoute({ id: "admin-audit-log", title: "审计日志", path: "/admin/audit-log", entryPath: "/admin/audit-log", surface: "admin", layout: "adminShell", nav: "admin", legacyPaths: screenPaths("admin-audit-log.html") }),
  defineRoute({ id: "admin-system", title: "系统设置", path: "/admin/system", entryPath: "/admin/system", surface: "admin", layout: "adminShell", nav: "admin", legacyPaths: screenPaths("admin-system.html") })
];

export const userNav = [
  { id: "feed", label: "首页", path: "/feed" },
  { id: "tasks", label: "任务", path: "/tasks" },
  { id: "post", label: "发布", path: "/post" },
  { id: "messages", label: "消息", path: "/messages" },
  { id: "jury-hall", label: "纠纷", path: "/jury" },
  { id: "profile", label: "我的", path: "/profile" }
];

export const adminNav = [
  { id: "admin-dashboard", label: "仪表盘", path: "/admin/dashboard" },
  { id: "admin-users", label: "用户管理", path: "/admin/users" },
  { id: "admin-transactions", label: "交易流水", path: "/admin/transactions" },
  { id: "admin-disputes", label: "争议处理", path: "/admin/disputes" },
  { id: "admin-risk-content", label: "内容审核", path: "/admin/risk-content" },
  { id: "admin-ai-logs", label: "AI 日志", path: "/admin/ai/logs" },
  { id: "admin-ai-conversations", label: "AI 会话", path: "/admin/ai/conversations" },
  { id: "admin-ai-feedback", label: "AI 反馈", path: "/admin/ai/feedback" },
  { id: "admin-ai-errors", label: "AI 异常", path: "/admin/ai/errors" },
  { id: "admin-ai-config", label: "AI 配置", path: "/admin/ai/config" },
  { id: "admin-categories", label: "标签/类别", path: "/admin/categories" },
  { id: "admin-sensitive-words", label: "敏感词", path: "/admin/sensitive-words" },
  { id: "admin-stats", label: "平台统计", path: "/admin/stats" },
  { id: "admin-audit-log", label: "审计日志", path: "/admin/audit-log" },
  { id: "admin-system", label: "系统设置", path: "/admin/system" }
];

export const responsiveViewports = [
  { name: "mobile-standard", width: 390, height: 844 },
  { name: "tablet-portrait", width: 820, height: 1180 },
  { name: "desktop", width: 1440, height: 900 },
  { name: "wide-desktop", width: 1920, height: 1080 }
];

export const legacyRedirects = buildLegacyRedirects(appRoutes);

export function routeById(id) {
  return appRoutes.find((route) => route.id === id);
}

export function routePath(route) {
  return route?.entryPath ?? route?.path ?? "/";
}

export function titleForPath(pathname) {
  const normalized = normalizePathname(pathname);
  return matchRoute(normalized)?.title ?? "邻帮";
}

export function routePayload() {
  return appRoutes.map((route) => ({
    id: route.id,
    title: route.title,
    path: route.path,
    entryPath: route.entryPath,
    surface: route.surface,
    layout: route.layout,
    auth: route.auth,
    nav: route.nav
  }));
}

export function normalizePathname(pathname) {
  const clean = decodeURIComponent(pathname || "/").split("?")[0].split("#")[0];
  const withoutTrailingSlash = clean.length > 1 ? clean.replace(/\/+$/, "") : clean;
  return withoutTrailingSlash || "/";
}

export function resolveLegacyRedirect(pathname, searchParams = new URLSearchParams()) {
  const normalized = normalizePathname(pathname);
  const exact = legacyRedirects.get(normalized);
  if (exact) return exact;

  const communityPost = normalized.match(/^\/community-posts\/([^/]+)$/);
  if (communityPost) return `/posts/${encodeURIComponent(communityPost[1])}`;

  if (normalized === "/credit") return "/profile";

  if (normalized === "/jury/voting") {
    const disputeId = searchParams.get("disputeId") ?? searchParams.get("dispute") ?? searchParams.get("id");
    if (disputeId) return `/jury/disputes/${encodeURIComponent(disputeId)}`;
  }

  return null;
}

export function matchRoute(pathname) {
  const normalized = normalizePathname(pathname);
  return appRoutes.find((route) => pathMatches(route.path, normalized) || route.entryPath === normalized) ?? null;
}

function defineRoute(route) {
  return {
    ...route,
    auth: route.auth ?? authForSurface(route.surface),
    nav: route.nav ?? "hidden",
    legacyPaths: route.legacyPaths ?? []
  };
}

function authForSurface(surface) {
  if (surface === "user") return "user";
  if (surface === "admin") return "admin";
  return "none";
}

function screenPaths(file) {
  return [`/screens/${file}`, `/${file}`];
}

function buildLegacyRedirects(routes) {
  const redirects = new Map();
  for (const route of routes) {
    for (const legacyPath of route.legacyPaths ?? []) {
      if (!legacyPath.includes("?")) {
        redirects.set(normalizePathname(legacyPath), route.entryPath);
      }
    }
  }
  return redirects;
}

function pathMatches(pattern, pathname) {
  if (pattern === pathname) return true;
  const patternParts = normalizePathname(pattern).split("/");
  const pathParts = normalizePathname(pathname).split("/");
  if (patternParts.length !== pathParts.length) return false;
  return patternParts.every((part, index) => part.startsWith(":") || part === pathParts[index]);
}
