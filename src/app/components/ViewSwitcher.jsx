import React from 'react';
import { VIEW_MODES } from '../constants';

function ViewSwitcher({
  viewMode,
  onSwitchToLibrary,
  onSwitchToPack,
  onSwitchToCollection,
  onSwitchToBoss,
  onSwitchToDuel
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
          <path className="view-icon-accent" d="M19 17V5a2 2 0 0 0-2-2H4v14a4 4 0 0 0 4 4h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1z" />
          <path d="M19 17V5a2 2 0 0 0-2-2H4" />
          <path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3" />
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
            d="M6.7 6.35 7.8 4.55 8.9 6.35 10.05 4.55 11.15 6.35 12.3 4.55 13.45 6.35 14.6 4.55 15.75 6.35 16.85 4.55 17.35 6.35"
          />
          <path d="M6.7 6.35V17.6" />
          <path d="M17.35 6.35V17.6" />
          <path d="M6.7 6.35H17.35" />
          <path d="M6.7 17.8H17.35" />
          <path
            d="M6.7 17.6 7.65 19.45 8.75 17.6 9.85 19.45 10.95 17.6 12.05 19.45 13.15 17.6 14.3 19.45 15.45 17.6 16.45 19.45 17.35 17.6"
          />
        </svg>
      </button>

      <button
        type="button"
        className={`view-toggle collection-toggle ${viewMode === VIEW_MODES.COLLECTION ? 'active' : ''}`}
        onClick={onSwitchToCollection}
        aria-label="Показать мои выбитые статьи"
      >
        <svg className="view-icon-svg collection-icon-svg" viewBox="0 0 24 24" aria-hidden="true">
          <path
            className="view-icon-accent"
            d="m3.604 7.197 7.138 -3.109a0.96 0.96 0 0 1 1.27 0.527l4.924 11.902a1 1 0 0 1 -0.514 1.304L9.285 20.93a0.96 0.96 0 0 1 -1.271 -0.527L3.09 8.5a1 1 0 0 1 0.514 -1.304z"
          />
          <path d="m3.604 7.197 7.138 -3.109a0.96 0.96 0 0 1 1.27 0.527l4.924 11.902a1 1 0 0 1 -0.514 1.304L9.285 20.93a0.96 0.96 0 0 1 -1.271 -0.527L3.09 8.5a1 1 0 0 1 0.514 -1.304z" />
          <path d="M15 4h1a1 1 0 0 1 1 1v3.5" />
          <path d="M20 6c0.264 0.112 0.52 0.217 0.768 0.315a1 1 0 0 1 0.53 1.311L19 13" />
        </svg>
      </button>

      <button
        type="button"
        className={`view-toggle boss-toggle ${viewMode === VIEW_MODES.BOSS ? 'active' : ''}`}
        onClick={onSwitchToBoss}
        aria-label="Показать экран боя с боссом"
      >
        <svg className="view-icon-svg boss-icon-svg" viewBox="0 0 24 24" aria-hidden="true">
          <path className="view-icon-accent" d="m12.5 17-.5-1-.5 1h1z" />
          <path d="M15 22a1 1 0 0 0 1-1v-1a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20v1a1 1 0 0 0 1 1z" />
          <circle cx="15" cy="12" r="1" />
          <circle cx="9" cy="12" r="1" />
        </svg>
      </button>

      <button
        type="button"
        className={`view-toggle duel-toggle ${viewMode === VIEW_MODES.DUEL ? 'active' : ''}`}
        onClick={onSwitchToDuel}
        aria-label="Показать экран дуэлей"
      >
        <svg className="view-icon-svg duel-icon-svg" viewBox="0 0 24 24" aria-hidden="true" strokeWidth={2}>
          <polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5" />
          <line x1="13" x2="19" y1="19" y2="13" />
          <line x1="16" x2="20" y1="16" y2="20" />
          <line x1="19" x2="21" y1="21" y2="19" />
          <polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5" />
          <line x1="5" x2="9" y1="14" y2="18" />
          <line x1="7" x2="4" y1="17" y2="20" />
          <line x1="3" x2="5" y1="19" y2="21" />
        </svg>
      </button>
    </div>
  );
}

export default ViewSwitcher;
