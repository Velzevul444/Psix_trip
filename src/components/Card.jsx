import React from 'react';
import '../styles/Card.scss';

function Card({ card }) {
  const formatNumber = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  if (!card) return null;

  return (
    <div className="card-wrapper">
      <div className={`card-front rarity-${card.rarity}`}>
        <div className="card-frame" style={{ borderColor: card.color }}>
          <div className="card-header">
            <h3 className="card-title">{card.title}</h3>
            <div className="card-rarity-badge" style={{ backgroundColor: card.color }}>
              {card.name}
            </div>
            {card.classLabel ? (
              <div className="card-class-badge">
                Класс: {card.classLabel}
              </div>
            ) : null}
          </div>

          <div className="card-image-container">
            {card.image ? (
              <img src={card.image} alt={card.title} className="card-image" />
            ) : (
              <div className="card-image-placeholder">
                <span>&#128218;</span>
              </div>
            )}
            <div className="card-image-shine"></div>
          </div>

          <div className="card-body">
            <p className="card-description">{card.extract}</p>
          </div>

          <div className="card-footer">
            <div className="view-count">
              <span>Просмотры</span>
              <span>{formatNumber(card.viewCount)}</span>
            </div>
            <a
              href={card.url}
              target="_blank"
              rel="noopener noreferrer"
              className="wiki-link"
            >
              Wikipedia &#8594;
            </a>
          </div>
        </div>

        <div className="card-glow" style={{ boxShadow: card.glow }}></div>
      </div>
    </div>
  );
}

export default Card;
