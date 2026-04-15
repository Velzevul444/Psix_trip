import React, { useEffect, useRef, useState } from 'react';
import { buildRarityLevels, DEFAULT_RARITY_THRESHOLDS } from '../shared/rarity.mjs';
import {
  fetchCurrentUser,
  fetchDuelState,
  fetchTradeState,
  respondToDuelInvite,
  respondToTradeInvite
} from './app/api';
import AppSideMenu from './app/components/AppSideMenu';
import BossView from './app/components/BossView';
import ClanView from './app/components/ClanView';
import DuelView from './app/components/DuelView';
import LibraryView from './app/components/LibraryView';
import PackView from './app/components/PackView';
import TradeView from './app/components/TradeView';
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
  const [tradeRefreshToken, setTradeRefreshToken] = useState(0);
  const [clanRefreshToken, setClanRefreshToken] = useState(0);
  const [duelState, setDuelState] = useState(null);
  const [duelBannerError, setDuelBannerError] = useState('');
  const [isDuelInviteResponding, setIsDuelInviteResponding] = useState(false);
  const [tradeState, setTradeState] = useState(null);
  const [tradeBannerError, setTradeBannerError] = useState('');
  const [isTradeInviteResponding, setIsTradeInviteResponding] = useState(false);
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

  useEffect(() => {
    if (!authToken || !authUser) {
      setTradeState(null);
      setTradeBannerError('');
      setIsTradeInviteResponding(false);
      return undefined;
    }

    let isCancelled = false;

    const loadTradeStatus = async () => {
      try {
        const payload = await fetchTradeState(authToken);

        if (!isCancelled) {
          setTradeState(payload.trade || null);
        }
      } catch {
        if (!isCancelled) {
          setTradeState(null);
        }
      }
    };

    loadTradeStatus();
    const intervalId = window.setInterval(loadTradeStatus, 12000);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [authToken, authUser, tradeRefreshToken]);

  const handleRarityLevelsChange = (nextLevels) => {
    setRarityLevels(buildRarityLevels(nextLevels || DEFAULT_RARITY_THRESHOLDS));
  };

  const handleAuthSuccess = (token, user) => {
    setAuthToken(token);
    setAuthUser(user || null);
    storeAuthToken(token);
    setCollectionRefreshToken((current) => current + 1);
    setDuelRefreshToken((current) => current + 1);
    setTradeRefreshToken((current) => current + 1);
    setClanRefreshToken((current) => current + 1);
  };

  const handleLogout = () => {
    setAuthToken('');
    setAuthUser(null);
    setDuelState(null);
    setTradeState(null);
    setDuelBannerError('');
    setTradeBannerError('');
    storeAuthToken('');
    setCollectionRefreshToken((current) => current + 1);
    setTradeRefreshToken((current) => current + 1);
    setClanRefreshToken((current) => current + 1);

    if (
      viewMode === VIEW_MODES.COLLECTION ||
      viewMode === VIEW_MODES.DUEL ||
      viewMode === VIEW_MODES.TRADE ||
      viewMode === VIEW_MODES.CLANS
    ) {
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
    if (nextMode === VIEW_MODES.TRADE) {
      setTradeRefreshToken((current) => current + 1);
    }
    if (nextMode === VIEW_MODES.CLANS) {
      setClanRefreshToken((current) => current + 1);
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

  const handleTradeInviteAction = async (action) => {
    if (!tradeState?.id || !authToken) {
      return;
    }

    setIsTradeInviteResponding(true);
    setTradeBannerError('');

    try {
      const payload = await respondToTradeInvite(tradeState.id, action, authToken);
      setTradeState(payload.trade || null);
      setTradeRefreshToken((current) => current + 1);

      if (action === 'accept') {
        setViewMode(VIEW_MODES.TRADE);
      }
    } catch (error) {
      setTradeBannerError(error.message || 'Не удалось ответить на приглашение на обмен.');
    } finally {
      setIsTradeInviteResponding(false);
    }
  };

  const incomingDuelInvite =
    duelState?.status === 'pending' && duelState?.isIncomingInvite ? duelState : null;
  const incomingTradeInvite =
    tradeState?.status === 'pending' && tradeState?.isIncomingInvite ? tradeState : null;

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
        onSwitchToTrade={() => switchView(VIEW_MODES.TRADE)}
        onSwitchToClans={() => switchView(VIEW_MODES.CLANS)}
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

      {incomingTradeInvite ? (
        <div className="duel-invite-banner trade-invite-banner" role="status" aria-live="polite">
          <div className="duel-invite-banner-copy">
            <div className="library-kicker">Обмен</div>
            <strong>{incomingTradeInvite.inviter.username} приглашает тебя на обмен 1v1</strong>
            <span>Каждый игрок кладёт по одной карте в слот, обе стороны подтверждают и сервер меняет карты местами.</span>
            {tradeBannerError ? <em>{tradeBannerError}</em> : null}
          </div>

          <div className="duel-invite-banner-actions">
            <button
              type="button"
              className="library-more-btn"
              onClick={() => switchView(VIEW_MODES.TRADE)}
            >
              Открыть
            </button>
            <button
              type="button"
              className="duel-invite-btn duel-invite-btn-muted"
              onClick={() => handleTradeInviteAction('decline')}
              disabled={isTradeInviteResponding}
            >
              Отклонить
            </button>
            <button
              type="button"
              className="auth-submit-btn duel-invite-btn"
              onClick={() => handleTradeInviteAction('accept')}
              disabled={isTradeInviteResponding}
            >
              {isTradeInviteResponding ? 'Обрабатываем...' : 'Принять'}
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
        <div
          className={`app-view-panel ${viewMode === VIEW_MODES.PACKS ? 'is-active' : ''}`}
          aria-hidden={viewMode !== VIEW_MODES.PACKS}
        >
          <PackView
            authToken={authToken}
            authUser={authUser}
            rarityLevels={rarityLevels}
            onRarityLevelsChange={handleRarityLevelsChange}
            recentTitlesRef={recentTitlesRef}
          />
        </div>

        <div
          className={`app-view-panel ${viewMode === VIEW_MODES.LIBRARY ? 'is-active' : ''}`}
          aria-hidden={viewMode !== VIEW_MODES.LIBRARY}
        >
          <LibraryView
            mode={VIEW_MODES.LIBRARY}
            authToken={authToken}
            authUser={authUser}
            rarityLevels={rarityLevels}
            onRarityLevelsChange={handleRarityLevelsChange}
            refreshToken={collectionRefreshToken}
          />
        </div>

        <div
          className={`app-view-panel ${viewMode === VIEW_MODES.COLLECTION ? 'is-active' : ''}`}
          aria-hidden={viewMode !== VIEW_MODES.COLLECTION}
        >
          <LibraryView
            mode={VIEW_MODES.COLLECTION}
            authToken={authToken}
            authUser={authUser}
            rarityLevels={rarityLevels}
            onRarityLevelsChange={handleRarityLevelsChange}
            refreshToken={collectionRefreshToken}
          />
        </div>

        <div
          className={`app-view-panel ${viewMode === VIEW_MODES.BOSS ? 'is-active' : ''}`}
          aria-hidden={viewMode !== VIEW_MODES.BOSS}
        >
          <BossView
            authToken={authToken}
            authUser={authUser}
            rarityLevels={rarityLevels}
            onRarityLevelsChange={handleRarityLevelsChange}
            refreshToken={bossRefreshToken}
            onCollectionRefresh={() => setCollectionRefreshToken((current) => current + 1)}
          />
        </div>

        <div
          className={`app-view-panel ${viewMode === VIEW_MODES.DUEL ? 'is-active' : ''}`}
          aria-hidden={viewMode !== VIEW_MODES.DUEL}
        >
          <DuelView
            authToken={authToken}
            authUser={authUser}
            rarityLevels={rarityLevels}
            onRarityLevelsChange={handleRarityLevelsChange}
            refreshToken={duelRefreshToken}
            onDuelRefresh={() => setDuelRefreshToken((current) => current + 1)}
          />
        </div>

        <div
          className={`app-view-panel ${viewMode === VIEW_MODES.TRADE ? 'is-active' : ''}`}
          aria-hidden={viewMode !== VIEW_MODES.TRADE}
        >
          <TradeView
            authToken={authToken}
            authUser={authUser}
            rarityLevels={rarityLevels}
            onRarityLevelsChange={handleRarityLevelsChange}
            refreshToken={tradeRefreshToken}
            onTradeRefresh={() => setTradeRefreshToken((current) => current + 1)}
            onCollectionRefresh={() => setCollectionRefreshToken((current) => current + 1)}
          />
        </div>

        <div
          className={`app-view-panel ${viewMode === VIEW_MODES.CLANS ? 'is-active' : ''}`}
          aria-hidden={viewMode !== VIEW_MODES.CLANS}
        >
          <ClanView
            authToken={authToken}
            authUser={authUser}
            isActive={viewMode === VIEW_MODES.CLANS}
            refreshToken={clanRefreshToken}
            onClanRefresh={() => setClanRefreshToken((current) => current + 1)}
          />
        </div>
      </main>
    </div>
  );
}

export default App;
