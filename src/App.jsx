import React, { useEffect, useRef, useState } from 'react';
import Pack from './components/Pack';
import Card from './components/Card';
import CardStats from './components/CardStats';
import './styles/App.scss';
import {
  buildRarityLevels,
  DEFAULT_RARITY_THRESHOLDS,
  getRarityByViewCount,
  RARITY_ORDER
} from '../shared/rarity.mjs';

const PACK_SIZE = 5;
const PACK_FETCH_BATCH = PACK_SIZE * 4;
const PACK_FETCH_ATTEMPTS = 4;
const RECENT_TITLES_LIMIT = 250;
const NEXT_PACK_DELAY_MS = 1200;
const TITLE_PROCESS_CONCURRENCY = 6;
const PACK_API_ENDPOINT = import.meta.env.VITE_PACK_API_ENDPOINT || '/api/pack';
const FALLBACK_EXTRACT = 'Краткое описание для этой статьи не найдено.';
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

function buildWikiUrl(title) {
  return `https://ru.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, '_'))}`;
}

async function fetchPackCandidates(count, excludeTitles) {
  const response = await fetch(PACK_API_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
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

async function fetchPageSummary(title) {
  const response = await fetch(
    `https://ru.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
  );

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  if (data.type && data.type !== 'standard') {
    return null;
  }

  return data;
}

function App() {
  const [cards, setCards] = useState([]);
  const [isOpening, setIsOpening] = useState(false);
  const [openedCards, setOpenedCards] = useState([]);
  const [currentCardIndex, setCurrentCardIndex] = useState(-1);
  const [isFetchingCards, setIsFetchingCards] = useState(false);
  const [isPackCooldown, setIsPackCooldown] = useState(false);
  const [rarityLevels, setRarityLevels] = useState(() => buildRarityLevels(DEFAULT_RARITY_THRESHOLDS));
  const initialLoadDoneRef = useRef(false);
  const summaryCacheRef = useRef(new Map());
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
    storage.queue.push({ key, title });

    if (storage.queue.length > RECENT_TITLES_LIMIT) {
      const oldest = storage.queue.shift();
      if (oldest) {
        storage.set.delete(oldest.key);
      }
    }
  };

  const getRecentTitles = () => recentTitlesRef.current.queue.map((entry) => entry.title);

  const getCachedPageSummary = async (title) => {
    const key = normalizeTitle(title);
    const cache = summaryCacheRef.current;

    if (!cache.has(key)) {
      const request = fetchPageSummary(title)
        .then((data) => {
          if (data) {
            cache.set(normalizeTitle(data.title), Promise.resolve(data));
          } else {
            cache.delete(key);
          }

          return data;
        })
        .catch(() => {
          cache.delete(key);
          return null;
        });

      cache.set(key, request);
    }

    return cache.get(key);
  };

  const processCardData = (article, summary, activeRarityLevels) => {
    const viewCount = Number.isFinite(article.viewCount) && article.viewCount >= 0 ? article.viewCount : 0;
    const rarity = getRarityByViewCount(viewCount, activeRarityLevels);
    const rarityData = activeRarityLevels[rarity];
    const title = summary?.title || article.title;

    return {
      id: `${article.id}-${normalizeTitle(title)}`,
      title,
      extract: summary?.extract || FALLBACK_EXTRACT,
      image: summary?.thumbnail?.source || null,
      url: summary?.content_urls?.desktop?.page || buildWikiUrl(title),
      viewCount,
      rarity,
      stats: generateCardStats(rarity),
      ...rarityData
    };
  };

  const fetchCards = async () => {
    setIsFetchingCards(true);
    setCards([]);

    try {
      const blockedTitles = new Set(recentTitlesRef.current.set);
      const fetchedCards = [];
      let attempts = 0;
      let activeRarityLevels = rarityLevels;

      while (fetchedCards.length < PACK_SIZE && attempts < PACK_FETCH_ATTEMPTS) {
        attempts += 1;

        const payload = await fetchPackCandidates(PACK_FETCH_BATCH, getRecentTitles());
        if (payload.rarityLevels) {
          activeRarityLevels = buildRarityLevels(payload.rarityLevels);
          setRarityLevels(activeRarityLevels);
        }

        const candidates = Array.isArray(payload.cards) ? payload.cards : [];
        const candidatesToProcess = [];

        for (const candidate of candidates) {
          const rawKey = normalizeTitle(candidate.title);
          if (blockedTitles.has(rawKey)) continue;
          blockedTitles.add(rawKey);
          candidatesToProcess.push(candidate);
        }

        for (let index = 0; index < candidatesToProcess.length && fetchedCards.length < PACK_SIZE; index += TITLE_PROCESS_CONCURRENCY) {
          const batch = candidatesToProcess.slice(index, index + TITLE_PROCESS_CONCURRENCY);
          const hydratedBatch = await Promise.all(
            batch.map(async (article) => {
              const summary = await getCachedPageSummary(article.title);
              return {
                article,
                card: processCardData(article, summary, activeRarityLevels)
              };
            })
          );

          for (const { article, card } of hydratedBatch) {
            if (fetchedCards.length >= PACK_SIZE) break;

            const rawKey = normalizeTitle(article.title);
            const finalKey = normalizeTitle(card.title);

            if (blockedTitles.has(finalKey) && finalKey !== rawKey) {
              continue;
            }

            blockedTitles.add(finalKey);
            fetchedCards.push(card);
            rememberTitle(card.title);
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
        {RARITY_ORDER.map((key) => {
          const value = rarityLevels[key];

          return (
            <div key={key} className="rarity-item">
              <div className="rarity-dot" style={{ backgroundColor: value.color, boxShadow: value.glow }}></div>
              <span>{value.name}</span>
            </div>
          );
        })}
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
