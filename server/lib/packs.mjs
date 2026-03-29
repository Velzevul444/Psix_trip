import { randomUUID } from 'node:crypto';
import { HttpError } from './errors.mjs';

const PACK_SESSION_TTL_MS = 10 * 60 * 1000;
const PACK_SESSION_LIMIT = 500;

const pendingPackSessions = new Map();

function pruneExpiredPackSessions(now = Date.now()) {
  for (const [sessionId, session] of pendingPackSessions.entries()) {
    if (now - session.createdAt > PACK_SESSION_TTL_MS) {
      pendingPackSessions.delete(sessionId);
    }
  }

  if (pendingPackSessions.size <= PACK_SESSION_LIMIT) {
    return;
  }

  const oldestSessions = [...pendingPackSessions.entries()]
    .sort((left, right) => left[1].createdAt - right[1].createdAt)
    .slice(0, pendingPackSessions.size - PACK_SESSION_LIMIT);

  for (const [sessionId] of oldestSessions) {
    pendingPackSessions.delete(sessionId);
  }
}

export function createPendingPackSession(cards, ownerUserId = null) {
  const articleIds = Array.from(
    new Set(
      Array.isArray(cards)
        ? cards
            .map((card) => Number(card?.id))
            .filter((articleId) => Number.isInteger(articleId) && articleId > 0)
        : []
    )
  );

  if (articleIds.length === 0) {
    return '';
  }

  pruneExpiredPackSessions();

  const sessionId = randomUUID();
  pendingPackSessions.set(sessionId, {
    ownerUserId: Number.isInteger(ownerUserId) ? ownerUserId : null,
    articleIds: new Set(articleIds),
    createdAt: Date.now()
  });

  return sessionId;
}

export function consumePendingPackSession(sessionId, requestedArticleIds, currentUserId = null) {
  pruneExpiredPackSessions();

  if (typeof sessionId !== 'string' || !sessionId.trim()) {
    throw new HttpError(400, 'Pack session is missing.');
  }

  const session = pendingPackSessions.get(sessionId);
  if (!session) {
    throw new HttpError(410, 'Pack session expired. Open a new pack.');
  }

  if (session.ownerUserId && session.ownerUserId !== currentUserId) {
    throw new HttpError(403, 'This pack belongs to a different user.');
  }

  const articleIds = Array.from(
    new Set(
      Array.isArray(requestedArticleIds)
        ? requestedArticleIds
            .map((articleId) => Number(articleId))
            .filter((articleId) => Number.isInteger(articleId) && articleId > 0)
        : []
    )
  );

  if (articleIds.length === 0) {
    throw new HttpError(400, 'Pack cards are missing.');
  }

  for (const articleId of articleIds) {
    if (!session.articleIds.has(articleId)) {
      throw new HttpError(400, 'Pack cards do not match the prepared drop.');
    }
  }

  pendingPackSessions.delete(sessionId);
  return articleIds;
}
