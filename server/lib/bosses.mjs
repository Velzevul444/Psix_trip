import { generateDeterministicCardStats } from '../../shared/card-stats.mjs';
import { getRarityByViewCount } from '../../shared/rarity.mjs';
import {
  BOSS_CARD_DEFEATS_TABLE,
  BOSSES_TABLE,
  BOSS_HP_MULTIPLIER,
  BOSS_TEAM_SIZE,
  COMBAT_STAT_KEYS,
  FINAL_TABLE,
  USER_ARTICLE_DROPS_TABLE,
  USERS_TABLE,
  pool
} from './config.mjs';
import { HttpError } from './errors.mjs';
import {
  buildArticleStats,
  buildArticleStatsGroupByColumns,
  buildArticleStatsProjection,
  buildArticleStatsProjectionForAlias,
  ensureUserArticleDropsTable,
  hasArticleStatsColumns,
  serializeArticleRow
} from './articles.mjs';

let hasBossesTableCache = false;
let hasBossCardDefeatsTableCache = false;

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

export async function getOrCreateCurrentBoss(rarityLevels) {
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

export async function loadBossDefeatedArticleIds(userId, bossId, db = pool) {
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

export async function replaceCurrentBoss(articleId, rarityLevels) {
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

export async function performBossBattle(userId, selectedArticleIds, rarityLevels) {
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
      const randomBossArticle = await pickRandomDivineArticleRow(
        rarityLevels,
        includeStatsColumns,
        client
      );

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

    const groupByColumns = buildArticleStatsGroupByColumns(includeStatsColumns, 'a');
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
        GROUP BY a.id, a.title, a.view_count${groupByColumns.length ? `, ${groupByColumns.join(', ')}` : ''}
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
