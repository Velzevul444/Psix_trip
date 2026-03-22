import React, { useState, useEffect, useRef } from 'react';
import Pack from './components/Pack';
import Card from './components/Card';
import CardStats from './components/CardStats';
import './styles/App.scss';

const RARITY_LEVELS = {
  divine: { name: 'Божественная', min: 10000000, max: 15000000, color: '#FFD700', glow: '0 0 30px #FFD700, 0 0 60px #FFA500' },
  legendary: { name: 'Легендарная', min: 5000000, max: 9999999, color: '#FF6B35', glow: '0 0 25px #FF6B35, 0 0 50px #FF4500' },
  mythic: { name: 'Мифическая', min: 1000000, max: 4999999, color: '#9333EA', glow: '0 0 20px #9333EA, 0 0 40px #7C3AED' },
  epic: { name: 'Эпическая', min: 500000, max: 999999, color: '#EC4899', glow: '0 0 15px #EC4899, 0 0 30px #DB2777' },
  superRare: { name: 'Сверхредкая', min: 100000, max: 499999, color: '#3B82F6', glow: '0 0 15px #3B82F6, 0 0 30px #2563EB' },
  rare: { name: 'Редкая', min: 10000, max: 99999, color: '#10B981', glow: '0 0 10px #10B981, 0 0 20px #059669' },
  common: { name: 'Обычная', min: 1000, max: 9999, color: '#6B7280', glow: '0 0 5px #6B7280' }
};

const RARITY_ORDER = ['divine', 'legendary', 'mythic', 'epic', 'superRare', 'rare', 'common'];
const PAGEVIEWS_WINDOW_DAYS = 30;
const PACK_SIZE = 5;
const RANDOM_TITLES_BATCH = 50;
const RANDOM_FETCH_ROUNDS = 4;
const RECENT_TITLES_LIMIT = 250;
const PAGEVIEWS_RETRY_DELAYS_MS = [250, 600, 1200];
const NEXT_PACK_DELAY_MS = 1200;
const STAT_RANGES_BY_RARITY = {
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

function formatPageviewsDate(date) {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

function normalizeTitle(title) {
  return title.replace(/_/g, ' ').trim().toLowerCase();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomInteger(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateCardStats(rarity) {
  const ranges = STAT_RANGES_BY_RARITY[rarity] || STAT_RANGES_BY_RARITY.common;

  return Object.fromEntries(
    Object.entries(ranges).map(([stat, range]) => {
      const [min, max] = range;
      return [stat, randomInteger(min, max)];
    })
  );
}

function getPageviewsRange(days = PAGEVIEWS_WINDOW_DAYS) {
  const endDate = new Date();
  endDate.setUTCDate(endDate.getUTCDate() - 1);

  const startDate = new Date(endDate);
  startDate.setUTCDate(startDate.getUTCDate() - (days - 1));

  return {
    start: formatPageviewsDate(startDate),
    end: formatPageviewsDate(endDate)
  };
}

function getRarityByViewCount(viewCount) {
  for (const rarity of RARITY_ORDER) {
    if (viewCount >= RARITY_LEVELS[rarity].min) {
      return rarity;
    }
  }

  return 'common';
}

async function fetchArticleViewCount(title) {
  const { start, end } = getPageviewsRange();
  const article = encodeURIComponent(title.replace(/\s+/g, '_'));

  for (let attempt = 0; attempt <= PAGEVIEWS_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const response = await fetch(
        `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/ru.wikipedia/all-access/user/${article}/daily/${start}/${end}`
      );

      if (response.ok) {
        const payload = await response.json();
        if (!payload.items || payload.items.length === 0) return 0;
        return payload.items.reduce((sum, day) => sum + day.views, 0);
      }

      if (response.status !== 429 || attempt === PAGEVIEWS_RETRY_DELAYS_MS.length) {
        return null;
      }
    } catch (error) {
      if (attempt === PAGEVIEWS_RETRY_DELAYS_MS.length) {
        return null;
      }
    }

    await sleep(PAGEVIEWS_RETRY_DELAYS_MS[attempt]);
  }

  return null;
}

async function fetchRandomArticleTitles(limit = RANDOM_TITLES_BATCH) {
  const params = new URLSearchParams({
    action: 'query',
    list: 'random',
    rnnamespace: '0',
    rnlimit: String(limit),
    format: 'json',
    origin: '*'
  });

  const response = await fetch(`https://ru.wikipedia.org/w/api.php?${params.toString()}`);
  if (!response.ok) return [];

  const payload = await response.json();
  if (!payload.query?.random) return [];

  return payload.query.random.map((item) => item.title).filter(Boolean);
}

async function fetchPageSummary(title) {
  const response = await fetch(
    `https://ru.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
  );

  if (!response.ok) return null;

  const data = await response.json();
  if (data.type !== 'standard') return null;

  return data;
}

function App() {
  const [cards, setCards] = useState([]);
  const [isOpening, setIsOpening] = useState(false);
  const [openedCards, setOpenedCards] = useState([]);
  const [currentCardIndex, setCurrentCardIndex] = useState(-1);
  const [isFetchingCards, setIsFetchingCards] = useState(false);
  const [isPackCooldown, setIsPackCooldown] = useState(false);
  const initialLoadDoneRef = useRef(false);
  const recentTitlesRef = useRef({
    set: new Set(),
    queue: []
  });

  useEffect(() => {
    if (initialLoadDoneRef.current) return;
    initialLoadDoneRef.current = true;
    fetchCards();
  }, []);

  const rememberTitle = (title) => {
    const key = normalizeTitle(title);
    const storage = recentTitlesRef.current;

    if (storage.set.has(key)) return;

    storage.set.add(key);
    storage.queue.push(key);

    if (storage.queue.length > RECENT_TITLES_LIMIT) {
      const oldest = storage.queue.shift();
      if (oldest) {
        storage.set.delete(oldest);
      }
    }
  };

  const fetchCards = async () => {
    setIsFetchingCards(true);
    setCards([]);

    try {
      const blockedTitles = new Set(recentTitlesRef.current.set);
      const fetchedCards = [];

      for (let round = 0; round < RANDOM_FETCH_ROUNDS && fetchedCards.length < PACK_SIZE; round += 1) {
        const randomTitles = await fetchRandomArticleTitles();

        for (const randomTitle of randomTitles) {
          if (fetchedCards.length >= PACK_SIZE) break;

          const normalizedRandomTitle = normalizeTitle(randomTitle);
          if (blockedTitles.has(normalizedRandomTitle)) continue;
          blockedTitles.add(normalizedRandomTitle);

          try {
            const data = await fetchPageSummary(randomTitle);
            if (!data) continue;

            const normalizedSummaryTitle = normalizeTitle(data.title);
            if (blockedTitles.has(normalizedSummaryTitle) && normalizedSummaryTitle !== normalizedRandomTitle) {
              continue;
            }
            blockedTitles.add(normalizedSummaryTitle);

            const viewCount = await fetchArticleViewCount(data.title);
            if (viewCount === null) continue;

            fetchedCards.push(processCardData(data, viewCount));
            rememberTitle(data.title);
          } catch (e) {
            continue;
          }
        }
      }

      setCards(fetchedCards);
    } catch (error) {
      console.error('Error fetching cards:', error);
    } finally {
      setIsFetchingCards(false);
    }
  };

  const processCardData = (data, rawViewCount) => {
    const viewCount = Number.isFinite(rawViewCount) && rawViewCount >= 0 ? rawViewCount : 0;
    const rarity = getRarityByViewCount(viewCount);
    const rarityData = RARITY_LEVELS[rarity];

    return {
      id: Math.random().toString(36).substr(2, 9),
      title: data.title,
      extract: data.extract,
      image: data.thumbnail?.source || null,
      url: data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${data.title}`,
      viewCount,
      rarity,
      stats: generateCardStats(rarity),
      ...rarityData
    };
  };

  const openPack = () => {
    if (cards.length === 0 || isFetchingCards || isPackCooldown) return;
    setIsOpening(true);
    setOpenedCards([...cards]);
    setCurrentCardIndex(0);
  };

  const prepareNextPack = async () => {
    if (isPackCooldown) return;

    setIsOpening(false);
    setCurrentCardIndex(-1);
    setIsPackCooldown(true);
    setCards([]);

    await sleep(NEXT_PACK_DELAY_MS);
    await fetchCards();
    setIsPackCooldown(false);
  };

  const nextCard = () => {
    if (currentCardIndex < openedCards.length - 1) {
      setCurrentCardIndex(currentCardIndex + 1);
    } else {
      prepareNextPack();
    }
  };

  const closePack = () => {
    prepareNextPack();
  };

  return (
    <div className="App">
      <h1 className="title">Wiki Cards</h1>
      <div className="rarity-legend">
        {Object.entries(RARITY_LEVELS).map(([key, value]) => (
          <div key={key} className="rarity-item">
            <div className="rarity-dot" style={{ backgroundColor: value.color, boxShadow: value.glow }}></div>
            <span>{value.name}</span>
          </div>
        ))}
      </div>

      {!isOpening ? (
        <Pack
          onOpen={openPack}
          cardCount={cards.length}
          isLocked={isFetchingCards || isPackCooldown}
        />
      ) : (
        <div className="card-reveal">
          <div className="card-counter">
            Карта {currentCardIndex + 1} из {openedCards.length}
          </div>
          <div className="card-showcase">
            <Card card={openedCards[currentCardIndex]} />
            <CardStats card={openedCards[currentCardIndex]} />
          </div>
          <div className="reveal-buttons">
            <button className="btn-next" onClick={nextCard}>
              {currentCardIndex < openedCards.length - 1 ? 'Следующая карта' : 'Новый пак'}
            </button>
            <button className="btn-close" onClick={closePack}>Закрыть пак</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
