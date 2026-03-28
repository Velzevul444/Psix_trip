import React, { useEffect, useRef, useState } from 'react';
import { changeBossArticle, fetchAdminUsers, fetchArticlesPage, grantCardToUser, submitAuthRequest } from '../api';
import {
  ADMIN_SEARCH_LIMIT,
  ADMIN_SEARCH_MIN_LENGTH,
  API_ENDPOINTS,
  EMPTY_AUTH_FORM
} from '../constants';
import AuthPanel from './side-menu/AuthPanel';
import AdminGrantPanel from './side-menu/AdminGrantPanel';
import AdminBossPanel from './side-menu/AdminBossPanel';

function AppSideMenu({
  isOpen,
  authToken,
  authUser,
  isAuthLoading,
  rarityLevels,
  onClose,
  onAuthSuccess,
  onLogout,
  onRarityLevelsChange,
  onCollectionRefresh,
  onBossRefresh
}) {
  const [authMode, setAuthMode] = useState(null);
  const [authForm, setAuthForm] = useState(EMPTY_AUTH_FORM);
  const [authError, setAuthError] = useState('');
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
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
  const [isAdminBossPanelOpen, setIsAdminBossPanelOpen] = useState(false);
  const [adminBossSearchInput, setAdminBossSearchInput] = useState('');
  const [adminBossSearchQuery, setAdminBossSearchQuery] = useState('');
  const [adminBossResults, setAdminBossResults] = useState([]);
  const [selectedAdminBossArticle, setSelectedAdminBossArticle] = useState(null);
  const [isLoadingAdminBossArticles, setIsLoadingAdminBossArticles] = useState(false);
  const [adminBossArticlesError, setAdminBossArticlesError] = useState('');
  const [isAdminBossSubmitting, setIsAdminBossSubmitting] = useState(false);
  const [adminBossError, setAdminBossError] = useState('');
  const [adminBossStatus, setAdminBossStatus] = useState('');
  const adminUsersRequestIdRef = useRef(0);
  const adminArticlesRequestIdRef = useRef(0);
  const adminBossArticlesRequestIdRef = useRef(0);

  useEffect(() => {
    if (authUser?.isAdmin) {
      return;
    }

    resetAdminGrantPanel();
    resetAdminBossPanel();
  }, [authUser]);

  useEffect(() => {
    if (isOpen) {
      return;
    }

    resetAuthPanel();
    resetAdminGrantPanel();
    resetAdminBossPanel();
  }, [isOpen]);

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

        if (payload.rarityLevels) {
          onRarityLevelsChange(payload.rarityLevels);
        }

        setAdminArticleResults(Array.isArray(payload.articles) ? payload.articles : []);
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
    if (!isAdminBossPanelOpen || !authUser?.isAdmin) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setAdminBossSearchQuery(adminBossSearchInput.trim());
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [adminBossSearchInput, isAdminBossPanelOpen, authUser]);

  useEffect(() => {
    if (!isAdminBossPanelOpen || !authUser?.isAdmin) {
      return;
    }

    if (adminBossSearchQuery.length < ADMIN_SEARCH_MIN_LENGTH) {
      setAdminBossResults([]);
      setAdminBossArticlesError('');
      setIsLoadingAdminBossArticles(false);
      return;
    }

    const requestId = adminBossArticlesRequestIdRef.current + 1;
    adminBossArticlesRequestIdRef.current = requestId;
    setIsLoadingAdminBossArticles(true);
    setAdminBossArticlesError('');

    const loadBossArticles = async () => {
      try {
        const payload = await fetchArticlesPage(0, ADMIN_SEARCH_LIMIT, {
          search: adminBossSearchQuery
        });

        if (requestId !== adminBossArticlesRequestIdRef.current) {
          return;
        }

        if (payload.rarityLevels) {
          onRarityLevelsChange(payload.rarityLevels);
        }

        setAdminBossResults(Array.isArray(payload.articles) ? payload.articles : []);
      } catch (error) {
        if (requestId === adminBossArticlesRequestIdRef.current) {
          setAdminBossResults([]);
          setAdminBossArticlesError(error.message || 'Не удалось загрузить статьи.');
        }
      } finally {
        if (requestId === adminBossArticlesRequestIdRef.current) {
          setIsLoadingAdminBossArticles(false);
        }
      }
    };

    loadBossArticles();
  }, [adminBossSearchQuery, isAdminBossPanelOpen, authUser]);

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

  const resetAdminBossPanel = () => {
    setIsAdminBossPanelOpen(false);
    setAdminBossSearchInput('');
    setAdminBossSearchQuery('');
    setAdminBossResults([]);
    setSelectedAdminBossArticle(null);
    setIsLoadingAdminBossArticles(false);
    setAdminBossArticlesError('');
    setIsAdminBossSubmitting(false);
    setAdminBossError('');
    setAdminBossStatus('');
  };

  const openAuthMode = (mode) => {
    setIsAdminGrantPanelOpen(false);
    setIsAdminBossPanelOpen(false);
    setAdminGrantError('');
    setAdminGrantStatus('');
    setAdminBossError('');
    setAdminBossStatus('');
    setAuthMode(mode);
    setAuthError('');
    setAuthForm(EMPTY_AUTH_FORM);
  };

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

      const endpoint =
        authMode === 'register' ? API_ENDPOINTS.AUTH_REGISTER : API_ENDPOINTS.AUTH_LOGIN;
      const auth = await submitAuthRequest(endpoint, payload);

      onAuthSuccess(auth.token, auth.user || null);
      onClose();
    } catch (error) {
      setAuthError(error.message || 'Не удалось выполнить запрос.');
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const handleLogout = () => {
    onLogout();
    onClose();
  };

  const toggleAdminGrantPanel = () => {
    setAuthMode(null);
    setAuthError('');
    setIsAdminBossPanelOpen(false);
    setAdminBossError('');
    setAdminBossStatus('');
    setIsAdminGrantPanelOpen((current) => !current);
    setAdminGrantError('');
    setAdminGrantStatus('');
  };

  const toggleAdminBossPanel = () => {
    setAuthMode(null);
    setAuthError('');
    setIsAdminGrantPanelOpen(false);
    setAdminGrantError('');
    setAdminGrantStatus('');
    setIsAdminBossPanelOpen((current) => !current);
    setAdminBossError('');
    setAdminBossStatus('');
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
        onCollectionRefresh();
      }
    } catch (error) {
      setAdminGrantError(error.message || 'Не удалось выдать карту.');
    } finally {
      setIsAdminGrantSubmitting(false);
    }
  };

  const handleAdminBossSubmit = async () => {
    if (!authToken || !selectedAdminBossArticle) {
      return;
    }

    setIsAdminBossSubmitting(true);
    setAdminBossError('');
    setAdminBossStatus('');

    try {
      const payload = await changeBossArticle(selectedAdminBossArticle.id, authToken);

      if (payload.rarityLevels) {
        onRarityLevelsChange(payload.rarityLevels);
      }

      onBossRefresh();
      setAdminBossStatus(`Босс сменён на "${selectedAdminBossArticle.title}".`);
    } catch (error) {
      setAdminBossError(error.message || 'Не удалось сменить босса.');
    } finally {
      setIsAdminBossSubmitting(false);
    }
  };

  return (
    <>
      <div className={`side-menu-backdrop ${isOpen ? 'visible' : ''}`} onClick={onClose}></div>

      <aside className={`side-menu ${isOpen ? 'open' : ''}`}>
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
                <button
                  type="button"
                  className={`auth-action-btn admin-toggle ${isAdminBossPanelOpen ? 'active' : ''}`}
                  onClick={toggleAdminBossPanel}
                >
                  Поменять босса
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

        {!authUser ? (
          <AuthPanel
            authMode={authMode}
            authForm={authForm}
            authError={authError}
            isAuthSubmitting={isAuthSubmitting}
            onFieldChange={handleAuthFieldChange}
            onSubmit={handleAuthSubmit}
          />
        ) : null}

        {authUser?.isAdmin && isAdminGrantPanelOpen ? (
          <AdminGrantPanel
            rarityLevels={rarityLevels}
            adminUserSearchInput={adminUserSearchInput}
            adminUserSearchQuery={adminUserSearchQuery}
            adminUserResults={adminUserResults}
            selectedAdminUser={selectedAdminUser}
            isLoadingAdminUsers={isLoadingAdminUsers}
            adminUsersError={adminUsersError}
            adminArticleSearchInput={adminArticleSearchInput}
            adminArticleSearchQuery={adminArticleSearchQuery}
            adminArticleResults={adminArticleResults}
            selectedGrantArticle={selectedGrantArticle}
            isLoadingAdminArticles={isLoadingAdminArticles}
            adminArticlesError={adminArticlesError}
            adminGrantError={adminGrantError}
            adminGrantStatus={adminGrantStatus}
            isAdminGrantSubmitting={isAdminGrantSubmitting}
            onUserInputChange={(event) => {
              setAdminUserSearchInput(event.target.value);
              setSelectedAdminUser(null);
              setAdminGrantError('');
              setAdminGrantStatus('');
            }}
            onArticleInputChange={(event) => {
              setAdminArticleSearchInput(event.target.value);
              setSelectedGrantArticle(null);
              setAdminGrantError('');
              setAdminGrantStatus('');
            }}
            onSelectUser={(user) => {
              setSelectedAdminUser(user);
              setAdminUserSearchInput(user.username);
              setAdminUserSearchQuery(user.username);
              setAdminGrantError('');
              setAdminGrantStatus('');
            }}
            onSelectArticle={(article) => {
              setSelectedGrantArticle(article);
              setAdminArticleSearchInput(article.title);
              setAdminArticleSearchQuery(article.title);
              setAdminGrantError('');
              setAdminGrantStatus('');
            }}
            onSubmit={handleAdminGrantSubmit}
          />
        ) : null}

        {authUser?.isAdmin && isAdminBossPanelOpen ? (
          <AdminBossPanel
            rarityLevels={rarityLevels}
            adminBossSearchInput={adminBossSearchInput}
            adminBossSearchQuery={adminBossSearchQuery}
            adminBossResults={adminBossResults}
            selectedAdminBossArticle={selectedAdminBossArticle}
            isLoadingAdminBossArticles={isLoadingAdminBossArticles}
            adminBossArticlesError={adminBossArticlesError}
            adminBossError={adminBossError}
            adminBossStatus={adminBossStatus}
            isAdminBossSubmitting={isAdminBossSubmitting}
            onInputChange={(event) => {
              setAdminBossSearchInput(event.target.value);
              setSelectedAdminBossArticle(null);
              setAdminBossError('');
              setAdminBossStatus('');
            }}
            onSelectArticle={(article) => {
              setSelectedAdminBossArticle(article);
              setAdminBossSearchInput(article.title);
              setAdminBossSearchQuery(article.title);
              setAdminBossError('');
              setAdminBossStatus('');
            }}
            onSubmit={handleAdminBossSubmit}
          />
        ) : null}

        {isAuthLoading ? <div className="auth-status">Проверяем текущую сессию...</div> : null}
      </aside>
    </>
  );
}

export default AppSideMenu;
