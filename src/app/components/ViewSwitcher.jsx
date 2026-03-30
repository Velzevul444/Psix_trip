import React from 'react';
import { VIEW_MODES } from '../constants';

function ViewSwitcher({
  viewMode,
  onSwitchToLibrary,
  onSwitchToPack,
  onSwitchToCollection,
  onSwitchToBoss
}) {
  return (
    <div className="view-switcher">
      <button
        type="button"
        className={`view-toggle ${viewMode === VIEW_MODES.LIBRARY ? 'active' : ''}`}
        onClick={onSwitchToLibrary}
        aria-label="Показать все статьи"
      >
        <svg className="view-icon-svg" viewBox="0 0 24 24" aria-hidden="true">
          <rect className="view-icon-accent" x="4.75" y="3.75" width="14.5" height="16.5" rx="3.4" />
          <path d="M7.9 8h8.2" />
          <path d="M7.9 11.55h8.2" />
          <path d="M7.9 15.1h5.35" />
          <path d="M6 8h.01" />
          <path d="M6 11.55h.01" />
          <path d="M6 15.1h.01" />
        </svg>
      </button>

      <button
        type="button"
        className={`view-toggle ${viewMode === VIEW_MODES.PACKS ? 'active' : ''}`}
        onClick={onSwitchToPack}
        aria-label="Показать экран паков"
      >
        <svg className="view-icon-svg pack-icon-svg" viewBox="0 0 24 24" aria-hidden="true">
          <path
            className="view-icon-accent"
            d="M7.1 4.7h9.8l2 2.45v11.05a2.35 2.35 0 0 1-2.35 2.35H7.45A2.35 2.35 0 0 1 5.1 18.2V7.15Z"
          />
          <path d="M7.1 7.15h11.8" />
          <path d="M9.4 4.7 11 7.15h2l1.6-2.45" />
          <path d="m12 10.15.62 1.37 1.5.24-1.08 1.04.26 1.49L12 13.53l-1.3.76.26-1.49-1.08-1.04 1.5-.24Z" />
        </svg>
      </button>

      <button
        type="button"
        className={`view-toggle collection-toggle ${viewMode === VIEW_MODES.COLLECTION ? 'active' : ''}`}
        onClick={onSwitchToCollection}
        aria-label="Показать мои выбитые статьи"
      >
        <svg className="view-icon-svg collection-icon-svg" viewBox="0 0 24 24" aria-hidden="true">
          <rect className="view-icon-accent" x="7.45" y="5.15" width="10.8" height="13.4" rx="2.8" />
          <path d="M5.25 15.9V7.35A2.6 2.6 0 0 1 7.85 4.75h6.5" />
          <path d="M10 10.55h5.65" />
          <path d="M10 13.9h4.1" />
          <path d="m12.25 7.15.52 1.08 1.2.17-.86.84.21 1.2-1.07-.57-1.07.57.2-1.2-.86-.84 1.2-.17Z" />
        </svg>
      </button>

      <button
        type="button"
        className={`view-toggle boss-toggle ${viewMode === VIEW_MODES.BOSS ? 'active' : ''}`}
        onClick={onSwitchToBoss}
        aria-label="Показать экран боя с боссом"
      >
        <svg className="view-icon-svg boss-icon-svg" viewBox="0 0 24 24" aria-hidden="true">
          <path
            className="view-icon-accent"
            d="M12 20.15c4.42-1.19 6.65-3.9 6.65-8.15V7.15L12 4.55 5.35 7.15V12c0 4.25 2.23 6.96 6.65 8.15Z"
          />
          <path d="M8.55 7.2 10.1 5.35 12 6.95l1.9-1.6 1.55 1.85" />
          <path d="M10.05 11.05h.01" />
          <path d="M13.95 11.05h.01" />
          <path d="M9.85 14.45c1.28 1 3.02 1 4.3 0" />
          <path d="M12 8.9v3.45" />
        </svg>
      </button>
    </div>
  );
}

export default ViewSwitcher;
