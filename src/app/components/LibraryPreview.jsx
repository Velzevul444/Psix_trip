import React from 'react';
import Card from '../../components/Card';
import CardStats from '../../components/CardStats';

function LibraryPreview({ card, label, onClose }) {
  if (!card) {
    return null;
  }

  return (
    <div className="library-preview-overlay" onClick={onClose}>
      <div className="library-preview-shell" onClick={(event) => event.stopPropagation()}>
        <div className="library-preview">
          <div className="card-counter">{label}</div>
          <div className="card-showcase">
            <Card card={card} />
            <CardStats card={card} />
          </div>
          <div className="reveal-buttons">
            <button className="btn-next" onClick={onClose}>
              Назад к списку
            </button>
            <a
              className="library-wiki-link"
              href={card.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Открыть в Wikipedia
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LibraryPreview;
