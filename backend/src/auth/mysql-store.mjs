import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { ACTIVE_STATUS, INITIAL_TIME_COIN_BALANCE, normalizeUsername } from "./store.mjs";

export function createMysqlAuthStore(options = {}) {
  const config = {
    mysqlBin: options.mysqlBin ?? process.env.MYSQL_BIN ?? "mysql",
    host: options.host ?? process.env.DB_HOST ?? "127.0.0.1",
    port: options.port ?? process.env.DB_PORT ?? "3306",
    user: options.user ?? process.env.DB_USER ?? "root",
    password: options.password ?? process.env.DB_PASSWORD ?? process.env.MYSQL_PWD ?? "",
    database: options.database ?? process.env.DB_NAME ?? "community_mis"
  };
  const sessions = new Map();
  const profileExtras = new Map();
  const settings = new Map();
  const requestExtras = new Map();
  const reviewExtras = new Map();

  return {
    createUserWithWallet,
    findUserByUsername,
    findUserById,
    findWalletByUserId,
    updateUserProfile,
    findSettingsByUserId,
    updateSettingsByUserId,
    listCategories,
    listTags,
    listServiceRequests,
    findServiceRequestById,
    createServiceRequest,
    acceptServiceRequest,
    listServiceOrders,
    findServiceOrderById,
    confirmServiceOrder,
    listTransactionLogs,
    getWalletSummary,
    listWalletTransactions,
    listWalletFreezes,
    createWalletFreeze,
    listNotificationsForUserId,
    markNotificationRead,
    markAllNotificationsRead,
    listMessagesForUserId,
    createReview,
    listReviewsForOrderId,
    listReviewsForTargetId,
    createSession,
    findSession,
    revokeSession
  };

  async function createUserWithWallet(input) {
    const username = input.username.trim();
    const skillTagsJson = JSON.stringify(Array.isArray(input.skillTags) ? input.skillTags : []);
    const initialBalance = Number(input.initialBalance ?? INITIAL_TIME_COIN_BALANCE).toFixed(2);
    const sql = `
START TRANSACTION;
INSERT INTO \`user\` (\`username\`, \`password_hash\`, \`phone\`, \`skill_tags\`, \`role\`, \`status\`)
VALUES (${sqlString(username)}, ${sqlString(input.passwordHash)}, ${sqlNullableString(input.phone)}, ${sqlString(skillTagsJson)}, ${sqlString(input.role ?? "user")}, ${Number(input.status ?? ACTIVE_STATUS)});
SET @created_user_id = LAST_INSERT_ID();
INSERT INTO \`wallet\` (\`user_id\`, \`balance\`, \`frozen_balance\`, \`version\`)
VALUES (@created_user_id, ${initialBalance}, 0.00, 0);
COMMIT;
SELECT JSON_OBJECT(
  'user', ${userJsonObjectSql("u")},
  'wallet', ${walletJsonObjectSql("w")}
)
FROM \`user\` u
JOIN \`wallet\` w ON w.\`user_id\` = u.\`user_id\`
WHERE u.\`user_id\` = @created_user_id;
`;
    const result = await mysqlJson(sql);
    const user = normalizeUser(result.user);
    if (user) {
      profileExtras.set(user.userId, normalizeProfileExtra(input, user));
      settings.set(user.userId, normalizeSettings(input.settings));
    }
    return {
      user: withProfileExtras(user),
      wallet: normalizeWallet(result.wallet)
    };
  }

  async function findUserByUsername(username) {
    const normalized = normalizeUsername(username);
    if (!normalized) {
      return null;
    }
    const sql = `
SELECT ${userJsonObjectSql("u")}
FROM \`user\` u
WHERE LOWER(u.\`username\`) = ${sqlString(normalized)}
LIMIT 1;
`;
    return withProfileExtras(normalizeUser(await mysqlJson(sql, { optional: true })));
  }

  async function findUserById(userId) {
    const sql = `
SELECT ${userJsonObjectSql("u")}
FROM \`user\` u
WHERE u.\`user_id\` = ${Number(userId)}
LIMIT 1;
`;
    return withProfileExtras(normalizeUser(await mysqlJson(sql, { optional: true })));
  }

  async function findWalletByUserId(userId) {
    const sql = `
SELECT ${walletJsonObjectSql("w")}
FROM \`wallet\` w
WHERE w.\`user_id\` = ${Number(userId)}
LIMIT 1;
`;
    return normalizeWallet(await mysqlJson(sql, { optional: true }));
  }

  async function updateUserProfile(userId, input) {
    const id = Number(userId);
    const existing = await findUserById(id);
    if (!existing) {
      return null;
    }

    const assignments = [];
    if (hasOwn(input, "phone")) {
      assignments.push(`\`phone\` = ${sqlNullableString(input.phone)}`);
    }
    if (hasOwn(input, "skillTags")) {
      assignments.push(`\`skill_tags\` = ${sqlString(JSON.stringify(Array.isArray(input.skillTags) ? input.skillTags : []))}`);
    }

    if (assignments.length > 0) {
      const result = await runMysql(`
UPDATE \`user\`
SET ${assignments.join(", ")}
WHERE \`user_id\` = ${id}
LIMIT 1;
`);
      if (result.code !== 0) {
        throw new Error(`mysql exited with code ${result.code}: ${result.stderr.trim()}`);
      }
    }

    profileExtras.set(id, {
      ...normalizeProfileExtra(existing, existing),
      ...profileExtras.get(id),
      ...normalizeProfileExtra(input, existing)
    });
    return findUserById(id);
  }

  function findSettingsByUserId(userId) {
    return clone(settings.get(Number(userId)) ?? normalizeSettings());
  }

  function updateSettingsByUserId(userId, input) {
    const id = Number(userId);
    const next = mergeSettings(settings.get(id) ?? normalizeSettings(), input);
    settings.set(id, next);
    return clone(next);
  }

  async function listCategories() {
    const sql = `
SELECT COALESCE(JSON_ARRAYAGG(JSON_OBJECT(
  'categoryId', q.\`category_id\`,
  'parentId', q.\`parent_id\`,
  'name', q.\`name\`,
  'code', q.\`code\`,
  'description', q.\`description\`,
  'sortOrder', q.\`sort_order\`,
  'status', q.\`status\`,
  'createdAt', q.\`created_at\`,
  'updatedAt', q.\`updated_at\`
)), JSON_ARRAY())
FROM (
  SELECT
    c.\`category_id\`,
    c.\`parent_id\`,
    c.\`name\`,
    c.\`code\`,
    c.\`description\`,
    c.\`sort_order\`,
    c.\`status\`,
    DATE_FORMAT(c.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS \`created_at\`,
    DATE_FORMAT(c.\`updated_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS \`updated_at\`
  FROM \`category\` c
  WHERE c.\`status\` = 1
  ORDER BY c.\`sort_order\` ASC, c.\`category_id\` ASC
) q;
`;
    const rows = await mysqlJson(sql, { optional: true });
    return Array.isArray(rows)
      ? rows.map(normalizeCategory).filter(Boolean).sort((left, right) => left.sortOrder - right.sortOrder || left.categoryId - right.categoryId)
      : [];
  }

  async function listTags() {
    const sql = `
SELECT COALESCE(JSON_ARRAYAGG(JSON_OBJECT(
  'skillTags', q.\`skill_tags\`
)), JSON_ARRAY())
FROM (
  SELECT u.\`skill_tags\`
  FROM \`user\` u
  WHERE u.\`status\` = 1
    AND u.\`role\` = 'user'
    AND u.\`skill_tags\` IS NOT NULL
  ORDER BY u.\`user_id\` ASC
) q;
`;
    const rows = await mysqlJson(sql, { optional: true });
    const tagMap = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
      for (const tag of parseSkillTags(row.skillTags)) {
        addTagCount(tagMap, tag, "userCount");
      }
    }
    return Array.from(tagMap.values())
      .sort((left, right) => right.userCount - left.userCount || left.name.localeCompare(right.name))
      .map(clone);
  }

  async function listServiceRequests() {
    const sql = `
SELECT COALESCE(JSON_ARRAYAGG(JSON_OBJECT(
  'requestId', q.\`request_id\`,
  'publisherId', q.\`publisher_id\`,
  'categoryId', q.\`category_id\`,
  'title', q.\`title\`,
  'description', q.\`description\`,
  'location', q.\`location\`,
  'estimatedHours', q.\`estimated_hours\`,
  'coinAmount', q.\`coin_amount\`,
  'status', q.\`status\`,
  'tags', JSON_ARRAY(),
  'visible', q.\`publisher_status\` = 1,
  'createdAt', q.\`created_at\`,
  'updatedAt', q.\`updated_at\`,
  'category', IF(q.\`category_id\` IS NULL, NULL, JSON_OBJECT(
    'categoryId', q.\`category_id\`,
    'parentId', q.\`category_parent_id\`,
    'name', q.\`category_name\`,
    'code', q.\`category_code\`,
    'description', q.\`category_description\`,
    'sortOrder', q.\`category_sort_order\`,
    'status', q.\`category_status\`,
    'createdAt', q.\`category_created_at\`,
    'updatedAt', q.\`category_updated_at\`
  ))
)), JSON_ARRAY())
FROM (
  SELECT
    sr.\`request_id\`,
    sr.\`publisher_id\`,
    sr.\`category_id\`,
    sr.\`title\`,
    sr.\`description\`,
    sr.\`location\`,
    CAST(sr.\`estimated_hours\` AS DOUBLE) AS \`estimated_hours\`,
    CAST(sr.\`coin_amount\` AS DOUBLE) AS \`coin_amount\`,
    sr.\`status\`,
    p.\`status\` AS \`publisher_status\`,
    DATE_FORMAT(sr.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS \`created_at\`,
    DATE_FORMAT(sr.\`updated_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS \`updated_at\`,
    c.\`parent_id\` AS \`category_parent_id\`,
    c.\`name\` AS \`category_name\`,
    c.\`code\` AS \`category_code\`,
    c.\`description\` AS \`category_description\`,
    c.\`sort_order\` AS \`category_sort_order\`,
    c.\`status\` AS \`category_status\`,
    DATE_FORMAT(c.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS \`category_created_at\`,
    DATE_FORMAT(c.\`updated_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS \`category_updated_at\`
  FROM \`service_request\` sr
  JOIN \`user\` p ON p.\`user_id\` = sr.\`publisher_id\`
  LEFT JOIN \`category\` c ON c.\`category_id\` = sr.\`category_id\`
  ORDER BY sr.\`created_at\` DESC, sr.\`request_id\` DESC
) q;
`;
    const rows = await mysqlJson(sql, { optional: true });
    return Array.isArray(rows) ? rows.map(normalizeServiceRequest).map(withRequestExtras) : [];
  }

  async function findServiceRequestById(requestId) {
    const id = Number(requestId);
    if (!Number.isInteger(id) || id <= 0) {
      return null;
    }
    const requests = await listServiceRequests();
    return requests.find((request) => request.requestId === id) ?? null;
  }

  async function createServiceRequest(input) {
    const tags = Array.isArray(input.tags) ? input.tags.map((item) => String(item).trim()).filter(Boolean).slice(0, 8) : [];
    const sql = `
INSERT INTO \`service_request\` (
  \`publisher_id\`,
  \`category_id\`,
  \`title\`,
  \`description\`,
  \`location\`,
  \`estimated_hours\`,
  \`coin_amount\`,
  \`status\`
)
VALUES (
  ${Number(input.publisherId)},
  ${Number(input.categoryId)},
  ${sqlString(input.title)},
  ${sqlString(input.description)},
  ${sqlNullableString(input.location)},
  ${Number(input.estimatedHours).toFixed(1)},
  ${Number(input.coinAmount).toFixed(2)},
  'open'
);
SET @created_request_id = LAST_INSERT_ID();
SELECT JSON_OBJECT(
  'requestId', sr.\`request_id\`,
  'publisherId', sr.\`publisher_id\`,
  'categoryId', sr.\`category_id\`,
  'title', sr.\`title\`,
  'description', sr.\`description\`,
  'location', sr.\`location\`,
  'estimatedHours', CAST(sr.\`estimated_hours\` AS DOUBLE),
  'coinAmount', CAST(sr.\`coin_amount\` AS DOUBLE),
  'status', sr.\`status\`,
  'tags', JSON_ARRAY(),
  'visible', p.\`status\` = 1,
  'createdAt', DATE_FORMAT(sr.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z'),
  'updatedAt', DATE_FORMAT(sr.\`updated_at\`, '%Y-%m-%dT%H:%i:%s.000Z'),
  'category', IF(c.\`category_id\` IS NULL, NULL, JSON_OBJECT(
    'categoryId', c.\`category_id\`,
    'parentId', c.\`parent_id\`,
    'name', c.\`name\`,
    'code', c.\`code\`,
    'description', c.\`description\`,
    'sortOrder', c.\`sort_order\`,
    'status', c.\`status\`,
    'createdAt', DATE_FORMAT(c.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z'),
    'updatedAt', DATE_FORMAT(c.\`updated_at\`, '%Y-%m-%dT%H:%i:%s.000Z')
  ))
)
FROM \`service_request\` sr
JOIN \`user\` p ON p.\`user_id\` = sr.\`publisher_id\`
LEFT JOIN \`category\` c ON c.\`category_id\` = sr.\`category_id\`
WHERE sr.\`request_id\` = @created_request_id
LIMIT 1;
`;
    const created = normalizeServiceRequest(await mysqlJson(sql));
    if (created) {
      requestExtras.set(created.requestId, { tags });
    }
    return withRequestExtras(created);
  }

  async function acceptServiceRequest(input) {
    const requestId = Number(input.requestId);
    const providerId = Number(input.providerId);
    const sql = `
START TRANSACTION;
SET @request_id = ${requestId};
SET @provider_id = ${providerId};
SET @publisher_id = NULL;
SET @request_status = NULL;
SELECT
  @publisher_id := sr.\`publisher_id\`,
  @request_status := sr.\`status\`
FROM \`service_request\` sr
WHERE sr.\`request_id\` = @request_id
FOR UPDATE;
UPDATE \`service_request\`
SET \`status\` = 'accepted'
WHERE \`request_id\` = @request_id
  AND \`status\` = 'open'
  AND \`publisher_id\` <> @provider_id
LIMIT 1;
SET @updated_rows = ROW_COUNT();
INSERT INTO \`service_order\` (
  \`request_id\`,
  \`provider_id\`,
  \`status\`,
  \`payer_confirmed\`,
  \`provider_confirmed\`,
  \`coin_amount\`
)
SELECT
  sr.\`request_id\`,
  @provider_id,
  'accepted',
  0,
  0,
  sr.\`coin_amount\`
FROM \`service_request\` sr
WHERE sr.\`request_id\` = @request_id
  AND @updated_rows = 1;
SET @created_order_id = IF(@updated_rows = 1, LAST_INSERT_ID(), NULL);
INSERT INTO \`notification\` (
  \`user_id\`,
  \`type\`,
  \`title\`,
  \`content\`,
  \`business_type\`,
  \`business_id\`
)
SELECT
  sr.\`publisher_id\`,
  'order',
  '需求已被接单',
  CONCAT(provider.\`username\`, ' 已接单：', sr.\`title\`, '。'),
  'order',
  @created_order_id
FROM \`service_request\` sr
JOIN \`user\` provider ON provider.\`user_id\` = @provider_id
WHERE sr.\`request_id\` = @request_id
  AND @updated_rows = 1;
COMMIT;
SELECT JSON_OBJECT(
  'updatedRows', @updated_rows,
  'requestId', @request_id,
  'publisherId', @publisher_id,
  'requestStatus', @request_status,
  'orderId', @created_order_id
);
`;
    let result;
    try {
      result = await mysqlJson(sql);
    } catch (error) {
      if (error.code === "DUPLICATE_ENTRY") {
        throw storeError("REQUEST_ALREADY_ACCEPTED", "This request already has an order.");
      }
      throw error;
    }

    if (Number(result?.updatedRows ?? 0) !== 1) {
      throwAcceptFailure(result, providerId);
    }

    return findServiceOrderById(result.orderId);
  }

  async function listServiceOrders() {
    const sql = `
SELECT COALESCE(JSON_ARRAYAGG(${serviceOrderJsonObjectSql("q")}), JSON_ARRAY())
FROM (
  SELECT
    so.\`order_id\`,
    so.\`request_id\`,
    so.\`provider_id\`,
    so.\`status\`,
    so.\`payer_confirmed\`,
    so.\`provider_confirmed\`,
    CAST(so.\`coin_amount\` AS DOUBLE) AS \`coin_amount\`,
    so.\`created_at\`,
    so.\`updated_at\`,
    so.\`completed_at\`
  FROM \`service_order\` so
  ORDER BY so.\`created_at\` DESC, so.\`order_id\` DESC
) q;
`;
    const rows = await mysqlJson(sql, { optional: true });
    return Array.isArray(rows) ? rows.map(normalizeServiceOrder).filter(Boolean) : [];
  }

  async function findServiceOrderById(orderId) {
    const id = Number(orderId);
    if (!Number.isInteger(id) || id <= 0) {
      return null;
    }
    const sql = `
SELECT ${serviceOrderJsonObjectSql("so")}
FROM \`service_order\` so
WHERE so.\`order_id\` = ${id}
LIMIT 1;
`;
    return normalizeServiceOrder(await mysqlJson(sql, { optional: true }));
  }

  async function confirmServiceOrder(input) {
    const orderId = Number(input.orderId);
    const actorId = Number(input.actorId);
    const actorRole = String(input.actorRole ?? "");
    if (!["payer", "provider"].includes(actorRole)) {
      throw storeError("ORDER_FORBIDDEN", "Actor is not part of this order.");
    }

    return transferCoins({ orderId, actorId, actorRole });
  }

  async function transferCoins(input) {
    const { orderId, actorId, actorRole } = input;
    const sql = `
START TRANSACTION;
SET @settled_at = CURRENT_TIMESTAMP;
SET @order_id = ${orderId};
SET @actor_id = ${actorId};
SET @actor_role = ${sqlString(actorRole)};
SET @order_found = 0;
SET @authorized = 0;
SET @status_allowed = 0;
SET @request_id = NULL;
SET @payer_id = NULL;
SET @provider_id = NULL;
SET @coin_amount = NULL;
SET @current_payer_confirmed = 0;
SET @current_provider_confirmed = 0;
SET @next_payer_confirmed = 0;
SET @next_provider_confirmed = 0;
SET @should_settle = 0;
SET @settled = 0;
SET @wallets_found = 1;
SET @insufficient_balance = 0;
SET @first_wallet_user_id = NULL;
SET @second_wallet_user_id = NULL;
SET @first_wallet_balance = NULL;
SET @second_wallet_balance = NULL;
SET @payer_balance_before = NULL;
SET @provider_balance_before = NULL;
SET @payer_balance_after = NULL;
SET @provider_balance_after = NULL;
SET @payer_wallet_updated = 0;
SET @provider_wallet_updated = 0;
SET @order_updated = 0;
SELECT
  @order_found := 1,
  @request_id := so.\`request_id\`,
  @payer_id := sr.\`publisher_id\`,
  @provider_id := so.\`provider_id\`,
  @coin_amount := so.\`coin_amount\`,
  @current_payer_confirmed := so.\`payer_confirmed\`,
  @current_provider_confirmed := so.\`provider_confirmed\`,
  @authorized := IF(
    (@actor_role = 'payer' AND sr.\`publisher_id\` = @actor_id)
      OR (@actor_role = 'provider' AND so.\`provider_id\` = @actor_id),
    1,
    0
  ),
  @status_allowed := IF(so.\`status\` IN ('accepted', 'payer_confirmed', 'both_confirmed'), 1, 0)
FROM \`service_order\` so
JOIN \`service_request\` sr ON sr.\`request_id\` = so.\`request_id\`
WHERE so.\`order_id\` = @order_id
FOR UPDATE;
SET @next_payer_confirmed = IF(@actor_role = 'payer', 1, COALESCE(@current_payer_confirmed, 0));
SET @next_provider_confirmed = IF(@actor_role = 'provider', 1, COALESCE(@current_provider_confirmed, 0));
SET @should_settle = IF(@authorized = 1 AND @status_allowed = 1 AND @next_payer_confirmed = 1 AND @next_provider_confirmed = 1, 1, 0);
SET @first_wallet_user_id = LEAST(@payer_id, @provider_id);
SET @second_wallet_user_id = GREATEST(@payer_id, @provider_id);
SELECT @first_wallet_balance := CAST(w.\`balance\` AS DECIMAL(10,2))
FROM \`wallet\` w
WHERE @should_settle = 1
  AND w.\`user_id\` = @first_wallet_user_id
FOR UPDATE;
SELECT @second_wallet_balance := CAST(w.\`balance\` AS DECIMAL(10,2))
FROM \`wallet\` w
WHERE @should_settle = 1
  AND w.\`user_id\` = @second_wallet_user_id
FOR UPDATE;
SET @payer_balance_before = IF(@payer_id = @first_wallet_user_id, @first_wallet_balance, @second_wallet_balance);
SET @provider_balance_before = IF(@provider_id = @first_wallet_user_id, @first_wallet_balance, @second_wallet_balance);
SET @wallets_found = IF(@should_settle = 0 OR (@payer_balance_before IS NOT NULL AND @provider_balance_before IS NOT NULL), 1, 0);
SET @insufficient_balance = IF(@should_settle = 1 AND @wallets_found = 1 AND @payer_balance_before < @coin_amount, 1, 0);
SET @payer_balance_after = ROUND(@payer_balance_before - @coin_amount, 2);
SET @provider_balance_after = ROUND(@provider_balance_before + @coin_amount, 2);
UPDATE \`wallet\`
SET
  \`balance\` = @payer_balance_after,
  \`version\` = \`version\` + 1,
  \`updated_at\` = @settled_at
WHERE \`user_id\` = @payer_id
  AND @should_settle = 1
  AND @wallets_found = 1
  AND @insufficient_balance = 0
  AND \`balance\` >= @coin_amount
LIMIT 1;
SET @payer_wallet_updated = ROW_COUNT();
UPDATE \`wallet\`
SET
  \`balance\` = @provider_balance_after,
  \`version\` = \`version\` + 1,
  \`updated_at\` = @settled_at
WHERE \`user_id\` = @provider_id
  AND @payer_wallet_updated = 1
LIMIT 1;
SET @provider_wallet_updated = ROW_COUNT();
SET @settled = IF(@should_settle = 1 AND @payer_wallet_updated = 1 AND @provider_wallet_updated = 1, 1, 0);
INSERT INTO \`transaction_log\` (
  \`user_id\`,
  \`order_id\`,
  \`type\`,
  \`amount\`,
  \`balance_after\`,
  \`remark\`,
  \`created_at\`
)
SELECT
  @payer_id,
  @order_id,
  'expense',
  @coin_amount,
  @payer_balance_after,
  '订单完成，需求方支出时间币',
  @settled_at
WHERE @settled = 1;
INSERT INTO \`transaction_log\` (
  \`user_id\`,
  \`order_id\`,
  \`type\`,
  \`amount\`,
  \`balance_after\`,
  \`remark\`,
  \`created_at\`
)
SELECT
  @provider_id,
  @order_id,
  'income',
  @coin_amount,
  @provider_balance_after,
  '订单完成，服务方收入时间币',
  @settled_at
WHERE @settled = 1;
UPDATE \`service_order\`
SET
  \`payer_confirmed\` = @next_payer_confirmed,
  \`provider_confirmed\` = @next_provider_confirmed,
  \`status\` = CASE
    WHEN @settled = 1 THEN 'completed'
    WHEN @next_payer_confirmed = 1 THEN 'payer_confirmed'
    ELSE 'accepted'
  END,
  \`completed_at\` = CASE WHEN @settled = 1 THEN @settled_at ELSE \`completed_at\` END,
  \`updated_at\` = @settled_at
WHERE \`order_id\` = @order_id
  AND @authorized = 1
  AND @status_allowed = 1
  AND (@should_settle = 0 OR @settled = 1)
LIMIT 1;
SET @order_updated = ROW_COUNT();
UPDATE \`service_request\`
SET
  \`status\` = 'completed',
  \`updated_at\` = @settled_at
WHERE \`request_id\` = @request_id
  AND @settled = 1
LIMIT 1;
INSERT INTO \`notification\` (
  \`user_id\`,
  \`type\`,
  \`title\`,
  \`content\`,
  \`business_type\`,
  \`business_id\`,
  \`created_at\`
)
SELECT
  IF(@actor_role = 'payer', @provider_id, @payer_id),
  'order',
  '订单确认状态已更新',
  CONCAT(actor.\`username\`, ' 已确认订单：', sr.\`title\`, '。'),
  'order',
  @order_id,
  @settled_at
FROM \`service_request\` sr
JOIN \`user\` actor ON actor.\`user_id\` = @actor_id
WHERE sr.\`request_id\` = @request_id
  AND @order_updated = 1
  AND @settled = 0;
INSERT INTO \`notification\` (
  \`user_id\`,
  \`type\`,
  \`title\`,
  \`content\`,
  \`business_type\`,
  \`business_id\`,
  \`created_at\`
)
SELECT
  @payer_id,
  'wallet',
  '时间币已结算',
  CONCAT('订单「', sr.\`title\`, '」已完成，支出 ', CAST(@coin_amount AS CHAR), ' 时间币。'),
  'wallet',
  @order_id,
  @settled_at
FROM \`service_request\` sr
WHERE sr.\`request_id\` = @request_id
  AND @order_updated = 1
  AND @settled = 1;
INSERT INTO \`notification\` (
  \`user_id\`,
  \`type\`,
  \`title\`,
  \`content\`,
  \`business_type\`,
  \`business_id\`,
  \`created_at\`
)
SELECT
  @provider_id,
  'wallet',
  '时间币已入账',
  CONCAT('订单「', sr.\`title\`, '」已完成，收入 ', CAST(@coin_amount AS CHAR), ' 时间币。'),
  'wallet',
  @order_id,
  @settled_at
FROM \`service_request\` sr
WHERE sr.\`request_id\` = @request_id
  AND @order_updated = 1
  AND @settled = 1;
SET @rollback_required = IF(
  @order_found <> 1
    OR @authorized <> 1
    OR @status_allowed <> 1
    OR (@should_settle = 1 AND @settled <> 1)
    OR (@settled = 1 AND @order_updated <> 1),
  1,
  0
);
SET @transaction_sql = IF(@rollback_required = 1, 'ROLLBACK', 'COMMIT');
PREPARE transaction_statement FROM @transaction_sql;
EXECUTE transaction_statement;
DEALLOCATE PREPARE transaction_statement;
SELECT JSON_OBJECT(
  'orderFound', @order_found,
  'authorized', @authorized,
  'statusAllowed', @status_allowed,
  'shouldSettle', @should_settle,
  'settled', @settled,
  'walletsFound', @wallets_found,
  'insufficientBalance', @insufficient_balance,
  'orderId', @order_id
);
`;
    const result = await mysqlJson(sql);
    if (Number(result?.orderFound ?? 0) !== 1) {
      throw storeError("ORDER_NOT_FOUND", "Service order was not found.");
    }
    if (Number(result?.authorized ?? 0) !== 1) {
      throw storeError("ORDER_FORBIDDEN", "Actor is not part of this order.");
    }
    if (Number(result?.statusAllowed ?? 0) !== 1) {
      throw storeError("ORDER_STATUS_NOT_CONFIRMABLE", "Only accepted orders can be confirmed.");
    }
    if (Number(result?.walletsFound ?? 1) !== 1) {
      throw storeError("ORDER_WALLET_NOT_FOUND", "Order wallet was not found.");
    }
    if (Number(result?.insufficientBalance ?? 0) === 1) {
      throw storeError("INSUFFICIENT_BALANCE", "Payer wallet balance is insufficient.");
    }
    if (Number(result?.shouldSettle ?? 0) === 1 && Number(result?.settled ?? 0) !== 1) {
      throw storeError("ORDER_SETTLEMENT_FAILED", "Order settlement could not be completed.");
    }
    return findServiceOrderById(result.orderId);
  }

  async function listTransactionLogs(query = {}) {
    const conditions = [];
    if (query.orderId !== undefined && query.orderId !== null) {
      conditions.push(`tl.\`order_id\` = ${Number(query.orderId)}`);
    }
    if (query.userId !== undefined && query.userId !== null) {
      conditions.push(`tl.\`user_id\` = ${Number(query.userId)}`);
    }
    const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = Math.min(200, Math.max(1, Number(query.limit ?? 100) || 100));
    const sql = `
SELECT COALESCE(JSON_ARRAYAGG(${transactionLogJsonObjectSql("q")}), JSON_ARRAY())
FROM (
  SELECT
    tl.\`log_id\`,
    tl.\`user_id\`,
    tl.\`order_id\`,
    tl.\`type\`,
    CAST(tl.\`amount\` AS DOUBLE) AS \`amount\`,
    CAST(tl.\`balance_after\` AS DOUBLE) AS \`balance_after\`,
    tl.\`remark\`,
    tl.\`created_at\`
  FROM \`transaction_log\` tl
  ${whereSql}
  ORDER BY tl.\`created_at\` DESC, tl.\`log_id\` DESC
  LIMIT ${limit}
) q;
`;
    const rows = await mysqlJson(sql, { optional: true });
    return Array.isArray(rows) ? rows.map(normalizeTransactionLog) : [];
  }

  async function getWalletSummary(userId) {
    const id = Number(userId);
    const wallet = await findWalletByUserId(id);
    if (!wallet) {
      return null;
    }
    const sql = `
SELECT JSON_OBJECT(
  'totalIncome', COALESCE(SUM(CASE WHEN tl.\`type\` = 'income' THEN tl.\`amount\` ELSE 0 END), 0),
  'totalExpense', COALESCE(SUM(CASE WHEN tl.\`type\` = 'expense' THEN tl.\`amount\` ELSE 0 END), 0),
  'transactionCount', COUNT(tl.\`log_id\`),
  'freezeCount', COALESCE(SUM(CASE WHEN tl.\`type\` = 'freeze' THEN 1 ELSE 0 END), 0)
)
FROM \`transaction_log\` tl
WHERE tl.\`user_id\` = ${id};
`;
    const summary = await mysqlJson(sql, { optional: true }) ?? {};
    return {
      wallet,
      totalIncome: Number(summary.totalIncome ?? 0),
      totalExpense: Number(summary.totalExpense ?? 0),
      transactionCount: Number(summary.transactionCount ?? 0),
      freezeCount: Number(summary.freezeCount ?? 0)
    };
  }

  async function listWalletTransactions(query = {}) {
    const userId = Number(query.userId);
    const type = String(query.type ?? "all").trim().toLowerCase();
    const page = positiveInteger(query.page, 1);
    const pageSize = Math.min(50, positiveInteger(query.pageSize, 20));
    const offset = (page - 1) * pageSize;
    const conditions = [`tl.\`user_id\` = ${userId}`];
    if (type !== "all") {
      conditions.push(`tl.\`type\` = ${sqlString(type)}`);
    }
    const whereSql = `WHERE ${conditions.join(" AND ")}`;
    const sql = `
SELECT JSON_OBJECT(
  'items', COALESCE(JSON_ARRAYAGG(${walletTransactionJsonObjectSql("q")}), JSON_ARRAY()),
  'total', (SELECT COUNT(*)
    FROM \`transaction_log\` tl
    ${whereSql}
  )
)
FROM (
  SELECT
    tl.\`log_id\`,
    tl.\`user_id\`,
    tl.\`order_id\`,
    tl.\`type\`,
    CAST(tl.\`amount\` AS DOUBLE) AS \`amount\`,
    CAST(tl.\`balance_after\` AS DOUBLE) AS \`balance_after\`,
    tl.\`remark\`,
    DATE_FORMAT(tl.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS \`created_at\`,
    so.\`request_id\`,
    d.\`dispute_id\`,
    sr.\`title\` AS \`related_title\`,
    IF(d.\`dispute_id\` IS NOT NULL AND tl.\`type\` = 'freeze', 'dispute', IF(tl.\`order_id\` IS NOT NULL, 'order', 'system')) AS \`business_type\`,
    IF(d.\`dispute_id\` IS NOT NULL AND tl.\`type\` = 'freeze', d.\`dispute_id\`, tl.\`order_id\`) AS \`business_id\`
  FROM \`transaction_log\` tl
  LEFT JOIN \`service_order\` so ON so.\`order_id\` = tl.\`order_id\`
  LEFT JOIN \`service_request\` sr ON sr.\`request_id\` = so.\`request_id\`
  LEFT JOIN \`dispute\` d ON d.\`order_id\` = tl.\`order_id\`
  ${whereSql}
  ORDER BY tl.\`created_at\` DESC, tl.\`log_id\` DESC
  LIMIT ${pageSize} OFFSET ${offset}
) q;
`;
    const result = await mysqlJson(sql, { optional: true });
    return {
      transactions: Array.isArray(result?.items) ? result.items.map(normalizeWalletTransaction) : [],
      total: Number(result?.total ?? 0)
    };
  }

  async function listWalletFreezes(query = {}) {
    const userId = Number(query.userId);
    const status = String(query.status ?? "all").trim().toLowerCase();
    const reasonType = String(query.reasonType ?? "all").trim().toLowerCase();
    const page = positiveInteger(query.page, 1);
    const pageSize = Math.min(50, positiveInteger(query.pageSize, 20));
    const offset = (page - 1) * pageSize;
    const conditions = [
      `tl.\`user_id\` = ${userId}`,
      "tl.`type` = 'freeze'"
    ];
    if (status !== "all") {
      conditions.push(freezeStatusSql() + ` = ${sqlString(status)}`);
    }
    if (reasonType !== "all") {
      conditions.push(freezeReasonTypeSql() + ` = ${sqlString(reasonType)}`);
    }
    const whereSql = `WHERE ${conditions.join(" AND ")}`;
    const sql = `
SELECT JSON_OBJECT(
  'items', COALESCE(JSON_ARRAYAGG(${walletFreezeJsonObjectSql("q")}), JSON_ARRAY()),
  'total', (SELECT COUNT(*)
    FROM \`transaction_log\` tl
    LEFT JOIN \`service_order\` so ON so.\`order_id\` = tl.\`order_id\`
    LEFT JOIN \`service_request\` sr ON sr.\`request_id\` = so.\`request_id\`
    LEFT JOIN \`dispute\` d ON d.\`order_id\` = tl.\`order_id\`
    ${whereSql}
  )
)
FROM (
  SELECT
    tl.\`log_id\` AS \`freeze_id\`,
    tl.\`user_id\`,
    tl.\`order_id\`,
    so.\`request_id\`,
    d.\`dispute_id\`,
    ${freezeReasonTypeSql()} AS \`reason_type\`,
    ${freezeStatusSql()} AS \`status\`,
    CAST(tl.\`amount\` AS DOUBLE) AS \`amount\`,
    COALESCE(tl.\`remark\`, IF(d.\`dispute_id\` IS NOT NULL, '纠纷处理中，相关时间币保持冻结', '订单时间币冻结')) AS \`reason\`,
    IF(d.\`dispute_id\` IS NOT NULL, '管理员终审后按裁决释放或退回', '双方确认完成后释放给服务方') AS \`release_condition\`,
    sr.\`title\` AS \`related_title\`,
    IF(d.\`dispute_id\` IS NOT NULL, 'dispute', 'order') AS \`business_type\`,
    IF(d.\`dispute_id\` IS NOT NULL, d.\`dispute_id\`, tl.\`order_id\`) AS \`business_id\`,
    DATE_FORMAT(tl.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS \`created_at\`,
    IF(so.\`status\` = 'completed', DATE_FORMAT(so.\`completed_at\`, '%Y-%m-%dT%H:%i:%s.000Z'), NULL) AS \`released_at\`
  FROM \`transaction_log\` tl
  LEFT JOIN \`service_order\` so ON so.\`order_id\` = tl.\`order_id\`
  LEFT JOIN \`service_request\` sr ON sr.\`request_id\` = so.\`request_id\`
  LEFT JOIN \`dispute\` d ON d.\`order_id\` = tl.\`order_id\`
  ${whereSql}
  ORDER BY IF(${freezeStatusSql()} = 'released', 1, 0) ASC, tl.\`created_at\` DESC, tl.\`log_id\` DESC
  LIMIT ${pageSize} OFFSET ${offset}
) q;
`;
    const result = await mysqlJson(sql, { optional: true });
    return {
      freezes: Array.isArray(result?.items) ? result.items.map(normalizeWalletFreeze) : [],
      total: Number(result?.total ?? 0)
    };
  }

  async function createWalletFreeze(input) {
    const userId = Number(input.userId);
    const orderId = input.orderId === undefined || input.orderId === null ? null : Number(input.orderId);
    const amount = Number(input.amount).toFixed(2);
    const reason = normalizeOptionalString(input.reason) ?? "订单时间币冻结";
    const sql = `
START TRANSACTION;
SET @freeze_user_id = ${userId};
SET @freeze_order_id = ${orderId === null ? "NULL" : orderId};
SET @freeze_amount = ${amount};
SET @wallet_found = 0;
SELECT @wallet_found := 1
FROM \`wallet\` w
WHERE w.\`user_id\` = @freeze_user_id
FOR UPDATE;
UPDATE \`wallet\`
SET
  \`frozen_balance\` = ROUND(\`frozen_balance\` + @freeze_amount, 2),
  \`version\` = \`version\` + 1,
  \`updated_at\` = CURRENT_TIMESTAMP
WHERE \`user_id\` = @freeze_user_id
  AND @wallet_found = 1
LIMIT 1;
INSERT INTO \`transaction_log\` (
  \`user_id\`,
  \`order_id\`,
  \`type\`,
  \`amount\`,
  \`balance_after\`,
  \`remark\`
)
SELECT
  @freeze_user_id,
  @freeze_order_id,
  'freeze',
  @freeze_amount,
  w.\`balance\`,
  ${sqlString(reason)}
FROM \`wallet\` w
WHERE w.\`user_id\` = @freeze_user_id
  AND @wallet_found = 1;
SET @created_log_id = IF(@wallet_found = 1, LAST_INSERT_ID(), NULL);
INSERT INTO \`notification\` (
  \`user_id\`,
  \`type\`,
  \`title\`,
  \`content\`,
  \`business_type\`,
  \`business_id\`
)
SELECT
  @freeze_user_id,
  'dispute',
  '订单时间币已冻结',
  CONCAT(${sqlString(reason)}, '，冻结 ', CAST(@freeze_amount AS CHAR), ' 时间币。'),
  IF(d.\`dispute_id\` IS NULL, 'order', 'dispute'),
  IF(d.\`dispute_id\` IS NULL, @freeze_order_id, d.\`dispute_id\`)
FROM \`transaction_log\` tl
LEFT JOIN \`dispute\` d ON d.\`order_id\` = tl.\`order_id\`
WHERE tl.\`log_id\` = @created_log_id
  AND @wallet_found = 1;
SET @transaction_sql = IF(@wallet_found = 1, 'COMMIT', 'ROLLBACK');
PREPARE transaction_statement FROM @transaction_sql;
EXECUTE transaction_statement;
DEALLOCATE PREPARE transaction_statement;
SELECT JSON_OBJECT('walletFound', @wallet_found, 'logId', @created_log_id);
`;
    const result = await mysqlJson(sql);
    if (Number(result?.walletFound ?? 0) !== 1) {
      throw storeError("WALLET_NOT_FOUND", "Wallet was not found.");
    }
    const freezePayload = await listWalletFreezes({ userId, page: 1, pageSize: 1 });
    return freezePayload.freezes.find((freeze) => freeze.freezeId === Number(result.logId)) ?? freezePayload.freezes[0] ?? null;
  }

  async function listNotificationsForUserId(userId, query = {}) {
    const id = Number(userId);
    const type = String(query.type ?? "all").trim().toLowerCase();
    const read = String(query.read ?? "all").trim().toLowerCase();
    const page = positiveInteger(query.page, 1);
    const pageSize = Math.min(50, positiveInteger(query.pageSize, 20));
    const offset = (page - 1) * pageSize;
    const conditions = [`n.\`user_id\` = ${id}`];
    if (type !== "all") {
      conditions.push(`n.\`type\` = ${sqlString(type)}`);
    }
    if (read === "read") {
      conditions.push("n.`read_at` IS NOT NULL");
    } else if (read === "unread") {
      conditions.push("n.`read_at` IS NULL");
    }
    const whereSql = `WHERE ${conditions.join(" AND ")}`;
    const sql = `
SELECT JSON_OBJECT(
  'items', COALESCE(JSON_ARRAYAGG(${notificationJsonObjectSql("q")}), JSON_ARRAY()),
  'total', (SELECT COUNT(*) FROM \`notification\` n ${whereSql}),
  'unreadTotal', (SELECT COUNT(*) FROM \`notification\` n WHERE n.\`user_id\` = ${id} AND n.\`read_at\` IS NULL)
)
FROM (
  SELECT
    n.\`notification_id\`,
    n.\`user_id\`,
    n.\`type\`,
    n.\`title\`,
    n.\`content\`,
    n.\`business_type\`,
    n.\`business_id\`,
    n.\`read_at\`,
    n.\`created_at\`
  FROM \`notification\` n
  ${whereSql}
  ORDER BY n.\`created_at\` DESC, n.\`notification_id\` DESC
  LIMIT ${pageSize} OFFSET ${offset}
) q;
`;
    const result = await mysqlJson(sql, { optional: true });
    return {
      notifications: Array.isArray(result?.items) ? result.items.map(normalizeNotification) : [],
      total: Number(result?.total ?? 0),
      unreadTotal: Number(result?.unreadTotal ?? 0)
    };
  }

  async function markNotificationRead(userId, notificationId) {
    const id = Number(userId);
    const notificationIdNumber = Number(notificationId);
    const sql = `
UPDATE \`notification\`
SET \`read_at\` = COALESCE(\`read_at\`, CURRENT_TIMESTAMP)
WHERE \`notification_id\` = ${notificationIdNumber}
  AND \`user_id\` = ${id}
LIMIT 1;
SELECT ${notificationJsonObjectSql("n")}
FROM \`notification\` n
WHERE n.\`notification_id\` = ${notificationIdNumber}
  AND n.\`user_id\` = ${id}
LIMIT 1;
`;
    return normalizeNotification(await mysqlJson(sql, { optional: true }));
  }

  async function markAllNotificationsRead(userId) {
    const id = Number(userId);
    const sql = `
UPDATE \`notification\`
SET \`read_at\` = COALESCE(\`read_at\`, CURRENT_TIMESTAMP)
WHERE \`user_id\` = ${id}
  AND \`read_at\` IS NULL;
SELECT JSON_OBJECT('updated', ROW_COUNT(), 'unreadTotal', 0);
`;
    const result = await mysqlJson(sql, { optional: true });
    return {
      updated: Number(result?.updated ?? 0),
      unreadTotal: 0
    };
  }

  async function listMessagesForUserId(userId, query = {}) {
    const id = Number(userId);
    const page = positiveInteger(query.page, 1);
    const pageSize = Math.min(50, positiveInteger(query.pageSize, 20));
    const offset = (page - 1) * pageSize;
    const sql = `
SELECT JSON_OBJECT(
  'items', COALESCE(JSON_ARRAYAGG(JSON_OBJECT(
    'conversationId', q.\`conversation_id\`,
    'type', q.\`type\`,
    'title', q.\`title\`,
    'participant', IF(q.\`other_user_id\` IS NULL, NULL, JSON_OBJECT(
      'userId', q.\`other_user_id\`,
      'username', q.\`other_username\`,
      'displayName', q.\`other_display_name\`
    )),
    'orderId', q.\`order_id\`,
    'preview', q.\`preview\`,
    'unreadCount', q.\`unread_count\`,
    'updatedAt', q.\`updated_at\`,
    'href', q.\`href\`
  )), JSON_ARRAY()),
  'total', (SELECT COUNT(*) FROM (
    SELECT CONCAT(COALESCE(m.\`order_id\`, 0), ':', IF(m.\`sender_id\` = ${id}, m.\`receiver_id\`, m.\`sender_id\`)) AS \`conversation_id\`
    FROM \`message\` m
    WHERE m.\`sender_id\` = ${id} OR m.\`receiver_id\` = ${id}
    GROUP BY \`conversation_id\`
  ) c) + IF(EXISTS(SELECT 1 FROM \`notification\` n WHERE n.\`user_id\` = ${id}), 1, 0),
  'unreadTotal', (
    SELECT COUNT(*) FROM \`message\` m
    WHERE m.\`receiver_id\` = ${id} AND m.\`is_read\` = 0
  ) + (
    SELECT COUNT(*) FROM \`notification\` n
    WHERE n.\`user_id\` = ${id} AND n.\`read_at\` IS NULL
  )
)
FROM (
  SELECT *
  FROM (
    SELECT
      CONCAT(COALESCE(m.\`order_id\`, 0), ':', IF(m.\`sender_id\` = ${id}, m.\`receiver_id\`, m.\`sender_id\`)) AS \`conversation_id\`,
      IF(m.\`order_id\` IS NULL, 'direct', 'order') AS \`type\`,
      IF(other_user.\`username\` IS NULL, '邻帮用户', other_user.\`username\`) AS \`title\`,
      other_user.\`user_id\` AS \`other_user_id\`,
      other_user.\`username\` AS \`other_username\`,
      other_user.\`username\` AS \`other_display_name\`,
      m.\`order_id\`,
      (
        SELECT m2.\`content\`
        FROM \`message\` m2
        WHERE (m2.\`sender_id\` = ${id} OR m2.\`receiver_id\` = ${id})
          AND CONCAT(COALESCE(m2.\`order_id\`, 0), ':', IF(m2.\`sender_id\` = ${id}, m2.\`receiver_id\`, m2.\`sender_id\`)) =
            CONCAT(COALESCE(m.\`order_id\`, 0), ':', IF(m.\`sender_id\` = ${id}, m.\`receiver_id\`, m.\`sender_id\`))
        ORDER BY m2.\`created_at\` DESC, m2.\`message_id\` DESC
        LIMIT 1
      ) AS \`preview\`,
      SUM(IF(m.\`receiver_id\` = ${id} AND m.\`is_read\` = 0, 1, 0)) AS \`unread_count\`,
      DATE_FORMAT(MAX(m.\`created_at\`), '%Y-%m-%dT%H:%i:%s.000Z') AS \`updated_at\`,
      IF(m.\`order_id\` IS NULL, NULL, CONCAT('/orders/', m.\`order_id\`)) AS \`href\`
    FROM \`message\` m
    LEFT JOIN \`user\` other_user ON other_user.\`user_id\` = IF(m.\`sender_id\` = ${id}, m.\`receiver_id\`, m.\`sender_id\`)
    WHERE m.\`sender_id\` = ${id} OR m.\`receiver_id\` = ${id}
    GROUP BY \`conversation_id\`, \`type\`, \`title\`, \`other_user_id\`, \`other_username\`, \`other_display_name\`, m.\`order_id\`
    UNION ALL
    SELECT
      'system:notifications',
      'system',
      '系统通知',
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      latest.\`title\`,
      (SELECT COUNT(*) FROM \`notification\` n WHERE n.\`user_id\` = ${id} AND n.\`read_at\` IS NULL),
      DATE_FORMAT(latest.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z'),
      '/notifications'
    FROM \`notification\` latest
    WHERE latest.\`user_id\` = ${id}
    ORDER BY latest.\`created_at\` DESC, latest.\`notification_id\` DESC
    LIMIT 1
  ) unioned
  ORDER BY \`updated_at\` DESC
  LIMIT ${pageSize} OFFSET ${offset}
) q;
`;
    const result = await mysqlJson(sql, { optional: true });
    return {
      conversations: Array.isArray(result?.items) ? result.items.map(normalizeConversation) : [],
      total: Number(result?.total ?? 0),
      unreadTotal: Number(result?.unreadTotal ?? 0)
    };
  }

  async function createReview(input) {
    const orderId = Number(input.orderId);
    const reviewerId = Number(input.reviewerId);
    const targetId = Number(input.targetId);
    const rating = Math.min(5, Math.max(1, Math.round(Number(input.rating) || 0)));
    const comment = normalizeOptionalString(input.comment);
    const tags = normalizeReviewTags(input.tags);
    const sql = `
START TRANSACTION;
SET @order_id = ${orderId};
SET @reviewer_id = ${reviewerId};
SET @target_id = ${targetId};
SET @rating = ${rating};
SET @order_found = 0;
SET @completed = 0;
SET @authorized = 0;
SET @target_valid = 0;
SET @direction = NULL;
SET @created_review_id = NULL;
SELECT
  @order_found := 1,
  @request_id := so.\`request_id\`,
  @publisher_id := sr.\`publisher_id\`,
  @provider_id := so.\`provider_id\`,
  @completed := IF(so.\`status\` = 'completed', 1, 0),
  @direction := CASE
    WHEN sr.\`publisher_id\` = @reviewer_id THEN 'publisher_to_provider'
    WHEN so.\`provider_id\` = @reviewer_id THEN 'provider_to_publisher'
    ELSE NULL
  END,
  @authorized := IF(
    reviewer.\`user_id\` IS NOT NULL
      AND reviewer.\`status\` = 1
      AND reviewer.\`role\` = 'user'
      AND (sr.\`publisher_id\` = @reviewer_id OR so.\`provider_id\` = @reviewer_id),
    1,
    0
  ),
  @target_valid := IF(
    target.\`user_id\` IS NOT NULL
      AND target.\`status\` = 1
      AND target.\`role\` = 'user'
      AND (
        (sr.\`publisher_id\` = @reviewer_id AND so.\`provider_id\` = @target_id)
        OR (so.\`provider_id\` = @reviewer_id AND sr.\`publisher_id\` = @target_id)
      ),
    1,
    0
  )
FROM \`service_order\` so
JOIN \`service_request\` sr ON sr.\`request_id\` = so.\`request_id\`
LEFT JOIN \`user\` reviewer ON reviewer.\`user_id\` = @reviewer_id
LEFT JOIN \`user\` target ON target.\`user_id\` = @target_id
WHERE so.\`order_id\` = @order_id
FOR UPDATE;
INSERT INTO \`review\` (
  \`order_id\`,
  \`reviewer_id\`,
  \`target_id\`,
  \`direction\`,
  \`rating\`,
  \`comment\`
)
SELECT
  @order_id,
  @reviewer_id,
  @target_id,
  @direction,
  @rating,
  ${sqlNullableString(comment)}
WHERE @order_found = 1
  AND @completed = 1
  AND @authorized = 1
  AND @target_valid = 1;
SET @created_review_id = IF(ROW_COUNT() = 1, LAST_INSERT_ID(), NULL);
INSERT INTO \`notification\` (
  \`user_id\`,
  \`type\`,
  \`title\`,
  \`content\`,
  \`business_type\`,
  \`business_id\`
)
SELECT
  @target_id,
  'review',
  '你收到一条新评价',
  CONCAT(reviewer.\`username\`, ' 评价了订单「', sr.\`title\`, '」。'),
  'order',
  @order_id
FROM \`service_request\` sr
JOIN \`user\` reviewer ON reviewer.\`user_id\` = @reviewer_id
WHERE sr.\`request_id\` = @request_id
  AND @created_review_id IS NOT NULL;
COMMIT;
SELECT JSON_OBJECT(
  'orderFound', @order_found,
  'completed', @completed,
  'authorized', @authorized,
  'targetValid', @target_valid,
  'reviewId', @created_review_id
);
`;
    let result;
    try {
      result = await mysqlJson(sql);
    } catch (error) {
      if (error.code === "DUPLICATE_ENTRY") {
        throw storeError("REVIEW_ALREADY_EXISTS", "This review direction already exists.");
      }
      throw error;
    }

    if (Number(result?.orderFound ?? 0) !== 1) {
      throw storeError("ORDER_NOT_FOUND", "Service order was not found.");
    }
    if (Number(result?.completed ?? 0) !== 1) {
      throw storeError("ORDER_NOT_COMPLETED", "Only completed orders can be reviewed.");
    }
    if (Number(result?.authorized ?? 0) !== 1) {
      throw storeError("REVIEW_FORBIDDEN", "Reviewer is not part of this order.");
    }
    if (Number(result?.targetValid ?? 0) !== 1) {
      throw storeError("REVIEW_TARGET_INVALID", "Review target must be the other party in this order.");
    }

    const reviewId = Number(result.reviewId);
    reviewExtras.set(reviewId, { tags });
    const orderReviews = await listReviewsForOrderId(orderId);
    return orderReviews.find((review) => review.reviewId === reviewId) ?? null;
  }

  async function listReviewsForOrderId(orderId) {
    return listReviews(`r.\`order_id\` = ${Number(orderId)}`);
  }

  async function listReviewsForTargetId(userId) {
    return listReviews(`r.\`target_id\` = ${Number(userId)}`);
  }

  async function listReviews(whereSql) {
    const sql = `
SELECT COALESCE(JSON_ARRAYAGG(JSON_OBJECT(
  'reviewId', q.\`review_id\`,
  'orderId', q.\`order_id\`,
  'reviewerId', q.\`reviewer_id\`,
  'targetId', q.\`target_id\`,
  'direction', q.\`direction\`,
  'rating', q.\`rating\`,
  'comment', q.\`comment\`,
  'orderTitle', q.\`order_title\`,
  'tags', JSON_ARRAY(),
  'createdAt', q.\`created_at\`,
  'reviewer', JSON_OBJECT(
    'userId', q.\`reviewer_id\`,
    'username', q.\`reviewer_username\`,
    'displayName', q.\`reviewer_display_name\`
  ),
  'target', JSON_OBJECT(
    'userId', q.\`target_id\`,
    'username', q.\`target_username\`,
    'displayName', q.\`target_display_name\`
  )
)), JSON_ARRAY())
FROM (
  SELECT
    r.\`review_id\`,
    r.\`order_id\`,
    r.\`reviewer_id\`,
    r.\`target_id\`,
    r.\`direction\`,
    r.\`rating\`,
    r.\`comment\`,
    sr.\`title\` AS \`order_title\`,
    DATE_FORMAT(r.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS \`created_at\`,
    reviewer.\`username\` AS \`reviewer_username\`,
    reviewer.\`username\` AS \`reviewer_display_name\`,
    target.\`username\` AS \`target_username\`,
    target.\`username\` AS \`target_display_name\`
  FROM \`review\` r
  JOIN \`user\` reviewer ON reviewer.\`user_id\` = r.\`reviewer_id\`
  JOIN \`user\` target ON target.\`user_id\` = r.\`target_id\`
  LEFT JOIN \`service_order\` so ON so.\`order_id\` = r.\`order_id\`
  LEFT JOIN \`service_request\` sr ON sr.\`request_id\` = so.\`request_id\`
  WHERE ${whereSql}
  ORDER BY r.\`created_at\` DESC, r.\`review_id\` DESC
) q;
`;
    const rows = await mysqlJson(sql, { optional: true });
    return Array.isArray(rows) ? rows.map(normalizeReview).map(withReviewExtras) : [];
  }

  function withProfileExtras(user) {
    return mergeProfileExtras(user, profileExtras.get(user?.userId));
  }

  function withRequestExtras(request) {
    if (!request) {
      return null;
    }
    const extra = requestExtras.get(request.requestId);
    return extra ? { ...request, tags: extra.tags ?? request.tags } : request;
  }

  function withReviewExtras(review) {
    const extra = reviewExtras.get(review?.reviewId);
    return extra ? { ...review, tags: extra.tags ?? review.tags } : review;
  }

  function createSession(input) {
    const now = new Date().toISOString();
    const session = {
      sessionId: crypto.randomUUID(),
      userId: input.userId,
      role: input.role,
      expiresAt: input.expiresAt,
      createdAt: now,
      revokedAt: null
    };
    sessions.set(session.sessionId, session);
    return clone(session);
  }

  function findSession(sessionId) {
    const session = sessions.get(sessionId);
    return session ? clone(session) : null;
  }

  function revokeSession(sessionId) {
    const session = sessions.get(sessionId);
    if (!session || session.revokedAt) {
      return false;
    }
    session.revokedAt = new Date().toISOString();
    return true;
  }

  async function mysqlJson(sql, options = {}) {
    const result = await runMysql(sql, ["--batch", "--raw", "--skip-column-names"]);
    if (result.code !== 0) {
      if (/Duplicate entry/i.test(result.stderr)) {
        const duplicateUsername = /uk_user_username/i.test(result.stderr);
        const error = new Error(duplicateUsername ? "Username already exists." : "Duplicate entry.");
        error.code = duplicateUsername ? "DUPLICATE_USERNAME" : "DUPLICATE_ENTRY";
        error.stderr = result.stderr;
        throw error;
      }
      throw new Error(`mysql exited with code ${result.code}: ${result.stderr.trim()}`);
    }

    const text = result.stdout.trim();
    if (!text) {
      return options.optional ? null : undefined;
    }
    return JSON.parse(text.split(/\r?\n/).at(-1));
  }

  function runMysql(sql, extraArgs = []) {
    return new Promise((resolve) => {
      const args = [
        `--host=${config.host}`,
        `--port=${config.port}`,
        `--user=${config.user}`,
        `--database=${config.database}`,
        "--default-character-set=utf8mb4",
        "--comments",
        ...extraArgs
      ];

      const child = spawn(config.mysqlBin, args, {
        env: { ...process.env, MYSQL_PWD: config.password },
        stdio: ["pipe", "pipe", "pipe"]
      });

      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("error", (error) => {
        resolve({ code: 1, stdout, stderr: `${stderr}${error.message}` });
      });
      child.on("close", (code) => {
        resolve({ code: code ?? 1, stdout, stderr });
      });
      child.stdin.end(sql);
    });
  }
}

function userJsonObjectSql(alias) {
  return `JSON_OBJECT(
    'userId', ${alias}.\`user_id\`,
    'username', ${alias}.\`username\`,
    'passwordHash', ${alias}.\`password_hash\`,
    'phone', ${alias}.\`phone\`,
    'skillTags', ${alias}.\`skill_tags\`,
    'role', ${alias}.\`role\`,
    'status', ${alias}.\`status\`,
    'createdAt', DATE_FORMAT(${alias}.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z'),
    'updatedAt', DATE_FORMAT(${alias}.\`updated_at\`, '%Y-%m-%dT%H:%i:%s.000Z')
  )`;
}

function walletJsonObjectSql(alias) {
  return `JSON_OBJECT(
    'walletId', ${alias}.\`wallet_id\`,
    'userId', ${alias}.\`user_id\`,
    'balance', CAST(${alias}.\`balance\` AS DOUBLE),
    'frozenBalance', CAST(${alias}.\`frozen_balance\` AS DOUBLE),
    'version', ${alias}.\`version\`,
    'createdAt', DATE_FORMAT(${alias}.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z'),
    'updatedAt', DATE_FORMAT(${alias}.\`updated_at\`, '%Y-%m-%dT%H:%i:%s.000Z')
  )`;
}

function serviceOrderJsonObjectSql(alias) {
  return `JSON_OBJECT(
    'orderId', ${alias}.\`order_id\`,
    'requestId', ${alias}.\`request_id\`,
    'providerId', ${alias}.\`provider_id\`,
    'status', ${alias}.\`status\`,
    'payerConfirmed', ${alias}.\`payer_confirmed\`,
    'providerConfirmed', ${alias}.\`provider_confirmed\`,
    'coinAmount', CAST(${alias}.\`coin_amount\` AS DOUBLE),
    'createdAt', DATE_FORMAT(${alias}.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z'),
    'updatedAt', DATE_FORMAT(${alias}.\`updated_at\`, '%Y-%m-%dT%H:%i:%s.000Z'),
    'completedAt', IF(${alias}.\`completed_at\` IS NULL, NULL, DATE_FORMAT(${alias}.\`completed_at\`, '%Y-%m-%dT%H:%i:%s.000Z'))
  )`;
}

function transactionLogJsonObjectSql(alias) {
  return `JSON_OBJECT(
    'logId', ${alias}.\`log_id\`,
    'userId', ${alias}.\`user_id\`,
    'orderId', ${alias}.\`order_id\`,
    'type', ${alias}.\`type\`,
    'amount', CAST(${alias}.\`amount\` AS DOUBLE),
    'balanceAfter', IF(${alias}.\`balance_after\` IS NULL, NULL, CAST(${alias}.\`balance_after\` AS DOUBLE)),
    'remark', ${alias}.\`remark\`,
    'createdAt', DATE_FORMAT(${alias}.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z')
  )`;
}

function walletTransactionJsonObjectSql(alias) {
  return `JSON_OBJECT(
    'logId', ${alias}.\`log_id\`,
    'userId', ${alias}.\`user_id\`,
    'orderId', ${alias}.\`order_id\`,
    'requestId', ${alias}.\`request_id\`,
    'disputeId', ${alias}.\`dispute_id\`,
    'type', ${alias}.\`type\`,
    'amount', ${alias}.\`amount\`,
    'balanceAfter', ${alias}.\`balance_after\`,
    'remark', ${alias}.\`remark\`,
    'relatedTitle', ${alias}.\`related_title\`,
    'businessType', ${alias}.\`business_type\`,
    'businessId', ${alias}.\`business_id\`,
    'createdAt', ${alias}.\`created_at\`
  )`;
}

function walletFreezeJsonObjectSql(alias) {
  return `JSON_OBJECT(
    'freezeId', ${alias}.\`freeze_id\`,
    'userId', ${alias}.\`user_id\`,
    'orderId', ${alias}.\`order_id\`,
    'requestId', ${alias}.\`request_id\`,
    'disputeId', ${alias}.\`dispute_id\`,
    'reasonType', ${alias}.\`reason_type\`,
    'status', ${alias}.\`status\`,
    'amount', ${alias}.\`amount\`,
    'reason', ${alias}.\`reason\`,
    'releaseCondition', ${alias}.\`release_condition\`,
    'relatedTitle', ${alias}.\`related_title\`,
    'businessType', ${alias}.\`business_type\`,
    'businessId', ${alias}.\`business_id\`,
    'timeline', JSON_ARRAY(),
    'createdAt', ${alias}.\`created_at\`,
    'releasedAt', ${alias}.\`released_at\`
  )`;
}

function notificationJsonObjectSql(alias) {
  return `JSON_OBJECT(
    'notificationId', ${alias}.\`notification_id\`,
    'userId', ${alias}.\`user_id\`,
    'type', ${alias}.\`type\`,
    'title', ${alias}.\`title\`,
    'content', ${alias}.\`content\`,
    'businessType', ${alias}.\`business_type\`,
    'businessId', ${alias}.\`business_id\`,
    'readAt', IF(${alias}.\`read_at\` IS NULL, NULL, DATE_FORMAT(${alias}.\`read_at\`, '%Y-%m-%dT%H:%i:%s.000Z')),
    'createdAt', DATE_FORMAT(${alias}.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z')
  )`;
}

function freezeReasonTypeSql() {
  return "IF(d.`dispute_id` IS NOT NULL, 'dispute', 'order')";
}

function freezeStatusSql() {
  return "CASE WHEN so.`status` = 'completed' THEN 'released' WHEN d.`dispute_id` IS NOT NULL THEN 'dispute' ELSE 'active' END";
}

function normalizeUser(user) {
  if (!user) {
    return null;
  }
  return {
    ...user,
    displayName: user.displayName ?? user.username,
    bio: user.bio ?? null,
    skillTags: parseSkillTags(user.skillTags),
    serviceCategories: parseSkillTags(user.serviceCategories)
  };
}

function normalizeWallet(wallet) {
  return wallet ?? null;
}

function normalizeCategory(category) {
  if (!category) {
    return null;
  }
  return {
    categoryId: Number(category.categoryId),
    parentId: category.parentId === undefined || category.parentId === null ? null : Number(category.parentId),
    name: String(category.name ?? ""),
    code: String(category.code ?? ""),
    description: normalizeOptionalString(category.description),
    sortOrder: Number(category.sortOrder ?? 0),
    status: Number(category.status ?? ACTIVE_STATUS),
    createdAt: category.createdAt ?? null,
    updatedAt: category.updatedAt ?? category.createdAt ?? null
  };
}

function normalizeServiceRequest(input) {
  return {
    requestId: Number(input.requestId),
    publisherId: Number(input.publisherId),
    categoryId: input.categoryId === undefined || input.categoryId === null ? null : Number(input.categoryId),
    title: String(input.title ?? ""),
    description: String(input.description ?? ""),
    location: normalizeOptionalString(input.location),
    estimatedHours: Number(input.estimatedHours ?? 0),
    coinAmount: Number(input.coinAmount ?? 0),
    status: String(input.status ?? "open"),
    tags: Array.isArray(input.tags) ? input.tags : [],
    visible: input.visible !== false && input.visible !== 0,
    createdAt: input.createdAt ?? null,
    updatedAt: input.updatedAt ?? input.createdAt ?? null,
    category: normalizeCategory(input.category)
  };
}

function normalizeServiceOrder(input) {
  if (!input) {
    return null;
  }
  return {
    orderId: Number(input.orderId),
    requestId: Number(input.requestId),
    providerId: Number(input.providerId),
    status: String(input.status ?? "accepted"),
    payerConfirmed: Boolean(input.payerConfirmed ?? input.payer_confirmed ?? false),
    providerConfirmed: Boolean(input.providerConfirmed ?? input.provider_confirmed ?? false),
    coinAmount: Number(input.coinAmount ?? input.coin_amount ?? 0),
    createdAt: input.createdAt ?? null,
    updatedAt: input.updatedAt ?? input.createdAt ?? null,
    completedAt: input.completedAt ?? input.completed_at ?? null
  };
}

function normalizeTransactionLog(input) {
  return {
    logId: Number(input.logId),
    userId: input.userId === undefined || input.userId === null ? null : Number(input.userId),
    orderId: input.orderId === undefined || input.orderId === null ? null : Number(input.orderId),
    type: String(input.type ?? ""),
    amount: Number(input.amount ?? 0),
    balanceAfter: input.balanceAfter === undefined || input.balanceAfter === null ? null : Number(input.balanceAfter),
    remark: normalizeOptionalString(input.remark),
    createdAt: input.createdAt ?? input.created_at ?? null
  };
}

function normalizeWalletTransaction(input) {
  return {
    logId: Number(input.logId),
    userId: input.userId === undefined || input.userId === null ? null : Number(input.userId),
    orderId: input.orderId === undefined || input.orderId === null ? null : Number(input.orderId),
    requestId: input.requestId === undefined || input.requestId === null ? null : Number(input.requestId),
    disputeId: input.disputeId === undefined || input.disputeId === null ? null : Number(input.disputeId),
    type: String(input.type ?? ""),
    amount: Number(input.amount ?? 0),
    balanceAfter: input.balanceAfter === undefined || input.balanceAfter === null ? null : Number(input.balanceAfter),
    remark: normalizeOptionalString(input.remark),
    relatedTitle: normalizeOptionalString(input.relatedTitle),
    businessType: normalizeOptionalString(input.businessType) ?? "system",
    businessId: input.businessId === undefined || input.businessId === null ? null : Number(input.businessId),
    createdAt: input.createdAt ?? null
  };
}

function normalizeWalletFreeze(input) {
  const freeze = {
    freezeId: Number(input.freezeId),
    userId: input.userId === undefined || input.userId === null ? null : Number(input.userId),
    orderId: input.orderId === undefined || input.orderId === null ? null : Number(input.orderId),
    requestId: input.requestId === undefined || input.requestId === null ? null : Number(input.requestId),
    disputeId: input.disputeId === undefined || input.disputeId === null ? null : Number(input.disputeId),
    reasonType: normalizeOptionalString(input.reasonType) ?? "order",
    status: normalizeOptionalString(input.status) ?? "active",
    amount: Number(input.amount ?? 0),
    reason: normalizeOptionalString(input.reason) ?? "订单时间币冻结",
    releaseCondition: normalizeOptionalString(input.releaseCondition) ?? "双方确认或平台处理后释放",
    relatedTitle: normalizeOptionalString(input.relatedTitle),
    businessType: normalizeOptionalString(input.businessType) ?? "order",
    businessId: input.businessId === undefined || input.businessId === null ? null : Number(input.businessId),
    timeline: Array.isArray(input.timeline) ? input.timeline : [],
    createdAt: input.createdAt ?? null,
    releasedAt: input.releasedAt ?? null
  };
  return {
    ...freeze,
    timeline: freeze.timeline.length > 0 ? freeze.timeline : freezeTimeline(freeze)
  };
}

function normalizeNotification(input) {
  if (!input) {
    return null;
  }
  const businessId = input.businessId ?? input.business_id;
  const notification = {
    notificationId: Number(input.notificationId),
    userId: Number(input.userId),
    type: String(input.type ?? "system"),
    title: String(input.title ?? ""),
    content: String(input.content ?? ""),
    businessType: normalizeOptionalString(input.businessType) ?? normalizeOptionalString(input.business_type),
    businessId: businessId === undefined || businessId === null ? null : Number(businessId),
    readAt: input.readAt ?? input.read_at ?? null,
    createdAt: input.createdAt ?? input.created_at ?? null
  };
  return {
    ...notification,
    isRead: Boolean(notification.readAt),
    href: notificationHref(notification.businessType ?? notification.type, notification.businessId)
  };
}

function normalizeConversation(input) {
  return {
    conversationId: String(input.conversationId ?? ""),
    type: String(input.type ?? "direct"),
    title: String(input.title ?? "邻帮用户"),
    participant: input.participant ?? null,
    orderId: input.orderId === undefined || input.orderId === null ? null : Number(input.orderId),
    preview: normalizeOptionalString(input.preview) ?? "",
    unreadCount: Number(input.unreadCount ?? 0),
    updatedAt: input.updatedAt ?? null,
    href: normalizeOptionalString(input.href)
  };
}

function parseSkillTags(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value !== "string" || !value.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeProfileExtra(input, fallback = {}) {
  const output = {};
  if (hasOwn(input, "displayName")) {
    output.displayName = normalizeOptionalString(input.displayName) ?? fallback.displayName ?? fallback.username;
  }
  if (hasOwn(input, "bio")) {
    output.bio = normalizeOptionalString(input.bio);
  }
  if (hasOwn(input, "serviceCategories")) {
    output.serviceCategories = Array.isArray(input.serviceCategories)
      ? input.serviceCategories.map((item) => String(item).trim()).filter(Boolean).slice(0, 20)
      : [];
  }
  return output;
}

function mergeProfileExtras(user, extra = null) {
  if (!user) {
    return null;
  }
  return {
    ...user,
    ...(extra ?? {}),
    displayName: extra?.displayName ?? user.displayName ?? user.username,
    bio: extra?.bio ?? user.bio ?? null,
    serviceCategories: extra?.serviceCategories ?? user.serviceCategories ?? deriveServiceCategories(user.skillTags)
  };
}

function normalizeReview(input) {
  return {
    reviewId: Number(input.reviewId),
    orderId: Number(input.orderId),
    reviewerId: Number(input.reviewerId),
    targetId: Number(input.targetId),
    direction: String(input.direction ?? ""),
    rating: Math.min(5, Math.max(1, Number(input.rating) || 1)),
    comment: normalizeOptionalString(input.comment),
    orderTitle: normalizeOptionalString(input.orderTitle),
    tags: Array.isArray(input.tags) ? input.tags : [],
    createdAt: input.createdAt ?? new Date().toISOString(),
    reviewer: input.reviewer ?? null,
    target: input.target ?? null
  };
}

function normalizeReviewTags(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  const tags = [];
  const seen = new Set();
  for (const item of value) {
    const tag = normalizeOptionalString(item);
    if (!tag || tag.length > 30) {
      continue;
    }
    const key = tag.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    tags.push(tag);
    seen.add(key);
    if (tags.length >= 8) {
      break;
    }
  }
  return tags;
}

function deriveServiceCategories(skillTags) {
  return Array.isArray(skillTags) ? skillTags.slice(0, 6) : [];
}

function normalizeSettings(input = {}) {
  return mergeSettings({
    notifications: {
      newMessages: true,
      interactions: true,
      orderStatus: true,
      announcements: false
    },
    privacy: {
      showCommunity: true,
      searchable: true,
      phoneVisible: false
    },
    preferences: {
      postVisibility: "nearby",
      language: "zh-CN",
      darkMode: "system"
    }
  }, input);
}

function mergeSettings(current, patch = {}) {
  return {
    notifications: {
      ...current.notifications,
      ...booleanPatch(patch.notifications, ["newMessages", "interactions", "orderStatus", "announcements"])
    },
    privacy: {
      ...current.privacy,
      ...booleanPatch(patch.privacy, ["showCommunity", "searchable", "phoneVisible"])
    },
    preferences: {
      ...current.preferences,
      ...preferencePatch(patch.preferences)
    }
  };
}

function booleanPatch(input, keys) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  const output = {};
  for (const key of keys) {
    if (hasOwn(input, key)) {
      output[key] = Boolean(input[key]);
    }
  }
  return output;
}

function preferencePatch(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  const output = {};
  if (hasOwn(input, "postVisibility")) {
    output.postVisibility = String(input.postVisibility || "nearby");
  }
  if (hasOwn(input, "language")) {
    output.language = String(input.language || "zh-CN");
  }
  if (hasOwn(input, "darkMode")) {
    output.darkMode = String(input.darkMode || "system");
  }
  return output;
}

function normalizeOptionalString(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const text = String(value).trim();
  return text ? text : null;
}

function hasOwn(input, key) {
  return Object.prototype.hasOwnProperty.call(input ?? {}, key);
}

function addTagCount(tagMap, rawTag, field) {
  const name = String(rawTag ?? "").trim();
  if (!name) {
    return;
  }
  const key = name.toLowerCase();
  const entry = tagMap.get(key) ?? {
    name,
    userCount: 0,
    requestCount: 0
  };
  entry[field] += 1;
  tagMap.set(key, entry);
}

function positiveInteger(raw, fallback) {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function notificationHref(type, id) {
  if (!id) {
    if (type === "wallet") {
      return "/wallet";
    }
    if (type === "ai") {
      return "/ai/assistant";
    }
    return null;
  }
  if (type === "order" || type === "review") {
    return `/orders/${encodeURIComponent(id)}`;
  }
  if (type === "dispute") {
    return `/disputes/${encodeURIComponent(id)}`;
  }
  if (type === "wallet") {
    return "/wallet";
  }
  if (type === "ai") {
    return "/ai/assistant";
  }
  return null;
}

function freezeTimeline(freeze) {
  const title = freeze.relatedTitle ?? "关联订单";
  if (freeze.status === "released") {
    return [
      { title: "冻结生效", detail: `${title} 冻结 ⏂${Number(freeze.amount || 0).toFixed(2)}`, createdAt: freeze.createdAt },
      { title: "冻结释放", detail: freeze.releaseCondition, createdAt: freeze.releasedAt }
    ];
  }
  return [
    { title: "冻结生效", detail: `${title} 冻结 ⏂${Number(freeze.amount || 0).toFixed(2)}`, createdAt: freeze.createdAt },
    { title: "预计释放", detail: freeze.releaseCondition, createdAt: null }
  ];
}

function sqlString(value) {
  return `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
}

function sqlNullableString(value) {
  if (value === undefined || value === null || value === "") {
    return "NULL";
  }
  return sqlString(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function throwAcceptFailure(result, providerId) {
  if (!result?.publisherId) {
    throw storeError("REQUEST_NOT_FOUND", "Service request was not found.");
  }
  if (Number(result.publisherId) === Number(providerId)) {
    throw storeError("SELF_ACCEPT_NOT_ALLOWED", "Publisher cannot accept their own request.");
  }
  if (result.requestStatus !== "open") {
    throw storeError("REQUEST_NOT_OPEN", "Only open requests can be accepted.");
  }
  throw storeError("REQUEST_ALREADY_ACCEPTED", "This request already has an order.");
}

function storeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
