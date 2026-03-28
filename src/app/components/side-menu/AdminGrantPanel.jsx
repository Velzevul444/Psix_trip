import React from 'react';
import { ADMIN_SEARCH_MIN_LENGTH } from '../../constants';
import { formatCompactNumber, formatFullNumber, resolveArticleRarity } from '../../utils';

function AdminGrantPanel({
  rarityLevels,
  adminUserSearchInput,
  adminUserSearchQuery,
  adminUserResults,
  selectedAdminUser,
  isLoadingAdminUsers,
  adminUsersError,
  adminArticleSearchInput,
  adminArticleSearchQuery,
  adminArticleResults,
  selectedGrantArticle,
  isLoadingAdminArticles,
  adminArticlesError,
  adminGrantError,
  adminGrantStatus,
  isAdminGrantSubmitting,
  onUserInputChange,
  onArticleInputChange,
  onSelectUser,
  onSelectArticle,
  onSubmit
}) {
  return (
    <section className="admin-grant-panel">
      <div className="admin-panel-kicker">Администрирование</div>
      <h3>Выдача карт</h3>
      <p className="admin-panel-description">
        Выбери пользователя по никнейму и найди статью по названию, затем добавь карту в его коллекцию.
      </p>

      <label className="admin-panel-field">
        <span>Пользователь</span>
        <input
          type="text"
          value={adminUserSearchInput}
          onChange={onUserInputChange}
          placeholder="Никнейм пользователя"
        />
      </label>

      <div className="admin-panel-selection">
        <span>Выбранный пользователь</span>
        <strong>{selectedAdminUser ? selectedAdminUser.username : 'Не выбран'}</strong>
        <small>{selectedAdminUser ? selectedAdminUser.email : 'Найди пользователя и нажми на него'}</small>
      </div>

      <div className="admin-search-results">
        {isLoadingAdminUsers ? (
          <div className="auth-status">Ищем пользователей...</div>
        ) : adminUsersError ? (
          <div className="auth-error">{adminUsersError}</div>
        ) : adminUserSearchQuery.length < ADMIN_SEARCH_MIN_LENGTH ? (
          <div className="auth-status">Введите минимум 2 символа никнейма.</div>
        ) : adminUserResults.length > 0 ? (
          adminUserResults.map((user) => (
            <button
              key={user.id}
              type="button"
              className={`admin-search-result ${selectedAdminUser?.id === user.id ? 'selected' : ''}`}
              onClick={() => onSelectUser(user)}
            >
              <div>
                <strong>{user.username}</strong>
                <span>{user.email}</span>
              </div>
              {user.isAdmin ? <em>admin</em> : null}
            </button>
          ))
        ) : (
          <div className="auth-status">Пользователи не найдены.</div>
        )}
      </div>

      <label className="admin-panel-field">
        <span>Карта</span>
        <input
          type="text"
          value={adminArticleSearchInput}
          onChange={onArticleInputChange}
          placeholder="Название статьи"
        />
      </label>

      <div className="admin-panel-selection">
        <span>Выбранная карта</span>
        <strong>{selectedGrantArticle ? selectedGrantArticle.title : 'Не выбрана'}</strong>
        <small>
          {selectedGrantArticle ? (() => {
            const rarity = resolveArticleRarity(selectedGrantArticle, rarityLevels);
            return `${rarityLevels[rarity]?.name || rarity} • ${formatFullNumber(selectedGrantArticle.viewCount)} просмотров`;
          })() : 'Найди статью и нажми на неё'}
        </small>
      </div>

      <div className="admin-search-results article-results">
        {isLoadingAdminArticles ? (
          <div className="auth-status">Ищем статьи...</div>
        ) : adminArticlesError ? (
          <div className="auth-error">{adminArticlesError}</div>
        ) : adminArticleSearchQuery.length < ADMIN_SEARCH_MIN_LENGTH ? (
          <div className="auth-status">Введите минимум 2 символа названия статьи.</div>
        ) : adminArticleResults.length > 0 ? (
          adminArticleResults.map((article) => {
            const rarity = resolveArticleRarity(article, rarityLevels);
            const rarityData = rarityLevels[rarity];

            return (
              <button
                key={article.id}
                type="button"
                className={`admin-search-result ${selectedGrantArticle?.id === article.id ? 'selected' : ''}`}
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

      {adminGrantError ? <div className="auth-error">{adminGrantError}</div> : null}
      {adminGrantStatus ? <div className="admin-success">{adminGrantStatus}</div> : null}

      <button
        type="button"
        className="auth-submit-btn admin-grant-btn"
        onClick={onSubmit}
        disabled={isAdminGrantSubmitting || !selectedAdminUser || !selectedGrantArticle}
      >
        {isAdminGrantSubmitting ? 'Выдаём карту...' : 'Выдать карту'}
      </button>
    </section>
  );
}

export default AdminGrantPanel;
