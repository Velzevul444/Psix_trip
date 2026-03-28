export const STAT_KEYS = [
  'hp',
  'stamina',
  'strength',
  'dexterity',
  'intelligence',
  'charisma'
];

export const STAT_RANGES_BY_RARITY = {
  common: {
    hp: [40, 140],
    stamina: [20, 100],
    strength: [1, 20],
    dexterity: [1, 20],
    intelligence: [1, 20],
    charisma: [1, 20]
  },
  rare: {
    hp: [120, 260],
    stamina: [80, 220],
    strength: [30, 110],
    dexterity: [25, 110],
    intelligence: [25, 120],
    charisma: [25, 110]
  },
  superRare: {
    hp: [240, 420],
    stamina: [180, 360],
    strength: [90, 230],
    dexterity: [85, 230],
    intelligence: [90, 250],
    charisma: [85, 230]
  },
  epic: {
    hp: [380, 580],
    stamina: [300, 520],
    strength: [200, 380],
    dexterity: [190, 380],
    intelligence: [210, 420],
    charisma: [190, 380]
  },
  mythic: {
    hp: [520, 760],
    stamina: [430, 690],
    strength: [340, 560],
    dexterity: [320, 560],
    intelligence: [360, 620],
    charisma: [320, 560]
  },
  legendary: {
    hp: [720, 920],
    stamina: [620, 900],
    strength: [520, 820],
    dexterity: [500, 800],
    intelligence: [560, 900],
    charisma: [500, 800]
  },
  divine: {
    hp: [860, 999],
    stamina: [780, 999],
    strength: [700, 999],
    dexterity: [680, 999],
    intelligence: [800, 999],
    charisma: [700, 999]
  }
};

export function randomInteger(min, max, randomValue = Math.random()) {
  return Math.floor(randomValue * (max - min + 1)) + min;
}

export function createDeterministicRandom(seedInput) {
  let seed = Number(seedInput) >>> 0;

  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

export function generateCardStats(rarity, randomFn = Math.random) {
  const ranges = STAT_RANGES_BY_RARITY[rarity] || STAT_RANGES_BY_RARITY.common;

  return Object.fromEntries(
    Object.entries(ranges).map(([stat, [min, max]]) => [stat, randomInteger(min, max, randomFn())])
  );
}

export function generateDeterministicCardStats(rarity, seedInput) {
  return generateCardStats(rarity, createDeterministicRandom(seedInput));
}
