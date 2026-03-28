export const RARITY_ORDER = [
  'divine',
  'legendary',
  'mythic',
  'epic',
  'superRare',
  'rare',
  'common'
];

export const RARITY_META = {
  divine: {
    name: 'Божественная',
    color: '#FFD700',
    glow: '0 0 30px #FFD700, 0 0 60px #FFA500'
  },
  legendary: {
    name: 'Легендарная',
    color: '#FF6B35',
    glow: '0 0 25px #FF6B35, 0 0 50px #FF4500'
  },
  mythic: {
    name: 'Мифическая',
    color: '#9333EA',
    glow: '0 0 20px #9333EA, 0 0 40px #7C3AED'
  },
  epic: {
    name: 'Эпическая',
    color: '#EC4899',
    glow: '0 0 15px #EC4899, 0 0 30px #DB2777'
  },
  superRare: {
    name: 'Сверхредкая',
    color: '#3B82F6',
    glow: '0 0 15px #3B82F6, 0 0 30px #2563EB'
  },
  rare: {
    name: 'Редкая',
    color: '#10B981',
    glow: '0 0 10px #10B981, 0 0 20px #059669'
  },
  common: {
    name: 'Обычная',
    color: '#6B7280',
    glow: '0 0 5px #6B7280'
  }
};

export const DEFAULT_RARITY_THRESHOLDS = {
  divine: { min: 46481 },
  legendary: { min: 22675 },
  mythic: { min: 11539 },
  epic: { min: 6690 },
  superRare: { min: 3995 },
  rare: { min: 2101 },
  common: { min: 1001 }
};

export const RARITY_DROP_CHANCES = {
  divine: 1 / 666,
  legendary: 1 / 228,
  mythic: 1 / 100,
  epic: 1 / 50,
  superRare: 1 / 20,
  rare: 1 / 6
};

export function buildRarityLevels(thresholds = DEFAULT_RARITY_THRESHOLDS) {
  const levels = {};

  for (const rarity of RARITY_ORDER) {
    const fallback = DEFAULT_RARITY_THRESHOLDS[rarity]?.min ?? 0;
    const min = Number(thresholds?.[rarity]?.min);

    levels[rarity] = {
      ...RARITY_META[rarity],
      min: Number.isFinite(min) ? min : fallback
    };
  }

  for (let index = 0; index < RARITY_ORDER.length; index += 1) {
    const rarity = RARITY_ORDER[index];
    const nextRarity = RARITY_ORDER[index - 1];
    const max = nextRarity ? Math.max(levels[nextRarity].min - 1, levels[rarity].min) : Infinity;
    levels[rarity].max = max;
  }

  return levels;
}

export function getRarityByViewCount(viewCount, levels = buildRarityLevels()) {
  for (const rarity of RARITY_ORDER) {
    if (viewCount >= levels[rarity].min) {
      return rarity;
    }
  }

  return 'common';
}

export function rollRarity(randomValue = Math.random()) {
  let cursor = 0;

  for (const rarity of ['divine', 'legendary', 'mythic', 'epic', 'superRare', 'rare']) {
    cursor += RARITY_DROP_CHANCES[rarity];
    if (randomValue < cursor) {
      return rarity;
    }
  }

  return 'common';
}
