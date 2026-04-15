import { FINAL_TABLE, TRADES_TABLE, USER_ARTICLE_DROPS_TABLE, USERS_TABLE, pool } from './config.mjs';
import { HttpError } from './errors.mjs';
import {
  buildArticleStatsGroupByColumns,
  buildArticleStatsProjectionForAlias,
  ensureUserArticleDropsTable,
  hasArticleStatsColumns,
  serializeArticleRow
} from './articles.mjs';
import { ensureUsersTable, serializePublicUser } from './auth.mjs';

let hasTradesTableCache = false;

function normalizeArticleId(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const articleId = Number(value);
  return Number.isInteger(articleId) && articleId > 0 ? articleId : null;
}

function buildParticipant(row, prefix) {
  return serializePublicUser({
    id: row[`${prefix}_user_id`],
    username: row[`${prefix}_username`]
  });
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

async function loadTradeArticlesByIds(articleIds, rarityLevels, db = pool) {
  const normalizedArticleIds = Array.from(
    new Set(
      (Array.isArray(articleIds) ? articleIds : [])
        .map((articleId) => Number(articleId))
        .filter((articleId) => Number.isInteger(articleId) && articleId > 0)
    )
  );

  if (normalizedArticleIds.length === 0) {
    return new Map();
  }

  const includeStatsColumns = await hasArticleStatsColumns();
  const result = await db.query(
    `
      SELECT
        a.id,
        a.title,
        a.view_count,
        ${buildArticleStatsProjectionForAlias(includeStatsColumns, 'a')}
      FROM ${FINAL_TABLE} a
      WHERE a.id = ANY($1::bigint[])
    `,
    [normalizedArticleIds]
  );

  return new Map(
    result.rows.map((row) => {
      const article = serializeArticleRow(row, rarityLevels);
      return [Number(row.id), article];
    })
  );
}

async function loadOwnedArticleOrThrow(userId, articleId, rarityLevels, db = pool) {
  const safeArticleId = normalizeArticleId(articleId);

  if (!safeArticleId) {
    throw new HttpError(400, 'Выбери карту для обмена.');
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
        AND d.article_id = $2
      GROUP BY a.id, a.title, a.view_count${groupByColumns.length ? `, ${groupByColumns.join(', ')}` : ''}
      LIMIT 1
    `,
    [userId, safeArticleId]
  );

  if (!result.rows[0]) {
    throw new HttpError(400, 'Эта карта сейчас недоступна в твоей коллекции.');
  }

  return serializeArticleRow(result.rows[0], rarityLevels);
}

async function loadTradeRowForUserUpdate(tradeId, userId, db = pool) {
  const result = await db.query(
    `
      SELECT *
      FROM ${TRADES_TABLE}
      WHERE id = $1
        AND (inviter_user_id = $2 OR invited_user_id = $2)
      LIMIT 1
      FOR UPDATE
    `,
    [tradeId, userId]
  );

  return result.rows[0] || null;
}

async function loadDecoratedTradeRowById(tradeId, db = pool) {
  const result = await db.query(
    `
      SELECT
        t.id,
        t.inviter_user_id,
        t.invited_user_id,
        t.status,
        t.inviter_offer_article_id,
        t.invited_offer_article_id,
        t.inviter_confirmed,
        t.invited_confirmed,
        t.trade_result,
        t.created_at,
        t.updated_at,
        t.responded_at,
        t.finished_at,
        inviter.username AS inviter_username,
        invited.username AS invited_username
      FROM ${TRADES_TABLE} t
      JOIN ${USERS_TABLE} inviter ON inviter.id = t.inviter_user_id
      JOIN ${USERS_TABLE} invited ON invited.id = t.invited_user_id
      WHERE t.id = $1
      LIMIT 1
    `,
    [tradeId]
  );

  return result.rows[0] || null;
}

async function loadActiveOrPendingTradeForUsers(userIds, db = pool) {
  const result = await db.query(
    `
      SELECT id
      FROM ${TRADES_TABLE}
      WHERE status IN ('pending', 'active')
        AND (inviter_user_id = ANY($1::bigint[]) OR invited_user_id = ANY($1::bigint[]))
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    [userIds]
  );

  return result.rows[0] || null;
}

function buildSerializedTradeResult(row, isInviter, articlesById) {
  if (!row?.trade_result) {
    return null;
  }

  const inviterArticleId = normalizeArticleId(
    row.trade_result.inviterArticleId ?? row.inviter_offer_article_id
  );
  const invitedArticleId = normalizeArticleId(
    row.trade_result.invitedArticleId ?? row.invited_offer_article_id
  );
  const mySentArticle = articlesById.get(isInviter ? inviterArticleId : invitedArticleId) || null;
  const myReceivedArticle = articlesById.get(isInviter ? invitedArticleId : inviterArticleId) || null;
  const opponentSentArticle = articlesById.get(isInviter ? invitedArticleId : inviterArticleId) || null;
  const opponentReceivedArticle = articlesById.get(isInviter ? inviterArticleId : invitedArticleId) || null;

  return {
    resolution: row.trade_result.resolution || 'completed',
    finishedAt: row.finished_at,
    cancelledByUserId: row.trade_result.cancelledByUserId
      ? Number(row.trade_result.cancelledByUserId)
      : null,
    cancelledByUsername: row.trade_result.cancelledByUsername || null,
    mySentArticle,
    myReceivedArticle,
    opponentSentArticle,
    opponentReceivedArticle
  };
}

async function serializeTradeForUser(row, currentUserId, rarityLevels, db = pool) {
  if (!row) {
    return null;
  }

  const safeCurrentUserId = Number(currentUserId);
  const inviter = buildParticipant(row, 'inviter');
  const invited = buildParticipant(row, 'invited');
  const isInviter = inviter.id === safeCurrentUserId;
  const me = isInviter ? inviter : invited;
  const opponent = isInviter ? invited : inviter;
  const articleIds = [
    row.inviter_offer_article_id,
    row.invited_offer_article_id,
    row.trade_result?.inviterArticleId,
    row.trade_result?.invitedArticleId
  ];
  const articlesById = await loadTradeArticlesByIds(articleIds, rarityLevels, db);
  const myOfferId = normalizeArticleId(isInviter ? row.inviter_offer_article_id : row.invited_offer_article_id);
  const opponentOfferId = normalizeArticleId(
    isInviter ? row.invited_offer_article_id : row.inviter_offer_article_id
  );

  return {
    id: Number(row.id),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    respondedAt: row.responded_at,
    finishedAt: row.finished_at,
    inviter,
    invited,
    myRole: isInviter ? 'inviter' : 'invited',
    me,
    opponent,
    isIncomingInvite: row.status === 'pending' && invited.id === safeCurrentUserId,
    isOutgoingInvite: row.status === 'pending' && inviter.id === safeCurrentUserId,
    canRespond: row.status === 'pending' && invited.id === safeCurrentUserId,
    myOffer: articlesById.get(myOfferId) || null,
    opponentOffer: articlesById.get(opponentOfferId) || null,
    myOfferConfirmed: isInviter ? Boolean(row.inviter_confirmed) : Boolean(row.invited_confirmed),
    opponentOfferConfirmed: isInviter
      ? Boolean(row.invited_confirmed)
      : Boolean(row.inviter_confirmed),
    canSelectOffer: row.status === 'active',
    canConfirmOffer:
      row.status === 'active' &&
      Boolean(myOfferId) &&
      Boolean(opponentOfferId) &&
      !(isInviter ? Boolean(row.inviter_confirmed) : Boolean(row.invited_confirmed)),
    result: buildSerializedTradeResult(row, isInviter, articlesById)
  };
}

async function loadLockedDrop(userId, articleId, db = pool) {
  const result = await db.query(
    `
      SELECT id
      FROM ${USER_ARTICLE_DROPS_TABLE}
      WHERE user_id = $1
        AND article_id = $2
      ORDER BY id ASC
      LIMIT 1
      FOR UPDATE
    `,
    [userId, articleId]
  );

  return result.rows[0] || null;
}

async function finalizeTradeSwap(tradeRow, client) {
  const inviterArticleId = normalizeArticleId(tradeRow.inviter_offer_article_id);
  const invitedArticleId = normalizeArticleId(tradeRow.invited_offer_article_id);

  if (!inviterArticleId || !invitedArticleId) {
    throw new HttpError(409, 'Для завершения обмена обе стороны должны выбрать карты.');
  }

  const inviterDrop = await loadLockedDrop(tradeRow.inviter_user_id, inviterArticleId, client);
  const invitedDrop = await loadLockedDrop(tradeRow.invited_user_id, invitedArticleId, client);

  if (!inviterDrop || !invitedDrop) {
    throw new HttpError(
      409,
      'Одна из выбранных карт больше недоступна. Выберите карты заново и повторите обмен.'
    );
  }

  await client.query(
    `
      DELETE FROM ${USER_ARTICLE_DROPS_TABLE}
      WHERE id = ANY($1::bigint[])
    `,
    [[Number(inviterDrop.id), Number(invitedDrop.id)]]
  );

  await client.query(
    `
      INSERT INTO ${USER_ARTICLE_DROPS_TABLE} (user_id, article_id)
      VALUES ($1, $2), ($3, $4)
    `,
    [
      Number(tradeRow.inviter_user_id),
      invitedArticleId,
      Number(tradeRow.invited_user_id),
      inviterArticleId
    ]
  );

  await client.query(
    `
      UPDATE ${TRADES_TABLE}
      SET status = 'finished',
          trade_result = $1::jsonb,
          finished_at = NOW(),
          updated_at = NOW(),
          inviter_confirmed = TRUE,
          invited_confirmed = TRUE
      WHERE id = $2
    `,
    [
      JSON.stringify({
        resolution: 'completed',
        inviterArticleId,
        invitedArticleId
      }),
      Number(tradeRow.id)
    ]
  );
}

export async function ensureTradesTable() {
  if (hasTradesTableCache) {
    return;
  }

  await ensureUsersTable();
  await ensureUserArticleDropsTable();

  await pool.query(
    `
      CREATE TABLE IF NOT EXISTS ${TRADES_TABLE} (
        id BIGSERIAL PRIMARY KEY,
        inviter_user_id BIGINT NOT NULL REFERENCES ${USERS_TABLE}(id) ON DELETE CASCADE,
        invited_user_id BIGINT NOT NULL REFERENCES ${USERS_TABLE}(id) ON DELETE CASCADE,
        status TEXT NOT NULL CHECK (status IN ('pending', 'declined', 'active', 'finished')),
        inviter_offer_article_id BIGINT REFERENCES ${FINAL_TABLE}(id) ON DELETE SET NULL,
        invited_offer_article_id BIGINT REFERENCES ${FINAL_TABLE}(id) ON DELETE SET NULL,
        inviter_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
        invited_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
        trade_result JSONB,
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
        CREATE INDEX IF NOT EXISTS ${TRADES_TABLE}_participants_updated_idx
        ON ${TRADES_TABLE} (inviter_user_id, invited_user_id, updated_at DESC)
      `
    ),
    pool.query(
      `
        CREATE INDEX IF NOT EXISTS ${TRADES_TABLE}_status_updated_idx
        ON ${TRADES_TABLE} (status, updated_at DESC)
      `
    )
  ]);

  hasTradesTableCache = true;
}

export async function loadUserTradeState(userId, rarityLevels) {
  const safeUserId = Number(userId);

  if (!Number.isInteger(safeUserId) || safeUserId <= 0) {
    return { trade: null };
  }

  await ensureTradesTable();

  const result = await pool.query(
    `
      SELECT
        t.id,
        t.inviter_user_id,
        t.invited_user_id,
        t.status,
        t.inviter_offer_article_id,
        t.invited_offer_article_id,
        t.inviter_confirmed,
        t.invited_confirmed,
        t.trade_result,
        t.created_at,
        t.updated_at,
        t.responded_at,
        t.finished_at,
        inviter.username AS inviter_username,
        invited.username AS invited_username
      FROM ${TRADES_TABLE} t
      JOIN ${USERS_TABLE} inviter ON inviter.id = t.inviter_user_id
      JOIN ${USERS_TABLE} invited ON invited.id = t.invited_user_id
      WHERE (t.inviter_user_id = $1 OR t.invited_user_id = $1)
        AND t.status IN ('pending', 'active', 'finished')
      ORDER BY
        CASE
          WHEN t.status = 'pending' AND t.invited_user_id = $1 THEN 0
          WHEN t.status = 'active' THEN 1
          WHEN t.status = 'pending' THEN 2
          WHEN t.status = 'finished' THEN 3
          ELSE 4
        END,
        t.updated_at DESC
      LIMIT 1
    `,
    [safeUserId]
  );

  return {
    trade: await serializeTradeForUser(result.rows[0] || null, safeUserId, rarityLevels)
  };
}

export async function createTradeInvitation(inviterUserId, targetUserId, rarityLevels) {
  const safeInviterUserId = Number(inviterUserId);
  const safeTargetUserId = Number(targetUserId);

  if (!Number.isInteger(safeTargetUserId) || safeTargetUserId <= 0) {
    throw new HttpError(400, 'Выбери игрока для обмена.');
  }

  if (safeInviterUserId === safeTargetUserId) {
    throw new HttpError(400, 'Нельзя приглашать самого себя.');
  }

  await ensureTradesTable();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const inviterUser = await loadUserById(safeInviterUserId, client);
    const targetUser = await loadUserById(safeTargetUserId, client);
    const existingTrade = await loadActiveOrPendingTradeForUsers(
      [safeInviterUserId, safeTargetUserId],
      client
    );

    if (!inviterUser || !targetUser) {
      throw new HttpError(404, 'Игрок не найден.');
    }

    if (existingTrade) {
      throw new HttpError(409, 'У одного из игроков уже есть активный или ожидающий обмен.');
    }

    const created = await client.query(
      `
        INSERT INTO ${TRADES_TABLE} (
          inviter_user_id,
          invited_user_id,
          status,
          updated_at
        )
        VALUES ($1, $2, 'pending', NOW())
        RETURNING id
      `,
      [safeInviterUserId, safeTargetUserId]
    );

    await client.query('COMMIT');

    const tradeRow = await loadDecoratedTradeRowById(created.rows[0].id);
    return {
      trade: await serializeTradeForUser(tradeRow, safeInviterUserId, rarityLevels)
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function createTradeInvitationByUsername(inviterUserId, username, rarityLevels) {
  await ensureTradesTable();
  const targetUser = await loadUserByUsername(username);

  if (!targetUser) {
    throw new HttpError(404, 'Игрок с таким ником не найден.');
  }

  return createTradeInvitation(inviterUserId, targetUser.id, rarityLevels);
}

export async function respondToTradeInvitation(userId, tradeId, action, rarityLevels) {
  const safeUserId = Number(userId);
  const safeTradeId = Number(tradeId);
  const normalizedAction = typeof action === 'string' ? action.trim().toLowerCase() : '';

  if (!Number.isInteger(safeTradeId) || safeTradeId <= 0) {
    throw new HttpError(400, 'Некорректный идентификатор обмена.');
  }

  if (!['accept', 'decline'].includes(normalizedAction)) {
    throw new HttpError(400, 'Некорректное действие для приглашения.');
  }

  await ensureTradesTable();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const tradeRow = await loadTradeRowForUserUpdate(safeTradeId, safeUserId, client);

    if (!tradeRow) {
      throw new HttpError(404, 'Обмен не найден.');
    }

    if (Number(tradeRow.invited_user_id) !== safeUserId) {
      throw new HttpError(403, 'Только приглашённый игрок может ответить на обмен.');
    }

    if (tradeRow.status !== 'pending') {
      throw new HttpError(409, 'На это приглашение уже ответили.');
    }

    await client.query(
      `
        UPDATE ${TRADES_TABLE}
        SET status = $1,
            responded_at = NOW(),
            updated_at = NOW()
        WHERE id = $2
      `,
      [normalizedAction === 'accept' ? 'active' : 'declined', safeTradeId]
    );

    await client.query('COMMIT');
    return loadUserTradeState(safeUserId, rarityLevels);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function leaveTrade(userId, tradeId, rarityLevels) {
  const safeUserId = Number(userId);
  const safeTradeId = Number(tradeId);

  if (!Number.isInteger(safeTradeId) || safeTradeId <= 0) {
    throw new HttpError(400, 'Некорректный идентификатор обмена.');
  }

  await ensureTradesTable();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const tradeRow = await loadTradeRowForUserUpdate(safeTradeId, safeUserId, client);

    if (!tradeRow) {
      throw new HttpError(404, 'Обмен не найден.');
    }

    if (!['pending', 'active'].includes(tradeRow.status)) {
      throw new HttpError(409, 'Этот обмен уже нельзя отменить.');
    }

    if (tradeRow.status === 'pending') {
      await client.query(
        `
          UPDATE ${TRADES_TABLE}
          SET status = 'declined',
              responded_at = NOW(),
              finished_at = NOW(),
              updated_at = NOW()
          WHERE id = $1
        `,
        [safeTradeId]
      );
    } else {
      const cancellingUser = await loadUserById(safeUserId, client);

      await client.query(
        `
          UPDATE ${TRADES_TABLE}
          SET status = 'finished',
              trade_result = $1::jsonb,
              finished_at = NOW(),
              updated_at = NOW()
          WHERE id = $2
        `,
        [
          JSON.stringify({
            resolution: 'cancelled',
            inviterArticleId: normalizeArticleId(tradeRow.inviter_offer_article_id),
            invitedArticleId: normalizeArticleId(tradeRow.invited_offer_article_id),
            cancelledByUserId: safeUserId,
            cancelledByUsername: cancellingUser?.username || null
          }),
          safeTradeId
        ]
      );
    }

    await client.query('COMMIT');
    return loadUserTradeState(safeUserId, rarityLevels);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function submitTradeOffer(userId, tradeId, articleId, rarityLevels) {
  const safeUserId = Number(userId);
  const safeTradeId = Number(tradeId);
  const nextArticleId = normalizeArticleId(articleId);

  if (!Number.isInteger(safeTradeId) || safeTradeId <= 0) {
    throw new HttpError(400, 'Некорректный идентификатор обмена.');
  }

  await ensureTradesTable();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const tradeRow = await loadTradeRowForUserUpdate(safeTradeId, safeUserId, client);

    if (!tradeRow) {
      throw new HttpError(404, 'Обмен не найден.');
    }

    if (tradeRow.status !== 'active') {
      throw new HttpError(409, 'Выбирать карты можно только в активном обмене.');
    }

    if (nextArticleId) {
      await loadOwnedArticleOrThrow(safeUserId, nextArticleId, rarityLevels, client);
    }

    const isInviter = Number(tradeRow.inviter_user_id) === safeUserId;
    const inviteOfferColumn = isInviter ? 'inviter_offer_article_id' : 'invited_offer_article_id';
    const inviteConfirmedColumn = isInviter ? 'inviter_confirmed' : 'invited_confirmed';
    const opponentConfirmedColumn = isInviter ? 'invited_confirmed' : 'inviter_confirmed';

    await client.query(
      `
        UPDATE ${TRADES_TABLE}
        SET ${inviteOfferColumn} = $1,
            ${inviteConfirmedColumn} = FALSE,
            ${opponentConfirmedColumn} = FALSE,
            updated_at = NOW()
        WHERE id = $2
      `,
      [nextArticleId, safeTradeId]
    );

    await client.query('COMMIT');

    const updatedRow = await loadDecoratedTradeRowById(safeTradeId);
    return {
      trade: await serializeTradeForUser(updatedRow, safeUserId, rarityLevels)
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function confirmTradeOffer(userId, tradeId, rarityLevels) {
  const safeUserId = Number(userId);
  const safeTradeId = Number(tradeId);

  if (!Number.isInteger(safeTradeId) || safeTradeId <= 0) {
    throw new HttpError(400, 'Некорректный идентификатор обмена.');
  }

  await ensureTradesTable();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const tradeRow = await loadTradeRowForUserUpdate(safeTradeId, safeUserId, client);

    if (!tradeRow) {
      throw new HttpError(404, 'Обмен не найден.');
    }

    if (tradeRow.status !== 'active') {
      throw new HttpError(409, 'Подтверждать можно только активный обмен.');
    }

    const isInviter = Number(tradeRow.inviter_user_id) === safeUserId;
    const myOfferId = normalizeArticleId(isInviter ? tradeRow.inviter_offer_article_id : tradeRow.invited_offer_article_id);
    const opponentOfferId = normalizeArticleId(
      isInviter ? tradeRow.invited_offer_article_id : tradeRow.inviter_offer_article_id
    );
    const myConfirmed = isInviter ? Boolean(tradeRow.inviter_confirmed) : Boolean(tradeRow.invited_confirmed);
    const opponentConfirmed = isInviter
      ? Boolean(tradeRow.invited_confirmed)
      : Boolean(tradeRow.inviter_confirmed);

    if (!myOfferId) {
      throw new HttpError(409, 'Сначала выбери свою карту для обмена.');
    }

    if (!opponentOfferId) {
      throw new HttpError(409, 'Соперник ещё не выбрал карту для обмена.');
    }

    if (myConfirmed) {
      throw new HttpError(409, 'Ты уже подтвердил этот обмен.');
    }

    await client.query(
      `
        UPDATE ${TRADES_TABLE}
        SET ${isInviter ? 'inviter_confirmed' : 'invited_confirmed'} = TRUE,
            updated_at = NOW()
        WHERE id = $1
      `,
      [safeTradeId]
    );

    if (opponentConfirmed) {
      const updatedTradeRow = await loadTradeRowForUserUpdate(safeTradeId, safeUserId, client);
      await finalizeTradeSwap(updatedTradeRow, client);
    }

    await client.query('COMMIT');

    const updatedRow = await loadDecoratedTradeRowById(safeTradeId);
    return {
      trade: await serializeTradeForUser(updatedRow, safeUserId, rarityLevels)
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
