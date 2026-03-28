import React from 'react';
import { ADMIN_SEARCH_MIN_LENGTH } from '../../constants';
import { formatCompactNumber, formatFullNumber, resolveArticleRarity } from '../../utils';

function AdminBossPanel({
  rarityLevels,
  adminBossSearchInput,
  adminBossSearchQuery,
  adminBossResults,
  selectedAdminBossArticle,
  isLoadingAdminBossArticles,
  adminBossArticlesError,
  adminBossError,
  adminBossStatus,
  isAdminBossSubmitting,
  onInputChange,
  onSelectArticle,
  onSubmit
}) {
  return (
    <section className="admin-grant-panel">
      <div className="admin-panel-kicker">Администрирование</div>
      <h3>Поменять босса</h3>
      <p className="admin-panel-description">
        Найди любую статью по названию и назначь её текущим боссом.
      </p>

      <label className="admin-panel-field">
        <span>Новый босс</span>
        <input
          type="text"
          value={adminBossSearchInput}
          onChange={onInputChange}
          placeholder="Название статьи"
        />
      </label>

      <div className="admin-panel-selection">
        <span>Выбранная статья</span>
        <strong>{selectedAdminBossArticle ? selectedAdminBossArticle.title : 'Не выбрана'}</strong>
        <small>
          {selectedAdminBossArticle ? (() => {
            const rarity = resolveArticleRarity(selectedAdminBossArticle, rarityLevels);
            return `${rarityLevels[rarity]?.name || rarity} • ${formatFullNumber(selectedAdminBossArticle.viewCount)} просмотров`;
          })() : 'Найди статью и нажми на неё'}
        </small>
      </div>

      <div className="admin-search-results article-results">
        {isLoadingAdminBossArticles ? (
          <div className="auth-status">Ищем статьи...</div>
        ) : adminBossArticlesError ? (
          <div className="auth-error">{adminBossArticlesError}</div>
        ) : adminBossSearchQuery.length < ADMIN_SEARCH_MIN_LENGTH ? (
          <div className="auth-status">Введите минимум 2 символа названия статьи.</div>
        ) : adminBossResults.length > 0 ? (
          adminBossResults.map((article) => {
            const rarity = resolveArticleRarity(article, rarityLevels);
            const rarityData = rarityLevels[rarity];

            return (
              <button
                key={article.id}
                type="button"
                className={`admin-search-result ${selectedAdminBossArticle?.id === article.id ? 'selected' : ''}`}
                onClick={() => onSelectArticle(article)}
              >
                <div>
                  <strong>{article.title}</strong>
                  <span>{rarityData?.name || rarity}</span>
                </div>
                <em>{formatCompactNumber(article.viewCount)}</em>
              </button>
            );
          })
        ) : (
          <div className="auth-status">Статьи не найдены.</div>
        )}
      </div>

      {adminBossError ? <div className="auth-error">{adminBossError}</div> : null}
      {adminBossStatus ? <div className="admin-success">{adminBossStatus}</div> : null}

      <button
        type="button"
        className="auth-submit-btn admin-grant-btn"
        onClick={onSubmit}
        disabled={isAdminBossSubmitting || !selectedAdminBossArticle}
      >
        {isAdminBossSubmitting ? 'Меняем босса...' : 'Назначить босса'}
      </button>
    </section>
  );
}

export default AdminBossPanel;
