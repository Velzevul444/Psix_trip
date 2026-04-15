import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pgPackage from 'pg';
import './load-env.mjs';

const { Pool } = pgPackage;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseCsvList(value) {
  if (typeof value !== 'string') {
    return [];
  }

  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://wiki:wiki@localhost:5432/postgres';
export const API_PORT = Number(process.env.PORT || process.env.API_PORT || 3001);
export const FINAL_TABLE = process.env.WIKI_TABLE_NAME || 'wiki_articles';
export const USERS_TABLE = process.env.USERS_TABLE_NAME || 'users';
export const USER_ARTICLE_DROPS_TABLE =
  process.env.USER_ARTICLE_DROPS_TABLE_NAME || 'user_article_drops';
export const BOSSES_TABLE = process.env.BOSSES_TABLE_NAME || 'bosses';
export const BOSS_CARD_DEFEATS_TABLE =
  process.env.BOSS_CARD_DEFEATS_TABLE_NAME || 'boss_card_defeats';
export const DUELS_TABLE = process.env.DUELS_TABLE_NAME || 'duels';
export const TRADES_TABLE = process.env.TRADES_TABLE_NAME || 'trades';
export const CLANS_TABLE = process.env.CLANS_TABLE_NAME || 'clans';
export const CLAN_MEMBERS_TABLE = process.env.CLAN_MEMBERS_TABLE_NAME || 'clan_members';
export const CLAN_MESSAGES_TABLE = process.env.CLAN_MESSAGES_TABLE_NAME || 'clan_messages';
export const MAX_RARITY_ROLL_ATTEMPTS = 25;
export const ARTICLES_PAGE_LIMIT_DEFAULT = Number(
  process.env.ARTICLES_PAGE_LIMIT_DEFAULT || 60
);
export const ARTICLES_PAGE_LIMIT_MAX = Number(process.env.ARTICLES_PAGE_LIMIT_MAX || 200);
export const ADMIN_USER_SEARCH_LIMIT_DEFAULT = Number(
  process.env.ADMIN_USER_SEARCH_LIMIT_DEFAULT || 12
);
export const ADMIN_USER_SEARCH_LIMIT_MAX = Number(
  process.env.ADMIN_USER_SEARCH_LIMIT_MAX || 30
);
export const ARTICLE_STATS_COLUMNS = [
  'hp',
  'stamina',
  'strength',
  'dexterity',
  'intelligence',
  'charisma'
];
export const COMBAT_STAT_KEYS = [
  'strength',
  'dexterity',
  'intelligence',
  'charisma',
  'stamina'
];
export const BOSS_TEAM_SIZE = 5;
export const DUEL_TEAM_SIZE = 5;
export const BOSS_HP_MULTIPLIER = Number(process.env.BOSS_HP_MULTIPLIER || 10);
export const BOSS_CARD_RECOVERY_MINUTES = Number(
  process.env.BOSS_CARD_RECOVERY_MINUTES || 30
);
export const AUTH_TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET || 'dev-only-change-me';
export const AUTH_TOKEN_TTL_SECONDS = Number(
  process.env.AUTH_TOKEN_TTL_SECONDS || 60 * 60 * 24 * 7
);
export const BOOTSTRAP_ADMIN_EMAILS = parseCsvList(
  process.env.BOOTSTRAP_ADMIN_EMAILS || 'qwe@gmail.com'
);
export const MIN_PASSWORD_LENGTH = 6;
export const SCRYPT_KEY_LENGTH = 64;
export const SCRYPT_SALT_BYTES = 16;
export const DIST_DIR = path.resolve(__dirname, '../../dist');
export const STATIC_CONTENT_TYPES = {
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

export const pool = new Pool({
  connectionString: DATABASE_URL
});
