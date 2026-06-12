import { ACTIVE_STATUS, DISABLED_STATUS } from "../auth/store.mjs";
import { HttpError, methodNotAllowed, readJsonBody, sendJson } from "../http.mjs";

const ADMIN_USER_STATUS_RE = /^\/api\/admin\/users\/([^/]+)\/status$/;
const ADMIN_TRANSACTION_TYPES = new Set(["all", "income", "expense", "system_fee", "freeze", "release", "refund"]);
const USER_STATUSES = new Set(["all", "active", "disabled"]);
const REQUEST_BODY_MAX_BYTES = 64 * 1024;

export async function handleAdminRoutes({ request, response, url, authService }) {
  if (!url.pathname.startsWith("/api/admin/")) {
    return false;
  }
  if (url.pathname === "/api/admin/auth/login" || url.pathname === "/api/admin/auth/me") {
    return false;
  }

  if (url.pathname === "/api/admin/dashboard") {
    allowOnly(request, response, ["GET"]);
    const context = await requireAdmin(request, authService);
    sendJson(response, 200, await dashboardPayload(authService.store, context));
    return true;
  }

  if (url.pathname === "/api/admin/users") {
    allowOnly(request, response, ["GET"]);
    await requireAdmin(request, authService);
    sendJson(response, 200, await usersPayload(authService.store, url.searchParams));
    return true;
  }

  const userStatusMatch = url.pathname.match(ADMIN_USER_STATUS_RE);
  if (userStatusMatch) {
    allowOnly(request, response, ["PUT"]);
    const context = await requireAdmin(request, authService);
    const userId = parseUserId(userStatusMatch[1]);
    const body = await readJsonBody(request, { maxBytes: REQUEST_BODY_MAX_BYTES });
    const input = normalizeStatusInput(body);
    if (Number(context.user.userId) === userId) {
      throw new HttpError(409, "ADMIN_SELF_DISABLE_NOT_ALLOWED", "Administrators cannot change their own account status.");
    }
    if (typeof authService.store.updateUserStatus !== "function") {
      throw new HttpError(500, "ADMIN_USER_STORE_UNAVAILABLE", "User status update is not available.");
    }

    let result;
    try {
      result = await authService.store.updateUserStatus({
        userId,
        status: input.status,
        actorId: context.user.userId,
        actorRole: context.user.role,
        reason: input.reason,
        ipAddress: clientIp(request)
      });
    } catch (error) {
      if (error?.code === "USER_NOT_FOUND") {
        throw new HttpError(404, "USER_NOT_FOUND", "User was not found.");
      }
      throw error;
    }
    if (!result?.user) {
      throw new HttpError(404, "USER_NOT_FOUND", "User was not found.");
    }

    sendJson(response, 200, {
      user: adminUserDto(result.user, result.summary),
      auditLog: result.auditLog ? auditLogDto(result.auditLog) : null
    });
    return true;
  }

  if (url.pathname === "/api/admin/transactions") {
    allowOnly(request, response, ["GET"]);
    await requireAdmin(request, authService);
    sendJson(response, 200, await transactionsPayload(authService.store, url.searchParams));
    return true;
  }

  return false;
}

async function requireAdmin(request, authService) {
  const context = await authService.authenticateRequest(request);
  return authService.requireRole(context, ["admin", "super_admin"]);
}

async function dashboardPayload(store, context) {
  const summary = typeof store.adminDashboardMetrics === "function"
    ? await store.adminDashboardMetrics()
    : await fallbackDashboardMetrics(store);
  const auditLogs = typeof store.listAuditLogs === "function"
    ? await store.listAuditLogs({ page: 1, pageSize: 5 })
    : { auditLogs: [], total: 0 };
  return {
    metrics: dashboardMetricsDto(summary),
    recentAuditLogs: (auditLogs.auditLogs ?? []).map(auditLogDto),
    viewer: {
      userId: context.user.userId,
      username: context.user.username,
      displayName: context.user.displayName ?? context.user.username,
      role: context.user.role
    }
  };
}

async function usersPayload(store, searchParams) {
  if (typeof store.listAdminUsers !== "function") {
    throw new HttpError(500, "ADMIN_USER_STORE_UNAVAILABLE", "Admin user listing is not available.");
  }
  const query = normalizeUserQuery(searchParams);
  const result = await store.listAdminUsers(query);
  const users = Array.isArray(result?.users) ? result.users : [];
  const total = Number(result?.total ?? users.length);
  return {
    users: users.map((item) => adminUserDto(item.user ?? item, item.summary ?? item)),
    pagination: paginationDto(query.page, query.pageSize, total),
    filters: {
      status: query.status,
      minCredit: query.minCredit,
      maxCredit: query.maxCredit,
      keyword: query.keyword,
      page: query.page,
      pageSize: query.pageSize
    }
  };
}

async function transactionsPayload(store, searchParams) {
  if (typeof store.listAdminTransactions !== "function") {
    throw new HttpError(500, "ADMIN_TRANSACTION_STORE_UNAVAILABLE", "Admin transaction listing is not available.");
  }
  const query = normalizeTransactionQuery(searchParams);
  const result = await store.listAdminTransactions(query);
  const transactions = Array.isArray(result?.transactions) ? result.transactions : [];
  const total = Number(result?.total ?? transactions.length);
  return {
    transactions: transactions.map(adminTransactionDto),
    pagination: paginationDto(query.page, query.pageSize, total),
    summary: transactionSummaryDto(result?.summary, transactions, total),
    filters: {
      type: query.type,
      keyword: query.keyword,
      orderId: query.orderId,
      userId: query.userId,
      page: query.page,
      pageSize: query.pageSize
    }
  };
}

async function fallbackDashboardMetrics(store) {
  const users = typeof store.listAdminUsers === "function"
    ? await store.listAdminUsers({ page: 1, pageSize: 1000 })
    : { users: [] };
  const requests = typeof store.listServiceRequests === "function" ? await store.listServiceRequests() : [];
  const orders = typeof store.listServiceOrders === "function" ? await store.listServiceOrders() : [];
  const transactions = typeof store.listTransactionLogs === "function" ? await store.listTransactionLogs({ limit: 1000 }) : [];
  return {
    userCount: Number(users.total ?? users.users?.length ?? 0),
    activeUserCount: (users.users ?? []).filter((item) => Number((item.user ?? item).status) === ACTIVE_STATUS).length,
    disabledUserCount: (users.users ?? []).filter((item) => Number((item.user ?? item).status) === DISABLED_STATUS).length,
    openRequestCount: requests.filter((item) => item.status === "open").length,
    orderCount: orders.length,
    disputeCount: orders.filter((item) => item.status === "disputed").length,
    circulatingCoins: roundMoney(transactions.reduce((sum, item) => sum + Number(item.amount ?? 0), 0)),
    transactionCount: transactions.length
  };
}

function dashboardMetricsDto(metrics = {}) {
  return {
    userCount: Number(metrics.userCount ?? 0),
    activeUserCount: Number(metrics.activeUserCount ?? 0),
    disabledUserCount: Number(metrics.disabledUserCount ?? 0),
    openRequestCount: Number(metrics.openRequestCount ?? 0),
    orderCount: Number(metrics.orderCount ?? 0),
    disputeCount: Number(metrics.disputeCount ?? 0),
    circulatingCoins: roundMoney(metrics.circulatingCoins ?? 0),
    frozenCoins: roundMoney(metrics.frozenCoins ?? 0),
    transactionCount: Number(metrics.transactionCount ?? 0),
    pendingAuditCount: Number(metrics.pendingAuditCount ?? 0)
  };
}

function adminUserDto(user, summary = {}) {
  const credit = summary.credit ?? {};
  const wallet = summary.wallet ?? {};
  return {
    userId: user.userId,
    username: user.username,
    displayName: user.displayName ?? user.username,
    phone: maskPhone(user.phone),
    role: user.role,
    status: Number(user.status),
    statusText: Number(user.status) === ACTIVE_STATUS ? "active" : "disabled",
    skillTags: user.skillTags ?? [],
    isJury: Boolean(user.isJury),
    wallet: wallet.walletId ? {
      walletId: wallet.walletId,
      balance: roundMoney(wallet.balance ?? 0),
      frozenBalance: roundMoney(wallet.frozenBalance ?? 0)
    } : null,
    credit: {
      averageRating: round1(credit.averageRating ?? 0),
      reviewCount: Number(credit.reviewCount ?? 0),
      positiveRate: Number(credit.positiveRate ?? 0)
    },
    orderCount: Number(summary.orderCount ?? 0),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt ?? null
  };
}

function adminTransactionDto(item) {
  const businessType = item.businessType ?? (item.disputeId ? "dispute" : item.orderId ? "order" : "system");
  const businessId = item.businessId ?? item.disputeId ?? item.orderId ?? null;
  return {
    logId: item.logId,
    userId: item.userId,
    orderId: item.orderId,
    requestId: item.requestId ?? null,
    disputeId: item.disputeId ?? null,
    type: item.type,
    amount: roundMoney(item.amount ?? 0),
    balanceAfter: item.balanceAfter === null || item.balanceAfter === undefined ? null : roundMoney(item.balanceAfter),
    remark: item.remark ?? null,
    relatedTitle: item.relatedTitle ?? null,
    businessType,
    businessId,
    href: businessHref(businessType, businessId),
    createdAt: item.createdAt,
    user: item.user ? adminTransactionUserDto(item.user) : null,
    order: item.order ? adminTransactionOrderDto(item.order) : null,
    risk: transactionRisk(item),
    status: transactionStatus(item)
  };
}

function adminTransactionUserDto(user) {
  return {
    userId: user.userId,
    username: user.username,
    displayName: user.displayName ?? user.username,
    phone: maskPhone(user.phone),
    status: Number(user.status)
  };
}

function adminTransactionOrderDto(order) {
  return {
    orderId: order.orderId,
    requestId: order.requestId,
    status: order.status,
    coinAmount: roundMoney(order.coinAmount ?? 0),
    publisher: order.publisher ? {
      userId: order.publisher.userId,
      username: order.publisher.username,
      displayName: order.publisher.displayName ?? order.publisher.username
    } : null,
    provider: order.provider ? {
      userId: order.provider.userId,
      username: order.provider.username,
      displayName: order.provider.displayName ?? order.provider.username
    } : null
  };
}

function auditLogDto(item) {
  return {
    auditId: item.auditId,
    actorId: item.actorId ?? null,
    actorRole: item.actorRole,
    action: item.action,
    targetType: item.targetType,
    targetId: item.targetId ?? null,
    ipAddress: item.ipAddress ?? null,
    detail: item.detail ?? null,
    createdAt: item.createdAt
  };
}

function transactionSummaryDto(summary, transactions, total) {
  if (summary) {
    return {
      transactionCount: Number(summary.transactionCount ?? total ?? 0),
      circulatingCoins: roundMoney(summary.circulatingCoins ?? 0),
      frozenCoins: roundMoney(summary.frozenCoins ?? 0),
      reviewCount: Number(summary.reviewCount ?? 0)
    };
  }
  return {
    transactionCount: Number(total ?? transactions.length),
    circulatingCoins: roundMoney(transactions.reduce((sum, item) => sum + Number(item.amount ?? 0), 0)),
    frozenCoins: roundMoney(transactions.filter((item) => item.type === "freeze").reduce((sum, item) => sum + Number(item.amount ?? 0), 0)),
    reviewCount: transactions.filter((item) => transactionRisk(item) !== "low").length
  };
}

function normalizeUserQuery(searchParams) {
  const status = optionalLower(searchParams.get("status") ?? "all", 20) ?? "all";
  if (!USER_STATUSES.has(status)) {
    throw new HttpError(400, "INVALID_USER_STATUS", "Unsupported user status filter.");
  }
  return {
    status,
    minCredit: parseCredit(searchParams.get("minCredit"), "INVALID_MIN_CREDIT"),
    maxCredit: parseCredit(searchParams.get("maxCredit"), "INVALID_MAX_CREDIT"),
    keyword: optionalLower(searchParams.get("keyword") ?? searchParams.get("q"), 100),
    page: parsePositiveInt(searchParams.get("page") ?? "1", "INVALID_PAGE", 1, 1000),
    pageSize: parsePositiveInt(searchParams.get("pageSize") ?? searchParams.get("limit") ?? "10", "INVALID_PAGE_SIZE", 1, 50)
  };
}

function normalizeTransactionQuery(searchParams) {
  const type = optionalLower(searchParams.get("type") ?? "all", 30) ?? "all";
  if (!ADMIN_TRANSACTION_TYPES.has(type)) {
    throw new HttpError(400, "INVALID_TRANSACTION_TYPE", "Unsupported transaction type filter.");
  }
  return {
    type,
    keyword: optionalLower(searchParams.get("keyword") ?? searchParams.get("q"), 100),
    orderId: parseOptionalPositiveInt(searchParams.get("orderId") ?? searchParams.get("order_id"), "INVALID_ORDER_ID"),
    userId: parseOptionalPositiveInt(searchParams.get("userId") ?? searchParams.get("user_id"), "INVALID_USER_ID"),
    page: parsePositiveInt(searchParams.get("page") ?? "1", "INVALID_PAGE", 1, 1000),
    pageSize: parsePositiveInt(searchParams.get("pageSize") ?? searchParams.get("limit") ?? "20", "INVALID_PAGE_SIZE", 1, 100)
  };
}

function normalizeStatusInput(input) {
  const rawStatus = input?.status;
  const normalized = typeof rawStatus === "string" ? rawStatus.trim().toLowerCase() : rawStatus;
  let status;
  if (normalized === "active" || normalized === 1 || normalized === "1") {
    status = ACTIVE_STATUS;
  } else if (normalized === "disabled" || normalized === 0 || normalized === "0") {
    status = DISABLED_STATUS;
  } else {
    throw new HttpError(400, "INVALID_USER_STATUS", "Status must be active or disabled.");
  }
  return {
    status,
    reason: optionalText(input?.reason, 200) ?? (status === ACTIVE_STATUS ? "管理员启用账号" : "管理员禁用账号")
  };
}

function parseUserId(raw) {
  if (!/^\d+$/.test(String(raw))) {
    throw new HttpError(404, "USER_NOT_FOUND", "User was not found.");
  }
  return Number(raw);
}

function parseOptionalPositiveInt(raw, code) {
  if (raw === undefined || raw === null || raw === "") {
    return null;
  }
  return parsePositiveInt(raw, code, 1, Number.MAX_SAFE_INTEGER);
}

function parsePositiveInt(raw, code, min = 1, max = Number.MAX_SAFE_INTEGER) {
  if (!/^\d+$/.test(String(raw ?? ""))) {
    throw new HttpError(400, code, "Expected a positive integer.");
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new HttpError(400, code, "Expected a positive integer in the supported range.");
  }
  return value;
}

function parseCredit(raw, code) {
  if (raw === undefined || raw === null || raw === "") {
    return null;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 5) {
    throw new HttpError(400, code, "Credit filter must be between 0 and 5.");
  }
  return value;
}

function optionalText(value, maxLength) {
  if (value === undefined || value === null) {
    return null;
  }
  const text = String(value).trim();
  if (text.length > maxLength) {
    throw new HttpError(400, "INVALID_FIELD", "One or more fields are too long.");
  }
  return text || null;
}

function optionalLower(value, maxLength) {
  return optionalText(value, maxLength)?.toLowerCase() ?? null;
}

function paginationDto(page, pageSize, total) {
  const totalPages = Math.ceil(total / pageSize);
  return {
    page,
    pageSize,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1 && totalPages > 0
  };
}

function transactionStatus(item) {
  if (item.type === "freeze") {
    return item.disputeId ? "review" : "pending";
  }
  return "settled";
}

function transactionRisk(item) {
  if (item.disputeId || item.type === "refund") {
    return "mid";
  }
  if (item.type === "freeze" && Number(item.amount ?? 0) >= 40) {
    return "mid";
  }
  return "low";
}

function businessHref(type, id) {
  if (!id) {
    return null;
  }
  if (type === "dispute") {
    return `/disputes/${encodeURIComponent(id)}`;
  }
  if (type === "order") {
    return `/orders/${encodeURIComponent(id)}`;
  }
  return null;
}

function clientIp(request) {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return request.socket?.remoteAddress ?? null;
}

function maskPhone(phone) {
  return phone ? String(phone).replace(/^(\d{3})\d{4}(\d{4})$/, "$1****$2") : null;
}

function round1(value) {
  return Math.round(Number(value) * 10) / 10;
}

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

function allowOnly(request, response, methods) {
  if (!methods.includes(request.method)) {
    methodNotAllowed(response, methods);
    throw new HttpError(0, "HANDLED", "Response was already handled.");
  }
}
