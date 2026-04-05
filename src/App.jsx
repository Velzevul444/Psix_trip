import React, { useEffect, useRef, useState } from 'react';
import { buildRarityLevels, DEFAULT_RARITY_THRESHOLDS } from '../shared/rarity.mjs';
import { fetchCurrentUser, fetchDuelState, respondToDuelInvite } from './app/api';
import AppSideMenu from './app/components/AppSideMenu';
import BossView from './app/components/BossView';
import DuelView from './app/components/DuelView';
import LibraryView from './app/components/LibraryView';
import PackView from './app/components/PackView';
import ViewSwitcher from './app/components/ViewSwitcher';
import { VIEW_MODES } from './app/constants';
import { readStoredAuthToken, storeAuthToken } from './app/utils';
import './styles/App.scss';

function App() {
  const [viewMode, setViewMode] = useState(VIEW_MODES.PACKS);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [authToken, setAuthToken] = useState(() => readStoredAuthToken());
  const [authUser, setAuthUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(() => Boolean(readStoredAuthToken()));
  const [rarityLevels, setRarityLevels] = useState(() => buildRarityLevels(DEFAULT_RARITY_THRESHOLDS));
  const [collectionRefreshToken, setCollectionRefreshToken] = useState(0);
  const [bossRefreshToken, setBossRefreshToken] = useState(0);
  const [duelRefreshToken, setDuelRefreshToken] = useState(0);
  const [duelState, setDuelState] = useState(null);
  const [duelBannerError, setDuelBannerError] = useState('');
  const [isDuelInviteResponding, setIsDuelInviteResponding] = useState(false);
  const recentTitlesRef = useRef({
    set: new Set(),
    queue: []
  });

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
    if (!authToken || !authUser) {
      setDuelState(null);
      setDuelBannerError('');
      setIsDuelInviteResponding(false);
      return undefined;
    }

    let isCancelled = false;

    const loadDuelStatus = async () => {
      try {
        const payload = await fetchDuelState(authToken);

        if (!isCancelled) {
          setDuelState(payload.duel || null);
        }
      } catch {
        if (!isCancelled) {
          setDuelState(null);
        }
      }
    };

    loadDuelStatus();
    const intervalId = window.setInterval(loadDuelStatus, 12000);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [authToken, authUser, duelRefreshToken]);

  const handleRarityLevelsChange = (nextLevels) => {
    setRarityLevels(buildRarityLevels(nextLevels || DEFAULT_RARITY_THRESHOLDS));
  };

  const handleAuthSuccess = (token, user) => {
    setAuthToken(token);
    setAuthUser(user || null);
    storeAuthToken(token);
    setCollectionRefreshToken((current) => current + 1);
    setDuelRefreshToken((current) => current + 1);
  };

  const handleLogout = () => {
    setAuthToken('');
    setAuthUser(null);
    setDuelState(null);
    setDuelBannerError('');
    storeAuthToken('');
    setCollectionRefreshToken((current) => current + 1);

    if (viewMode === VIEW_MODES.COLLECTION || viewMode === VIEW_MODES.DUEL) {
      setViewMode(VIEW_MODES.PACKS);
    }
  };

  const switchView = (nextMode) => {
    setViewMode(nextMode);
    if (nextMode === VIEW_MODES.BOSS) {
      setBossRefreshToken((current) => current + 1);
    }
    if (nextMode === VIEW_MODES.DUEL) {
      setDuelRefreshToken((current) => current + 1);
    }
  };

  const handleDuelInviteAction = async (action) => {
    if (!duelState?.id || !authToken) {
      return;
    }

    setIsDuelInviteResponding(true);
    setDuelBannerError('');

    try {
      const payload = await respondToDuelInvite(duelState.id, action, authToken);
      setDuelState(payload.duel || null);
      setDuelRefreshToken((current) => current + 1);

      if (action === 'accept') {
        setViewMode(VIEW_MODES.DUEL);
      }
    } catch (error) {
      setDuelBannerError(error.message || 'Не удалось ответить на приглашение.');
    } finally {
      setIsDuelInviteResponding(false);
    }
  };

  const incomingDuelInvite =
    duelState?.status === 'pending' && duelState?.isIncomingInvite ? duelState : null;

  return (
    <div className={`App app-view-${viewMode}`}>
      <div className="app-brand-mark" aria-label="WIKI CARDS">
        <span>WIKI CARDS</span>
      </div>

      <ViewSwitcher
        viewMode={viewMode}
        onSwitchToLibrary={() => switchView(VIEW_MODES.LIBRARY)}
        onSwitchToPack={() => switchView(VIEW_MODES.PACKS)}
        onSwitchToCollection={() => switchView(VIEW_MODES.COLLECTION)}
        onSwitchToBoss={() => switchView(VIEW_MODES.BOSS)}
        onSwitchToDuel={() => switchView(VIEW_MODES.DUEL)}
      />

      {incomingDuelInvite ? (
        <div className="duel-invite-banner" role="status" aria-live="polite">
          <div className="duel-invite-banner-copy">
            <div className="library-kicker">Дуэль</div>
            <strong>{incomingDuelInvite.inviter.username} вызывает тебя на бой 1v1</strong>
            <span>Собери 5 карт и решите, чья колода переживёт случайный обмен ударами.</span>
            {duelBannerError ? <em>{duelBannerError}</em> : null}
          </div>

          <div className="duel-invite-banner-actions">
            <button
              type="button"
              className="library-more-btn"
              onClick={() => switchView(VIEW_MODES.DUEL)}
            >
              Открыть
            </button>
            <button
              type="button"
              className="duel-invite-btn duel-invite-btn-muted"
              onClick={() => handleDuelInviteAction('decline')}
              disabled={isDuelInviteResponding}
            >
              Отклонить
            </button>
            <button
              type="button"
              className="auth-submit-btn duel-invite-btn"
              onClick={() => handleDuelInviteAction('accept')}
              disabled={isDuelInviteResponding}
            >
              {isDuelInviteResponding ? 'Обрабатываем...' : 'Принять'}
            </button>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        className={`menu-toggle ${isMenuOpen ? 'open' : ''}`}
        onClick={() => setIsMenuOpen((current) => !current)}
        aria-label={isMenuOpen ? 'Закрыть меню' : 'Открыть меню'}
        aria-expanded={isMenuOpen}
      >
        <span></span>
        <span></span>
        <span></span>
      </button>

      <AppSideMenu
        isOpen={isMenuOpen}
        authToken={authToken}
        authUser={authUser}
        isAuthLoading={isAuthLoading}
        rarityLevels={rarityLevels}
        onClose={() => setIsMenuOpen(false)}
        onAuthSuccess={handleAuthSuccess}
        onLogout={handleLogout}
        onRarityLevelsChange={handleRarityLevelsChange}
        onCollectionRefresh={() => setCollectionRefreshToken((current) => current + 1)}
        onBossRefresh={() => setBossRefreshToken((current) => current + 1)}
      />

      <main className="app-stage">
        {viewMode === VIEW_MODES.PACKS ? (
          <PackView
            authToken={authToken}
            authUser={authUser}
            rarityLevels={rarityLevels}
            onRarityLevelsChange={handleRarityLevelsChange}
            recentTitlesRef={recentTitlesRef}
          />
        ) : viewMode === VIEW_MODES.BOSS ? (
          <BossView
            authToken={authToken}
            authUser={authUser}
            rarityLevels={rarityLevels}
            onRarityLevelsChange={handleRarityLevelsChange}
            refreshToken={bossRefreshToken}
            onCollectionRefresh={() => setCollectionRefreshToken((current) => current + 1)}
          />
        ) : viewMode === VIEW_MODES.DUEL ? (
          <DuelView
            authToken={authToken}
            authUser={authUser}
            rarityLevels={rarityLevels}
            onRarityLevelsChange={handleRarityLevelsChange}
            refreshToken={duelRefreshToken}
            onDuelRefresh={() => setDuelRefreshToken((current) => current + 1)}
          />
        ) : (
          <LibraryView
            mode={viewMode}
            authToken={authToken}
            authUser={authUser}
            rarityLevels={rarityLevels}
            onRarityLevelsChange={handleRarityLevelsChange}
            refreshToken={collectionRefreshToken}
          />
        )}
      </main>
    </div>
  );
}

export default App;
