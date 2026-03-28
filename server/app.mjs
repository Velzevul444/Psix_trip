import http from 'node:http';
import { URL } from 'node:url';
import { buildRarityLevels, DEFAULT_RARITY_THRESHOLDS } from '../shared/rarity.mjs';
import {
  getCurrentUser,
  getOptionalCurrentUser,
  assertAdminUser,
  loginUser,
  registerUser
} from './lib/auth.mjs';
import {
  grantArticleToUser,
  loadAdminUsers,
  loadArticlesPage,
  loadPackArticles,
  loadUserArticlesPage,
  normalizeExcludedTitles,
  recordUserPackDrops
} from './lib/articles.mjs';
import { getOrCreateCurrentBoss, loadBossDefeatedArticleIds, performBossBattle, replaceCurrentBoss } from './lib/bosses.mjs';
import { HttpError } from './lib/errors.mjs';
import { tryServeFrontend } from './lib/frontend.mjs';
import { readJsonBody, sendJson, sendNoContent } from './lib/http.mjs';
import { clamp } from './lib/utils.mjs';

function createRarityLevels() {
  return buildRarityLevels(DEFAULT_RARITY_THRESHOLDS);
}

export function createAppServer() {
  return http.createServer(async (request, response) => {
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
        const rarityLevels = createRarityLevels();
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
        const rarityLevels = createRarityLevels();
        const page = await loadArticlesPage(
          url.searchParams.get('offset'),
          url.searchParams.get('limit'),
          rarityLevels,
          {
            search: url.searchParams.get('search'),
            rarity: url.searchParams.get('rarity')
          }
        );

        sendJson(response, 200, {
          ...page,
          rarityLevels
        });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/my-articles') {
        const rarityLevels = createRarityLevels();
        const currentUser = await getCurrentUser(request);
        const page = await loadUserArticlesPage(
          currentUser.id,
          url.searchParams.get('offset'),
          url.searchParams.get('limit'),
          rarityLevels,
          {
            search: url.searchParams.get('search'),
            rarity: url.searchParams.get('rarity')
          }
        );

        sendJson(response, 200, {
          ...page,
          rarityLevels
        });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/boss') {
        const rarityLevels = createRarityLevels();
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
        const rarityLevels = createRarityLevels();
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

        const result = await loadAdminUsers(
          url.searchParams.get('search'),
          url.searchParams.get('limit')
        );

        sendJson(response, 200, result);
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/admin/grant-card') {
        const currentUser = await getCurrentUser(request);
        assertAdminUser(currentUser);

        const body = await readJsonBody(request);
        const rarityLevels = createRarityLevels();
        const result = await grantArticleToUser(body.userId, body.articleId, rarityLevels);

        sendJson(response, 200, result);
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/admin/change-boss') {
        const currentUser = await getCurrentUser(request);
        assertAdminUser(currentUser);

        const body = await readJsonBody(request);
        const rarityLevels = createRarityLevels();
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
}
