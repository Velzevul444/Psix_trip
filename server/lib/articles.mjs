import { generateDeterministicCardStats } from '../../shared/card-stats.mjs';
import {
  getRarityByViewCount,
  RARITY_ORDER,
  rollRarity
} from '../../shared/rarity.mjs';
import {
  ADMIN_USER_SEARCH_LIMIT_DEFAULT,
  ADMIN_USER_SEARCH_LIMIT_MAX,
  ARTICLES_PAGE_LIMIT_DEFAULT,
  ARTICLES_PAGE_LIMIT_MAX,
  ARTICLE_STATS_COLUMNS,
  FINAL_TABLE,
  MAX_RARITY_ROLL_ATTEMPTS,
  USER_ARTICLE_DROPS_TABLE,
  USERS_TABLE,
  pool
} from './config.mjs';
import { HttpError } from './errors.mjs';
import { clamp } from './utils.mjs';
import { ensureUsersTable, findUserById, serializeUser } from './auth.mjs';

let hasArticlesTableCache = false;
let hasArticleStatsColumnsCache = null;
let hasUserArticleDropsTableCache = false;

export function normalizeExcludedTitles(value) {
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

export async function hasArticleStatsColumns() {
  await ensureArticlesTable();

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

export async function ensureArticlesTable() {
  if (hasArticlesTableCache) {
    return;
  }

  await pool.query(
    `
      CREATE TABLE IF NOT EXISTS ${FINAL_TABLE} (
        id BIGINT PRIMARY KEY,
        title TEXT NOT NULL UNIQUE,
        view_count BIGINT NOT NULL DEFAULT 0
      )
    `
  );

  await pool.query(
    `
      CREATE INDEX IF NOT EXISTS ${FINAL_TABLE}_view_count_idx
      ON ${FINAL_TABLE} (view_count DESC)
    `
  );

  hasArticlesTableCache = true;
}

export async function ensureArticleStatsColumns() {
  await ensureArticlesTable();

  if (hasArticleStatsColumnsCache === true) {
    return;
  }

  await pool.query(
    `
      ALTER TABLE ${FINAL_TABLE}
      ADD COLUMN IF NOT EXISTS hp INTEGER,
      ADD COLUMN IF NOT EXISTS stamina INTEGER,
      ADD COLUMN IF NOT EXISTS strength INTEGER,
      ADD COLUMN IF NOT EXISTS dexterity INTEGER,
      ADD COLUMN IF NOT EXISTS intelligence INTEGER,
      ADD COLUMN IF NOT EXISTS charisma INTEGER
    `
  );

  hasArticleStatsColumnsCache = true;
}

export async function ensureUserArticleDropsTable() {
  if (hasUserArticleDropsTableCache) {
    return;
  }

  await ensureUsersTable();
  await ensureArticlesTable();

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

export function buildArticleStatsProjection(includeStatsColumns) {
  if (includeStatsColumns) {
    return ARTICLE_STATS_COLUMNS.join(', ');
  }

  return ARTICLE_STATS_COLUMNS.map((column) => `NULL::INTEGER AS ${column}`).join(', ');
}

export function buildArticleStatsProjectionForAlias(includeStatsColumns, alias) {
  if (includeStatsColumns) {
    return ARTICLE_STATS_COLUMNS.map((column) => `${alias}.${column} AS ${column}`).join(', ');
  }

  return buildArticleStatsProjection(false);
}

export function buildArticleStatsGroupByColumns(includeStatsColumns, alias) {
  if (!includeStatsColumns) {
    return [];
  }

  return ARTICLE_STATS_COLUMNS.map((column) => `${alias}.${column}`);
}

export function buildArticleStats(row) {
  const stats = {
    hp: row.hp,
    stamina: row.stamina,
    strength: row.strength,
    dexterity: row.dexterity,
    intelligence: row.intelligence,
    charisma: row.charisma
  };

  const normalizedStats = {};

  for (const [key, rawValue] of Object.entries(stats)) {
    if (rawValue === null || rawValue === undefined) {
      return null;
    }

    const value = Number(rawValue);

    if (!Number.isFinite(value)) {
      return null;
    }

    normalizedStats[key] = value;
  }

  return normalizedStats;
}

export function serializeArticleRow(row, rarityLevels, forcedRarity = null) {
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

export async function loadPackArticles(count, excludedTitles, rarityLevels) {
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

export async function recordUserPackDrops(userId, cards) {
  if (!userId || !Array.isArray(cards) || cards.length === 0) {
    return;
  }

  await recordUserPackDropIds(
    userId,
    cards.map((card) => card?.id)
  );
}

export async function recordUserPackDropIds(userId, articleIds) {
  if (!userId || !Array.isArray(articleIds) || articleIds.length === 0) {
    return;
  }

  await ensureUserArticleDropsTable();

  const uniqueArticleIds = Array.from(
    new Set(
      articleIds
        .map((articleId) => Number(articleId))
        .filter((articleId) => Number.isInteger(articleId) && articleId > 0)
    )
  );

  if (uniqueArticleIds.length === 0) {
    return;
  }

  const values = [];
  const placeholders = uniqueArticleIds.map((articleId, index) => {
    const baseIndex = index * 2;
    values.push(userId, articleId);
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

export async function loadAdminUsers(search, limit) {
  await ensureUsersTable();

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

export async function grantArticleToUser(targetUserId, articleId, rarityLevels) {
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

export async function loadArticlesPage(offset, limit, rarityLevels, options = {}) {
  await ensureArticlesTable();

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

export async function loadUserArticlesPage(userId, offset, limit, rarityLevels, options = {}) {
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
  const groupByColumns = buildArticleStatsGroupByColumns(includeStatsColumns, 'a');

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
        GROUP BY a.id, a.title, a.view_count${groupByColumns.length ? `, ${groupByColumns.join(', ')}` : ''}
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
