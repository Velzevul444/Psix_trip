export const STAT_KEYS = [
  'hp',
  'stamina',
  'strength',
  'dexterity',
  'intelligence',
  'charisma'
];

export const COMBAT_STAT_KEYS = STAT_KEYS.filter((statKey) => statKey !== 'hp');

export const STAT_RANGES_BY_RARITY = {
  common: {
    hp: [55, 140],
    stamina: [10, 34],
    strength: [10, 34],
    dexterity: [10, 34],
    intelligence: [10, 34],
    charisma: [10, 34]
  },
  rare: {
    hp: [140, 270],
    stamina: [36, 118],
    strength: [36, 118],
    dexterity: [36, 118],
    intelligence: [36, 118],
    charisma: [36, 118]
  },
  superRare: {
    hp: [270, 430],
    stamina: [95, 245],
    strength: [95, 245],
    dexterity: [95, 245],
    intelligence: [95, 245],
    charisma: [95, 245]
  },
  epic: {
    hp: [400, 590],
    stamina: [220, 410],
    strength: [220, 410],
    dexterity: [220, 410],
    intelligence: [220, 410],
    charisma: [220, 410]
  },
  mythic: {
    hp: [540, 770],
    stamina: [360, 610],
    strength: [360, 610],
    dexterity: [360, 610],
    intelligence: [360, 610],
    charisma: [360, 610]
  },
  legendary: {
    hp: [730, 930],
    stamina: [540, 890],
    strength: [540, 890],
    dexterity: [540, 890],
    intelligence: [540, 890],
    charisma: [540, 890]
  },
  divine: {
    hp: [860, 999],
    stamina: [720, 999],
    strength: [720, 999],
    dexterity: [720, 999],
    intelligence: [720, 999],
    charisma: [720, 999]
  }
};

const STAT_VALUE_BANDS = {
  primary: [0.82, 1],
  strong: [0.54, 0.7],
  average: [0.34, 0.5],
  low: [0.18, 0.3],
  weak: [0.06, 0.14]
};

const SECONDARY_BAND_ORDER = ['strong', 'average', 'low', 'weak'];

const HP_VALUE_BANDS_BY_PRIMARY_STAT = {
  stamina: [0.72, 1],
  strength: [0.62, 0.9],
  dexterity: [0.46, 0.76],
  intelligence: [0.42, 0.72],
  charisma: [0.5, 0.82]
};

export function randomInteger(min, max, randomValue = Math.random()) {
  return Math.floor(randomValue * (max - min + 1)) + min;
}

function hashSeedInput(seedInput) {
  const normalizedSeed = String(seedInput);
  let hash = 2166136261;

  for (let index = 0; index < normalizedSeed.length; index += 1) {
    hash ^= normalizedSeed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

export function createDeterministicRandom(seedInput) {
  let seed = hashSeedInput(seedInput);

  return () => {
    seed += 0x6D2B79F5;

    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleValues(values, randomFn) {
  const nextValues = [...values];

  for (let index = nextValues.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(randomFn() * (index + 1));
    [nextValues[index], nextValues[swapIndex]] = [nextValues[swapIndex], nextValues[index]];
  }

  return nextValues;
}

function getBandRange([min, max], [bandMinRatio, bandMaxRatio]) {
  const span = Math.max(0, max - min);
  const bandMin = Math.round(min + span * bandMinRatio);
  const bandMax = Math.round(min + span * bandMaxRatio);

  return [Math.min(bandMin, bandMax), Math.max(bandMin, bandMax)];
}

function randomValueFromBand(range, band, randomFn) {
  const [bandMin, bandMax] = getBandRange(range, band);
  return randomInteger(bandMin, bandMax, randomFn());
}

export function generateCardStats(rarity, randomFn = Math.random) {
  const ranges = STAT_RANGES_BY_RARITY[rarity] || STAT_RANGES_BY_RARITY.common;
  const stats = {};
  const primaryStatKey = COMBAT_STAT_KEYS[Math.floor(randomFn() * COMBAT_STAT_KEYS.length)];
  const secondaryStatKeys = shuffleValues(
    COMBAT_STAT_KEYS.filter((statKey) => statKey !== primaryStatKey),
    randomFn
  );

  stats.hp = randomValueFromBand(
    ranges.hp,
    HP_VALUE_BANDS_BY_PRIMARY_STAT[primaryStatKey] || [0.5, 0.82],
    randomFn
  );
  stats[primaryStatKey] = randomValueFromBand(ranges[primaryStatKey], STAT_VALUE_BANDS.primary, randomFn);

  secondaryStatKeys.forEach((statKey, index) => {
    const bandKey = SECONDARY_BAND_ORDER[index] || 'weak';
    stats[statKey] = randomValueFromBand(ranges[statKey], STAT_VALUE_BANDS[bandKey], randomFn);
  });

  return stats;
}

export function generateDeterministicCardStats(rarity, seedInput) {
  return generateCardStats(rarity, createDeterministicRandom(seedInput));
}
