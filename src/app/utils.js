import { generateDeterministicCardStats } from '../../shared/card-stats.mjs';
import { getRarityByViewCount } from '../../shared/rarity.mjs';
import { AUTH_STORAGE_KEY, FALLBACK_EXTRACT, STAT_LABELS } from './constants';

export function normalizeTitle(title) {
  return title.replace(/_/g, ' ').trim().toLowerCase();
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function buildWikiUrl(title) {
  return `https://ru.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, '_'))}`;
}

export function readStoredAuthToken() {
  if (typeof window === 'undefined') {
    return '';
  }

  return window.localStorage.getItem(AUTH_STORAGE_KEY) || '';
}

export function storeAuthToken(token) {
  if (typeof window === 'undefined') {
    return;
  }

  if (token) {
    window.localStorage.setItem(AUTH_STORAGE_KEY, token);
    return;
  }

  window.localStorage.removeItem(AUTH_STORAGE_KEY);
}

export function formatCompactNumber(num) {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return String(num);
}

export function formatFullNumber(num) {
  return Number(num || 0).toLocaleString('ru-RU');
}

export function hasCompleteStats(stats) {
  return Boolean(stats && STAT_LABELS.every((stat) => Number.isFinite(stats[stat.key])));
}

export function calculateTotalPower(stats) {
  return STAT_LABELS.reduce((sum, stat) => sum + (stats?.[stat.key] || 0), 0);
}

export function resolveArticleStats(article, rarity) {
  if (hasCompleteStats(article.stats)) {
    return article.stats;
  }

  return generateDeterministicCardStats(rarity, article.id);
}

export function getStatLabel(statKey) {
  return STAT_LABELS.find((stat) => stat.key === statKey)?.label || statKey;
}

export function resolveArticleRarity(article, rarityLevels) {
  const viewCount = Number.isFinite(article.viewCount) && article.viewCount >= 0 ? article.viewCount : 0;
  return article.rarity || getRarityByViewCount(viewCount, rarityLevels);
}

export function buildCardData(article, summary, rarityLevels) {
  const viewCount = Number.isFinite(article.viewCount) && article.viewCount >= 0 ? article.viewCount : 0;
  const rarity = resolveArticleRarity(article, rarityLevels);
  const rarityData = rarityLevels[rarity];
  const title = summary?.title || article.title;
  const stats = resolveArticleStats(article, rarity);

  return {
    id: `${article.id}-${normalizeTitle(title)}`,
    sourceId: article.id,
    title,
    extract: summary?.extract || FALLBACK_EXTRACT,
    image: summary?.thumbnail?.source || null,
    url: summary?.content_urls?.desktop?.page || buildWikiUrl(title),
    viewCount,
    rarity,
    stats,
    ...rarityData
  };
}
