import {
  CLANS_TABLE,
  CLAN_MEMBERS_TABLE,
  CLAN_MESSAGES_TABLE,
  USERS_TABLE,
  pool
} from './config.mjs';
import { HttpError } from './errors.mjs';
import { ensureUsersTable, serializePublicUser } from './auth.mjs';
import { clamp } from './utils.mjs';

const CLAN_NAME_MIN_LENGTH = 3;
const CLAN_NAME_MAX_LENGTH = 40;
const CLAN_DESCRIPTION_MAX_LENGTH = 420;
const CLAN_PAGE_LIMIT_DEFAULT = 24;
const CLAN_PAGE_LIMIT_MAX = 60;
const CLAN_MESSAGE_MAX_LENGTH = 600;
const CLAN_MESSAGES_LIMIT_DEFAULT = 80;
const CLAN_MESSAGES_LIMIT_MAX = 120;

let hasClansTablesCache = false;

function normalizeClanName(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeClanDescription(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeClanMessage(value) {
  return typeof value === 'string' ? value.replace(/\r\n/g, '\n').trim() : '';
}

function validateClanPayload(body) {
  const name = normalizeClanName(body?.name);
  const description = normalizeClanDescription(body?.description);

  if (name.length < CLAN_NAME_MIN_LENGTH) {
    throw new HttpError(400, `Название клана должно быть не короче ${CLAN_NAME_MIN_LENGTH} символов.`);
  }

  if (name.length > CLAN_NAME_MAX_LENGTH) {
    throw new HttpError(400, `Название клана должно быть не длиннее ${CLAN_NAME_MAX_LENGTH} символов.`);
  }

  if (description.length > CLAN_DESCRIPTION_MAX_LENGTH) {
    throw new HttpError(400, `Описание клана должно быть не длиннее ${CLAN_DESCRIPTION_MAX_LENGTH} символов.`);
  }

  return {
    name,
    description
  };
}

function validateClanMessagePayload(body) {
  const message = normalizeClanMessage(body?.message);

  if (!message) {
    throw new HttpError(400, 'Сообщение не должно быть пустым.');
  }

  if (message.length > CLAN_MESSAGE_MAX_LENGTH) {
    throw new HttpError(400, `Сообщение не должно быть длиннее ${CLAN_MESSAGE_MAX_LENGTH} символов.`);
  }

  return {
    message
  };
}

function serializeClanSummary(row, currentUserId = null) {
  const safeCurrentUserId = Number(currentUserId);
  const ownerUserId = Number(row.owner_user_id);

  return {
    id: Number(row.id),
    name: row.name,
    description: row.description || '',
    owner: serializePublicUser({
      id: ownerUserId,
      username: row.owner_username
    }),
    memberCount: Number(row.member_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isOwner: ownerUserId === safeCurrentUserId
  };
}

function serializeClanMember(row, ownerUserId) {
  const userId = Number(row.user_id);

  return {
    id: userId,
    username: row.username,
    joinedAt: row.joined_at,
    isOwner: userId === Number(ownerUserId)
  };
}

function serializeClanDetails(row, currentUserId, members) {
  return {
    ...serializeClanSummary(row, currentUserId),
    members: Array.isArray(members) ? members : []
  };
}

function serializeClanMessage(row, currentUserId = null) {
  const authorUserId = Number(row.user_id);

  return {
    id: Number(row.id),
    message: row.message,
    createdAt: row.created_at,
    author: serializePublicUser({
      id: authorUserId,
      username: row.username
    }),
    isMine: authorUserId === Number(currentUserId)
  };
}

async function loadDecoratedClanById(clanId, db = pool) {
  const result = await db.query(
    `
      SELECT
        c.id,
        c.name,
        c.description,
        c.owner_user_id,
        c.created_at,
        c.updated_at,
        owner.username AS owner_username,
        COUNT(m.user_id)::INTEGER AS member_count
      FROM ${CLANS_TABLE} c
      JOIN ${USERS_TABLE} owner ON owner.id = c.owner_user_id
      LEFT JOIN ${CLAN_MEMBERS_TABLE} m ON m.clan_id = c.id
      WHERE c.id = $1
      GROUP BY c.id, c.name, c.description, c.owner_user_id, c.created_at, c.updated_at, owner.username
      LIMIT 1
    `,
    [clanId]
  );

  return result.rows[0] || null;
}

async function loadDecoratedClanByUserId(userId, db = pool) {
  const result = await db.query(
    `
      SELECT
        c.id,
        c.name,
        c.description,
        c.owner_user_id,
        c.created_at,
        c.updated_at,
        owner.username AS owner_username,
        COUNT(m.user_id)::INTEGER AS member_count
      FROM ${CLANS_TABLE} c
      JOIN ${CLAN_MEMBERS_TABLE} self_member ON self_member.clan_id = c.id
      JOIN ${USERS_TABLE} owner ON owner.id = c.owner_user_id
      LEFT JOIN ${CLAN_MEMBERS_TABLE} m ON m.clan_id = c.id
      WHERE self_member.user_id = $1
      GROUP BY c.id, c.name, c.description, c.owner_user_id, c.created_at, c.updated_at, owner.username
      LIMIT 1
    `,
    [userId]
  );

  return result.rows[0] || null;
}

async function loadClanMembershipByUserId(userId, db = pool) {
  const result = await db.query(
    `
      SELECT clan_id
      FROM ${CLAN_MEMBERS_TABLE}
      WHERE user_id = $1
      LIMIT 1
    `,
    [userId]
  );

  return result.rows[0] || null;
}

async function loadClanMembers(clanId, ownerUserId, db = pool) {
  const result = await db.query(
    `
      SELECT
        m.user_id,
        m.joined_at,
        u.username
      FROM ${CLAN_MEMBERS_TABLE} m
      JOIN ${USERS_TABLE} u ON u.id = m.user_id
      WHERE m.clan_id = $1
      ORDER BY
        CASE WHEN m.user_id = $2 THEN 0 ELSE 1 END,
        m.joined_at ASC,
        u.username ASC
    `,
    [clanId, ownerUserId]
  );

  return result.rows.map((row) => serializeClanMember(row, ownerUserId));
}

async function loadClanMessagesByClanId(
  clanId,
  currentUserId = null,
  limit = CLAN_MESSAGES_LIMIT_DEFAULT,
  db = pool
) {
  const safeClanId = Number(clanId);
  const safeLimit = clamp(Number(limit) || CLAN_MESSAGES_LIMIT_DEFAULT, 1, CLAN_MESSAGES_LIMIT_MAX);
  const result = await db.query(
    `
      SELECT
        m.id,
        m.user_id,
        m.message,
        m.created_at,
        u.username
      FROM ${CLAN_MESSAGES_TABLE} m
      JOIN ${USERS_TABLE} u ON u.id = m.user_id
      WHERE m.clan_id = $1
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT $2
    `,
    [safeClanId, safeLimit]
  );

  return result.rows.reverse().map((row) => serializeClanMessage(row, currentUserId));
}

function isClanNameConflict(error) {
  return (
    error?.code === '23505' &&
    (error.constraint === `${CLANS_TABLE}_name_lower_uidx` || error.constraint === `${CLANS_TABLE}_name_key`)
  );
}

export async function ensureClansTables() {
  if (hasClansTablesCache) {
    return;
  }

  await ensureUsersTable();

  await pool.query(
    `
      CREATE TABLE IF NOT EXISTS ${CLANS_TABLE} (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        owner_user_id BIGINT NOT NULL REFERENCES ${USERS_TABLE}(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
  );

  await pool.query(
    `
      CREATE TABLE IF NOT EXISTS ${CLAN_MEMBERS_TABLE} (
        clan_id BIGINT NOT NULL REFERENCES ${CLANS_TABLE}(id) ON DELETE CASCADE,
        user_id BIGINT NOT NULL REFERENCES ${USERS_TABLE}(id) ON DELETE CASCADE,
        joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (clan_id, user_id),
        UNIQUE (user_id)
      )
    `
  );

  await pool.query(
    `
      CREATE TABLE IF NOT EXISTS ${CLAN_MESSAGES_TABLE} (
        id BIGSERIAL PRIMARY KEY,
        clan_id BIGINT NOT NULL REFERENCES ${CLANS_TABLE}(id) ON DELETE CASCADE,
        user_id BIGINT NOT NULL REFERENCES ${USERS_TABLE}(id) ON DELETE CASCADE,
        message TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
  );

  await Promise.all([
    pool.query(
      `
        CREATE UNIQUE INDEX IF NOT EXISTS ${CLANS_TABLE}_name_lower_uidx
        ON ${CLANS_TABLE} (LOWER(name))
      `
    ),
    pool.query(
      `
        CREATE INDEX IF NOT EXISTS ${CLANS_TABLE}_updated_at_idx
        ON ${CLANS_TABLE} (updated_at DESC)
      `
    ),
    pool.query(
      `
        CREATE INDEX IF NOT EXISTS ${CLAN_MEMBERS_TABLE}_clan_joined_idx
        ON ${CLAN_MEMBERS_TABLE} (clan_id, joined_at ASC)
      `
    ),
    pool.query(
      `
        CREATE INDEX IF NOT EXISTS ${CLAN_MESSAGES_TABLE}_clan_created_idx
        ON ${CLAN_MESSAGES_TABLE} (clan_id, created_at DESC, id DESC)
      `
    )
  ]);

  hasClansTablesCache = true;
}

export async function loadCurrentUserClan(userId) {
  const safeUserId = Number(userId);

  if (!Number.isInteger(safeUserId) || safeUserId <= 0) {
    return { clan: null };
  }

  await ensureClansTables();

  const clanRow = await loadDecoratedClanByUserId(safeUserId);

  if (!clanRow) {
    return { clan: null };
  }

  const members = await loadClanMembers(clanRow.id, clanRow.owner_user_id);

  return {
    clan: serializeClanDetails(clanRow, safeUserId, members)
  };
}

export async function loadClansPage(offset, limit, search, currentUserId = null) {
  await ensureClansTables();

  const safeOffset = Math.max(Number(offset) || 0, 0);
  const safeLimit = clamp(Number(limit) || CLAN_PAGE_LIMIT_DEFAULT, 1, CLAN_PAGE_LIMIT_MAX);
  const normalizedSearch = normalizeClanName(search);
  const values = [];
  let whereClause = '';

  if (normalizedSearch) {
    values.push(`%${normalizedSearch}%`);
    whereClause = `
      WHERE
        c.name ILIKE $1
        OR COALESCE(c.description, '') ILIKE $1
        OR owner.username ILIKE $1
    `;
  }

  const rowsValues = [...values, safeOffset, safeLimit];
  const offsetParameter = rowsValues.length - 1;
  const limitParameter = rowsValues.length;

  const rowsResult = await pool.query(
    `
      SELECT
        c.id,
        c.name,
        c.description,
        c.owner_user_id,
        c.created_at,
        c.updated_at,
        owner.username AS owner_username,
        COUNT(m.user_id)::INTEGER AS member_count
      FROM ${CLANS_TABLE} c
      JOIN ${USERS_TABLE} owner ON owner.id = c.owner_user_id
      LEFT JOIN ${CLAN_MEMBERS_TABLE} m ON m.clan_id = c.id
      ${whereClause}
      GROUP BY c.id, c.name, c.description, c.owner_user_id, c.created_at, c.updated_at, owner.username
      ORDER BY COUNT(m.user_id) DESC, c.updated_at DESC, c.name ASC
      OFFSET $${offsetParameter}
      LIMIT $${limitParameter}
    `,
    rowsValues
  );

  const totalResult = await pool.query(
    `
      SELECT COUNT(*)::BIGINT AS total
      FROM ${CLANS_TABLE} c
      JOIN ${USERS_TABLE} owner ON owner.id = c.owner_user_id
      ${whereClause}
    `,
    values
  );

  return {
    clans: rowsResult.rows.map((row) => serializeClanSummary(row, currentUserId)),
    total: Number(totalResult.rows[0]?.total || 0),
    offset: safeOffset,
    limit: safeLimit,
    search: normalizedSearch
  };
}

export async function createClan(userId, body) {
  const safeUserId = Number(userId);

  if (!Number.isInteger(safeUserId) || safeUserId <= 0) {
    throw new HttpError(400, 'Некорректный пользователь.');
  }

  await ensureClansTables();
  const { name, description } = validateClanPayload(body);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const existingMembership = await client.query(
      `
        SELECT clan_id
        FROM ${CLAN_MEMBERS_TABLE}
        WHERE user_id = $1
        LIMIT 1
        FOR UPDATE
      `,
      [safeUserId]
    );

    if (existingMembership.rows[0]) {
      throw new HttpError(409, 'Ты уже состоишь в клане.');
    }

    const createdClan = await client.query(
      `
        INSERT INTO ${CLANS_TABLE} (name, description, owner_user_id, updated_at)
        VALUES ($1, $2, $3, NOW())
        RETURNING id
      `,
      [name, description, safeUserId]
    );

    const clanId = Number(createdClan.rows[0].id);

    await client.query(
      `
        INSERT INTO ${CLAN_MEMBERS_TABLE} (clan_id, user_id)
        VALUES ($1, $2)
      `,
      [clanId, safeUserId]
    );

    await client.query('COMMIT');

    const clanRow = await loadDecoratedClanById(clanId);
    const members = await loadClanMembers(clanId, safeUserId);

    return {
      clan: serializeClanDetails(clanRow, safeUserId, members)
    };
  } catch (error) {
    await client.query('ROLLBACK');

    if (isClanNameConflict(error)) {
      throw new HttpError(409, 'Клан с таким названием уже существует.');
    }

    throw error;
  } finally {
    client.release();
  }
}

export async function joinClan(userId, clanId) {
  const safeUserId = Number(userId);
  const safeClanId = Number(clanId);

  if (!Number.isInteger(safeUserId) || safeUserId <= 0) {
    throw new HttpError(400, 'Некорректный пользователь.');
  }

  if (!Number.isInteger(safeClanId) || safeClanId <= 0) {
    throw new HttpError(400, 'Некорректный идентификатор клана.');
  }

  await ensureClansTables();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const existingMembership = await client.query(
      `
        SELECT clan_id
        FROM ${CLAN_MEMBERS_TABLE}
        WHERE user_id = $1
        LIMIT 1
        FOR UPDATE
      `,
      [safeUserId]
    );

    if (existingMembership.rows[0]) {
      throw new HttpError(409, 'Ты уже состоишь в клане.');
    }

    const targetClan = await client.query(
      `
        SELECT id
        FROM ${CLANS_TABLE}
        WHERE id = $1
        LIMIT 1
        FOR UPDATE
      `,
      [safeClanId]
    );

    if (!targetClan.rows[0]) {
      throw new HttpError(404, 'Клан не найден.');
    }

    await client.query(
      `
        INSERT INTO ${CLAN_MEMBERS_TABLE} (clan_id, user_id)
        VALUES ($1, $2)
      `,
      [safeClanId, safeUserId]
    );

    await client.query(
      `
        UPDATE ${CLANS_TABLE}
        SET updated_at = NOW()
        WHERE id = $1
      `,
      [safeClanId]
    );

    await client.query('COMMIT');

    const clanRow = await loadDecoratedClanById(safeClanId);
    const members = await loadClanMembers(safeClanId, clanRow.owner_user_id);

    return {
      clan: serializeClanDetails(clanRow, safeUserId, members)
    };
  } catch (error) {
    await client.query('ROLLBACK');

    if (error?.code === '23505' && error.constraint === `${CLAN_MEMBERS_TABLE}_user_id_key`) {
      throw new HttpError(409, 'Ты уже состоишь в клане.');
    }

    throw error;
  } finally {
    client.release();
  }
}

export async function leaveCurrentClan(userId) {
  const safeUserId = Number(userId);

  if (!Number.isInteger(safeUserId) || safeUserId <= 0) {
    throw new HttpError(400, 'Некорректный пользователь.');
  }

  await ensureClansTables();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const membership = await client.query(
      `
        SELECT clan_id
        FROM ${CLAN_MEMBERS_TABLE}
        WHERE user_id = $1
        LIMIT 1
        FOR UPDATE
      `,
      [safeUserId]
    );

    const membershipRow = membership.rows[0];

    if (!membershipRow) {
      throw new HttpError(409, 'Ты не состоишь в клане.');
    }

    const clanId = Number(membershipRow.clan_id);
    const clanResult = await client.query(
      `
        SELECT id, owner_user_id
        FROM ${CLANS_TABLE}
        WHERE id = $1
        LIMIT 1
        FOR UPDATE
      `,
      [clanId]
    );

    const clanRow = clanResult.rows[0];

    if (!clanRow) {
      await client.query('COMMIT');
      return { clan: null };
    }

    await client.query(
      `
        DELETE FROM ${CLAN_MEMBERS_TABLE}
        WHERE user_id = $1
      `,
      [safeUserId]
    );

    const remainingMembers = await client.query(
      `
        SELECT user_id
        FROM ${CLAN_MEMBERS_TABLE}
        WHERE clan_id = $1
        ORDER BY joined_at ASC, user_id ASC
      `,
      [clanId]
    );

    if (remainingMembers.rows.length === 0) {
      await client.query(
        `
          DELETE FROM ${CLANS_TABLE}
          WHERE id = $1
        `,
        [clanId]
      );
    } else {
      const nextOwnerUserId =
        Number(clanRow.owner_user_id) === safeUserId
          ? Number(remainingMembers.rows[0].user_id)
          : Number(clanRow.owner_user_id);

      await client.query(
        `
          UPDATE ${CLANS_TABLE}
          SET owner_user_id = $1,
              updated_at = NOW()
          WHERE id = $2
        `,
        [nextOwnerUserId, clanId]
      );
    }

    await client.query('COMMIT');

    return { clan: null };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateCurrentClan(userId, body) {
  const safeUserId = Number(userId);

  if (!Number.isInteger(safeUserId) || safeUserId <= 0) {
    throw new HttpError(400, 'Некорректный пользователь.');
  }

  await ensureClansTables();
  const { name, description } = validateClanPayload(body);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const membership = await client.query(
      `
        SELECT clan_id
        FROM ${CLAN_MEMBERS_TABLE}
        WHERE user_id = $1
        LIMIT 1
        FOR UPDATE
      `,
      [safeUserId]
    );

    const membershipRow = membership.rows[0];

    if (!membershipRow) {
      throw new HttpError(409, 'Сначала вступи в клан.');
    }

    const clanId = Number(membershipRow.clan_id);

    const targetClan = await client.query(
      `
        SELECT id
        FROM ${CLANS_TABLE}
        WHERE id = $1
        LIMIT 1
        FOR UPDATE
      `,
      [clanId]
    );

    if (!targetClan.rows[0]) {
      throw new HttpError(404, 'Клан не найден.');
    }

    await client.query(
      `
        UPDATE ${CLANS_TABLE}
        SET name = $1,
            description = $2,
            updated_at = NOW()
        WHERE id = $3
      `,
      [name, description, clanId]
    );

    await client.query('COMMIT');

    const clanRow = await loadDecoratedClanById(clanId);
    const members = await loadClanMembers(clanId, clanRow.owner_user_id);

    return {
      clan: serializeClanDetails(clanRow, safeUserId, members)
    };
  } catch (error) {
    await client.query('ROLLBACK');

    if (isClanNameConflict(error)) {
      throw new HttpError(409, 'Клан с таким названием уже существует.');
    }

    throw error;
  } finally {
    client.release();
  }
}

export async function removeClanMember(userId, targetUserId) {
  const safeUserId = Number(userId);
  const safeTargetUserId = Number(targetUserId);

  if (!Number.isInteger(safeUserId) || safeUserId <= 0) {
    throw new HttpError(400, 'Некорректный пользователь.');
  }

  if (!Number.isInteger(safeTargetUserId) || safeTargetUserId <= 0) {
    throw new HttpError(400, 'Некорректный участник клана.');
  }

  await ensureClansTables();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const membership = await client.query(
      `
        SELECT clan_id
        FROM ${CLAN_MEMBERS_TABLE}
        WHERE user_id = $1
        LIMIT 1
        FOR UPDATE
      `,
      [safeUserId]
    );

    const membershipRow = membership.rows[0];

    if (!membershipRow) {
      throw new HttpError(409, 'Сначала вступи в клан.');
    }

    const clanId = Number(membershipRow.clan_id);
    const clanResult = await client.query(
      `
        SELECT id, owner_user_id
        FROM ${CLANS_TABLE}
        WHERE id = $1
        LIMIT 1
        FOR UPDATE
      `,
      [clanId]
    );

    const clanRow = clanResult.rows[0];

    if (!clanRow) {
      throw new HttpError(404, 'Клан не найден.');
    }

    if (Number(clanRow.owner_user_id) !== safeUserId) {
      throw new HttpError(403, 'Удалять участников может только лидер клана.');
    }

    if (safeTargetUserId === safeUserId) {
      throw new HttpError(409, 'Лидер не может удалить сам себя. Используй выход из клана.');
    }

    const targetMembership = await client.query(
      `
        SELECT user_id
        FROM ${CLAN_MEMBERS_TABLE}
        WHERE clan_id = $1
          AND user_id = $2
        LIMIT 1
        FOR UPDATE
      `,
      [clanId, safeTargetUserId]
    );

    if (!targetMembership.rows[0]) {
      throw new HttpError(404, 'Участник не найден в этом клане.');
    }

    await client.query(
      `
        DELETE FROM ${CLAN_MEMBERS_TABLE}
        WHERE clan_id = $1
          AND user_id = $2
      `,
      [clanId, safeTargetUserId]
    );

    await client.query(
      `
        UPDATE ${CLANS_TABLE}
        SET updated_at = NOW()
        WHERE id = $1
      `,
      [clanId]
    );

    await client.query('COMMIT');

    const updatedClanRow = await loadDecoratedClanById(clanId);
    const members = await loadClanMembers(clanId, safeUserId);

    return {
      clan: serializeClanDetails(updatedClanRow, safeUserId, members)
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function loadCurrentClanMessages(userId, limit = CLAN_MESSAGES_LIMIT_DEFAULT) {
  const safeUserId = Number(userId);

  if (!Number.isInteger(safeUserId) || safeUserId <= 0) {
    throw new HttpError(400, 'Некорректный пользователь.');
  }

  await ensureClansTables();
  const membership = await loadClanMembershipByUserId(safeUserId);

  if (!membership) {
    throw new HttpError(409, 'Сначала вступи в клан.');
  }

  const clanId = Number(membership.clan_id);
  const messages = await loadClanMessagesByClanId(clanId, safeUserId, limit);

  return {
    clanId,
    messages
  };
}

export async function createClanMessage(userId, body) {
  const safeUserId = Number(userId);

  if (!Number.isInteger(safeUserId) || safeUserId <= 0) {
    throw new HttpError(400, 'Некорректный пользователь.');
  }

  await ensureClansTables();
  const { message } = validateClanMessagePayload(body);

  const insertResult = await pool.query(
    `
      INSERT INTO ${CLAN_MESSAGES_TABLE} (clan_id, user_id, message)
      SELECT clan_id, user_id, $2
      FROM ${CLAN_MEMBERS_TABLE}
      WHERE user_id = $1
      RETURNING id, clan_id
    `,
    [safeUserId, message]
  );

  if (!insertResult.rows[0]) {
    throw new HttpError(409, 'Сначала вступи в клан.');
  }

  const clanId = Number(insertResult.rows[0].clan_id);
  const messages = await loadClanMessagesByClanId(clanId, safeUserId);

  return {
    clanId,
    messages
  };
}
