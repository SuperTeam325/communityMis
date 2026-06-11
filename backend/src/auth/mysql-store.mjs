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

  return {
    createUserWithWallet,
    findUserByUsername,
    findUserById,
    findWalletByUserId,
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
    return {
      user: normalizeUser(result.user),
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
    return normalizeUser(await mysqlJson(sql, { optional: true }));
  }

  async function findUserById(userId) {
    const sql = `
SELECT ${userJsonObjectSql("u")}
FROM \`user\` u
WHERE u.\`user_id\` = ${Number(userId)}
LIMIT 1;
`;
    return normalizeUser(await mysqlJson(sql, { optional: true }));
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
        const error = new Error("Username already exists.");
        error.code = "DUPLICATE_USERNAME";
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

function normalizeUser(user) {
  if (!user) {
    return null;
  }
  return {
    ...user,
    skillTags: parseSkillTags(user.skillTags)
  };
}

function normalizeWallet(wallet) {
  return wallet ?? null;
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
