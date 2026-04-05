import {
  createDeterministicRandom,
  generateDeterministicCardStats,
  STAT_KEYS
} from '../../shared/card-stats.mjs';
import { getRarityByViewCount } from '../../shared/rarity.mjs';
import {
  COMBAT_STAT_KEYS,
  DUELS_TABLE,
  DUEL_TEAM_SIZE,
  FINAL_TABLE,
  USER_ARTICLE_DROPS_TABLE,
  USERS_TABLE,
  pool
} from './config.mjs';
import { HttpError } from './errors.mjs';
import {
  buildArticleStats,
  buildArticleStatsGroupByColumns,
  buildArticleStatsProjectionForAlias,
  ensureUserArticleDropsTable,
  hasArticleStatsColumns,
  serializeArticleRow
} from './articles.mjs';
import { ensureUsersTable, serializePublicUser } from './auth.mjs';

let hasDuelsTableCache = false;

function normalizeTeamArticleIds(articleIds) {
  if (!Array.isArray(articleIds)) {
    return [];
  }

  const uniqueArticleIds = [];
  const seenIds = new Set();

  for (const value of articleIds) {
    const articleId = Number(value);

    if (!Number.isInteger(articleId) || articleId <= 0 || seenIds.has(articleId)) {
      continue;
    }

    seenIds.add(articleId);
    uniqueArticleIds.push(articleId);
  }

  return uniqueArticleIds;
}

function buildParticipant(row, prefix) {
  return serializePublicUser({
    id: row[`${prefix}_user_id`],
    username: row[`${prefix}_username`]
  });
}

function normalizeTeamSnapshot(team) {
  if (!Array.isArray(team)) {
    return [];
  }

  return team.map((fighter) => ({
    id: Number(fighter.id),
    title: fighter.title,
    viewCount: Number(fighter.viewCount || 0),
    rarity: fighter.rarity,
    stats: fighter.stats,
    maxHp: Number(fighter.maxHp || fighter.stats?.hp || 0),
    remainingHp: Number(
      fighter.remainingHp === undefined ? fighter.maxHp || fighter.stats?.hp || 0 : fighter.remainingHp
    ),
    defeated: Boolean(fighter.defeated)
  }));
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

function normalizeCombatStats(stats) {
  if (!stats || typeof stats !== 'object') {
    return null;
  }

  const normalizedStats = {};

  for (const key of STAT_KEYS) {
    const rawValue = stats[key];

    if (rawValue === null || rawValue === undefined) {
      return null;
    }

    const value = Number(rawValue);

    if (!Number.isFinite(value)) {
      return null;
    }

    normalizedStats[key] = value;
  }

  return normalizedStats.hp > 0 ? normalizedStats : null;
}

function createFighterSnapshot(article, rarityLevels) {
  const rarity =
    article.rarity ||
    getRarityByViewCount(Number(article.viewCount || article.view_count || 0), rarityLevels);
  const stats =
    buildArticleStats(article) ||
    normalizeCombatStats(article.stats) ||
    generateDeterministicCardStats(rarity, Number(article.id));
  const maxHp = Number(stats.hp || 0);

  return {
    id: Number(article.id),
    title: article.title,
    viewCount: Number(article.viewCount || article.view_count || 0),
    rarity,
    stats,
    maxHp,
    remainingHp: maxHp,
    defeated: false
  };
}

function simulateDuelBattle(duelRow, rarityLevels, randomFn = Math.random) {
  const inviterUser = buildParticipant(duelRow, 'inviter');
  const invitedUser = buildParticipant(duelRow, 'invited');
  const inviterTeam = normalizeTeamSnapshot(duelRow.inviter_team).map((fighter) =>
    createFighterSnapshot(fighter, rarityLevels)
  );
  const invitedTeam = normalizeTeamSnapshot(duelRow.invited_team).map((fighter) =>
    createFighterSnapshot(fighter, rarityLevels)
  );
  const turns = [];
  let turn = 1;

  const sides = {
    inviter: {
      key: 'inviter',
      user: inviterUser,
      team: inviterTeam
    },
    invited: {
      key: 'invited',
      user: invitedUser,
      team: invitedTeam
    }
  };

  const getAliveFighters = (team) => team.filter((fighter) => fighter.remainingHp > 0);
  const runAttack = (attackerSide, defenderSide) => {
    const aliveAttackers = getAliveFighters(attackerSide.team);
    const aliveDefenders = getAliveFighters(defenderSide.team);

    if (aliveAttackers.length === 0 || aliveDefenders.length === 0) {
      return;
    }

    const attacker = aliveAttackers[Math.floor(randomFn() * aliveAttackers.length)];
    const target = aliveDefenders[Math.floor(randomFn() * aliveDefenders.length)];
    const strongestAttack = getStrongestCombatStat(attacker.stats);
    const defenseValue = Number(target.stats?.[strongestAttack.key] || 0);
    const damage = Math.max(1, strongestAttack.value - defenseValue);

    target.remainingHp = Math.max(0, target.remainingHp - damage);
    target.defeated = target.remainingHp <= 0;

    turns.push({
      turn,
      attackerUserId: attackerSide.user.id,
      attackerUsername: attackerSide.user.username,
      attackerArticleId: attacker.id,
      attackerTitle: attacker.title,
      targetUserId: defenderSide.user.id,
      targetUsername: defenderSide.user.username,
      targetArticleId: target.id,
      targetTitle: target.title,
      statKey: strongestAttack.key,
      attackValue: strongestAttack.value,
      defenseValue,
      damage,
      targetRemainingHp: target.remainingHp
    });

    turn += 1;
  };

  while (getAliveFighters(inviterTeam).length > 0 && getAliveFighters(invitedTeam).length > 0) {
    const firstPair = randomFn() < 0.5 ? [sides.inviter, sides.invited] : [sides.invited, sides.inviter];
    const secondPair = firstPair[0].key === 'inviter' ? [sides.invited, sides.inviter] : [sides.inviter, sides.invited];

    runAttack(firstPair[0], firstPair[1]);

    if (getAliveFighters(firstPair[1].team).length === 0) {
      break;
    }

    runAttack(secondPair[0], secondPair[1]);
  }

  const inviterAlive = getAliveFighters(inviterTeam).length;
  const invitedAlive = getAliveFighters(invitedTeam).length;
  const winnerKey =
    inviterAlive === invitedAlive
      ? turns[turns.length - 1]?.attackerUserId === inviterUser.id
        ? 'inviter'
        : 'invited'
      : inviterAlive > 0
        ? 'inviter'
        : 'invited';
  const loserKey = winnerKey === 'inviter' ? 'invited' : 'inviter';

  return {
    winnerUserId: sides[winnerKey].user.id,
    loserUserId: sides[loserKey].user.id,
    winnerUsername: sides[winnerKey].user.username,
    loserUsername: sides[loserKey].user.username,
    turns,
    teams: {
      inviter: inviterTeam,
      invited: invitedTeam
    }
  };
}

function buildSerializedBattleResult(row) {
  if (!row?.battle_result) {
    return null;
  }

  const battleResult = {
    ...row.battle_result,
    teams: row.battle_result.teams || {
      inviter: normalizeTeamSnapshot(row.inviter_team),
      invited: normalizeTeamSnapshot(row.invited_team)
    },
    turns: Array.isArray(row.battle_result.turns) ? row.battle_result.turns : []
  };

  if (battleResult.turns.length > 0 || row.status !== 'finished') {
    return battleResult;
  }

  const inviterTeam = normalizeTeamSnapshot(row.inviter_team);
  const invitedTeam = normalizeTeamSnapshot(row.invited_team);

  if (inviterTeam.length !== DUEL_TEAM_SIZE || invitedTeam.length !== DUEL_TEAM_SIZE) {
    return battleResult;
  }

  const expectedWinnerUserId = Number(row.winner_user_id || row.battle_result.winnerUserId || 0);
  let fallbackBattle = null;

  for (let attempt = 0; attempt < 128; attempt += 1) {
    const repairedBattle = simulateDuelBattle(
      {
        ...row,
        inviter_team: inviterTeam,
        invited_team: invitedTeam
      },
      undefined,
      createDeterministicRandom(Number(row.id) * 1000 + attempt)
    );

    if (repairedBattle.turns.length === 0) {
      continue;
    }

    if (!fallbackBattle) {
      fallbackBattle = repairedBattle;
    }

    if (expectedWinnerUserId && repairedBattle.winnerUserId !== expectedWinnerUserId) {
      continue;
    }

    return {
      ...battleResult,
      ...repairedBattle,
      recovered: true
    };
  }

  if (fallbackBattle) {
    return {
      ...battleResult,
      ...fallbackBattle,
      recovered: true,
      recoveredWinnerMismatch: expectedWinnerUserId > 0 && fallbackBattle.winnerUserId !== expectedWinnerUserId
    };
  }

  return battleResult;
}

function serializeDuelForUser(row, currentUserId) {
  if (!row) {
    return null;
  }

  const safeCurrentUserId = Number(currentUserId);
  const battleResult = buildSerializedBattleResult(row);
  const inviter = buildParticipant(row, 'inviter');
  const invited = buildParticipant(row, 'invited');
  const winnerSource =
    battleResult?.winnerUserId && battleResult?.winnerUsername
      ? {
          id: battleResult.winnerUserId,
          username: battleResult.winnerUsername
        }
      : row.winner_user_id && row.winner_username
        ? {
            id: row.winner_user_id,
            username: row.winner_username
          }
        : null;
  const winner = winnerSource ? serializePublicUser(winnerSource) : null;
  const isInviter = inviter.id === safeCurrentUserId;
  const myParticipant = isInviter ? inviter : invited;
  const opponentParticipant = isInviter ? invited : inviter;
  const myTeam = normalizeTeamSnapshot(isInviter ? row.inviter_team : row.invited_team);
  const opponentTeam = normalizeTeamSnapshot(isInviter ? row.invited_team : row.inviter_team);

  return {
    id: Number(row.id),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    respondedAt: row.responded_at,
    finishedAt: row.finished_at,
    inviter,
    invited,
    winner,
    myRole: isInviter ? 'inviter' : 'invited',
    me: myParticipant,
    opponent: opponentParticipant,
    isIncomingInvite: row.status === 'pending' && invited.id === safeCurrentUserId,
    isOutgoingInvite: row.status === 'pending' && inviter.id === safeCurrentUserId,
    myTeam,
    opponentTeam,
    myTeamSubmitted: myTeam.length === DUEL_TEAM_SIZE,
    opponentTeamSubmitted: opponentTeam.length === DUEL_TEAM_SIZE,
    canRespond: row.status === 'pending' && invited.id === safeCurrentUserId,
    canSelectTeam: row.status === 'active' && !battleResult,
    battleResult
  };
}

async function loadDecoratedDuelRowById(duelId, db = pool) {
  const result = await db.query(
    `
      SELECT
        d.id,
        d.inviter_user_id,
        d.invited_user_id,
        d.status,
        d.inviter_team,
        d.invited_team,
        d.battle_result,
        d.winner_user_id,
        d.created_at,
        d.updated_at,
        d.responded_at,
        d.finished_at,
        inviter.username AS inviter_username,
        invited.username AS invited_username,
        winner.username AS winner_username
      FROM ${DUELS_TABLE} d
      JOIN ${USERS_TABLE} inviter ON inviter.id = d.inviter_user_id
      JOIN ${USERS_TABLE} invited ON invited.id = d.invited_user_id
      LEFT JOIN ${USERS_TABLE} winner ON winner.id = d.winner_user_id
      WHERE d.id = $1
      LIMIT 1
    `,
    [duelId]
  );

  return result.rows[0] || null;
}

async function loadDuelRowForUserUpdate(duelId, userId, db = pool) {
  const result = await db.query(
    `
      SELECT *
      FROM ${DUELS_TABLE}
      WHERE id = $1
        AND (inviter_user_id = $2 OR invited_user_id = $2)
      LIMIT 1
      FOR UPDATE
    `,
    [duelId, userId]
  );

  return result.rows[0] || null;
}

async function loadActiveOrPendingDuelForUsers(userIds, db = pool) {
  const result = await db.query(
    `
      SELECT id
      FROM ${DUELS_TABLE}
      WHERE status IN ('pending', 'active')
        AND (inviter_user_id = ANY($1::bigint[]) OR invited_user_id = ANY($1::bigint[]))
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    [userIds]
  );

  return result.rows[0] || null;
}

async function loadUserById(userId, db = pool) {
  const result = await db.query(
    `
      SELECT id, username
      FROM ${USERS_TABLE}
      WHERE id = $1
      LIMIT 1
    `,
    [userId]
  );

  return result.rows[0] || null;
}

async function loadUserByUsername(username, db = pool) {
  const normalizedUsername = typeof username === 'string' ? username.trim() : '';

  if (!normalizedUsername) {
    return null;
  }

  const result = await db.query(
    `
      SELECT id, username
      FROM ${USERS_TABLE}
      WHERE LOWER(username) = LOWER($1)
      LIMIT 1
    `,
    [normalizedUsername]
  );

  return result.rows[0] || null;
}

async function loadDuelTeamSnapshots(userId, articleIds, rarityLevels, db = pool) {
  const normalizedArticleIds = normalizeTeamArticleIds(articleIds);

  if (normalizedArticleIds.length !== DUEL_TEAM_SIZE) {
    throw new HttpError(400, `Нужно выбрать ровно ${DUEL_TEAM_SIZE} разных карт.`);
  }

  const includeStatsColumns = await hasArticleStatsColumns();
  const groupByColumns = buildArticleStatsGroupByColumns(includeStatsColumns, 'a');
  const result = await db.query(
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
    [userId, normalizedArticleIds]
  );

  if (result.rows.length !== DUEL_TEAM_SIZE) {
    throw new HttpError(400, 'Все выбранные карты должны быть в твоей коллекции.');
  }

  const snapshotsById = new Map(
    result.rows.map((row) => {
      const article = serializeArticleRow(row, rarityLevels);
      return [
        Number(row.id),
        createFighterSnapshot(
          {
            ...article,
            viewCount: article.viewCount
          },
          rarityLevels
        )
      ];
    })
  );

  return normalizedArticleIds.map((articleId) => snapshotsById.get(articleId));
}

export async function ensureDuelsTable() {
  if (hasDuelsTableCache) {
    return;
  }

  await ensureUsersTable();
  await ensureUserArticleDropsTable();

  await pool.query(
    `
      CREATE TABLE IF NOT EXISTS ${DUELS_TABLE} (
        id BIGSERIAL PRIMARY KEY,
        inviter_user_id BIGINT NOT NULL REFERENCES ${USERS_TABLE}(id) ON DELETE CASCADE,
        invited_user_id BIGINT NOT NULL REFERENCES ${USERS_TABLE}(id) ON DELETE CASCADE,
        status TEXT NOT NULL CHECK (status IN ('pending', 'declined', 'active', 'finished')),
        inviter_team JSONB,
        invited_team JSONB,
        battle_result JSONB,
        winner_user_id BIGINT REFERENCES ${USERS_TABLE}(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        responded_at TIMESTAMPTZ,
        finished_at TIMESTAMPTZ,
        CHECK (inviter_user_id <> invited_user_id)
      )
    `
  );

  await Promise.all([
    pool.query(
      `
        CREATE INDEX IF NOT EXISTS ${DUELS_TABLE}_participants_updated_idx
        ON ${DUELS_TABLE} (inviter_user_id, invited_user_id, updated_at DESC)
      `
    ),
    pool.query(
      `
        CREATE INDEX IF NOT EXISTS ${DUELS_TABLE}_status_updated_idx
        ON ${DUELS_TABLE} (status, updated_at DESC)
      `
    )
  ]);

  hasDuelsTableCache = true;
}

export async function loadUserDuelState(userId) {
  const safeUserId = Number(userId);

  if (!Number.isInteger(safeUserId) || safeUserId <= 0) {
    return { duel: null };
  }

  await ensureDuelsTable();

  const result = await pool.query(
    `
      SELECT
        d.id,
        d.inviter_user_id,
        d.invited_user_id,
        d.status,
        d.inviter_team,
        d.invited_team,
        d.battle_result,
        d.winner_user_id,
        d.created_at,
        d.updated_at,
        d.responded_at,
        d.finished_at,
        inviter.username AS inviter_username,
        invited.username AS invited_username,
        winner.username AS winner_username
      FROM ${DUELS_TABLE} d
      JOIN ${USERS_TABLE} inviter ON inviter.id = d.inviter_user_id
      JOIN ${USERS_TABLE} invited ON invited.id = d.invited_user_id
      LEFT JOIN ${USERS_TABLE} winner ON winner.id = d.winner_user_id
      WHERE (d.inviter_user_id = $1 OR d.invited_user_id = $1)
        AND d.status IN ('pending', 'active', 'finished')
      ORDER BY
        CASE
          WHEN d.status = 'pending' AND d.invited_user_id = $1 THEN 0
          WHEN d.status = 'active' THEN 1
          WHEN d.status = 'pending' THEN 2
          WHEN d.status = 'finished' THEN 3
          ELSE 4
        END,
        d.updated_at DESC
      LIMIT 1
    `,
    [safeUserId]
  );

  return {
    duel: serializeDuelForUser(result.rows[0] || null, safeUserId)
  };
}

export async function createDuelInvitation(inviterUserId, targetUserId) {
  const safeInviterUserId = Number(inviterUserId);
  const safeTargetUserId = Number(targetUserId);

  if (!Number.isInteger(safeTargetUserId) || safeTargetUserId <= 0) {
    throw new HttpError(400, 'Выбери игрока для дуэли.');
  }

  if (safeInviterUserId === safeTargetUserId) {
    throw new HttpError(400, 'Нельзя вызвать на дуэль самого себя.');
  }

  await ensureDuelsTable();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const [inviterUser, targetUser, existingDuel] = await Promise.all([
      loadUserById(safeInviterUserId, client),
      loadUserById(safeTargetUserId, client),
      loadActiveOrPendingDuelForUsers([safeInviterUserId, safeTargetUserId], client)
    ]);

    if (!inviterUser || !targetUser) {
      throw new HttpError(404, 'Игрок не найден.');
    }

    if (existingDuel) {
      throw new HttpError(409, 'У одного из игроков уже есть активная или ожидающая дуэль.');
    }

    const created = await client.query(
      `
        INSERT INTO ${DUELS_TABLE} (
          inviter_user_id,
          invited_user_id,
          status,
          inviter_team,
          invited_team,
          battle_result,
          updated_at
        )
        VALUES ($1, $2, 'pending', NULL, NULL, NULL, NOW())
        RETURNING id
      `,
      [safeInviterUserId, safeTargetUserId]
    );

    await client.query('COMMIT');

    const duelRow = await loadDecoratedDuelRowById(created.rows[0].id);
    return {
      duel: serializeDuelForUser(duelRow, safeInviterUserId)
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function createDuelInvitationByUsername(inviterUserId, username) {
  await ensureDuelsTable();
  const targetUser = await loadUserByUsername(username);

  if (!targetUser) {
    throw new HttpError(404, 'Игрок с таким ником не найден.');
  }

  return createDuelInvitation(inviterUserId, targetUser.id);
}

export async function respondToDuelInvitation(userId, duelId, action) {
  const safeUserId = Number(userId);
  const safeDuelId = Number(duelId);
  const normalizedAction = typeof action === 'string' ? action.trim().toLowerCase() : '';

  if (!Number.isInteger(safeDuelId) || safeDuelId <= 0) {
    throw new HttpError(400, 'Некорректный идентификатор дуэли.');
  }

  if (!['accept', 'decline'].includes(normalizedAction)) {
    throw new HttpError(400, 'Некорректное действие для приглашения.');
  }

  await ensureDuelsTable();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const duelRow = await loadDuelRowForUserUpdate(safeDuelId, safeUserId, client);

    if (!duelRow) {
      throw new HttpError(404, 'Дуэль не найдена.');
    }

    if (Number(duelRow.invited_user_id) !== safeUserId) {
      throw new HttpError(403, 'Только приглашённый игрок может ответить на вызов.');
    }

    if (duelRow.status !== 'pending') {
      throw new HttpError(409, 'На это приглашение уже ответили.');
    }

    await client.query(
      `
        UPDATE ${DUELS_TABLE}
        SET status = $1,
            responded_at = NOW(),
            updated_at = NOW()
        WHERE id = $2
      `,
      [normalizedAction === 'accept' ? 'active' : 'declined', safeDuelId]
    );

    await client.query('COMMIT');
    return loadUserDuelState(safeUserId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function submitDuelTeam(userId, duelId, articleIds, rarityLevels) {
  const safeUserId = Number(userId);
  const safeDuelId = Number(duelId);

  if (!Number.isInteger(safeDuelId) || safeDuelId <= 0) {
    throw new HttpError(400, 'Некорректный идентификатор дуэли.');
  }

  await ensureDuelsTable();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const duelRow = await loadDuelRowForUserUpdate(safeDuelId, safeUserId, client);

    if (!duelRow) {
      throw new HttpError(404, 'Дуэль не найдена.');
    }

    if (duelRow.status !== 'active') {
      throw new HttpError(409, 'Команды можно выбирать только в активной дуэли.');
    }

    const isInviter = Number(duelRow.inviter_user_id) === safeUserId;
    const teamSnapshots = await loadDuelTeamSnapshots(safeUserId, articleIds, rarityLevels, client);
    const nextInviterTeam = isInviter ? teamSnapshots : normalizeTeamSnapshot(duelRow.inviter_team);
    const nextInvitedTeam = isInviter ? normalizeTeamSnapshot(duelRow.invited_team) : teamSnapshots;

    let nextStatus = 'active';
    let battleResult = null;
    let winnerUserId = null;
    let finishedAt = null;

    if (nextInviterTeam.length === DUEL_TEAM_SIZE && nextInvitedTeam.length === DUEL_TEAM_SIZE) {
      const simulatedBattle = simulateDuelBattle(
        {
          ...duelRow,
          inviter_team: nextInviterTeam,
          invited_team: nextInvitedTeam,
          inviter_username: (await loadUserById(duelRow.inviter_user_id, client)).username,
          invited_username: (await loadUserById(duelRow.invited_user_id, client)).username
        },
        rarityLevels
      );

      battleResult = simulatedBattle;
      winnerUserId = simulatedBattle.winnerUserId;
      nextStatus = 'finished';
      finishedAt = new Date().toISOString();
    }

    await client.query(
      `
        UPDATE ${DUELS_TABLE}
        SET inviter_team = $1::jsonb,
            invited_team = $2::jsonb,
            battle_result = $3::jsonb,
            winner_user_id = $4,
            status = $5,
            finished_at = $6,
            updated_at = NOW()
        WHERE id = $7
      `,
      [
        JSON.stringify(nextInviterTeam),
        JSON.stringify(nextInvitedTeam),
        battleResult ? JSON.stringify(battleResult) : null,
        winnerUserId,
        nextStatus,
        finishedAt,
        safeDuelId
      ]
    );

    await client.query('COMMIT');

    const updatedRow = await loadDecoratedDuelRowById(safeDuelId);
    return {
      duel: serializeDuelForUser(updatedRow, safeUserId)
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
