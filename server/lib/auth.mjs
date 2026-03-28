import {
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual
} from 'node:crypto';
import { promisify } from 'node:util';
import {
  AUTH_TOKEN_SECRET,
  AUTH_TOKEN_TTL_SECONDS,
  MIN_PASSWORD_LENGTH,
  SCRYPT_KEY_LENGTH,
  SCRYPT_SALT_BYTES,
  USERS_TABLE,
  pool
} from './config.mjs';
import { HttpError } from './errors.mjs';

const scrypt = promisify(scryptCallback);

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

export function serializeUser(row) {
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

export async function findUserById(id) {
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

export async function registerUser(body) {
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

export async function loginUser(body) {
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

export async function getCurrentUser(request) {
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

export async function getOptionalCurrentUser(request) {
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

export function assertAdminUser(user) {
  if (!user?.isAdmin) {
    throw new HttpError(403, 'Требуются права администратора.');
  }
}
