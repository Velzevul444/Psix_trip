import React, { useEffect, useRef, useState } from 'react';
import { fetchArticlesPage, fetchMyArticlesPage, fetchPageSummary } from '../api';
import useIsMobileViewport from '../hooks/useIsMobileViewport';
import { useLibraryDepthEffect } from '../hooks/useLibraryDepthEffect';
import { ARTICLE_PAGE_SIZE, RARITY_ORDER, STAT_LABELS, VIEW_MODES } from '../constants';
import {
  buildCardData,
  calculateTotalPower,
  formatCompactNumber,
  formatFullNumber,
  resolveArticleRarity,
  resolveArticleStats
} from '../utils';
import LibraryPreview from './LibraryPreview';

function LibraryView({ mode, authUser, authToken, rarityLevels, onRarityLevelsChange, refreshToken }) {
  const [articles, setArticles] = useState([]);
  const [articlesTotal, setArticlesTotal] = useState(0);
  const [hasMoreArticles, setHasMoreArticles] = useState(true);
  const [isLoadingArticles, setIsLoadingArticles] = useState(false);
  const [articlesError, setArticlesError] = useState('');
  const [collectionArticles, setCollectionArticles] = useState([]);
  const [collectionTotal, setCollectionTotal] = useState(0);
  const [hasMoreCollectionArticles, setHasMoreCollectionArticles] = useState(true);
  const [isLoadingCollectionArticles, setIsLoadingCollectionArticles] = useState(false);
  const [collectionError, setCollectionError] = useState('');
  const [articleSearchInput, setArticleSearchInput] = useState('');
  const [articleSearchQuery, setArticleSearchQuery] = useState('');
  const [articleRarityFilter, setArticleRarityFilter] = useState('');
  const [selectedLibraryCard, setSelectedLibraryCard] = useState(null);
  const [isOpeningLibraryCard, setIsOpeningLibraryCard] = useState(false);
  const summaryCacheRef = useRef(new Map());
  const articlesRequestIdRef = useRef(0);
  const collectionRequestIdRef = useRef(0);
  const isCollectionView = mode === VIEW_MODES.COLLECTION;
  const isLibraryView = mode === VIEW_MODES.LIBRARY;
  const isMobileViewport = useIsMobileViewport();
  const { listRef, scheduleDepthEffect } = useLibraryDepthEffect(true, articles.length + collectionArticles.length);

  useEffect(() => {
    if (!isLibraryView && !isCollectionView) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setArticleSearchQuery(articleSearchInput.trim());
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [articleSearchInput, isCollectionView, isLibraryView]);

  useEffect(() => {
    setSelectedLibraryCard(null);

    if (listRef.current) {
      listRef.current.scrollTop = 0;
    }

    if (isLibraryView) {
      setArticles([]);
      setArticlesTotal(0);
      setHasMoreArticles(true);
      setArticlesError('');
      loadArticles(true);
      return;
    }

    setCollectionArticles([]);
    setCollectionTotal(0);
    setHasMoreCollectionArticles(true);
    setCollectionError('');

    if (authUser) {
      loadCollectionArticles(true);
    } else {
      setCollectionError('Войдите, чтобы видеть выбитые статьи.');
    }
  }, [articleSearchQuery, articleRarityFilter, isCollectionView, isLibraryView, authUser, refreshToken]);

  const getCachedPageSummary = async (title) => {
    const key = title.trim().toLowerCase();
    const cache = summaryCacheRef.current;

    if (!cache.has(key)) {
      const request = fetchPageSummary(title)
        .then((data) => {
          if (data) {
            cache.set(data.title.trim().toLowerCase(), Promise.resolve(data));
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

  const loadArticles = async (reset = false) => {
    if (isLoadingArticles && !reset) return;

    const requestId = articlesRequestIdRef.current + 1;
    articlesRequestIdRef.current = requestId;

    setIsLoadingArticles(true);
    if (reset) {
      setArticlesError('');
    }

    try {
      const offset = reset ? 0 : articles.length;
      const payload = await fetchArticlesPage(offset, ARTICLE_PAGE_SIZE, {
        search: articleSearchQuery,
        rarity: articleRarityFilter
      });

      if (requestId !== articlesRequestIdRef.current) {
        return;
      }

      const incomingArticles = Array.isArray(payload.articles) ? payload.articles : [];
      const total = Number(payload.total || 0);

      if (payload.rarityLevels) {
        onRarityLevelsChange(payload.rarityLevels);
      }

      setArticles((current) => (reset ? incomingArticles : [...current, ...incomingArticles]));
      setArticlesTotal(total);
      setHasMoreArticles(offset + incomingArticles.length < total);
    } catch {
      if (requestId === articlesRequestIdRef.current) {
        setArticlesError('Не удалось загрузить список статей.');
      }
    } finally {
      if (requestId === articlesRequestIdRef.current) {
        setIsLoadingArticles(false);
      }
    }
  };

  const loadCollectionArticles = async (reset = false) => {
    if (!authToken) {
      setCollectionArticles([]);
      setCollectionTotal(0);
      setHasMoreCollectionArticles(false);
      setCollectionError('Войдите, чтобы видеть выбитые статьи.');
      return;
    }

    if (isLoadingCollectionArticles && !reset) return;

    const requestId = collectionRequestIdRef.current + 1;
    collectionRequestIdRef.current = requestId;

    setIsLoadingCollectionArticles(true);
    if (reset) {
      setCollectionError('');
    }

    try {
      const offset = reset ? 0 : collectionArticles.length;
      const payload = await fetchMyArticlesPage(offset, ARTICLE_PAGE_SIZE, authToken, {
        search: articleSearchQuery,
        rarity: articleRarityFilter
      });

      if (requestId !== collectionRequestIdRef.current) {
        return;
      }

      const incomingArticles = Array.isArray(payload.articles) ? payload.articles : [];
      const total = Number(payload.total || 0);

      if (payload.rarityLevels) {
        onRarityLevelsChange(payload.rarityLevels);
      }

      setCollectionArticles((current) => (reset ? incomingArticles : [...current, ...incomingArticles]));
      setCollectionTotal(total);
      setHasMoreCollectionArticles(offset + incomingArticles.length < total);
    } catch (error) {
      if (requestId === collectionRequestIdRef.current) {
        setCollectionError(error.message || 'Не удалось загрузить выбитые статьи.');
      }
    } finally {
      if (requestId === collectionRequestIdRef.current) {
        setIsLoadingCollectionArticles(false);
      }
    }
  };

  const handleLibraryScroll = (event) => {
    scheduleDepthEffect();

    const activeIsLoading = isCollectionView ? isLoadingCollectionArticles : isLoadingArticles;
    const activeHasMore = isCollectionView ? hasMoreCollectionArticles : hasMoreArticles;

    if (activeIsLoading || !activeHasMore) return;

    const element = event.currentTarget;
    const distanceToBottom = element.scrollHeight - element.scrollTop - element.clientHeight;

    if (distanceToBottom < 220) {
      if (isCollectionView) {
        loadCollectionArticles(false);
      } else {
        loadArticles(false);
      }
    }
  };

  const openLibraryArticle = async (article) => {
    if (isOpeningLibraryCard) return;

    setIsOpeningLibraryCard(true);

    try {
      const summary = await getCachedPageSummary(article.title);
      setSelectedLibraryCard(buildCardData(article, summary, rarityLevels));
    } finally {
      setIsOpeningLibraryCard(false);
    }
  };

  const handleLibraryItemKeyDown = (event, article) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    openLibraryArticle(article);
  };

  const activeArticles = isCollectionView ? collectionArticles : articles;
  const activeArticlesTotal = isCollectionView ? collectionTotal : articlesTotal;
  const activeHasMoreArticles = isCollectionView
    ? authUser
      ? hasMoreCollectionArticles
      : false
    : hasMoreArticles;
  const activeIsLoadingArticles = isCollectionView ? isLoadingCollectionArticles : isLoadingArticles;
  const activeArticlesError = isCollectionView ? collectionError : articlesError;
  const activeVisibleArticles = articleRarityFilter
    ? activeArticles.filter((article) => resolveArticleRarity(article, rarityLevels) === articleRarityFilter)
    : activeArticles;
  const activeKicker = isCollectionView ? 'Коллекция' : 'Каталог';
  const activeHeading = isCollectionView ? 'Мои выбитые статьи' : 'Все существующие статьи';
  const activeDescription = isCollectionView
    ? `Показано ${formatFullNumber(activeVisibleArticles.length)} из ${formatFullNumber(activeArticlesTotal)}`
    : `Загружено ${formatFullNumber(activeVisibleArticles.length)} из ${formatFullNumber(activeArticlesTotal)}`;
  const activeEmptyState = isCollectionView
    ? authUser
      ? 'У тебя пока нет выбитых статей.'
      : 'Войдите, чтобы видеть выбитые статьи.'
    : 'Статьи не найдены.';
  const previewLabel = isCollectionView ? 'Карточка статьи из коллекции' : 'Карточка статьи из каталога';

  return (
    <section className="article-library">
      <div className="library-header">
        <div>
          <div className="library-kicker">{activeKicker}</div>
          <h2>{activeHeading}</h2>
          <p>{activeDescription}</p>
        </div>
        <div className={`library-controls${isMobileViewport ? ' library-controls-mobile' : ''}`}>
          <label className="library-search">
            <span>Поиск</span>
            <input
              type="text"
              value={articleSearchInput}
              onChange={(event) => setArticleSearchInput(event.target.value)}
              placeholder={isMobileViewport ? 'Найти статью по названию' : 'Название статьи'}
              aria-label="Поиск по названию статьи"
            />
          </label>
          <label className="library-sort">
            <span>Редкость</span>
            <select
              value={articleRarityFilter}
              onChange={(event) => setArticleRarityFilter(event.target.value)}
              aria-label="Фильтр по редкости"
            >
              <option value="">Все редкости</option>
              {RARITY_ORDER.map((rarityKey) => (
                <option key={rarityKey} value={rarityKey}>
                  {rarityLevels[rarityKey]?.name || rarityKey}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {!isMobileViewport ? (
        <div className="library-overview">
          <article className="library-overview-card">
            <span>Всего в разделе</span>
            <strong>{formatFullNumber(activeArticlesTotal)}</strong>
            <small>{isCollectionView ? 'Карты в личном vault' : 'Статей в общем каталоге'}</small>
          </article>

          <article className="library-overview-card">
            <span>На экране</span>
            <strong>{formatFullNumber(activeVisibleArticles.length)}</strong>
            <small>{activeHasMoreArticles ? 'Можно загрузить ещё' : 'Текущая выдача полная'}</small>
          </article>

          <article className="library-overview-card">
            <span>Фильтр</span>
            <strong>{articleRarityFilter ? rarityLevels[articleRarityFilter]?.name || articleRarityFilter : 'Все редкости'}</strong>
            <small>{articleSearchQuery ? `Поиск: ${articleSearchQuery}` : 'Без текстового фильтра'}</small>
          </article>
        </div>
      ) : null}

      <div className="library-list" onScroll={handleLibraryScroll} ref={listRef}>
        {activeVisibleArticles.map((article) => {
          const rarity = resolveArticleRarity(article, rarityLevels);
          const rarityData = rarityLevels[rarity];
          const stats = resolveArticleStats(article, rarity);
          const totalPower = calculateTotalPower(stats);

          return (
            <article
              key={article.id}
              className="library-item"
              data-rarity={rarity}
              style={{ '--library-accent': rarityData?.color || '#c9a36a' }}
              role="button"
              tabIndex={0}
              onClick={() => openLibraryArticle(article)}
              onKeyDown={(event) => handleLibraryItemKeyDown(event, article)}
            >
              <div className="library-item-top">
                <div className="library-item-title-wrap">
                  <div className="library-item-title">{article.title}</div>
                  <div className="library-item-subtitle" style={{ color: rarityData.color }}>
                    {rarityData.name}
                  </div>
                </div>
                <div className="library-item-views">
                  <span>Просмотры</span>
                  <strong>{formatCompactNumber(article.viewCount)}</strong>
                </div>
              </div>

              <div className="library-item-stats">
                {STAT_LABELS.map((stat) => (
                  <div key={stat.key} className="library-stat">
                    <span>{stat.label}</span>
                    <strong>{stats[stat.key]}</strong>
                  </div>
                ))}
              </div>

              <div className="library-item-footer">
                <span>Power {formatFullNumber(totalPower)}</span>
                <span>
                  {isCollectionView && article.dropCount
                    ? `Выбито x${formatFullNumber(article.dropCount)}`
                    : `ID ${article.id}`}
                </span>
              </div>
            </article>
          );
        })}

        {activeIsLoadingArticles ? (
          <div className="library-status">
            {isCollectionView ? 'Загружаем выбитые статьи...' : 'Загружаем ещё статьи...'}
          </div>
        ) : null}

        {activeArticlesError ? (
          <div className="library-status error">{activeArticlesError}</div>
        ) : null}

        {!activeIsLoadingArticles && activeHasMoreArticles ? (
          <button
            type="button"
            className="library-more-btn"
            onClick={() => (isCollectionView ? loadCollectionArticles(false) : loadArticles(false))}
          >
            Загрузить ещё
          </button>
        ) : null}

        {!activeHasMoreArticles && activeArticles.length > 0 ? (
          <div className="library-status">
            {isCollectionView ? 'Все выбитые статьи загружены.' : 'Все статьи загружены.'}
          </div>
        ) : null}

        {!activeIsLoadingArticles && activeVisibleArticles.length === 0 && !activeArticlesError ? (
          <div className="library-status">
            {articleSearchQuery ? 'Ничего не найдено по этому запросу.' : activeEmptyState}
          </div>
        ) : null}
      </div>

      <LibraryPreview
        card={selectedLibraryCard}
        label={previewLabel}
        onClose={() => setSelectedLibraryCard(null)}
      />

      {isOpeningLibraryCard ? (
        <div className="library-floating-status">Открываем карточку...</div>
      ) : null}
    </section>
  );
}

export default LibraryView;
