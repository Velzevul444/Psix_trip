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
import { generateDeterministicCardStats } from '../shared/card-stats.mjs';

const PACK_SIZE = 5;
const PACK_FETCH_BATCH = PACK_SIZE * 4;
const PACK_FETCH_ATTEMPTS = 4;
const ARTICLE_PAGE_SIZE = 60;
const RECENT_TITLES_LIMIT = 250;
const NEXT_PACK_DELAY_MS = 1200;
const TITLE_PROCESS_CONCURRENCY = 6;
const AUTH_STORAGE_KEY = 'wiki-cards-auth-token';
const ADMIN_SEARCH_LIMIT = 12;
const ADMIN_SEARCH_MIN_LENGTH = 2;
const VIEW_MODES = {
  PACKS: 'packs',
  LIBRARY: 'library',
  COLLECTION: 'collection'
};
const STAT_LABELS = [
  { key: 'hp', label: 'HP' },
  { key: 'stamina', label: 'ST' },
  { key: 'strength', label: 'STR' },
  { key: 'dexterity', label: 'DEX' },
  { key: 'intelligence', label: 'INT' },
  { key: 'charisma', label: 'CHA' }
];
const PACK_API_ENDPOINT = import.meta.env.VITE_PACK_API_ENDPOINT || '/api/pack';
const ARTICLES_API_ENDPOINT = import.meta.env.VITE_ARTICLES_API_ENDPOINT || '/api/articles';
const MY_ARTICLES_API_ENDPOINT = import.meta.env.VITE_MY_ARTICLES_API_ENDPOINT || '/api/my-articles';
const AUTH_REGISTER_ENDPOINT = import.meta.env.VITE_AUTH_REGISTER_ENDPOINT || '/api/auth/register';
const AUTH_LOGIN_ENDPOINT = import.meta.env.VITE_AUTH_LOGIN_ENDPOINT || '/api/auth/login';
const AUTH_ME_ENDPOINT = import.meta.env.VITE_AUTH_ME_ENDPOINT || '/api/auth/me';
const ADMIN_USERS_ENDPOINT = import.meta.env.VITE_ADMIN_USERS_ENDPOINT || '/api/admin/users';
const ADMIN_GRANT_CARD_ENDPOINT =
  import.meta.env.VITE_ADMIN_GRANT_CARD_ENDPOINT || '/api/admin/grant-card';
const FALLBACK_EXTRACT = 'Краткое описание для этой статьи не найдено.';
const EMPTY_AUTH_FORM = {
  username: '',
  email: '',
  password: ''
};

function normalizeTitle(title) {
  return title.replace(/_/g, ' ').trim().toLowerCase();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildWikiUrl(title) {
  return `https://ru.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, '_'))}`;
}

function readStoredAuthToken() {
  if (typeof window === 'undefined') {
    return '';
  }

  return window.localStorage.getItem(AUTH_STORAGE_KEY) || '';
}

function storeAuthToken(token) {
  if (typeof window === 'undefined') {
    return;
  }

  if (token) {
    window.localStorage.setItem(AUTH_STORAGE_KEY, token);
    return;
  }

  window.localStorage.removeItem(AUTH_STORAGE_KEY);
}

function formatCompactNumber(num) {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return String(num);
}

function formatFullNumber(num) {
  return Number(num || 0).toLocaleString('ru-RU');
}

function hasCompleteStats(stats) {
  return Boolean(
    stats &&
      STAT_LABELS.every((stat) => Number.isFinite(stats[stat.key]))
  );
}

function calculateTotalPower(stats) {
  return STAT_LABELS.reduce((sum, stat) => sum + (stats?.[stat.key] || 0), 0);
}

function resolveArticleStats(article, rarity) {
  if (hasCompleteStats(article.stats)) {
    return article.stats;
  }

  return generateDeterministicCardStats(rarity, article.id);
}

async function fetchPackCandidates(count, excludeTitles, authToken = '') {
  const headers = {
    'Content-Type': 'application/json'
  };

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(PACK_API_ENDPOINT, {
    method: 'POST',
    headers,
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

async function fetchArticlesPage(offset, limit, options = {}) {
  const params = new URLSearchParams({
    offset: String(offset),
    limit: String(limit)
  });

  if (options.search) {
    params.set('search', options.search);
  }

  if (options.rarity) {
    params.set('rarity', options.rarity);
  }

  const response = await fetch(`${ARTICLES_API_ENDPOINT}?${params.toString()}`);

  if (!response.ok) {
    throw new Error(`Failed to load articles: ${response.status}`);
  }

  return response.json();
}

async function fetchMyArticlesPage(offset, limit, authToken, options = {}) {
  const params = new URLSearchParams({
    offset: String(offset),
    limit: String(limit)
  });

  if (options.search) {
    params.set('search', options.search);
  }

  if (options.rarity) {
    params.set('rarity', options.rarity);
  }

  const response = await fetch(`${MY_ARTICLES_API_ENDPOINT}?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${authToken}`
    }
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Failed to load user articles: ${response.status}`);
  }

  return response.json();
}

async function fetchAdminUsers(search, authToken) {
  const params = new URLSearchParams({
    search,
    limit: String(ADMIN_SEARCH_LIMIT)
  });

  const response = await fetch(`${ADMIN_USERS_ENDPOINT}?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${authToken}`
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Failed to load users: ${response.status}`);
  }

  return data;
}

async function grantCardToUser(userId, articleId, authToken) {
  const response = await fetch(ADMIN_GRANT_CARD_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`
    },
    body: JSON.stringify({
      userId,
      articleId
    })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Failed to grant card: ${response.status}`);
  }

  return data;
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

async function submitAuthRequest(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || 'Authentication failed.');
  }

  return data;
}

async function fetchCurrentUser(token) {
  const response = await fetch(AUTH_ME_ENDPOINT, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || 'Failed to load current user.');
  }

  return data.user || null;
}

function App() {
  const [cards, setCards] = useState([]);
  const [isOpening, setIsOpening] = useState(false);
  const [openedCards, setOpenedCards] = useState([]);
  const [currentCardIndex, setCurrentCardIndex] = useState(-1);
  const [isFetchingCards, setIsFetchingCards] = useState(false);
  const [isPackCooldown, setIsPackCooldown] = useState(false);
  const [viewMode, setViewMode] = useState(VIEW_MODES.PACKS);
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
  const [rarityLevels, setRarityLevels] = useState(() => buildRarityLevels(DEFAULT_RARITY_THRESHOLDS));
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [authMode, setAuthMode] = useState(null);
  const [authForm, setAuthForm] = useState(EMPTY_AUTH_FORM);
  const [authError, setAuthError] = useState('');
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [authToken, setAuthToken] = useState(() => readStoredAuthToken());
  const [authUser, setAuthUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(() => Boolean(readStoredAuthToken()));
  const [isAdminGrantPanelOpen, setIsAdminGrantPanelOpen] = useState(false);
  const [adminUserSearchInput, setAdminUserSearchInput] = useState('');
  const [adminUserSearchQuery, setAdminUserSearchQuery] = useState('');
  const [adminUserResults, setAdminUserResults] = useState([]);
  const [selectedAdminUser, setSelectedAdminUser] = useState(null);
  const [isLoadingAdminUsers, setIsLoadingAdminUsers] = useState(false);
  const [adminUsersError, setAdminUsersError] = useState('');
  const [adminArticleSearchInput, setAdminArticleSearchInput] = useState('');
  const [adminArticleSearchQuery, setAdminArticleSearchQuery] = useState('');
  const [adminArticleResults, setAdminArticleResults] = useState([]);
  const [selectedGrantArticle, setSelectedGrantArticle] = useState(null);
  const [isLoadingAdminArticles, setIsLoadingAdminArticles] = useState(false);
  const [adminArticlesError, setAdminArticlesError] = useState('');
  const [isAdminGrantSubmitting, setIsAdminGrantSubmitting] = useState(false);
  const [adminGrantError, setAdminGrantError] = useState('');
  const [adminGrantStatus, setAdminGrantStatus] = useState('');
  const initialLoadDoneRef = useRef(false);
  const summaryCacheRef = useRef(new Map());
  const libraryListRef = useRef(null);
  const libraryDepthFrameRef = useRef(0);
  const articlesRequestIdRef = useRef(0);
  const collectionRequestIdRef = useRef(0);
  const adminUsersRequestIdRef = useRef(0);
  const adminArticlesRequestIdRef = useRef(0);
  const recentTitlesRef = useRef({
    set: new Set(),
    queue: []
  });

  const isLibraryView = viewMode === VIEW_MODES.LIBRARY;
  const isCollectionView = viewMode === VIEW_MODES.COLLECTION;

  useEffect(() => {
    if (initialLoadDoneRef.current) return;
    initialLoadDoneRef.current = true;
    fetchCards();
  }, []);

  useEffect(() => {
    if (!isLibraryView || articles.length > 0 || isLoadingArticles) {
      return;
    }

    loadArticles(true);
  }, [isLibraryView, articles.length, isLoadingArticles]);

  useEffect(() => {
    if (!isCollectionView || !authUser || collectionArticles.length > 0 || isLoadingCollectionArticles) {
      return;
    }

    loadCollectionArticles(true);
  }, [isCollectionView, authUser, collectionArticles.length, isLoadingCollectionArticles]);

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
  }, [articleSearchInput, isLibraryView, isCollectionView]);

  useEffect(() => {
    if (!isLibraryView && !isCollectionView) {
      return;
    }

    setSelectedLibraryCard(null);

    if (libraryListRef.current) {
      libraryListRef.current.scrollTop = 0;
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
    }
  }, [articleSearchQuery, articleRarityFilter, isLibraryView, isCollectionView, authUser]);

  useEffect(() => {
    if (!authToken) {
      setAuthUser(null);
      setIsAuthLoading(false);
      return;
    }

    let isCancelled = false;

    const loadCurrentUser = async () => {
      setIsAuthLoading(true);

      try {
        const user = await fetchCurrentUser(authToken);
        if (!isCancelled) {
          setAuthUser(user);
        }
      } catch {
        if (!isCancelled) {
          setAuthUser(null);
          setAuthToken('');
          storeAuthToken('');
        }
      } finally {
        if (!isCancelled) {
          setIsAuthLoading(false);
        }
      }
    };

    loadCurrentUser();

    return () => {
      isCancelled = true;
    };
  }, [authToken]);

  useEffect(() => {
    if (authUser?.isAdmin) {
      return;
    }

    resetAdminGrantPanel();
  }, [authUser]);

  useEffect(() => {
    if (!isAdminGrantPanelOpen || !authUser?.isAdmin) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setAdminUserSearchQuery(adminUserSearchInput.trim());
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [adminUserSearchInput, isAdminGrantPanelOpen, authUser]);

  useEffect(() => {
    if (!isAdminGrantPanelOpen || !authUser?.isAdmin) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setAdminArticleSearchQuery(adminArticleSearchInput.trim());
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [adminArticleSearchInput, isAdminGrantPanelOpen, authUser]);

  useEffect(() => {
    if (!isAdminGrantPanelOpen || !authUser?.isAdmin || !authToken) {
      return;
    }

    if (adminUserSearchQuery.length < ADMIN_SEARCH_MIN_LENGTH) {
      setAdminUserResults([]);
      setAdminUsersError('');
      setIsLoadingAdminUsers(false);
      return;
    }

    const requestId = adminUsersRequestIdRef.current + 1;
    adminUsersRequestIdRef.current = requestId;
    setIsLoadingAdminUsers(true);
    setAdminUsersError('');

    const loadUsers = async () => {
      try {
        const payload = await fetchAdminUsers(adminUserSearchQuery, authToken);
        if (requestId !== adminUsersRequestIdRef.current) {
          return;
        }

        setAdminUserResults(Array.isArray(payload.users) ? payload.users : []);
      } catch (error) {
        if (requestId === adminUsersRequestIdRef.current) {
          setAdminUserResults([]);
          setAdminUsersError(error.message || 'Не удалось загрузить пользователей.');
        }
      } finally {
        if (requestId === adminUsersRequestIdRef.current) {
          setIsLoadingAdminUsers(false);
        }
      }
    };

    loadUsers();
  }, [adminUserSearchQuery, isAdminGrantPanelOpen, authToken, authUser]);

  useEffect(() => {
    if (!isAdminGrantPanelOpen || !authUser?.isAdmin) {
      return;
    }

    if (adminArticleSearchQuery.length < ADMIN_SEARCH_MIN_LENGTH) {
      setAdminArticleResults([]);
      setAdminArticlesError('');
      setIsLoadingAdminArticles(false);
      return;
    }

    const requestId = adminArticlesRequestIdRef.current + 1;
    adminArticlesRequestIdRef.current = requestId;
    setIsLoadingAdminArticles(true);
    setAdminArticlesError('');

    const loadArticlesForGrant = async () => {
      try {
        const payload = await fetchArticlesPage(0, ADMIN_SEARCH_LIMIT, {
          search: adminArticleSearchQuery
        });

        if (requestId !== adminArticlesRequestIdRef.current) {
          return;
        }

        const incomingArticles = Array.isArray(payload.articles) ? payload.articles : [];
        if (payload.rarityLevels) {
          setRarityLevels(buildRarityLevels(payload.rarityLevels));
        }
        setAdminArticleResults(incomingArticles);
      } catch (error) {
        if (requestId === adminArticlesRequestIdRef.current) {
          setAdminArticleResults([]);
          setAdminArticlesError(error.message || 'Не удалось загрузить статьи.');
        }
      } finally {
        if (requestId === adminArticlesRequestIdRef.current) {
          setIsLoadingAdminArticles(false);
        }
      }
    };

    loadArticlesForGrant();
  }, [adminArticleSearchQuery, isAdminGrantPanelOpen, authUser]);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && libraryDepthFrameRef.current) {
        window.cancelAnimationFrame(libraryDepthFrameRef.current);
      }
    };
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

  const resetAuthPanel = () => {
    setAuthMode(null);
    setAuthError('');
    setAuthForm(EMPTY_AUTH_FORM);
  };

  const resetAdminGrantPanel = () => {
    setIsAdminGrantPanelOpen(false);
    setAdminUserSearchInput('');
    setAdminUserSearchQuery('');
    setAdminUserResults([]);
    setSelectedAdminUser(null);
    setIsLoadingAdminUsers(false);
    setAdminUsersError('');
    setAdminArticleSearchInput('');
    setAdminArticleSearchQuery('');
    setAdminArticleResults([]);
    setSelectedGrantArticle(null);
    setIsLoadingAdminArticles(false);
    setAdminArticlesError('');
    setIsAdminGrantSubmitting(false);
    setAdminGrantError('');
    setAdminGrantStatus('');
  };

  const toggleMenu = () => {
    setIsMenuOpen((current) => {
      const next = !current;
      if (!next) {
        resetAuthPanel();
        resetAdminGrantPanel();
      }
      return next;
    });
  };

  const openAuthMode = (mode) => {
    setIsAdminGrantPanelOpen(false);
    setAdminGrantError('');
    setAdminGrantStatus('');
    setAuthMode(mode);
    setAuthError('');
    setAuthForm(EMPTY_AUTH_FORM);
  };

  const toggleAdminGrantPanel = () => {
    setAuthMode(null);
    setAuthError('');
    setIsAdminGrantPanelOpen((current) => !current);
    setAdminGrantError('');
    setAdminGrantStatus('');
  };

  const closeMenu = () => {
    setIsMenuOpen(false);
    resetAuthPanel();
    resetAdminGrantPanel();
  };

  const switchToLibraryView = () => {
    setViewMode(VIEW_MODES.LIBRARY);
    setIsOpening(false);
    setCurrentCardIndex(-1);
  };

  const switchToCollectionView = () => {
    setViewMode(VIEW_MODES.COLLECTION);
    setSelectedLibraryCard(null);
    setIsOpening(false);
    setCurrentCardIndex(-1);
  };

  const switchToPackView = () => {
    setViewMode(VIEW_MODES.PACKS);
    setSelectedLibraryCard(null);
    setIsOpening(false);
    setCurrentCardIndex(-1);
  };

  const handleAdminUserSearchInputChange = (event) => {
    setAdminUserSearchInput(event.target.value);
    setSelectedAdminUser(null);
    setAdminGrantError('');
    setAdminGrantStatus('');
  };

  const handleAdminArticleSearchInputChange = (event) => {
    setAdminArticleSearchInput(event.target.value);
    setSelectedGrantArticle(null);
    setAdminGrantError('');
    setAdminGrantStatus('');
  };

  const selectAdminUser = (user) => {
    setSelectedAdminUser(user);
    setAdminUserSearchInput(user.username);
    setAdminUserSearchQuery(user.username);
    setAdminGrantError('');
    setAdminGrantStatus('');
  };

  const selectGrantArticle = (article) => {
    setSelectedGrantArticle(article);
    setAdminArticleSearchInput(article.title);
    setAdminArticleSearchQuery(article.title);
    setAdminGrantError('');
    setAdminGrantStatus('');
  };

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
    const rarity = article.rarity || getRarityByViewCount(viewCount, activeRarityLevels);
    const rarityData = activeRarityLevels[rarity];
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
        setRarityLevels(buildRarityLevels(payload.rarityLevels));
      }

      setArticles((current) => (reset ? incomingArticles : [...current, ...incomingArticles]));
      setArticlesTotal(total);
      setHasMoreArticles(offset + incomingArticles.length < total);
    } catch (error) {
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
        setRarityLevels(buildRarityLevels(payload.rarityLevels));
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
    scheduleLibraryDepthEffect();

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
      setSelectedLibraryCard(processCardData(article, summary, rarityLevels));
    } finally {
      setIsOpeningLibraryCard(false);
    }
  };

  const closeLibraryArticle = () => {
    setSelectedLibraryCard(null);
  };

  const handleArticleSearchChange = (event) => {
    setArticleSearchInput(event.target.value);
  };

  const handleArticleRarityChange = (event) => {
    setArticleRarityFilter(event.target.value);
  };

  const updateLibraryDepthEffect = () => {
    const list = libraryListRef.current;

    if (!list) return;

    const listRect = list.getBoundingClientRect();
    const listCenterY = listRect.top + listRect.height / 2;
    const halfHeight = Math.max(listRect.height / 2, 1);
    const items = Array.from(list.querySelectorAll('.library-item'));

    const measurements = items.map((item) => {
      const itemRect = item.getBoundingClientRect();
      const itemCenterY = itemRect.top + itemRect.height / 2;
      const normalizedDistance = (itemCenterY - listCenterY) / halfHeight;
      const clampedDistance = Math.max(-1.2, Math.min(1.2, normalizedDistance));
      const distanceAbs = Math.min(1, Math.abs(clampedDistance));

      return {
        item,
        clampedDistance,
        distanceAbs
      };
    });

    const sortedByDistance = [...measurements].sort((left, right) => left.distanceAbs - right.distanceAbs);
    const thirdClosestDistance = sortedByDistance[Math.min(2, sortedByDistance.length - 1)]?.distanceAbs ?? 0;
    const focusZone = Math.min(0.64, Math.max(0.26, thirdClosestDistance + 0.05));

    measurements.forEach(({ item, clampedDistance, distanceAbs }) => {
      const frontPresence = distanceAbs < focusZone ? 1 - distanceAbs / focusZone : 0;
      const beyondFocus = Math.max(0, distanceAbs - focusZone);
      const normalizedBeyondFocus = beyondFocus / Math.max(1 - focusZone, 0.001);
      const curvedDistance = 1 - Math.pow(1 - normalizedBeyondFocus, 1.7);
      const shiftX = 0;
      const shiftY = clampedDistance * 3 + Math.sign(clampedDistance || 1) * curvedDistance * 12;
      const depth = Math.round(frontPresence * 42) - Math.round(curvedDistance * 255);
      const scale = Math.max(0.89, 1 + frontPresence * 0.03 - curvedDistance * 0.11);
      const tilt = `${clampedDistance * -5.2 * (1 - frontPresence * 0.55)}deg`;
      const opacity = Math.max(0.66, 0.86 + frontPresence * 0.16 - curvedDistance * 0.18);
      const blur = `${curvedDistance * 0.45}px`;
      const saturate = (0.96 + frontPresence * 0.08 - curvedDistance * 0.06).toFixed(3);
      const brightness = (0.98 + frontPresence * 0.08 - curvedDistance * 0.05).toFixed(3);
      const shadowAlpha = (0.18 + frontPresence * 0.08 + (1 - curvedDistance) * 0.12).toFixed(3);

      item.style.setProperty('--wave-shift-x', `${shiftX.toFixed(2)}px`);
      item.style.setProperty('--wave-shift-y', `${shiftY.toFixed(2)}px`);
      item.style.setProperty('--wave-depth', `${depth}px`);
      item.style.setProperty('--wave-scale', scale.toFixed(3));
      item.style.setProperty('--wave-tilt', tilt);
      item.style.setProperty('--wave-opacity', opacity.toFixed(3));
      item.style.setProperty('--wave-blur', blur);
      item.style.setProperty('--wave-saturate', saturate);
      item.style.setProperty('--wave-brightness', brightness);
      item.style.setProperty('--wave-shadow-alpha', shadowAlpha);
      item.style.setProperty('--wave-z-index', String(1000 - Math.round(distanceAbs * 400)));
    });
  };

  const scheduleLibraryDepthEffect = () => {
    if (typeof window === 'undefined' || libraryDepthFrameRef.current) {
      return;
    }

    libraryDepthFrameRef.current = window.requestAnimationFrame(() => {
      libraryDepthFrameRef.current = 0;
      updateLibraryDepthEffect();
    });
  };

  useEffect(() => {
    if (!isLibraryView && !isCollectionView) {
      return;
    }

    scheduleLibraryDepthEffect();
  }, [isLibraryView, isCollectionView, articles.length, collectionArticles.length]);

  useEffect(() => {
    if ((!isLibraryView && !isCollectionView) || typeof window === 'undefined') {
      return undefined;
    }

    const handleResize = () => {
      scheduleLibraryDepthEffect();
    };

    window.addEventListener('resize', handleResize);
    scheduleLibraryDepthEffect();

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [isLibraryView, isCollectionView]);

  const handleAuthFieldChange = (event) => {
    const { name, value } = event.target;

    setAuthForm((current) => ({
      ...current,
      [name]: value
    }));
  };

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    if (!authMode) return;

    setIsAuthSubmitting(true);
    setAuthError('');

    try {
      const payload =
        authMode === 'register'
          ? {
              username: authForm.username,
              email: authForm.email,
              password: authForm.password
            }
          : {
              login: authForm.email,
              password: authForm.password
            };

      const endpoint = authMode === 'register' ? AUTH_REGISTER_ENDPOINT : AUTH_LOGIN_ENDPOINT;
      const auth = await submitAuthRequest(endpoint, payload);

      setAuthToken(auth.token);
      setAuthUser(auth.user || null);
      storeAuthToken(auth.token);
      closeMenu();
    } catch (error) {
      setAuthError(error.message || 'Не удалось выполнить запрос.');
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const handleLogout = () => {
    setAuthToken('');
    setAuthUser(null);
    storeAuthToken('');
    setCollectionArticles([]);
    setCollectionTotal(0);
    setHasMoreCollectionArticles(true);
    setCollectionError('');
    if (viewMode === VIEW_MODES.COLLECTION) {
      setViewMode(VIEW_MODES.PACKS);
    }
    closeMenu();
  };

  const handleAdminGrantSubmit = async () => {
    if (!authToken || !selectedAdminUser || !selectedGrantArticle) {
      return;
    }

    setIsAdminGrantSubmitting(true);
    setAdminGrantError('');
    setAdminGrantStatus('');

    try {
      const payload = await grantCardToUser(selectedAdminUser.id, selectedGrantArticle.id, authToken);
      const grantedArticle = payload.article || selectedGrantArticle;
      const targetUser = payload.user || selectedAdminUser;

      setAdminGrantStatus(`Карта "${grantedArticle.title}" выдана пользователю ${targetUser.username}.`);
      setSelectedGrantArticle(null);
      setAdminArticleSearchInput('');
      setAdminArticleSearchQuery('');
      setAdminArticleResults([]);

      if (authUser && Number(targetUser.id) === Number(authUser.id)) {
        setCollectionArticles([]);
        setCollectionTotal(0);
        setHasMoreCollectionArticles(true);
        setCollectionError('');

        if (viewMode === VIEW_MODES.COLLECTION) {
          loadCollectionArticles(true);
        }
      }
    } catch (error) {
      setAdminGrantError(error.message || 'Не удалось выдать карту.');
    } finally {
      setIsAdminGrantSubmitting(false);
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
    ? activeArticles.filter((article) => {
        const rarity = article.rarity || getRarityByViewCount(article.viewCount, rarityLevels);
        return rarity === articleRarityFilter;
      })
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
    <div className="App">
      <div className="view-switcher">
        <button
          type="button"
          className={`view-toggle ${viewMode === VIEW_MODES.LIBRARY ? 'active' : ''}`}
          onClick={switchToLibraryView}
          aria-label="Показать все статьи"
        >
          <svg className="view-icon-svg" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="4.5" y="3.5" width="15" height="17" rx="3.5" />
            <path d="M8 8.5h8" />
            <path d="M8 12h8" />
            <path d="M8 15.5h5.5" />
          </svg>
        </button>

        <button
          type="button"
          className={`view-toggle ${viewMode === VIEW_MODES.PACKS ? 'active' : ''}`}
          onClick={switchToPackView}
          aria-label="Показать экран паков"
        >
          <svg className="view-icon-svg pack-icon-svg" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7.2 4.5h9.6l2.2 2.5V19a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7z" />
            <path d="M7.2 4.5l2 2.5h5.6l2-2.5" />
            <path d="M9 11.75h6" />
            <path d="M12 9.4v4.7" />
          </svg>
        </button>

        <button
          type="button"
          className={`view-toggle collection-toggle ${viewMode === VIEW_MODES.COLLECTION ? 'active' : ''}`}
          onClick={switchToCollectionView}
          aria-label="Показать мои выбитые статьи"
        >
          <svg className="view-icon-svg collection-icon-svg" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="6.8" y="4.7" width="10.4" height="14" rx="2.8" />
            <path d="M9.5 2.8h7a2.7 2.7 0 0 1 2.7 2.7v9.2" />
            <path d="m11.9 8.7.8 1.65 1.8.26-1.3 1.28.31 1.82-1.61-.86-1.61.86.31-1.82-1.3-1.28 1.8-.26z" />
          </svg>
        </button>
      </div>

      <button
        type="button"
        className={`menu-toggle ${isMenuOpen ? 'open' : ''}`}
        onClick={toggleMenu}
        aria-label="Открыть меню"
      >
        <span></span>
        <span></span>
        <span></span>
      </button>

      <div className={`side-menu-backdrop ${isMenuOpen ? 'visible' : ''}`} onClick={closeMenu}></div>

      <aside className={`side-menu ${isMenuOpen ? 'open' : ''}`}>
        <div className="side-menu-header">
          <div>
            <div className="side-menu-kicker">Аккаунт</div>
            <h2>{authUser ? authUser.username : 'Гость'}</h2>
            <p>{authUser ? authUser.email : 'Войдите, чтобы сохранить доступ к профилю'}</p>
          </div>
        </div>

        {!authUser ? (
          <div className="auth-menu-actions">
            <button type="button" className="auth-action-btn" onClick={() => openAuthMode('register')}>
              Регистрация
            </button>
            <button type="button" className="auth-action-btn" onClick={() => openAuthMode('login')}>
              Вход
            </button>
          </div>
        ) : (
          <>
            {authUser.isAdmin ? (
              <div className="auth-menu-actions">
                <button
                  type="button"
                  className={`auth-action-btn admin-toggle ${isAdminGrantPanelOpen ? 'active' : ''}`}
                  onClick={toggleAdminGrantPanel}
                >
                  Выдача карт
                </button>
              </div>
            ) : null}

            <div className="auth-menu-actions">
              <button type="button" className="auth-action-btn logout" onClick={handleLogout}>
                Выход
              </button>
            </div>
          </>
        )}

        {!authUser && authMode ? (
          <form className="auth-form" onSubmit={handleAuthSubmit}>
            <h3>{authMode === 'register' ? 'Создать аккаунт' : 'Войти в аккаунт'}</h3>

            {authMode === 'register' ? (
              <label>
                <span>Имя пользователя</span>
                <input
                  name="username"
                  type="text"
                  value={authForm.username}
                  onChange={handleAuthFieldChange}
                  autoComplete="username"
                  required
                />
              </label>
            ) : null}

            <label>
              <span>{authMode === 'register' ? 'Email' : 'Email или логин'}</span>
              <input
                name="email"
                type={authMode === 'register' ? 'email' : 'text'}
                value={authForm.email}
                onChange={handleAuthFieldChange}
                autoComplete={authMode === 'register' ? 'email' : 'username'}
                required
              />
            </label>

            <label>
              <span>Пароль</span>
              <input
                name="password"
                type="password"
                value={authForm.password}
                onChange={handleAuthFieldChange}
                autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
                required
              />
            </label>

            {authError ? <div className="auth-error">{authError}</div> : null}

            <button type="submit" className="auth-submit-btn" disabled={isAuthSubmitting}>
              {isAuthSubmitting
                ? 'Подождите...'
                : authMode === 'register'
                  ? 'Зарегистрироваться'
                  : 'Войти'}
            </button>
          </form>
        ) : null}

        {authUser?.isAdmin && isAdminGrantPanelOpen ? (
          <section className="admin-grant-panel">
            <div className="admin-panel-kicker">Администрирование</div>
            <h3>Выдача карт</h3>
            <p className="admin-panel-description">
              Выбери пользователя по никнейму и найди статью по названию, затем добавь карту в его коллекцию.
            </p>

            <label className="admin-panel-field">
              <span>Пользователь</span>
              <input
                type="text"
                value={adminUserSearchInput}
                onChange={handleAdminUserSearchInputChange}
                placeholder="Никнейм пользователя"
              />
            </label>

            <div className="admin-panel-selection">
              <span>Выбранный пользователь</span>
              <strong>{selectedAdminUser ? selectedAdminUser.username : 'Не выбран'}</strong>
              <small>{selectedAdminUser ? selectedAdminUser.email : 'Найди пользователя и нажми на него'}</small>
            </div>

            <div className="admin-search-results">
              {isLoadingAdminUsers ? (
                <div className="auth-status">Ищем пользователей...</div>
              ) : adminUsersError ? (
                <div className="auth-error">{adminUsersError}</div>
              ) : adminUserSearchQuery.length < ADMIN_SEARCH_MIN_LENGTH ? (
                <div className="auth-status">Введите минимум 2 символа никнейма.</div>
              ) : adminUserResults.length > 0 ? (
                adminUserResults.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    className={`admin-search-result ${selectedAdminUser?.id === user.id ? 'selected' : ''}`}
                    onClick={() => selectAdminUser(user)}
                  >
                    <div>
                      <strong>{user.username}</strong>
                      <span>{user.email}</span>
                    </div>
                    {user.isAdmin ? <em>admin</em> : null}
                  </button>
                ))
              ) : (
                <div className="auth-status">Пользователи не найдены.</div>
              )}
            </div>

            <label className="admin-panel-field">
              <span>Карта</span>
              <input
                type="text"
                value={adminArticleSearchInput}
                onChange={handleAdminArticleSearchInputChange}
                placeholder="Название статьи"
              />
            </label>

            <div className="admin-panel-selection">
              <span>Выбранная карта</span>
              <strong>{selectedGrantArticle ? selectedGrantArticle.title : 'Не выбрана'}</strong>
              <small>
                {selectedGrantArticle ? (() => {
                  const rarity =
                    selectedGrantArticle.rarity ||
                    getRarityByViewCount(selectedGrantArticle.viewCount, rarityLevels);
                  return `${rarityLevels[rarity]?.name || rarity} • ${formatFullNumber(selectedGrantArticle.viewCount)} просмотров`;
                })() : 'Найди статью и нажми на неё'}
              </small>
            </div>

            <div className="admin-search-results article-results">
              {isLoadingAdminArticles ? (
                <div className="auth-status">Ищем статьи...</div>
              ) : adminArticlesError ? (
                <div className="auth-error">{adminArticlesError}</div>
              ) : adminArticleSearchQuery.length < ADMIN_SEARCH_MIN_LENGTH ? (
                <div className="auth-status">Введите минимум 2 символа названия статьи.</div>
              ) : adminArticleResults.length > 0 ? (
                adminArticleResults.map((article) => {
                  const rarity = article.rarity || getRarityByViewCount(article.viewCount, rarityLevels);
                  const rarityData = rarityLevels[rarity];

                  return (
                    <button
                      key={article.id}
                      type="button"
                      className={`admin-search-result ${selectedGrantArticle?.id === article.id ? 'selected' : ''}`}
                      onClick={() => selectGrantArticle(article)}
                    >
                      <div>
                        <strong>{article.title}</strong>
                        <span>{rarityData?.name || rarity}</span>
                      </div>
                      <em>{formatCompactNumber(article.viewCount)}</em>
                    </button>
                  );
                })
              ) : (
                <div className="auth-status">Статьи не найдены.</div>
              )}
            </div>

            {adminGrantError ? <div className="auth-error">{adminGrantError}</div> : null}
            {adminGrantStatus ? <div className="admin-success">{adminGrantStatus}</div> : null}

            <button
              type="button"
              className="auth-submit-btn admin-grant-btn"
              onClick={handleAdminGrantSubmit}
              disabled={isAdminGrantSubmitting || !selectedAdminUser || !selectedGrantArticle}
            >
              {isAdminGrantSubmitting ? 'Выдаём карту...' : 'Выдать карту'}
            </button>
          </section>
        ) : null}

        {isAuthLoading ? <div className="auth-status">Проверяем текущую сессию...</div> : null}
      </aside>

      <h1 className="title">Wiki Cards</h1>

      {viewMode === VIEW_MODES.PACKS ? (
        <>
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
        </>
      ) : (
        <section className="article-library">
          <>
            <div className="library-header">
              <div>
                <div className="library-kicker">{activeKicker}</div>
                <h2>{activeHeading}</h2>
                <p>{activeDescription}</p>
              </div>
              <div className="library-controls">
                <label className="library-search">
                  <span>Поиск</span>
                  <input
                    type="text"
                    value={articleSearchInput}
                    onChange={handleArticleSearchChange}
                    placeholder="Название статьи"
                  />
                </label>
                <label className="library-sort">
                  <span>Редкость</span>
                  <select value={articleRarityFilter} onChange={handleArticleRarityChange}>
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

            <div className="library-list" onScroll={handleLibraryScroll} ref={libraryListRef}>
              {activeVisibleArticles.map((article) => {
                const rarity = article.rarity || getRarityByViewCount(article.viewCount, rarityLevels);
                const rarityData = rarityLevels[rarity];
                const stats = resolveArticleStats(article, rarity);
                const totalPower = calculateTotalPower(stats);

                return (
                  <button
                    key={article.id}
                    type="button"
                    className="library-item"
                    onClick={() => openLibraryArticle(article)}
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
                  </button>
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
          </>

          {selectedLibraryCard ? (
            <div className="library-preview-overlay" onClick={closeLibraryArticle}>
              <div className="library-preview-shell" onClick={(event) => event.stopPropagation()}>
                <div className="library-preview">
                  <div className="card-counter">
                    {previewLabel}
                  </div>
                  <div className="card-showcase">
                    <Card card={selectedLibraryCard} />
                    <CardStats card={selectedLibraryCard} />
                  </div>
                  <div className="reveal-buttons">
                    <button className="btn-next" onClick={closeLibraryArticle}>
                      Назад к списку
                    </button>
                    <a
                      className="library-wiki-link"
                      href={selectedLibraryCard.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Открыть в Wikipedia
                    </a>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {isOpeningLibraryCard ? (
            <div className="library-floating-status">Открываем карточку...</div>
          ) : null}
        </section>
      )}
    </div>
  );
}

export default App;
