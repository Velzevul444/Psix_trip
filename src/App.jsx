import React, { useEffect, useRef, useState } from 'react';
import { buildRarityLevels, DEFAULT_RARITY_THRESHOLDS } from '../shared/rarity.mjs';
import { fetchCurrentUser } from './app/api';
import AppSideMenu from './app/components/AppSideMenu';
import BossView from './app/components/BossView';
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

  const handleRarityLevelsChange = (nextLevels) => {
    setRarityLevels(buildRarityLevels(nextLevels || DEFAULT_RARITY_THRESHOLDS));
  };

  const handleAuthSuccess = (token, user) => {
    setAuthToken(token);
    setAuthUser(user || null);
    storeAuthToken(token);
    setCollectionRefreshToken((current) => current + 1);
  };

  const handleLogout = () => {
    setAuthToken('');
    setAuthUser(null);
    storeAuthToken('');
    setCollectionRefreshToken((current) => current + 1);

    if (viewMode === VIEW_MODES.COLLECTION) {
      setViewMode(VIEW_MODES.PACKS);
    }
  };

  const switchView = (nextMode) => {
    setViewMode(nextMode);
    if (nextMode === VIEW_MODES.BOSS) {
      setBossRefreshToken((current) => current + 1);
    }
  };

  return (
    <div className={`App app-view-${viewMode}`}>
      <ViewSwitcher
        viewMode={viewMode}
        onSwitchToLibrary={() => switchView(VIEW_MODES.LIBRARY)}
        onSwitchToPack={() => switchView(VIEW_MODES.PACKS)}
        onSwitchToCollection={() => switchView(VIEW_MODES.COLLECTION)}
        onSwitchToBoss={() => switchView(VIEW_MODES.BOSS)}
      />

      <button
        type="button"
        className={`menu-toggle ${isMenuOpen ? 'open' : ''}`}
        onClick={() => setIsMenuOpen((current) => !current)}
        aria-label="Открыть меню"
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
