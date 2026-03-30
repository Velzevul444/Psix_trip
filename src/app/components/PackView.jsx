import React, { useEffect, useRef, useState } from 'react';
import Pack from '../../components/Pack';
import Card from '../../components/Card';
import CardStats from '../../components/CardStats';
import { fetchPackCandidates, fetchPageSummary, openPackSelection } from '../api';
import useIsMobileViewport from '../hooks/useIsMobileViewport';
import {
  NEXT_PACK_DELAY_MS,
  PACK_FETCH_ATTEMPTS,
  PACK_FETCH_BATCH,
  PACK_SIZE,
  RECENT_TITLES_LIMIT,
  RARITY_ORDER,
  TITLE_PROCESS_CONCURRENCY
} from '../constants';
import { buildCardData, normalizeTitle, sleep } from '../utils';

function PackView({ authToken, authUser, rarityLevels, onRarityLevelsChange, recentTitlesRef }) {
  const [cards, setCards] = useState([]);
  const [isOpening, setIsOpening] = useState(false);
  const [openedCards, setOpenedCards] = useState([]);
  const [currentCardIndex, setCurrentCardIndex] = useState(-1);
  const [isFetchingCards, setIsFetchingCards] = useState(false);
  const [isPackCooldown, setIsPackCooldown] = useState(false);
  const summaryCacheRef = useRef(new Map());
  const isMobileViewport = useIsMobileViewport();

  useEffect(() => {
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

        const payload = await fetchPackCandidates(
          PACK_FETCH_BATCH,
          getRecentTitles(),
          authUser ? authToken : ''
        );

        if (payload.rarityLevels) {
          activeRarityLevels = payload.rarityLevels;
          onRarityLevelsChange(payload.rarityLevels);
        }

        const candidates = Array.isArray(payload.cards) ? payload.cards : [];
        const candidatesToProcess = [];

        for (const candidate of candidates) {
          const rawKey = normalizeTitle(candidate.title);
          if (blockedTitles.has(rawKey)) continue;
          blockedTitles.add(rawKey);
          candidatesToProcess.push(candidate);
        }

        for (
          let index = 0;
          index < candidatesToProcess.length && fetchedCards.length < PACK_SIZE;
          index += TITLE_PROCESS_CONCURRENCY
        ) {
          const batch = candidatesToProcess.slice(index, index + TITLE_PROCESS_CONCURRENCY);
          const hydratedBatch = await Promise.all(
            batch.map(async (article) => {
              const summary = await getCachedPageSummary(article.title);
              return {
                article,
                card: {
                  ...buildCardData(article, summary, activeRarityLevels),
                  packSessionId: payload.packSessionId || ''
                }
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

    const openedPackCards = [...cards];

    setIsOpening(true);
    setOpenedCards(openedPackCards);
    setCurrentCardIndex(0);

    if (authToken) {
      void openPackSelection(openedPackCards, authToken).catch((error) => {
        console.error('Error saving opened pack:', error);
      });
    }
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
    <section className="pack-screen">
      {!isMobileViewport ? (
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
      ) : null}

      {!isOpening ? (
        <div className={`pack-screen-stage${isMobileViewport ? ' pack-screen-stage-mobile' : ''}`}>
          <div className="pack-stage-card">
            <Pack
              onOpen={openPack}
              cardCount={cards.length}
              isLocked={isFetchingCards || isPackCooldown}
            />
          </div>

          {!isMobileViewport ? (
            <div className="pack-stage-notes">
              <article className="pack-note">
                <span>Drop logic</span>
                <strong>Без недавних повторов</strong>
                <p>Система запоминает свежие заголовки и не забрасывает тебя одинаковыми статьями подряд.</p>
              </article>

              <article className="pack-note">
                <span>Rarity engine</span>
                <strong>Редкость считается на лету</strong>
                <p>Вес статьи зависит от просмотров, а цвета и power карточки пересчитываются сразу после выдачи.</p>
              </article>

              <article className="pack-note">
                <span>Preview</span>
                <strong>Каждая карта открывается отдельно</strong>
                <p>Ты видишь и арт, и характеристики, а потом сразу переходишь к следующему дропу.</p>
              </article>
            </div>
          ) : null}
        </div>
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
    </section>
  );
}

export default PackView;
