import crypto from "node:crypto";
import { hashPassword } from "./password.mjs";

export const ACTIVE_STATUS = 1;
export const DISABLED_STATUS = 0;
export const INITIAL_TIME_COIN_BALANCE = 5;

export function createMemoryAuthStore(options = {}) {
  const users = new Map();
  const usernameIndex = new Map();
  const wallets = new Map();
  const sessions = new Map();
  let nextUserId = options.nextUserId ?? 10000;
  let nextWalletId = options.nextWalletId ?? 20000;

  for (const seedUser of options.seedUsers ?? defaultSeedUsers()) {
    insertSeedUser(seedUser);
  }

  return {
    createUserWithWallet,
    findUserByUsername,
    findUserById,
    findWalletByUserId,
    createSession,
    findSession,
    revokeSession
  };

  function createUserWithWallet(input) {
    const normalized = normalizeUsername(input.username);
    if (usernameIndex.has(normalized)) {
      const error = new Error("Username already exists.");
      error.code = "DUPLICATE_USERNAME";
      throw error;
    }

    const now = new Date().toISOString();
    const user = {
      userId: nextUserId,
      username: input.username.trim(),
      passwordHash: input.passwordHash,
      phone: normalizeOptionalString(input.phone),
      skillTags: normalizeSkillTags(input.skillTags),
      role: input.role ?? "user",
      status: input.status ?? ACTIVE_STATUS,
      createdAt: now,
      updatedAt: now
    };
    nextUserId += 1;

    const wallet = {
      walletId: nextWalletId,
      userId: user.userId,
      balance: Number(input.initialBalance ?? INITIAL_TIME_COIN_BALANCE),
      frozenBalance: 0,
      version: 0,
      createdAt: now,
      updatedAt: now
    };
    nextWalletId += 1;

    users.set(user.userId, user);
    usernameIndex.set(normalized, user.userId);
    wallets.set(user.userId, wallet);
    return { user: clone(user), wallet: clone(wallet) };
  }

  function findUserByUsername(username) {
    const userId = usernameIndex.get(normalizeUsername(username));
    return userId === undefined ? null : findUserById(userId);
  }

  function findUserById(userId) {
    const user = users.get(Number(userId));
    return user ? clone(user) : null;
  }

  function findWalletByUserId(userId) {
    const wallet = wallets.get(Number(userId));
    return wallet ? clone(wallet) : null;
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

  function insertSeedUser(seedUser) {
    const passwordHash = seedUser.passwordHash ?? hashPassword(seedUser.password);
    const { user } = createUserWithWallet({
      ...seedUser,
      passwordHash,
      initialBalance: seedUser.initialBalance ?? 0
    });
    if (seedUser.userId !== undefined) {
      const created = users.get(user.userId);
      users.delete(user.userId);
      usernameIndex.set(normalizeUsername(created.username), seedUser.userId);
      created.userId = seedUser.userId;
      users.set(created.userId, created);

      const wallet = wallets.get(user.userId);
      wallets.delete(user.userId);
      wallet.userId = created.userId;
      wallets.set(created.userId, wallet);
      nextUserId = Math.max(nextUserId, seedUser.userId + 1);
    }
  }
}

export function defaultSeedUsers() {
  return [
    {
      userId: 1001,
      username: "user_a",
      password: "user123456",
      role: "user",
      status: ACTIVE_STATUS,
      initialBalance: 120
    },
    {
      userId: 1004,
      username: "disabled_user",
      password: "user123456",
      role: "user",
      status: DISABLED_STATUS,
      initialBalance: 0
    },
    {
      userId: 9001,
      username: "admin_main",
      password: "admin123456",
      role: "admin",
      status: ACTIVE_STATUS,
      initialBalance: 0
    }
  ];
}

export function normalizeUsername(username) {
  return typeof username === "string" ? username.trim().toLowerCase() : "";
}

function normalizeOptionalString(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const text = String(value).trim();
  return text ? text : null;
}

function normalizeSkillTags(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item).trim()).filter(Boolean).slice(0, 20);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
