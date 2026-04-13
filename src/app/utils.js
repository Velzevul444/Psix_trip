import { generateDeterministicCardStats } from '../../shared/card-stats.mjs';
import { getRarityByViewCount } from '../../shared/rarity.mjs';
import { AUTH_STORAGE_KEY, FALLBACK_EXTRACT, STAT_LABELS } from './constants';

const CLASS_STAT_KEYS = ['stamina', 'strength', 'dexterity', 'intelligence', 'charisma'];
const CLASS_LABELS = {
  stamina: 'Танк',
  strength: 'Воин',
  dexterity: 'Плут',
  intelligence: 'Маг',
  charisma: 'Бард'
};

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

export function resolveClassKeyFromStats(stats) {
  let strongestKey = CLASS_STAT_KEYS[0];
  let strongestValue = Number(stats?.[strongestKey] || 0);

  for (const key of CLASS_STAT_KEYS.slice(1)) {
    const value = Number(stats?.[key] || 0);

    if (value > strongestValue) {
      strongestKey = key;
      strongestValue = value;
    }
  }

  return strongestKey;
}

export function resolveClassMeta(article, rarityLevels) {
  const rarity = article?.rarity || (rarityLevels ? resolveArticleRarity(article, rarityLevels) : 'common');
  const stats = hasCompleteStats(article?.stats)
    ? article.stats
    : resolveArticleStats(article || { id: 0, stats: null }, rarity);
  const statKey = article?.primaryStatKey || article?.roleKey || resolveClassKeyFromStats(stats);

  return {
    statKey,
    label: CLASS_LABELS[statKey] || 'Боец'
  };
}

export function buildDuelTurnLines(turn) {
  if (Array.isArray(turn?.lines) && turn.lines.length > 0) {
    return turn.lines;
  }

  if (!turn?.attackerTitle || !turn?.targetTitle) {
    return [];
  }

  return [
    `${turn.attackerUsername} / "${turn.attackerTitle}" атакует "${turn.targetTitle}" (${turn.targetUsername}) через ${getStatLabel(turn.statKey)}: ${formatFullNumber(turn.attackValue)} - ${formatFullNumber(turn.defenseValue)} = ${formatFullNumber(turn.damage)}. Осталось HP: ${formatFullNumber(turn.targetRemainingHp)}.`
  ];
}

export function buildBossRoundLines(round) {
  if (Array.isArray(round?.lines) && round.lines.length > 0) {
    return round.lines;
  }

  const lines = [];

  if (round?.bossAttack) {
    lines.push(
      `Босс ударил карту "${round.bossAttack.targetTitle}" через ${getStatLabel(round.bossAttack.statKey)}: ${formatFullNumber(round.bossAttack.attackValue)} - ${formatFullNumber(round.bossAttack.defenseValue)} = ${formatFullNumber(round.bossAttack.damage)} урона.`
    );
  }

  if (Array.isArray(round?.playerAttacks)) {
    for (const attack of round.playerAttacks) {
      if (attack.damage === 0) {
        lines.push(
          `Карта "${attack.title}" атаковала через ${getStatLabel(attack.statKey)}, но не пробила защиту босса: ${formatFullNumber(attack.attackValue)} - ${formatFullNumber(attack.defenseValue)} = 0.`
        );
        continue;
      }

      lines.push(
        `Карта "${attack.title}" ударила через ${getStatLabel(attack.statKey)} на ${formatFullNumber(attack.damage)} урона. У босса осталось ${formatFullNumber(attack.bossRemainingHp)} HP.`
      );
    }
  }

  return lines;
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
  const classMeta = resolveClassMeta({ ...article, stats, rarity }, rarityLevels);

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
    classKey: classMeta.statKey,
    classLabel: classMeta.label,
    ...rarityData
  };
}
