import { ADMIN_SEARCH_LIMIT, API_ENDPOINTS } from './constants';

function buildAuthHeaders(token, withJson = false) {
  const headers = {};

  if (withJson) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

async function readJson(response) {
  return response.json().catch(() => ({}));
}

export async function fetchPackCandidates(count, excludeTitles, authToken = '') {
  const response = await fetch(API_ENDPOINTS.PACK, {
    method: 'POST',
    headers: buildAuthHeaders(authToken, true),
    body: JSON.stringify({
      count,
      excludeTitles
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to load pack candidates: ${response.status}`);
  }

  return response.json();
}

export async function openPackSelection(cards, authToken = '') {
  const serializedCards = Array.isArray(cards)
    ? cards
        .map((card) => ({
          sessionId: typeof card?.packSessionId === 'string' ? card.packSessionId : '',
          articleId: Number(card?.sourceId)
        }))
        .filter((card) => card.sessionId && Number.isInteger(card.articleId) && card.articleId > 0)
    : [];

  const response = await fetch(API_ENDPOINTS.PACK_OPEN, {
    method: 'POST',
    headers: buildAuthHeaders(authToken, true),
    body: JSON.stringify({
      cards: serializedCards
    })
  });
  const data = await readJson(response);

  if (!response.ok) {
    throw new Error(data.error || `Failed to save opened pack: ${response.status}`);
  }

  return data;
}

export async function fetchArticlesPage(offset, limit, options = {}) {
  const params = new URLSearchParams({
    offset: String(offset),
    limit: String(limit)
  });

  if (options.search) {
    params.set('search', options.search);
  }

  if (options.rarity) {
    params.set('rarity', options.rarity);
  }

  const response = await fetch(`${API_ENDPOINTS.ARTICLES}?${params.toString()}`);

  if (!response.ok) {
    throw new Error(`Failed to load articles: ${response.status}`);
  }

  return response.json();
}

export async function fetchMyArticlesPage(offset, limit, authToken, options = {}) {
  const params = new URLSearchParams({
    offset: String(offset),
    limit: String(limit)
  });

  if (options.search) {
    params.set('search', options.search);
  }

  if (options.rarity) {
    params.set('rarity', options.rarity);
  }

  const response = await fetch(`${API_ENDPOINTS.MY_ARTICLES}?${params.toString()}`, {
    headers: buildAuthHeaders(authToken)
  });
  const data = await readJson(response);

  if (!response.ok) {
    throw new Error(data.error || `Failed to load user articles: ${response.status}`);
  }

  return data;
}

export async function fetchAdminUsers(search, authToken) {
  const params = new URLSearchParams({
    search,
    limit: String(ADMIN_SEARCH_LIMIT)
  });

  const response = await fetch(`${API_ENDPOINTS.ADMIN_USERS}?${params.toString()}`, {
    headers: buildAuthHeaders(authToken)
  });
  const data = await readJson(response);

  if (!response.ok) {
    throw new Error(data.error || `Failed to load users: ${response.status}`);
  }

  return data;
}

export async function grantCardToUser(userId, articleId, authToken) {
  const response = await fetch(API_ENDPOINTS.ADMIN_GRANT_CARD, {
    method: 'POST',
    headers: buildAuthHeaders(authToken, true),
    body: JSON.stringify({
      userId,
      articleId
    })
  });
  const data = await readJson(response);

  if (!response.ok) {
    throw new Error(data.error || `Failed to grant card: ${response.status}`);
  }

  return data;
}

export async function changeBossArticle(articleId, authToken) {
  const response = await fetch(API_ENDPOINTS.ADMIN_CHANGE_BOSS, {
    method: 'POST',
    headers: buildAuthHeaders(authToken, true),
    body: JSON.stringify({
      articleId
    })
  });
  const data = await readJson(response);

  if (!response.ok) {
    throw new Error(data.error || `Failed to change boss: ${response.status}`);
  }

  return data;
}

export async function fetchCurrentBoss(authToken = '') {
  const response = await fetch(API_ENDPOINTS.BOSS, {
    headers: buildAuthHeaders(authToken)
  });
  const data = await readJson(response);

  if (!response.ok) {
    throw new Error(data.error || `Failed to load boss: ${response.status}`);
  }

  return data;
}

export async function fetchClanState(authToken) {
  const response = await fetch(API_ENDPOINTS.CLAN_STATE, {
    headers: buildAuthHeaders(authToken)
  });
  const data = await readJson(response);

  if (!response.ok) {
    throw new Error(data.error || `Failed to load clan state: ${response.status}`);
  }

  return data;
}

export async function fetchClansPage(offset, limit, authToken, options = {}) {
  const params = new URLSearchParams({
    offset: String(offset),
    limit: String(limit)
  });

  if (options.search) {
    params.set('search', options.search);
  }

  const response = await fetch(`${API_ENDPOINTS.CLANS}?${params.toString()}`, {
    headers: buildAuthHeaders(authToken)
  });
  const data = await readJson(response);

  if (!response.ok) {
    throw new Error(data.error || `Failed to load clans: ${response.status}`);
  }

  return data;
}

export async function createClanRequest(payload, authToken) {
  const response = await fetch(API_ENDPOINTS.CLANS, {
    method: 'POST',
    headers: buildAuthHeaders(authToken, true),
    body: JSON.stringify(payload)
  });
  const data = await readJson(response);

  if (!response.ok) {
    throw new Error(data.error || `Failed to create clan: ${response.status}`);
  }

  return data;
}

export async function joinClanRequest(clanId, authToken) {
  const response = await fetch(API_ENDPOINTS.CLAN_JOIN, {
    method: 'POST',
    headers: buildAuthHeaders(authToken, true),
    body: JSON.stringify({ clanId })
  });
  const data = await readJson(response);

  if (!response.ok) {
    throw new Error(data.error || `Failed to join clan: ${response.status}`);
  }

  return data;
}

export async function leaveClanRequest(authToken) {
  const response = await fetch(API_ENDPOINTS.CLAN_LEAVE, {
    method: 'POST',
    headers: buildAuthHeaders(authToken, true),
    body: JSON.stringify({})
  });
  const data = await readJson(response);

  if (!response.ok) {
    throw new Error(data.error || `Failed to leave clan: ${response.status}`);
  }

  return data;
}

export async function removeClanMemberRequest(userId, authToken) {
  const response = await fetch(API_ENDPOINTS.CLAN_KICK, {
    method: 'POST',
    headers: buildAuthHeaders(authToken, true),
    body: JSON.stringify({ userId })
  });
  const data = await readJson(response);

  if (!response.ok) {
    throw new Error(data.error || `Failed to remove clan member: ${response.status}`);
  }

  return data;
}

export async function updateCurrentClanRequest(payload, authToken) {
  const response = await fetch(API_ENDPOINTS.CLAN_CURRENT, {
    method: 'POST',
    headers: buildAuthHeaders(authToken, true),
    body: JSON.stringify(payload)
  });
  const data = await readJson(response);

  if (!response.ok) {
    throw new Error(data.error || `Failed to update clan: ${response.status}`);
  }

  return data;
}

export async function fetchClanMessages(authToken, limit) {
  const params = new URLSearchParams();

  if (limit) {
    params.set('limit', String(limit));
  }

  const response = await fetch(
    `${API_ENDPOINTS.CLAN_MESSAGES}${params.toString() ? `?${params.toString()}` : ''}`,
    {
      headers: buildAuthHeaders(authToken)
    }
  );
  const data = await readJson(response);

  if (!response.ok) {
    throw new Error(data.error || `Failed to load clan chat: ${response.status}`);
  }

  return data;
}

export async function sendClanMessageRequest(message, authToken) {
  const response = await fetch(API_ENDPOINTS.CLAN_MESSAGES, {
    method: 'POST',
    headers: buildAuthHeaders(authToken, true),
    body: JSON.stringify({ message })
  });
  const data = await readJson(response);

  if (!response.ok) {
    throw new Error(data.error || `Failed to send clan message: ${response.status}`);
  }

  return data;
}

export async function submitBossBattle(articleIds, authToken) {
  const response = await fetch(API_ENDPOINTS.BOSS_BATTLE, {
    method: 'POST',
    headers: buildAuthHeaders(authToken, true),
    body: JSON.stringify({
      articleIds
    })
  });
  const data = await readJson(response);

  if (!response.ok) {
    throw new Error(data.error || `Failed to start battle: ${response.status}`);
  }

  return data;
}

export async function fetchDuelState(authToken) {
  const response = await fetch(API_ENDPOINTS.DUEL_STATE, {
    headers: buildAuthHeaders(authToken)
  });
  const data = await readJson(response);

  if (!response.ok) {
    throw new Error(data.error || `Failed to load duel state: ${response.status}`);
  }

  return data;
}

export async function searchDuelUsers(search, authToken) {
  const params = new URLSearchParams({ search });
  const response = await fetch(`${API_ENDPOINTS.DUEL_USERS}?${params.toString()}`, {
    headers: buildAuthHeaders(authToken)
  });
  const data = await readJson(response);

  if (!response.ok) {
    throw new Error(data.error || `Failed to search players: ${response.status}`);
  }

  return data;
}

export async function sendDuelInvite(payload, authToken) {
  const response = await fetch(API_ENDPOINTS.DUEL_INVITE, {
    method: 'POST',
    headers: buildAuthHeaders(authToken, true),
    body: JSON.stringify(payload)
  });
  const data = await readJson(response);

  if (!response.ok) {
    throw new Error(data.error || `Failed to send duel invite: ${response.status}`);
  }

  return data;
}

export async function respondToDuelInvite(duelId, action, authToken) {
  const response = await fetch(`${API_ENDPOINTS.DUEL_RESPOND}/${duelId}/respond`, {
    method: 'POST',
    headers: buildAuthHeaders(authToken, true),
    body: JSON.stringify({ action })
  });
  const data = await readJson(response);

  if (!response.ok) {
    throw new Error(data.error || `Failed to respond to duel invite: ${response.status}`);
  }

  return data;
}

export async function submitDuelTeamSelection(duelId, articleIds, authToken) {
  const response = await fetch(`${API_ENDPOINTS.DUEL_TEAM}/${duelId}/team`, {
    method: 'POST',
    headers: buildAuthHeaders(authToken, true),
    body: JSON.stringify({ articleIds })
  });
  const data = await readJson(response);

  if (!response.ok) {
    throw new Error(data.error || `Failed to submit duel team: ${response.status}`);
  }

  return data;
}

export async function leaveCurrentDuelRequest(duelId, authToken) {
  const response = await fetch(`${API_ENDPOINTS.DUEL_LEAVE}/${duelId}/leave`, {
    method: 'POST',
    headers: buildAuthHeaders(authToken, true),
    body: JSON.stringify({})
  });
  const data = await readJson(response);

  if (!response.ok) {
    throw new Error(data.error || `Failed to leave duel: ${response.status}`);
  }

  return data;
}

export async function fetchPageSummary(title) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 5000);

  let response;

  try {
    response = await fetch(
      `https://ru.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
      {
        signal: controller.signal
      }
    );
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeoutId);
  }

  if (!response?.ok) {
    return null;
  }

  const data = await response.json();
  if (data.type && data.type !== 'standard') {
    return null;
  }

  return data;
}

export async function submitAuthRequest(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: buildAuthHeaders('', true),
    body: JSON.stringify(payload)
  });
  const data = await readJson(response);

  if (!response.ok) {
    throw new Error(data.error || 'Authentication failed.');
  }

  return data;
}

export async function fetchCurrentUser(token) {
  const response = await fetch(API_ENDPOINTS.AUTH_ME, {
    headers: buildAuthHeaders(token)
  });
  const data = await readJson(response);

  if (!response.ok) {
    throw new Error(data.error || 'Failed to load current user.');
  }

  return data.user || null;
}
