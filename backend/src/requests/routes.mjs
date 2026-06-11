import { ACTIVE_STATUS } from "../auth/store.mjs";
import { HttpError, methodNotAllowed, sendJson } from "../http.mjs";

const REQUEST_DETAIL_RE = /^\/api\/requests\/([^/]+)$/;
const PUBLIC_REQUEST_STATUSES = new Set(["open", "accepted", "completed"]);
const STATUS_FILTERS = new Set(["open", "accepted", "completed", "cancelled", "all"]);
const SORTS = new Set(["latest", "oldest", "coin_desc", "coin_asc", "credit_desc", "credit_asc", "hours_desc", "hours_asc"]);

export async function handleRequestRoutes({ request, response, url, authService }) {
  if (url.pathname === "/api/categories") {
    allowOnly(request, response, ["GET"]);
    const categories = await safeStoreCall(authService.store, "listCategories", []);
    sendJson(response, 200, {
      categories: categories.map(categoryDto)
    });
    return true;
  }

  if (url.pathname === "/api/tags") {
    allowOnly(request, response, ["GET"]);
    const tags = await safeStoreCall(authService.store, "listTags", []);
    sendJson(response, 200, {
      tags: tags.map(tagDto)
    });
    return true;
  }

  if (url.pathname === "/api/requests") {
    allowOnly(request, response, ["GET"]);
    sendJson(response, 200, await requestListPayload(authService.store, url.searchParams));
    return true;
  }

  const detailMatch = url.pathname.match(REQUEST_DETAIL_RE);
  if (detailMatch) {
    allowOnly(request, response, ["GET"]);
    sendJson(response, 200, await requestDetailPayload(authService.store, detailMatch[1]));
    return true;
  }

  return false;
}

async function requestListPayload(store, searchParams) {
  const query = normalizeRequestQuery(searchParams);
  const categories = await safeStoreCall(store, "listCategories", []);
  const categoryMap = new Map(categories.map((category) => [category.categoryId, category]));
  const requests = await safeStoreCall(store, "listServiceRequests", []);
  const enriched = [];

  for (const request of requests) {
    const item = await enrichRequest(store, request, categoryMap);
    if (item && matchesRequestQuery(item, query)) {
      enriched.push(item);
    }
  }

  enriched.sort((left, right) => compareRequests(left, right, query.sort));
  const total = enriched.length;
  const offset = (query.page - 1) * query.pageSize;
  const pageItems = enriched.slice(offset, offset + query.pageSize);

  return {
    requests: pageItems.map(requestSummaryDto),
    pagination: paginationDto(query.page, query.pageSize, total),
    filters: filterDto(query),
    structuredFilters: structuredFilterDto(query)
  };
}

async function requestDetailPayload(store, rawRequestId) {
  const requestId = parseRequestId(rawRequestId);
  const categories = await safeStoreCall(store, "listCategories", []);
  const categoryMap = new Map(categories.map((category) => [category.categoryId, category]));
  const request = typeof store.findServiceRequestById === "function"
    ? await store.findServiceRequestById(requestId)
    : (await safeStoreCall(store, "listServiceRequests", [])).find((item) => item.requestId === requestId);
  const item = request ? await enrichRequest(store, request, categoryMap) : null;

  if (!item) {
    throw new HttpError(404, "REQUEST_NOT_FOUND", "Service request was not found.");
  }

  return {
    request: requestDetailDto(item)
  };
}

async function enrichRequest(store, request, categoryMap) {
  const status = String(request.status ?? "");
  if (request.visible === false || !PUBLIC_REQUEST_STATUSES.has(status)) {
    return null;
  }

  const publisher = await store.findUserById(request.publisherId);
  if (!publisher || publisher.status !== ACTIVE_STATUS) {
    return null;
  }

  const category = request.category ?? categoryMap.get(request.categoryId) ?? null;
  const credit = await creditSummary(store, publisher.userId);
  return {
    ...request,
    category,
    publisher,
    credit
  };
}

function matchesRequestQuery(item, query) {
  if (query.status !== "all" && item.status !== query.status) {
    return false;
  }
  if (query.categoryId !== null && item.categoryId !== query.categoryId) {
    return false;
  }
  if (query.categoryText && !matchesCategory(item.category, query.categoryText)) {
    return false;
  }
  if (query.tags.length > 0 && !matchesTags(item, query.tags)) {
    return false;
  }
  if (query.keyword && !matchesKeyword(item, query.keyword)) {
    return false;
  }
  if (query.createdFrom !== null && createdTime(item) < query.createdFrom) {
    return false;
  }
  if (query.createdTo !== null && createdTime(item) > query.createdTo) {
    return false;
  }
  if (query.minCredit !== null && item.credit.averageRating < query.minCredit) {
    return false;
  }
  if (query.maxCredit !== null && item.credit.averageRating > query.maxCredit) {
    return false;
  }
  return true;
}

function matchesCategory(category, rawCategory) {
  if (!category) {
    return false;
  }
  const expected = rawCategory.toLowerCase();
  return [category.code, category.name, String(category.categoryId)]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase())
    .includes(expected);
}

function matchesTags(item, tags) {
  const values = [
    ...(item.tags ?? []),
    ...(item.publisher.skillTags ?? []),
    ...(item.publisher.serviceCategories ?? []),
    item.category?.name,
    item.category?.code
  ].filter(Boolean).map((value) => String(value).toLowerCase());

  return tags.every((tag) => values.some((value) => value.includes(tag)));
}

function matchesKeyword(item, keyword) {
  const haystack = [
    item.title,
    item.description,
    item.location,
    item.category?.name,
    item.category?.code,
    ...(item.tags ?? [])
  ].filter(Boolean).join(" ").toLowerCase();
  return haystack.includes(keyword);
}

async function creditSummary(store, userId) {
  const reviews = typeof store.listReviewsForTargetId === "function"
    ? await store.listReviewsForTargetId(userId)
    : [];
  let sum = 0;
  let positiveCount = 0;

  for (const review of reviews) {
    const rating = Math.min(5, Math.max(1, Number(review.rating) || 1));
    sum += rating;
    if (rating >= 4) {
      positiveCount += 1;
    }
  }

  const reviewCount = reviews.length;
  const averageRating = reviewCount > 0 ? round1(sum / reviewCount) : 0;
  return {
    averageRating,
    reviewCount,
    positiveRate: reviewCount > 0 ? Math.round((positiveCount / reviewCount) * 100) : 0,
    level: creditLevel(averageRating, reviewCount)
  };
}

function requestSummaryDto(item) {
  return {
    requestId: item.requestId,
    title: item.title,
    descriptionSummary: summarize(item.description),
    estimatedHours: item.estimatedHours,
    coinAmount: item.coinAmount,
    status: item.status,
    location: item.location,
    category: categoryDto(item.category),
    tags: item.tags ?? [],
    publisher: publicPublisherDto(item.publisher),
    creditSummary: item.credit,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

function requestDetailDto(item) {
  return {
    ...requestSummaryDto(item),
    description: item.description,
    publisher: {
      ...publicPublisherDto(item.publisher),
      credit: item.credit
    }
  };
}

function categoryDto(category) {
  if (!category) {
    return null;
  }
  return {
    categoryId: category.categoryId,
    parentId: category.parentId ?? null,
    name: category.name,
    code: category.code,
    description: category.description ?? null,
    sortOrder: category.sortOrder ?? 0,
    status: category.status,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt
  };
}

function tagDto(tag) {
  return {
    name: tag.name,
    userCount: Number(tag.userCount ?? 0),
    requestCount: Number(tag.requestCount ?? 0)
  };
}

function publicPublisherDto(user) {
  return {
    userId: user.userId,
    username: user.username,
    displayName: user.displayName ?? user.username,
    bio: user.bio ?? null,
    skillTags: user.skillTags ?? [],
    serviceCategories: user.serviceCategories ?? [],
    createdAt: user.createdAt
  };
}

function normalizeRequestQuery(searchParams) {
  const status = optionalLower(searchParams.get("status")) ?? "open";
  if (!STATUS_FILTERS.has(status)) {
    throw new HttpError(400, "INVALID_REQUEST_STATUS", "Unsupported request status filter.");
  }

  const sort = optionalLower(searchParams.get("sort")) ?? "latest";
  if (!SORTS.has(sort)) {
    throw new HttpError(400, "INVALID_REQUEST_SORT", "Unsupported request sort value.");
  }

  const categoryRaw = optionalText(searchParams.get("category") ?? searchParams.get("categoryCode"), 50);
  const categoryIdRaw = optionalText(searchParams.get("categoryId"), 20) ?? (/^\d+$/.test(categoryRaw ?? "") ? categoryRaw : null);

  return {
    keyword: optionalLower(searchParams.get("keyword") ?? searchParams.get("q"), 100),
    categoryText: categoryRaw && !/^\d+$/.test(categoryRaw) ? categoryRaw.toLowerCase() : null,
    categoryId: categoryIdRaw ? parsePositiveInt(categoryIdRaw, "INVALID_CATEGORY_ID") : null,
    tags: normalizeTags(searchParams),
    status,
    createdFrom: parseDateFilter(searchParams.get("createdFrom") ?? searchParams.get("publishedFrom"), "INVALID_CREATED_FROM"),
    createdTo: parseDateFilter(searchParams.get("createdTo") ?? searchParams.get("publishedTo"), "INVALID_CREATED_TO", true),
    minCredit: parseCredit(searchParams.get("minCredit"), "INVALID_MIN_CREDIT"),
    maxCredit: parseCredit(searchParams.get("maxCredit"), "INVALID_MAX_CREDIT"),
    page: parsePositiveInt(searchParams.get("page") ?? "1", "INVALID_PAGE", 1, 1000),
    pageSize: parsePositiveInt(searchParams.get("pageSize") ?? searchParams.get("limit") ?? "10", "INVALID_PAGE_SIZE", 1, 50),
    sort
  };
}

function filterDto(query) {
  return {
    keyword: query.keyword,
    categoryId: query.categoryId,
    category: query.categoryText,
    tags: query.tags,
    status: query.status,
    createdFrom: query.createdFrom === null ? null : new Date(query.createdFrom).toISOString(),
    createdTo: query.createdTo === null ? null : new Date(query.createdTo).toISOString(),
    minCredit: query.minCredit,
    maxCredit: query.maxCredit,
    page: query.page,
    pageSize: query.pageSize,
    sort: query.sort
  };
}

function structuredFilterDto(query) {
  return {
    source: "query",
    ai: {
      applied: false,
      reservedForStage: "ai_request_filter"
    },
    criteria: {
      keyword: query.keyword,
      categoryId: query.categoryId,
      category: query.categoryText,
      tags: query.tags,
      status: query.status,
      createdAt: {
        from: query.createdFrom === null ? null : new Date(query.createdFrom).toISOString(),
        to: query.createdTo === null ? null : new Date(query.createdTo).toISOString()
      },
      publisherCredit: {
        min: query.minCredit,
        max: query.maxCredit
      }
    }
  };
}

function compareRequests(left, right, sort) {
  if (sort === "oldest") {
    return createdTime(left) - createdTime(right) || left.requestId - right.requestId;
  }
  if (sort === "coin_desc") {
    return right.coinAmount - left.coinAmount || createdTime(right) - createdTime(left);
  }
  if (sort === "coin_asc") {
    return left.coinAmount - right.coinAmount || createdTime(right) - createdTime(left);
  }
  if (sort === "credit_desc") {
    return right.credit.averageRating - left.credit.averageRating || createdTime(right) - createdTime(left);
  }
  if (sort === "credit_asc") {
    return left.credit.averageRating - right.credit.averageRating || createdTime(right) - createdTime(left);
  }
  if (sort === "hours_desc") {
    return right.estimatedHours - left.estimatedHours || createdTime(right) - createdTime(left);
  }
  if (sort === "hours_asc") {
    return left.estimatedHours - right.estimatedHours || createdTime(right) - createdTime(left);
  }
  return createdTime(right) - createdTime(left) || right.requestId - left.requestId;
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

function normalizeTags(searchParams) {
  return [
    ...searchParams.getAll("tag"),
    ...searchParams.getAll("tags")
  ]
    .flatMap((value) => String(value ?? "").split(","))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 20);
}

function optionalText(value, maxLength = 100) {
  if (value === undefined || value === null) {
    return null;
  }
  const text = String(value).trim();
  if (text.length > maxLength) {
    throw new HttpError(400, "INVALID_QUERY", "One or more query filters are too long.");
  }
  return text || null;
}

function optionalLower(value, maxLength = 50) {
  return optionalText(value, maxLength)?.toLowerCase() ?? null;
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

function parseDateFilter(raw, code, endOfDay = false) {
  const text = optionalText(raw, 40);
  if (!text) {
    return null;
  }
  const normalized = endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T23:59:59.999Z` : text;
  const time = new Date(normalized).getTime();
  if (!Number.isFinite(time)) {
    throw new HttpError(400, code, "Date filter must be a valid date or ISO timestamp.");
  }
  return time;
}

function parseRequestId(raw) {
  if (!/^\d+$/.test(String(raw))) {
    throw new HttpError(404, "REQUEST_NOT_FOUND", "Service request was not found.");
  }
  return Number(raw);
}

function createdTime(item) {
  const time = new Date(item.createdAt).getTime();
  return Number.isFinite(time) ? time : 0;
}

function summarize(value) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > 80 ? `${text.slice(0, 80)}...` : text;
}

function creditLevel(averageRating, reviewCount) {
  if (reviewCount === 0) {
    return "暂无评价";
  }
  if (averageRating >= 4.8) {
    return "金牌服务者";
  }
  if (averageRating >= 4.5) {
    return "信誉优秀";
  }
  if (averageRating >= 4) {
    return "信誉良好";
  }
  return "持续观察";
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

async function safeStoreCall(store, method, fallback) {
  return typeof store[method] === "function" ? await store[method]() : fallback;
}

function allowOnly(request, response, methods) {
  if (!methods.includes(request.method)) {
    methodNotAllowed(response, methods);
    throw new HttpError(0, "HANDLED", "Response was already handled.");
  }
}
