import { RARITY_ORDER } from '../../shared/rarity.mjs';

export const PACK_SIZE = 5;
export const PACK_FETCH_BATCH = PACK_SIZE * 4;
export const PACK_FETCH_ATTEMPTS = 4;
export const ARTICLE_PAGE_SIZE = 60;
export const RECENT_TITLES_LIMIT = 250;
export const NEXT_PACK_DELAY_MS = 1200;
export const TITLE_PROCESS_CONCURRENCY = 6;
export const AUTH_STORAGE_KEY = 'wiki-cards-auth-token';
export const ADMIN_SEARCH_LIMIT = 12;
export const ADMIN_SEARCH_MIN_LENGTH = 2;
export const BOSS_TEAM_SEARCH_LIMIT = 24;
export const BOSS_TEAM_SIZE = 5;
export const DUEL_TEAM_SEARCH_LIMIT = 24;
export const DUEL_TEAM_SIZE = 5;
export const DUEL_USER_SEARCH_MIN_LENGTH = 2;
export const DUEL_STATE_POLL_MS = 5000;
export const TRADE_CARD_SEARCH_LIMIT = 24;
export const TRADE_USER_SEARCH_MIN_LENGTH = 2;
export const TRADE_STATE_POLL_MS = 5000;
export const CLAN_PAGE_SIZE = 24;
export const CLAN_CHAT_MESSAGE_LIMIT = 80;
export const CLAN_CHAT_POLL_MS = 5000;
export const CLAN_STATE_POLL_MS = 5000;
export const CLAN_CHAT_MESSAGE_MAX_LENGTH = 600;
export const VIEW_MODES = {
  PACKS: 'packs',
  LIBRARY: 'library',
  COLLECTION: 'collection',
  BOSS: 'boss',
  DUEL: 'duel',
  TRADE: 'trade',
  CLANS: 'clans'
};
export { RARITY_ORDER };
export const STAT_LABELS = [
  { key: 'hp', label: 'HP' },
  { key: 'stamina', label: 'ST' },
  { key: 'strength', label: 'STR' },
  { key: 'dexterity', label: 'DEX' },
  { key: 'intelligence', label: 'INT' },
  { key: 'charisma', label: 'CHA' }
];
export const FALLBACK_EXTRACT = 'Краткое описание для этой статьи не найдено.';
export const EMPTY_AUTH_FORM = {
  username: '',
  email: '',
  password: ''
};
export const API_ENDPOINTS = {
  PACK: import.meta.env.VITE_PACK_API_ENDPOINT || '/api/pack',
  PACK_OPEN: import.meta.env.VITE_PACK_OPEN_API_ENDPOINT || '/api/pack/open',
  ARTICLES: import.meta.env.VITE_ARTICLES_API_ENDPOINT || '/api/articles',
  MY_ARTICLES: import.meta.env.VITE_MY_ARTICLES_API_ENDPOINT || '/api/my-articles',
  AUTH_REGISTER: import.meta.env.VITE_AUTH_REGISTER_ENDPOINT || '/api/auth/register',
  AUTH_LOGIN: import.meta.env.VITE_AUTH_LOGIN_ENDPOINT || '/api/auth/login',
  AUTH_ME: import.meta.env.VITE_AUTH_ME_ENDPOINT || '/api/auth/me',
  ADMIN_USERS: import.meta.env.VITE_ADMIN_USERS_ENDPOINT || '/api/admin/users',
  ADMIN_GRANT_CARD:
    import.meta.env.VITE_ADMIN_GRANT_CARD_ENDPOINT || '/api/admin/grant-card',
  ADMIN_CHANGE_BOSS:
    import.meta.env.VITE_ADMIN_CHANGE_BOSS_ENDPOINT || '/api/admin/change-boss',
  BOSS: import.meta.env.VITE_BOSS_ENDPOINT || '/api/boss',
  BOSS_BATTLE: import.meta.env.VITE_BOSS_BATTLE_ENDPOINT || '/api/boss/battle',
  CLAN_STATE: import.meta.env.VITE_CLAN_STATE_ENDPOINT || '/api/clans/state',
  CLANS: import.meta.env.VITE_CLANS_ENDPOINT || '/api/clans',
  CLAN_JOIN: import.meta.env.VITE_CLAN_JOIN_ENDPOINT || '/api/clans/join',
  CLAN_LEAVE: import.meta.env.VITE_CLAN_LEAVE_ENDPOINT || '/api/clans/leave',
  CLAN_KICK: import.meta.env.VITE_CLAN_KICK_ENDPOINT || '/api/clans/kick',
  CLAN_CURRENT: import.meta.env.VITE_CLAN_CURRENT_ENDPOINT || '/api/clans/current',
  CLAN_MESSAGES:
    import.meta.env.VITE_CLAN_MESSAGES_ENDPOINT || '/api/clans/current/messages',
  DUEL_STATE: import.meta.env.VITE_DUEL_STATE_ENDPOINT || '/api/duels/state',
  DUEL_USERS: import.meta.env.VITE_DUEL_USERS_ENDPOINT || '/api/duels/users',
  DUEL_INVITE: import.meta.env.VITE_DUEL_INVITE_ENDPOINT || '/api/duels/invite',
  DUEL_RESPOND: import.meta.env.VITE_DUEL_RESPOND_ENDPOINT || '/api/duels',
  DUEL_TEAM: import.meta.env.VITE_DUEL_TEAM_ENDPOINT || '/api/duels',
  DUEL_LEAVE: import.meta.env.VITE_DUEL_LEAVE_ENDPOINT || '/api/duels',
  TRADE_STATE: import.meta.env.VITE_TRADE_STATE_ENDPOINT || '/api/trades/state',
  TRADE_USERS: import.meta.env.VITE_TRADE_USERS_ENDPOINT || '/api/trades/users',
  TRADE_INVITE: import.meta.env.VITE_TRADE_INVITE_ENDPOINT || '/api/trades/invite',
  TRADE_RESPOND: import.meta.env.VITE_TRADE_RESPOND_ENDPOINT || '/api/trades',
  TRADE_OFFER: import.meta.env.VITE_TRADE_OFFER_ENDPOINT || '/api/trades',
  TRADE_CONFIRM: import.meta.env.VITE_TRADE_CONFIRM_ENDPOINT || '/api/trades',
  TRADE_LEAVE: import.meta.env.VITE_TRADE_LEAVE_ENDPOINT || '/api/trades'
};
