import http from 'node:http';
import {
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual
} from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { URL, fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import pgPackage from 'pg';
import {
  buildRarityLevels,
  DEFAULT_RARITY_THRESHOLDS,
  getRarityByViewCount,
  RARITY_ORDER,
  rollRarity
} from '../shared/rarity.mjs';
import { generateDeterministicCardStats } from '../shared/card-stats.mjs';

const { Pool } = pgPackage;

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://wiki:wiki@localhost:5432/postgres';
const API_PORT = Number(process.env.PORT || process.env.API_PORT || 3001);
const FINAL_TABLE = process.env.WIKI_TABLE_NAME || 'wiki_articles';
const USERS_TABLE = process.env.USERS_TABLE_NAME || 'users';
const USER_ARTICLE_DROPS_TABLE = process.env.USER_ARTICLE_DROPS_TABLE_NAME || 'user_article_drops';
const BOSSES_TABLE = process.env.BOSSES_TABLE_NAME || 'bosses';
const BOSS_CARD_DEFEATS_TABLE =
  process.env.BOSS_CARD_DEFEATS_TABLE_NAME || 'boss_card_defeats';
const MAX_RARITY_ROLL_ATTEMPTS = 25;
const ARTICLES_PAGE_LIMIT_DEFAULT = Number(process.env.ARTICLES_PAGE_LIMIT_DEFAULT || 60);
const ARTICLES_PAGE_LIMIT_MAX = Number(process.env.ARTICLES_PAGE_LIMIT_MAX || 200);
const ADMIN_USER_SEARCH_LIMIT_DEFAULT = Number(process.env.ADMIN_USER_SEARCH_LIMIT_DEFAULT || 12);
const ADMIN_USER_SEARCH_LIMIT_MAX = Number(process.env.ADMIN_USER_SEARCH_LIMIT_MAX || 30);
const ARTICLE_STATS_COLUMNS = ['hp', 'stamina', 'strength', 'dexterity', 'intelligence', 'charisma'];
const COMBAT_STAT_KEYS = ['strength', 'dexterity', 'intelligence', 'charisma', 'stamina'];
const BOSS_TEAM_SIZE = 5;
const BOSS_HP_MULTIPLIER = Number(process.env.BOSS_HP_MULTIPLIER || 10);
const AUTH_TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET || 'dev-only-change-me';
const AUTH_TOKEN_TTL_SECONDS = Number(process.env.AUTH_TOKEN_TTL_SECONDS || 60 * 60 * 24 * 7);
const MIN_PASSWORD_LENGTH = 6;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_SALT_BYTES = 16;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.resolve(__dirname, '../dist');
const STATIC_CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

const pool = new Pool({
  connectionString: DATABASE_URL
});
const scrypt = promisify(scryptCallback);
let hasArticleStatsColumnsCache = null;
let hasUserArticleDropsTableCache = false;
let hasBossesTableCache = false;
let hasBossCardDefeatsTableCache = false;

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
  }
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
  });
  response.end(JSON.stringify(payload));
}

function sendNoContent(response) {
  response.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
  });
  response.end();
}

function sendStatic(response, statusCode, body, contentType) {
  response.writeHead(statusCode, {
    'Content-Type': contentType,
    'Cache-Control': contentType.includes('text/html') ? 'no-cache' : 'public, max-age=3600'
  });
  response.end(body);
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getStaticContentType(filePath) {
  return STATIC_CONTENT_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

async function resolveStaticFile(pathname) {
  const normalizedPathname = pathname === '/' ? '/index.html' : pathname;
  const sanitizedPath = path
    .normalize(normalizedPathname)
    .replace(/^(\.\.(\/|\\|$))+/, '')
    .replace(/^\/+/, '');
  const absolutePath = path.resolve(DIST_DIR, sanitizedPath);

  if (absolutePath !== DIST_DIR && !absolutePath.startsWith(`${DIST_DIR}${path.sep}`)) {
    return null;
  }

  try {
    const fileStats = await stat(absolutePath);
    if (!fileStats.isFile()) {
      return null;
    }

    return absolutePath;
  } catch {
    return null;
  }
}

async function tryServeFrontend(request, response, url) {
  if (!['GET', 'HEAD'].includes(request.method || '')) {
    return false;
  }

  if (url.pathname.startsWith('/api/')) {
    return false;
  }

  const requestedFile = await resolveStaticFile(url.pathname);
  const shouldFallbackToIndex = path.extname(url.pathname) === '';
  const filePath =
    requestedFile || (shouldFallbackToIndex ? await resolveStaticFile('/index.html') : null);

  if (!filePath) {
    return false;
  }

  const contentType = getStaticContentType(filePath);
  const body = request.method === 'HEAD' ? '' : await readFile(filePath);
  sendStatic(response, 200, body, contentType);
  return true;
}

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function normalizeUsername(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizePassword(value) {
  return typeof value === 'string' ? value : '';
}

function toBase64Url(value) {
  return Buffer.from(value).toString('base64url');
}

function fromBase64Url(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function createTokenSignature(encodedHeader, encodedPayload) {
  return createHmac('sha256', AUTH_TOKEN_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');
}

function createAuthToken(user) {
  const header = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = toBase64Url(
    JSON.stringify({
      sub: user.id,
      username: user.username,
      email: user.email,
      isAdmin: user.isAdmin,
      exp: Math.floor(Date.now() / 1000) + AUTH_TOKEN_TTL_SECONDS
    })
  );
  const signature = createTokenSignature(header, payload);

  return `${header}.${payload}.${signature}`;
}

function verifyAuthToken(token) {
  if (!token || typeof token !== 'string') {
    return null;
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  const [header, payload, signature] = parts;
  const expectedSignature = createTokenSignature(header, payload);
  const actualBuffer = Buffer.from(signature, 'base64url');
  const expectedBuffer = Buffer.from(expectedSignature, 'base64url');

  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const parsedPayload = JSON.parse(fromBase64Url(payload));

    if (!parsedPayload.exp || parsedPayload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return parsedPayload;
  } catch {
    return null;
  }
}

function getBearerToken(request) {
  const authorization = request.headers.authorization;

  if (!authorization || !authorization.startsWith('Bearer ')) {
    return null;
  }

  return authorization.slice('Bearer '.length).trim();
}

async function hashPassword(password) {
  const salt = randomBytes(SCRYPT_SALT_BYTES).toString('hex');
  const derivedKey = await scrypt(password, salt, SCRYPT_KEY_LENGTH);

  return `scrypt:${salt}:${Buffer.from(derivedKey).toString('hex')}`;
}

async function verifyPassword(password, passwordHash) {
  const [algorithm, salt, expectedHex] = String(passwordHash).split(':');
  if (algorithm !== 'scrypt' || !salt || !expectedHex) {
    return false;
  }

  const expectedBuffer = Buffer.from(expectedHex, 'hex');
  const actualBuffer = Buffer.from(await scrypt(password, salt, expectedBuffer.length));

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}

function serializeUser(row) {
  return {
    id: Number(row.id),
    username: row.username,
    email: row.email,
    isAdmin: Boolean(row.is_admin),
    createdAt: row.created_at
  };
}

function buildAuthResponse(row) {
  const user = serializeUser(row);
  const token = createAuthToken(user);

  return {
    token,
    user
  };
}

async function findUserByLogin(login) {
  const result = await pool.query(
    `
      SELECT id, username, email, password_hash, is_admin, created_at
      FROM ${USERS_TABLE}
      WHERE LOWER(email) = LOWER($1)
         OR LOWER(username) = LOWER($1)
      LIMIT 1
    `,
    [login]
  );

  return result.rows[0] || null;
}

async function findUserById(id) {
  const result = await pool.query(
    `
      SELECT id, username, email, password_hash, is_admin, created_at
      FROM ${USERS_TABLE}
      WHERE id = $1
      LIMIT 1
    `,
    [id]
  );

  return result.rows[0] || null;
}

function validateRegistrationInput(body) {
  const username = normalizeUsername(body.username);
  const email = normalizeEmail(body.email);
  const password = normalizePassword(body.password);

  if (username.length < 3) {
    throw new HttpError(400, 'Username must be at least 3 characters long.');
  }

  if (username.length > 50) {
    throw new HttpError(400, 'Username must be 50 characters or fewer.');
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, 'Email is invalid.');
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new HttpError(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
  }

  return {
    username,
    email,
    password
  };
}

function validateLoginInput(body) {
  const login = normalizeUsername(body.login || body.email || body.username);
  const password = normalizePassword(body.password);

  if (!login) {
    throw new HttpError(400, 'Login is required.');
  }

  if (!password) {
    throw new HttpError(400, 'Password is required.');
  }

  return {
    login,
    password
  };
}

async function registerUser(body) {
  const { username, email, password } = validateRegistrationInput(body);
  const passwordHash = await hashPassword(password);

  try {
    const result = await pool.query(
      `
        INSERT INTO ${USERS_TABLE} (username, email, password_hash, is_admin)
        VALUES ($1, $2, $3, FALSE)
        RETURNING id, username, email, password_hash, is_admin, created_at
      `,
      [username, email, passwordHash]
    );

    return buildAuthResponse(result.rows[0]);
  } catch (error) {
    if (error?.code === '23505') {
      if (error.constraint === 'users_email_key') {
        throw new HttpError(409, 'Email is already registered.');
      }

      if (error.constraint === 'users_username_key') {
        throw new HttpError(409, 'Username is already taken.');
      }

      throw new HttpError(409, 'User already exists.');
    }

    throw error;
  }
}

async function loginUser(body) {
  const { login, password } = validateLoginInput(body);
  const user = await findUserByLogin(login);

  if (!user) {
    throw new HttpError(401, 'Invalid login or password.');
  }

  const isPasswordValid = await verifyPassword(password, user.password_hash);
  if (!isPasswordValid) {
    throw new HttpError(401, 'Invalid login or password.');
  }

  return buildAuthResponse(user);
}

async function getCurrentUser(request) {
  const token = getBearerToken(request);
  if (!token) {
    throw new HttpError(401, 'Authorization token is required.');
  }

  const payload = verifyAuthToken(token);
  if (!payload?.sub) {
    throw new HttpError(401, 'Authorization token is invalid or expired.');
  }

  const user = await findUserById(payload.sub);
  if (!user) {
    throw new HttpError(401, 'User not found.');
  }

  return serializeUser(user);
}

async function getOptionalCurrentUser(request) {
  const token = getBearerToken(request);
  if (!token) {
    return null;
  }

  const payload = verifyAuthToken(token);
  if (!payload?.sub) {
    return null;
  }

  const user = await findUserById(payload.sub);
  if (!user) {
    return null;
  }

  return serializeUser(user);
}

function assertAdminUser(user) {
  if (!user?.isAdmin) {
    throw new HttpError(403, 'Требуются права администратора.');
  }
}

function normalizeExcludedTitles(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
    )
  ).slice(0, 500);
}

async function hasArticleStatsColumns() {
  if (hasArticleStatsColumnsCache !== null) {
    return hasArticleStatsColumnsCache;
  }

  const result = await pool.query(
    `
      SELECT COUNT(*)::INTEGER AS count
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = ANY($2::text[])
    `,
    [FINAL_TABLE, ARTICLE_STATS_COLUMNS]
  );

  hasArticleStatsColumnsCache = Number(result.rows[0].count) === ARTICLE_STATS_COLUMNS.length;
  return hasArticleStatsColumnsCache;
}

async function ensureUserArticleDropsTable() {
  if (hasUserArticleDropsTableCache) {
    return;
  }

  await pool.query(
    `
      CREATE TABLE IF NOT EXISTS ${USER_ARTICLE_DROPS_TABLE} (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES ${USERS_TABLE}(id) ON DELETE CASCADE,
        article_id BIGINT NOT NULL REFERENCES ${FINAL_TABLE}(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
  );

  await Promise.all([
    pool.query(
      `
        CREATE INDEX IF NOT EXISTS ${USER_ARTICLE_DROPS_TABLE}_user_created_idx
        ON ${USER_ARTICLE_DROPS_TABLE} (user_id, created_at DESC)
      `
    ),
    pool.query(
      `
        CREATE INDEX IF NOT EXISTS ${USER_ARTICLE_DROPS_TABLE}_user_article_idx
        ON ${USER_ARTICLE_DROPS_TABLE} (user_id, article_id)
      `
    )
  ]);

  hasUserArticleDropsTableCache = true;
}

async function ensureBossesTable() {
  if (hasBossesTableCache) {
    return;
  }

  await pool.query(
    `
      CREATE TABLE IF NOT EXISTS ${BOSSES_TABLE} (
        id BIGSERIAL PRIMARY KEY,
        boss_article_id BIGINT NOT NULL REFERENCES ${FINAL_TABLE}(id) ON DELETE CASCADE,
        remaining_hp INTEGER NOT NULL CHECK (remaining_hp >= 0),
        status TEXT NOT NULL CHECK (status IN ('alive', 'defeated'))
      )
    `
  );

  await pool.query(
    `
      CREATE INDEX IF NOT EXISTS ${BOSSES_TABLE}_status_id_idx
      ON ${BOSSES_TABLE} (status, id DESC)
    `
  );

  hasBossesTableCache = true;
}

async function ensureBossCardDefeatsTable() {
  if (hasBossCardDefeatsTableCache) {
    return;
  }

  await ensureBossesTable();

  await pool.query(
    `
      CREATE TABLE IF NOT EXISTS ${BOSS_CARD_DEFEATS_TABLE} (
        id BIGSERIAL PRIMARY KEY,
        boss_id BIGINT NOT NULL REFERENCES ${BOSSES_TABLE}(id) ON DELETE CASCADE,
        user_id BIGINT NOT NULL REFERENCES ${USERS_TABLE}(id) ON DELETE CASCADE,
        article_id BIGINT NOT NULL REFERENCES ${FINAL_TABLE}(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (boss_id, user_id, article_id)
      )
    `
  );

  await Promise.all([
    pool.query(
      `
        CREATE INDEX IF NOT EXISTS ${BOSS_CARD_DEFEATS_TABLE}_boss_user_created_idx
        ON ${BOSS_CARD_DEFEATS_TABLE} (boss_id, user_id, created_at DESC)
      `
    ),
    pool.query(
      `
        CREATE INDEX IF NOT EXISTS ${BOSS_CARD_DEFEATS_TABLE}_boss_article_idx
        ON ${BOSS_CARD_DEFEATS_TABLE} (boss_id, article_id)
      `
    )
  ]);

  hasBossCardDefeatsTableCache = true;
}

function buildArticleStatsProjection(includeStatsColumns) {
  if (includeStatsColumns) {
    return ARTICLE_STATS_COLUMNS.join(', ');
  }

  return ARTICLE_STATS_COLUMNS.map((column) => `NULL::INTEGER AS ${column}`).join(', ');
}

function buildArticleStatsProjectionForAlias(includeStatsColumns, alias) {
  if (includeStatsColumns) {
    return ARTICLE_STATS_COLUMNS.map((column) => `${alias}.${column} AS ${column}`).join(', ');
  }

  return buildArticleStatsProjection(false);
}

function buildArticleStatsGroupByColumns(includeStatsColumns, alias) {
  if (!includeStatsColumns) {
    return [];
  }

  return ARTICLE_STATS_COLUMNS.map((column) => `${alias}.${column}`);
}

function buildArticleStats(row) {
  if (
    row.hp === null ||
    row.stamina === null ||
    row.strength === null ||
    row.dexterity === null ||
    row.intelligence === null ||
    row.charisma === null
  ) {
    return null;
  }

  return {
    hp: Number(row.hp),
    stamina: Number(row.stamina),
    strength: Number(row.strength),
    dexterity: Number(row.dexterity),
    intelligence: Number(row.intelligence),
    charisma: Number(row.charisma)
  };
}

function resolveArticleCombatProfile(row, rarityLevels, forcedRarity = null) {
  const viewCount = Number(row.view_count);
  const rarity = forcedRarity || getRarityByViewCount(viewCount, rarityLevels);
  const stats = buildArticleStats(row) || generateDeterministicCardStats(rarity, row.id);

  return {
    rarity,
    stats
  };
}

function getStrongestCombatStat(stats) {
  let strongestKey = COMBAT_STAT_KEYS[0];
  let strongestValue = Number(stats?.[strongestKey] || 0);

  for (const key of COMBAT_STAT_KEYS.slice(1)) {
    const value = Number(stats?.[key] || 0);
    if (value > strongestValue) {
      strongestKey = key;
      strongestValue = value;
    }
  }

  return {
    key: strongestKey,
    value: strongestValue
  };
}

function buildBossMaxHp(stats) {
  return Math.max(1, Math.round(Number(stats?.hp || 0) * BOSS_HP_MULTIPLIER));
}

function serializeArticleRow(row, rarityLevels, forcedRarity = null) {
  const viewCount = Number(row.view_count);
  const rarity = forcedRarity || getRarityByViewCount(viewCount, rarityLevels);
  const article = {
    id: Number(row.id),
    title: row.title,
    viewCount,
    rarity,
    stats: buildArticleStats(row)
  };

  if (row.drop_count !== undefined) {
    article.dropCount = Number(row.drop_count);
  }

  if (row.last_dropped_at) {
    article.lastDroppedAt = row.last_dropped_at;
  }

  return article;
}

function normalizeArticleSearch(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeArticleRarity(value) {
  return value && RARITY_ORDER.includes(value) ? value : '';
}

function normalizeAdminUserSearch(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function buildArticlesWhereClause(search, rarity, rarityLevels, values, tableAlias = '') {
  const prefix = tableAlias ? `${tableAlias}.` : '';
  const clauses = [];

  if (search) {
    values.push(`%${search}%`);
    clauses.push(`${prefix}title ILIKE $${values.length}`);
  }

  if (rarity) {
    const level = rarityLevels[rarity];
    values.push(level.min);
    clauses.push(`${prefix}view_count >= $${values.length}`);

    if (Number.isFinite(level.max)) {
      values.push(level.max);
      clauses.push(`${prefix}view_count <= $${values.length}`);
    }
  }

  if (clauses.length === 0) {
    return '';
  }

  return `WHERE ${clauses.join(' AND ')}`;
}

function buildRaritySortClause(rarityLevels) {
  const cases = RARITY_ORDER.map((rarity, index) => {
    const level = rarityLevels[rarity];
    const maxClause = Number.isFinite(level.max) ? ` AND view_count <= ${Number(level.max)}` : '';

    return `WHEN view_count >= ${Number(level.min)}${maxClause} THEN ${index}`;
  }).join(' ');

  return `CASE ${cases} ELSE ${RARITY_ORDER.length} END ASC, view_count DESC, title ASC`;
}

async function loadRandomArticleByRarity(rarity, excludedTitles, rarityLevels) {
  const includeStatsColumns = await hasArticleStatsColumns();
  const level = rarityLevels[rarity];
  const values = [level.min];
  let parameterIndex = 2;
  let maxClause = '';
  let excludedClause = '';

  if (Number.isFinite(level.max)) {
    maxClause = `AND view_count <= $${parameterIndex}`;
    values.push(level.max);
    parameterIndex += 1;
  }

  if (excludedTitles.length > 0) {
    excludedClause = `AND title <> ALL($${parameterIndex}::text[])`;
    values.push(excludedTitles);
  }

  const result = await pool.query(
    `
      SELECT id, title, view_count, ${buildArticleStatsProjection(includeStatsColumns)}
      FROM ${FINAL_TABLE}
      WHERE view_count >= $1
      ${maxClause}
      ${excludedClause}
      ORDER BY random()
      LIMIT 1
    `,
    values
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return serializeArticleRow(row, rarityLevels, rarity);
}

async function loadPackArticles(count, excludedTitles, rarityLevels) {
  const safeCount = clamp(Number(count) || 5, 1, 30);
  const usedTitles = [...excludedTitles];
  const cards = [];

  for (let index = 0; index < safeCount; index += 1) {
    let article = null;

    for (let attempt = 0; attempt < MAX_RARITY_ROLL_ATTEMPTS; attempt += 1) {
      const rarity = rollRarity();
      article = await loadRandomArticleByRarity(rarity, usedTitles, rarityLevels);

      if (article) {
        usedTitles.push(article.title);
        cards.push(article);
        break;
      }
    }

    if (!article) {
      break;
    }
  }

  return cards;
}

async function recordUserPackDrops(userId, cards) {
  if (!userId || !Array.isArray(cards) || cards.length === 0) {
    return;
  }

  await ensureUserArticleDropsTable();

  const values = [];
  const placeholders = cards.map((card, index) => {
    const baseIndex = index * 2;
    values.push(userId, Number(card.id));
    return `($${baseIndex + 1}, $${baseIndex + 2})`;
  });

  await pool.query(
    `
      INSERT INTO ${USER_ARTICLE_DROPS_TABLE} (user_id, article_id)
      VALUES ${placeholders.join(', ')}
    `,
    values
  );
}

async function loadAdminUsers(search, limit) {
  const normalizedSearch = normalizeAdminUserSearch(search);
  const safeLimit = clamp(
    Number(limit) || ADMIN_USER_SEARCH_LIMIT_DEFAULT,
    1,
    ADMIN_USER_SEARCH_LIMIT_MAX
  );

  if (!normalizedSearch) {
    return {
      users: [],
      total: 0,
      search: ''
    };
  }

  const values = [`%${normalizedSearch}%`, safeLimit];
  const result = await pool.query(
    `
      SELECT id, username, email, password_hash, is_admin, created_at
      FROM ${USERS_TABLE}
      WHERE username ILIKE $1
      ORDER BY username ASC
      LIMIT $2
    `,
    values
  );

  return {
    users: result.rows.map((row) => serializeUser(row)),
    total: result.rows.length,
    search: normalizedSearch
  };
}

async function grantArticleToUser(targetUserId, articleId, rarityLevels) {
  const safeUserId = Number(targetUserId);
  const safeArticleId = Number(articleId);

  if (!Number.isInteger(safeUserId) || safeUserId <= 0) {
    throw new HttpError(400, 'User id is invalid.');
  }

  if (!Number.isInteger(safeArticleId) || safeArticleId <= 0) {
    throw new HttpError(400, 'Article id is invalid.');
  }

  await ensureUserArticleDropsTable();

  const includeStatsColumns = await hasArticleStatsColumns();
  const [user, articleResult] = await Promise.all([
    findUserById(safeUserId),
    pool.query(
      `
        SELECT
          id,
          title,
          view_count,
          ${buildArticleStatsProjection(includeStatsColumns)}
        FROM ${FINAL_TABLE}
        WHERE id = $1
        LIMIT 1
      `,
      [safeArticleId]
    )
  ]);

  if (!user) {
    throw new HttpError(404, 'User not found.');
  }

  const articleRow = articleResult.rows[0];
  if (!articleRow) {
    throw new HttpError(404, 'Article not found.');
  }

  await pool.query(
    `
      INSERT INTO ${USER_ARTICLE_DROPS_TABLE} (user_id, article_id)
      VALUES ($1, $2)
    `,
    [safeUserId, safeArticleId]
  );

  return {
    user: serializeUser(user),
    article: serializeArticleRow(articleRow, rarityLevels)
  };
}

async function replaceCurrentBoss(articleId, rarityLevels) {
  const safeArticleId = Number(articleId);

  if (!Number.isInteger(safeArticleId) || safeArticleId <= 0) {
    throw new HttpError(400, 'Article id is invalid.');
  }

  await ensureBossesTable();

  const includeStatsColumns = await hasArticleStatsColumns();
  const articleRow = await loadArticleRowById(safeArticleId, includeStatsColumns);

  if (!articleRow) {
    throw new HttpError(404, 'Article not found.');
  }

  const { stats } = resolveArticleCombatProfile(articleRow, rarityLevels);
  const createResult = await pool.query(
    `
      INSERT INTO ${BOSSES_TABLE} (boss_article_id, remaining_hp, status)
      VALUES ($1, $2, 'alive')
      RETURNING id, boss_article_id, remaining_hp, status
    `,
    [safeArticleId, buildBossMaxHp(stats)]
  );

  return serializeBossState(createResult.rows[0], articleRow, rarityLevels);
}

function serializeBossState(bossRow, articleRow, rarityLevels) {
  const baseArticle = serializeArticleRow(articleRow, rarityLevels);
  const { rarity, stats } = resolveArticleCombatProfile(articleRow, rarityLevels);
  const maxHp = buildBossMaxHp(stats);

  return {
    ...baseArticle,
    rarity,
    stats,
    bossRecordId: Number(bossRow.id),
    remainingHp: Number(bossRow.remaining_hp),
    maxHp,
    status: bossRow.status
  };
}

async function loadArticleRowById(articleId, includeStatsColumns, db = pool) {
  const result = await db.query(
    `
      SELECT
        id,
        title,
        view_count,
        ${buildArticleStatsProjection(includeStatsColumns)}
      FROM ${FINAL_TABLE}
      WHERE id = $1
      LIMIT 1
    `,
    [articleId]
  );

  return result.rows[0] || null;
}

async function pickRandomDivineArticleRow(rarityLevels, includeStatsColumns, db = pool) {
  const result = await db.query(
    `
      SELECT
        id,
        title,
        view_count,
        ${buildArticleStatsProjection(includeStatsColumns)}
      FROM ${FINAL_TABLE}
      WHERE view_count >= $1
      ORDER BY random()
      LIMIT 1
    `,
    [rarityLevels.divine.min]
  );

  return result.rows[0] || null;
}

async function getOrCreateCurrentBoss(rarityLevels) {
  await ensureBossesTable();

  const includeStatsColumns = await hasArticleStatsColumns();
  let bossResult = await pool.query(
    `
      SELECT id, boss_article_id, remaining_hp, status
      FROM ${BOSSES_TABLE}
      ORDER BY id DESC
      LIMIT 1
    `
  );

  let bossRow = bossResult.rows[0] || null;
  let articleRow =
    bossRow && bossRow.status !== 'defeated'
      ? await loadArticleRowById(bossRow.boss_article_id, includeStatsColumns)
      : null;

  if (!bossRow || bossRow.status === 'defeated' || !articleRow) {
    const randomBossArticle = await pickRandomDivineArticleRow(rarityLevels, includeStatsColumns);

    if (!randomBossArticle) {
      throw new HttpError(404, 'Не удалось подобрать божественного босса.');
    }

    const { stats } = resolveArticleCombatProfile(randomBossArticle, rarityLevels, 'divine');
    const createResult = await pool.query(
      `
        INSERT INTO ${BOSSES_TABLE} (boss_article_id, remaining_hp, status)
        VALUES ($1, $2, 'alive')
        RETURNING id, boss_article_id, remaining_hp, status
      `,
      [randomBossArticle.id, buildBossMaxHp(stats)]
    );

    bossRow = createResult.rows[0];
    articleRow = randomBossArticle;
  }

  return serializeBossState(bossRow, articleRow, rarityLevels);
}

async function loadBossDefeatedArticleIds(userId, bossId, db = pool) {
  const safeUserId = Number(userId);
  const safeBossId = Number(bossId);

  if (!Number.isInteger(safeUserId) || safeUserId <= 0) {
    return [];
  }

  if (!Number.isInteger(safeBossId) || safeBossId <= 0) {
    return [];
  }

  await ensureBossCardDefeatsTable();

  const result = await db.query(
    `
      SELECT article_id
      FROM ${BOSS_CARD_DEFEATS_TABLE}
      WHERE boss_id = $1
        AND user_id = $2
      ORDER BY created_at ASC, article_id ASC
    `,
    [safeBossId, safeUserId]
  );

  return result.rows.map((row) => Number(row.article_id));
}

async function performBossBattle(userId, selectedArticleIds, rarityLevels) {
  await ensureBossesTable();
  await ensureUserArticleDropsTable();
  await ensureBossCardDefeatsTable();

  const uniqueArticleIds = Array.from(
    new Set(
      Array.isArray(selectedArticleIds)
        ? selectedArticleIds
            .map((value) => Number(value))
            .filter((value) => Number.isInteger(value) && value > 0)
        : []
    )
  );

  if (uniqueArticleIds.length !== BOSS_TEAM_SIZE) {
    throw new HttpError(400, `Нужно выбрать ровно ${BOSS_TEAM_SIZE} разных карт.`);
  }

  const includeStatsColumns = await hasArticleStatsColumns();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    let bossResult = await client.query(
      `
        SELECT id, boss_article_id, remaining_hp, status
        FROM ${BOSSES_TABLE}
        ORDER BY id DESC
        LIMIT 1
        FOR UPDATE
      `
    );

    let bossRow = bossResult.rows[0] || null;
    let bossArticleRow =
      bossRow && bossRow.status !== 'defeated'
        ? await loadArticleRowById(bossRow.boss_article_id, includeStatsColumns, client)
        : null;

    if (!bossRow || bossRow.status === 'defeated' || !bossArticleRow) {
      const randomBossArticle = await pickRandomDivineArticleRow(rarityLevels, includeStatsColumns, client);

      if (!randomBossArticle) {
        throw new HttpError(404, 'Не удалось подобрать божественного босса.');
      }

      const { stats } = resolveArticleCombatProfile(randomBossArticle, rarityLevels, 'divine');
      const createdBoss = await client.query(
        `
          INSERT INTO ${BOSSES_TABLE} (boss_article_id, remaining_hp, status)
          VALUES ($1, $2, 'alive')
          RETURNING id, boss_article_id, remaining_hp, status
        `,
        [randomBossArticle.id, buildBossMaxHp(stats)]
      );

      bossRow = createdBoss.rows[0];
      bossArticleRow = randomBossArticle;
    }

    const fightersResult = await client.query(
      `
        SELECT
          a.id,
          a.title,
          a.view_count,
          ${buildArticleStatsProjectionForAlias(includeStatsColumns, 'a')}
        FROM ${USER_ARTICLE_DROPS_TABLE} d
        JOIN ${FINAL_TABLE} a ON a.id = d.article_id
        WHERE d.user_id = $1
          AND a.id = ANY($2::bigint[])
        GROUP BY a.id, a.title, a.view_count${buildArticleStatsGroupByColumns(includeStatsColumns, 'a').length ? `, ${buildArticleStatsGroupByColumns(includeStatsColumns, 'a').join(', ')}` : ''}
      `,
      [userId, uniqueArticleIds]
    );

    if (fightersResult.rows.length !== BOSS_TEAM_SIZE) {
      throw new HttpError(400, 'Все выбранные карты должны быть в твоей коллекции.');
    }

    const defeatedArticleIdsBeforeBattle = await loadBossDefeatedArticleIds(
      userId,
      Number(bossRow.id),
      client
    );
    const defeatedArticleIdsBeforeBattleSet = new Set(defeatedArticleIdsBeforeBattle);

    if (uniqueArticleIds.some((articleId) => defeatedArticleIdsBeforeBattleSet.has(articleId))) {
      throw new HttpError(
        400,
        'Карты, павшие против текущего босса, нельзя отправлять на него повторно.'
      );
    }

    const fightersById = new Map(
      fightersResult.rows.map((row) => {
        const article = serializeArticleRow(row, rarityLevels);
        const { rarity, stats } = resolveArticleCombatProfile(row, rarityLevels, article.rarity);

        return [
          Number(row.id),
          {
            id: Number(row.id),
            title: row.title,
            rarity,
            stats,
            maxHp: Number(stats.hp || 0),
            currentHp: Number(stats.hp || 0)
          }
        ];
      })
    );

    const fighters = uniqueArticleIds.map((articleId) => fightersById.get(articleId));

    const bossArticle = serializeArticleRow(bossArticleRow, rarityLevels);
    const bossProfile = resolveArticleCombatProfile(bossArticleRow, rarityLevels);
    const boss = {
      id: bossArticle.id,
      title: bossArticle.title,
      rarity: bossProfile.rarity,
      stats: bossProfile.stats,
      maxHp: buildBossMaxHp(bossProfile.stats),
      currentHp: Number(bossRow.remaining_hp)
    };

    const rounds = [];
    let turn = 1;

    while (boss.currentHp > 0 && fighters.some((fighter) => fighter.currentHp > 0)) {
      const aliveBeforeAttack = fighters.filter((fighter) => fighter.currentHp > 0);
      const bossAttack = getStrongestCombatStat(boss.stats);
      const bossTarget = aliveBeforeAttack[Math.floor(Math.random() * aliveBeforeAttack.length)];
      const targetDefense = Number(bossTarget.stats?.[bossAttack.key] || 0);
      const damageToTarget = Math.max(0, bossAttack.value - targetDefense);
      bossTarget.currentHp = Math.max(0, bossTarget.currentHp - damageToTarget);

      const round = {
        turn,
        bossAttack: {
          targetId: bossTarget.id,
          attackerTitle: boss.title,
          targetTitle: bossTarget.title,
          statKey: bossAttack.key,
          attackValue: bossAttack.value,
          defenseValue: targetDefense,
          damage: damageToTarget,
          targetRemainingHp: bossTarget.currentHp
        },
        playerAttacks: []
      };

      const aliveAttackers = fighters.filter((fighter) => fighter.currentHp > 0);

      if (aliveAttackers.length === 0) {
        rounds.push(round);
        break;
      }

      for (const attacker of aliveAttackers) {
        if (boss.currentHp <= 0) {
          break;
        }

        const strongestAttack = getStrongestCombatStat(attacker.stats);
        const bossDefenseValue = Number(boss.stats?.[strongestAttack.key] || 0);
        const damage = Math.max(0, strongestAttack.value - bossDefenseValue);

        boss.currentHp = Math.max(0, boss.currentHp - damage);
        round.playerAttacks.push({
          articleId: attacker.id,
          title: attacker.title,
          targetTitle: boss.title,
          statKey: strongestAttack.key,
          attackValue: strongestAttack.value,
          defenseValue: bossDefenseValue,
          damage,
          bossRemainingHp: boss.currentHp
        });
      }

      rounds.push(round);
      turn += 1;
    }

    const isVictory = boss.currentHp <= 0;
    const finalStatus = isVictory ? 'defeated' : 'alive';

    await client.query(
      `
        UPDATE ${BOSSES_TABLE}
        SET remaining_hp = $1,
            status = $2
        WHERE id = $3
      `,
      [boss.currentHp, finalStatus, bossRow.id]
    );

    const defeatedFighters = fighters.filter((fighter) => fighter.currentHp <= 0);

    if (defeatedFighters.length > 0) {
      const values = [];
      const placeholders = defeatedFighters.map((fighter, index) => {
        const baseIndex = index * 3;
        values.push(Number(bossRow.id), Number(userId), fighter.id);
        return `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3})`;
      });

      await client.query(
        `
          INSERT INTO ${BOSS_CARD_DEFEATS_TABLE} (boss_id, user_id, article_id)
          VALUES ${placeholders.join(', ')}
          ON CONFLICT (boss_id, user_id, article_id) DO NOTHING
        `,
        values
      );
    }

    const unavailableArticleIds =
      finalStatus === 'alive'
        ? await loadBossDefeatedArticleIds(userId, Number(bossRow.id), client)
        : [];

    if (isVictory) {
      await client.query(
        `
          INSERT INTO ${USER_ARTICLE_DROPS_TABLE} (user_id, article_id)
          VALUES ($1, $2)
        `,
        [userId, boss.id]
      );
    }

    await client.query('COMMIT');

    return {
      outcome: isVictory ? 'victory' : 'defeat',
      boss: {
        ...bossArticle,
        stats: boss.stats,
        bossRecordId: Number(bossRow.id),
        maxHp: boss.maxHp,
        remainingHp: boss.currentHp,
        status: finalStatus
      },
      team: fighters.map((fighter) => ({
        id: fighter.id,
        title: fighter.title,
        rarity: fighter.rarity,
        stats: fighter.stats,
        maxHp: fighter.maxHp,
        remainingHp: fighter.currentHp,
        defeated: fighter.currentHp <= 0
      })),
      rounds,
      unavailableArticleIds,
      grantedArticle: isVictory ? bossArticle : null
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function loadArticlesPage(offset, limit, rarityLevels, options = {}) {
  const includeStatsColumns = await hasArticleStatsColumns();
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const safeLimit = clamp(Number(limit) || ARTICLES_PAGE_LIMIT_DEFAULT, 1, ARTICLES_PAGE_LIMIT_MAX);
  const search = normalizeArticleSearch(options.search);
  const rarity = normalizeArticleRarity(options.rarity);
  const baseValues = [];
  const whereClause = buildArticlesWhereClause(search, rarity, rarityLevels, baseValues);
  const orderClause = rarity ? 'view_count DESC, title ASC' : buildRaritySortClause(rarityLevels);
  const rowsValues = [...baseValues, safeOffset, safeLimit];
  const offsetParameter = rowsValues.length - 1;
  const limitParameter = rowsValues.length;

  const [rowsResult, totalResult] = await Promise.all([
    pool.query(
      `
        SELECT
          id,
          title,
          view_count,
          ${buildArticleStatsProjection(includeStatsColumns)}
        FROM ${FINAL_TABLE}
        ${whereClause}
        ORDER BY ${orderClause}
        OFFSET $${offsetParameter}
        LIMIT $${limitParameter}
      `,
      rowsValues
    ),
    pool.query(
      `
        SELECT COUNT(*)::BIGINT AS total
        FROM ${FINAL_TABLE}
        ${whereClause}
      `,
      baseValues
    )
  ]);

  return {
    articles: rowsResult.rows.map((row) => serializeArticleRow(row, rarityLevels)),
    total: Number(totalResult.rows[0].total),
    offset: safeOffset,
    limit: safeLimit,
    search,
    rarity
  };
}

async function loadUserArticlesPage(userId, offset, limit, rarityLevels, options = {}) {
  await ensureUserArticleDropsTable();

  const includeStatsColumns = await hasArticleStatsColumns();
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const safeLimit = clamp(Number(limit) || ARTICLES_PAGE_LIMIT_DEFAULT, 1, ARTICLES_PAGE_LIMIT_MAX);
  const search = normalizeArticleSearch(options.search);
  const rarity = normalizeArticleRarity(options.rarity);
  const baseValues = [userId];
  const whereClause = buildArticlesWhereClause(search, rarity, rarityLevels, baseValues, 'a');
  const rowsValues = [...baseValues, safeOffset, safeLimit];
  const offsetParameter = rowsValues.length - 1;
  const limitParameter = rowsValues.length;

  const [rowsResult, totalResult] = await Promise.all([
    pool.query(
      `
        SELECT
          a.id,
          a.title,
          a.view_count,
          ${buildArticleStatsProjectionForAlias(includeStatsColumns, 'a')},
          COUNT(*)::INTEGER AS drop_count,
          MAX(d.created_at) AS last_dropped_at
        FROM ${USER_ARTICLE_DROPS_TABLE} d
        JOIN ${FINAL_TABLE} a ON a.id = d.article_id
        WHERE d.user_id = $1
        ${whereClause ? `AND ${whereClause.replace(/^WHERE\s+/i, '')}` : ''}
        GROUP BY a.id, a.title, a.view_count${buildArticleStatsGroupByColumns(includeStatsColumns, 'a').length ? `, ${buildArticleStatsGroupByColumns(includeStatsColumns, 'a').join(', ')}` : ''}
        ORDER BY MAX(d.created_at) DESC, a.view_count DESC, a.title ASC
        OFFSET $${offsetParameter}
        LIMIT $${limitParameter}
      `,
      rowsValues
    ),
    pool.query(
      `
        SELECT COUNT(*)::BIGINT AS total
        FROM (
          SELECT a.id
          FROM ${USER_ARTICLE_DROPS_TABLE} d
          JOIN ${FINAL_TABLE} a ON a.id = d.article_id
          WHERE d.user_id = $1
          ${whereClause ? `AND ${whereClause.replace(/^WHERE\s+/i, '')}` : ''}
          GROUP BY a.id
        ) AS user_articles
      `,
      baseValues
    )
  ]);

  return {
    articles: rowsResult.rows.map((row) => serializeArticleRow(row, rarityLevels)),
    total: Number(totalResult.rows[0].total),
    offset: safeOffset,
    limit: safeLimit,
    search,
    rarity
  };
}

const server = http.createServer(async (request, response) => {
  if (!request.url) {
    sendJson(response, 400, { error: 'Request URL is missing.' });
    return;
  }

  if (request.method === 'OPTIONS') {
    sendNoContent(response);
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

  try {
    if (await tryServeFrontend(request, response, url)) {
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/health') {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/auth/register') {
      const body = await readJsonBody(request);
      const auth = await registerUser(body);

      sendJson(response, 201, auth);
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/auth/login') {
      const body = await readJsonBody(request);
      const auth = await loginUser(body);

      sendJson(response, 200, auth);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/auth/me') {
      const user = await getCurrentUser(request);

      sendJson(response, 200, { user });
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/pack') {
      const body = await readJsonBody(request);
      const count = clamp(Number(body.count) || 5, 1, 30);
      const excludeTitles = normalizeExcludedTitles(body.excludeTitles);
      const rarityLevels = buildRarityLevels(DEFAULT_RARITY_THRESHOLDS);
      const currentUser = await getOptionalCurrentUser(request);

      const cards = await loadPackArticles(count, excludeTitles, rarityLevels);
      await recordUserPackDrops(currentUser?.id, cards);

      sendJson(response, 200, {
        cards,
        rarityLevels
      });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/articles') {
      const rarityLevels = buildRarityLevels(DEFAULT_RARITY_THRESHOLDS);
      const offset = url.searchParams.get('offset');
      const limit = url.searchParams.get('limit');
      const search = url.searchParams.get('search');
      const rarity = url.searchParams.get('rarity');
      const page = await loadArticlesPage(offset, limit, rarityLevels, {
        search,
        rarity
      });

      sendJson(response, 200, {
        ...page,
        rarityLevels
      });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/my-articles') {
      const rarityLevels = buildRarityLevels(DEFAULT_RARITY_THRESHOLDS);
      const currentUser = await getCurrentUser(request);
      const offset = url.searchParams.get('offset');
      const limit = url.searchParams.get('limit');
      const search = url.searchParams.get('search');
      const rarity = url.searchParams.get('rarity');
      const page = await loadUserArticlesPage(currentUser.id, offset, limit, rarityLevels, {
        search,
        rarity
      });

      sendJson(response, 200, {
        ...page,
        rarityLevels
      });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/boss') {
      const rarityLevels = buildRarityLevels(DEFAULT_RARITY_THRESHOLDS);
      const currentUser = await getOptionalCurrentUser(request);
      const boss = await getOrCreateCurrentBoss(rarityLevels);
      const unavailableArticleIds = currentUser
        ? await loadBossDefeatedArticleIds(currentUser.id, boss.bossRecordId)
        : [];

      sendJson(response, 200, {
        boss,
        unavailableArticleIds,
        rarityLevels
      });
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/boss/battle') {
      const rarityLevels = buildRarityLevels(DEFAULT_RARITY_THRESHOLDS);
      const currentUser = await getCurrentUser(request);
      const body = await readJsonBody(request);
      const result = await performBossBattle(currentUser.id, body.articleIds, rarityLevels);

      sendJson(response, 200, {
        ...result,
        rarityLevels
      });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/admin/users') {
      const currentUser = await getCurrentUser(request);
      assertAdminUser(currentUser);

      const search = url.searchParams.get('search');
      const limit = url.searchParams.get('limit');
      const result = await loadAdminUsers(search, limit);

      sendJson(response, 200, result);
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/admin/grant-card') {
      const currentUser = await getCurrentUser(request);
      assertAdminUser(currentUser);

      const body = await readJsonBody(request);
      const rarityLevels = buildRarityLevels(DEFAULT_RARITY_THRESHOLDS);
      const result = await grantArticleToUser(body.userId, body.articleId, rarityLevels);

      sendJson(response, 200, result);
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/admin/change-boss') {
      const currentUser = await getCurrentUser(request);
      assertAdminUser(currentUser);

      const body = await readJsonBody(request);
      const rarityLevels = buildRarityLevels(DEFAULT_RARITY_THRESHOLDS);
      const boss = await replaceCurrentBoss(body.articleId, rarityLevels);

      sendJson(response, 200, {
        boss,
        unavailableArticleIds: [],
        rarityLevels
      });
      return;
    }

    sendJson(response, 404, { error: 'Not found.' });
  } catch (error) {
    console.error(error);

    if (error instanceof HttpError) {
      sendJson(response, error.statusCode, {
        error: error.message
      });
      return;
    }

    if (error instanceof SyntaxError) {
      sendJson(response, 400, {
        error: 'Invalid JSON payload.'
      });
      return;
    }

    sendJson(response, 500, {
      error: 'Internal server error.'
    });
  }
});

server.listen(API_PORT, () => {
  console.log(
    `[${new Date().toISOString()}] Wiki API is listening on http://localhost:${API_PORT}`
  );
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await pool.end();
    server.close(() => process.exit(0));
  });
}
