import React, { useState } from 'react';
import '../styles/Pack.scss';

function Pack({ onOpen, cardCount, isLocked = false }) {
  const [isHovered, setIsHovered] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const hasCards = cardCount > 0 && !isLocked;

  const handleClick = () => {
    if (!hasCards) return;

    setIsShaking(true);
    setTimeout(() => {
      setIsShaking(false);
      onOpen();
    }, 500);
  };

  return (
    <div className="pack-container">
      <div
        className={`pack ${isHovered ? 'hovered' : ''} ${isShaking ? 'shaking' : ''} ${!hasCards ? 'loading' : ''}`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={handleClick}
      >
        <div className="pack-front">
          <div className="pack-top">
            <span className="pack-series">Atlas Archive</span>
            <span className="pack-edition">Live Index</span>
          </div>

          <div className="pack-content">
            <div className="pack-logo">WIKI VAULT</div>
            <div className="pack-subtitle">5 curated article drops</div>

            <div className="pack-art">
              <div className="pack-orbit"></div>
              <div className="pack-core"></div>
              <div className="card-stack">
                <div className="stack-card c1"></div>
                <div className="stack-card c2"></div>
                <div className="stack-card c3"></div>
              </div>
            </div>

            <div className="pack-rarities">
              <div className="rarity-dot divine" title="Божественная"></div>
              <div className="rarity-dot legendary" title="Легендарная"></div>
              <div className="rarity-dot mythic" title="Мифическая"></div>
              <div className="rarity-dot epic" title="Эпическая"></div>
              <div className="rarity-dot super-rare" title="Сверхредкая"></div>
              <div className="rarity-dot rare" title="Редкая"></div>
              <div className="rarity-dot common" title="Обычная"></div>
            </div>

            <div className="pack-info">
              <span className="card-count">{hasCards ? `${cardCount} карт уже внутри` : 'Собираем следующий дроп...'}</span>
              <span className="booster-text">{hasCards ? 'Нажми, чтобы вскрыть архив' : 'Подожди пару секунд'}</span>
            </div>
          </div>

          <div className="pack-shine"></div>
        </div>
        <div className="pack-glow"></div>
      </div>
      <p className="pack-hint">{hasCards ? 'Нажми, чтобы открыть пак' : 'Открытие временно недоступно'}</p>
    </div>
  );
}

export default Pack;
