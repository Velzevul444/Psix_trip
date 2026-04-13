import React from 'react';
import '../styles/CardStats.scss';

const STAT_LABELS = [
  { key: 'hp', label: 'HP' },
  { key: 'stamina', label: 'Stamina' },
  { key: 'strength', label: 'Strength' },
  { key: 'dexterity', label: 'Dexterity' },
  { key: 'intelligence', label: 'Intelligence' },
  { key: 'charisma', label: 'Charisma' }
];

function CardStats({ card }) {
  if (!card) return null;

  const totalPower = STAT_LABELS.reduce((sum, stat) => sum + (card.stats?.[stat.key] || 0), 0);

  return (
    <div className="stats-wrapper">
      <div className={`stats-front rarity-${card.rarity}`}>
        <div className="stats-frame" style={{ borderColor: card.color }}>
          <div className="stats-header">
            <h3 className="stats-title">Характеристики</h3>
            <div className="stats-rarity-badge" style={{ backgroundColor: card.color }}>
              {card.name}
            </div>
            {card.classLabel ? (
              <div className="stats-class-badge">
                Класс: {card.classLabel}
              </div>
            ) : null}
          </div>

          <div className="stats-list">
            {STAT_LABELS.map((stat) => {
              const value = card.stats?.[stat.key] || 0;
              const fillPercent = Math.min(100, Math.round((value / 999) * 100));

              return (
                <div className="stat-row" key={stat.key}>
                  <div className="stat-meta">
                    <span className="stat-name">{stat.label}</span>
                    <span className="stat-value">{value}</span>
                  </div>
                  <div className="stat-bar">
                    <div className="stat-fill" style={{ width: `${fillPercent}%`, backgroundColor: card.color }}></div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="stats-footer">
            <span className="power-label">Total Power</span>
            <span className="power-value">{totalPower}</span>
          </div>
        </div>

        <div className="stats-glow" style={{ boxShadow: card.glow }}></div>
      </div>
    </div>
  );
}

export default CardStats;
