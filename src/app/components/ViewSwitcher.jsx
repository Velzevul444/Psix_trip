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
          <rect x="4.5" y="3.5" width="15" height="17" rx="3.5" />
          <path d="M8 8.5h8" />
          <path d="M8 12h8" />
          <path d="M8 15.5h5.5" />
        </svg>
      </button>

      <button
        type="button"
        className={`view-toggle ${viewMode === VIEW_MODES.PACKS ? 'active' : ''}`}
        onClick={onSwitchToPack}
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
        onClick={onSwitchToCollection}
        aria-label="Показать мои выбитые статьи"
      >
        <svg className="view-icon-svg collection-icon-svg" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="6.8" y="4.7" width="10.4" height="14" rx="2.8" />
          <path d="M9.5 2.8h7a2.7 2.7 0 0 1 2.7 2.7v9.2" />
          <path d="m11.9 8.7.8 1.65 1.8.26-1.3 1.28.31 1.82-1.61-.86-1.61.86.31-1.82-1.3-1.28 1.8-.26z" />
        </svg>
      </button>

      <button
        type="button"
        className={`view-toggle boss-toggle ${viewMode === VIEW_MODES.BOSS ? 'active' : ''}`}
        onClick={onSwitchToBoss}
        aria-label="Показать экран боя с боссом"
      >
        <span className="boss-emoji-icon" aria-hidden="true">☠︎</span>
      </button>
    </div>
  );
}

export default ViewSwitcher;
