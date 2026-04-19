import React, { useEffect, useRef, useState } from 'react';
import { TRADE_USER_SEARCH_MIN_LENGTH } from '../constants';
import { formatCompactNumber, resolveClassMeta, resolveArticleRarity } from '../utils';

function describeTradeArticle(article, rarityLevels) {
  if (!article) {
    return '';
  }

  const rarity = resolveArticleRarity(article, rarityLevels);
  const rarityData = rarityLevels[rarity];
  const classMeta = resolveClassMeta({ ...article, rarity }, rarityLevels);
  const dropCount = Number(article.dropCount || 0);

  return `${rarityData?.name || rarity} • ${classMeta.label}${dropCount > 1 ? ` • x${dropCount}` : ''}`;
}

function TradeMobileView({
  rarityLevels,
  tradeError,
  isTradeLoading,
  tradeState,
  showInviteSearchPanel,
  isTradeCompleted,
  isTradeCancelled,
  inviteSearchInput,
  onInviteSearchInputChange,
  inviteSearchQuery,
  inviteResults,
  isInviteSearchLoading,
  inviteSearchError,
  inviteActionError,
  isInviteSubmitting,
  isInviteResponding,
  isLeavingTrade,
  onInvite,
  onRespondToInvite,
  onLeaveTrade,
  cardSearchInput,
  onCardSearchInputChange,
  cardSearchQuery,
  selectedOfferId,
  orderedCardCandidates,
  isCardLoading,
  cardError,
  offerActionError,
  isOfferSubmitting,
  isConfirmingOffer,
  onSelectOffer,
  onClearOffer,
  onConfirmOffer
}) {
  const [activeTab, setActiveTab] = useState(tradeState ? 'trade' : 'invite');
  const scrollContainerRef = useRef(null);

  useEffect(() => {
    if (!tradeState) {
      setActiveTab('invite');
      return;
    }

    if (!showInviteSearchPanel && activeTab !== 'trade') {
      setActiveTab('trade');
    }
  }, [activeTab, showInviteSearchPanel, tradeState]);

  useEffect(() => {
    const scrollContainerElement = scrollContainerRef.current;

    if (!scrollContainerElement) {
      return;
    }

    scrollContainerElement.scrollTop = 0;
  }, [activeTab, tradeState?.id, tradeState?.status, tradeState?.updatedAt]);

  const renderInvitePanel = () => (
    <div className="duel-invite-panel trade-invite-panel trade-mobile-pane">
      <div className="duel-panel-head">
        <div>
          <div className="library-kicker">Обмен</div>
          <h3>Пригласи игрока на обмен 1v1</h3>
        </div>
      </div>

      <label className="admin-panel-field duel-search-field">
        <span>Ник игрока</span>
        <input
          type="text"
          value={inviteSearchInput}
          onChange={(event) => onInviteSearchInputChange(event.target.value)}
          placeholder="Начни вводить ник"
        />
      </label>

      {inviteActionError ? <div className="auth-error">{inviteActionError}</div> : null}

      <div className="admin-search-results duel-search-results trade-mobile-search-results">
        {isInviteSearchLoading ? (
          <div className="auth-status">Ищем игроков для обмена...</div>
        ) : inviteSearchError ? (
          <div className="auth-error">{inviteSearchError}</div>
        ) : inviteSearchQuery.length < TRADE_USER_SEARCH_MIN_LENGTH ? (
          <div className="auth-status">Введи минимум 2 символа, чтобы начать поиск.</div>
        ) : inviteResults.length > 0 ? (
          inviteResults.map((user) => (
            <button
              key={user.id}
              type="button"
              className="admin-search-result trade-mobile-candidate trade-mobile-user-candidate"
              onClick={() => onInvite(user)}
              disabled={isInviteSubmitting}
            >
              <div className="trade-mobile-candidate-copy">
                <strong>{user.username}</strong>
                <span>Игрок доступен для обмена 1 на 1</span>
              </div>
              <div className="trade-mobile-candidate-meta">
                <em className="trade-mobile-candidate-action">
                  {isInviteSubmitting ? 'Отправляем...' : 'Пригласить'}
                </em>
              </div>
            </button>
          ))
        ) : (
          <div className="auth-status">Игроки по этому запросу не найдены.</div>
        )}
      </div>
    </div>
  );

  const renderOfferSlot = (label, article, confirmed, isMine) => {
    const rarity = article ? resolveArticleRarity(article, rarityLevels) : null;
    const rarityData = rarity ? rarityLevels[rarity] : null;
    const classMeta = article ? resolveClassMeta({ ...article, rarity }, rarityLevels) : null;

    return (
      <article className={`trade-offer-slot trade-mobile-offer-slot ${article ? 'filled' : 'empty'} ${isMine ? 'mine' : 'opponent'}`}>
        <span className="trade-offer-label">{label}</span>
        {article ? (
          <>
            <strong>{article.title}</strong>
            <em>{`${rarityData?.name || rarity} • ${classMeta?.label || 'Боец'}`}</em>
            <i>
              {confirmed
                ? 'Подтверждено'
                : isMine
                  ? 'Ещё не подтверждено'
                  : 'Ожидаем подтверждение соперника'}
            </i>
          </>
        ) : (
          <>
            <strong>{isMine ? 'Карта не выбрана' : 'Соперник ещё не выбрал карту'}</strong>
            <em>{isMine ? 'Выбери карту ниже, чтобы положить её в слот.' : 'Слот соперника пока пуст.'}</em>
          </>
        )}
      </article>
    );
  };

  const renderSummaryPanel = () => {
    if (!tradeState) {
      return null;
    }

    const resultLabel = tradeState.status === 'finished'
      ? isTradeCompleted
        ? 'Обмен завершён'
        : 'Обмен отменён'
      : tradeState.status === 'pending'
        ? tradeState.isIncomingInvite
          ? 'Входящий запрос'
          : 'Ожидание ответа'
        : 'Подготовка сделки';

    return (
      <article className="trade-mobile-summary">
        <div className="trade-mobile-summary-head">
          <div>
            <div className="library-kicker">Сделка</div>
            <strong className="trade-mobile-summary-title">{resultLabel}</strong>
          </div>
          <div className="boss-team-count">
            {tradeState.myOffer ? 1 : 0}/1
          </div>
        </div>

        <div className="trade-mobile-participants">
          <article className="duel-participant-card duel-participant-card-me">
            <span>Ты</span>
            <strong>{tradeState.me.username}</strong>
            <em>
              {tradeState.myOffer
                ? tradeState.myOfferConfirmed
                  ? 'Карта выбрана и подтверждена'
                  : 'Карта выбрана, ждём подтверждение'
                : 'Карта ещё не выбрана'}
            </em>
          </article>

          <article className="duel-participant-card">
            <span>Соперник</span>
            <strong>{tradeState.opponent.username}</strong>
            <em>
              {tradeState.opponentOffer
                ? tradeState.opponentOfferConfirmed
                  ? 'Карта выбрана и подтверждена'
                  : 'Карта выбрана, ждём подтверждение'
                : tradeState.status === 'pending'
                  ? 'Ожидаем ответ на приглашение'
                  : 'Карта ещё не выбрана'}
            </em>
          </article>
        </div>

        {tradeState.status === 'pending' && tradeState.isIncomingInvite ? (
          <div className="duel-pending-actions">
            <button
              type="button"
              className="duel-invite-btn duel-invite-btn-muted"
              onClick={() => onRespondToInvite('decline')}
              disabled={isInviteResponding}
            >
              Отклонить
            </button>
            <button
              type="button"
              className="auth-submit-btn duel-invite-btn"
              onClick={() => onRespondToInvite('accept')}
              disabled={isInviteResponding}
            >
              {isInviteResponding ? 'Обрабатываем...' : 'Принять'}
            </button>
          </div>
        ) : null}

        {tradeState.status === 'pending' && tradeState.isOutgoingInvite ? (
          <>
            <div className="duel-note">
              Приглашение на обмен отправлено. Как только соперник примет его, откроются слоты выбора карт.
            </div>
            <div className="duel-secondary-actions">
              <button
                type="button"
                className="duel-invite-btn duel-invite-btn-muted"
                onClick={onLeaveTrade}
                disabled={isLeavingTrade}
              >
                {isLeavingTrade ? 'Отменяем...' : 'Отменить приглашение'}
              </button>
            </div>
          </>
        ) : null}

        {tradeState.status === 'active' ? (
          <>
            <div className="duel-note">
              Оба игрока выбирают по одной карте из коллекции. Если кто-то меняет карту, подтверждения сбрасываются.
            </div>
            <div className="duel-secondary-actions">
              <button
                type="button"
                className="duel-invite-btn duel-invite-btn-muted"
                onClick={onLeaveTrade}
                disabled={isLeavingTrade}
              >
                {isLeavingTrade ? 'Отменяем...' : 'Отменить обмен'}
              </button>
            </div>
          </>
        ) : null}

        {isTradeCompleted ? (
          <div className="duel-result-chip">
            <strong>Обмен завершён</strong>
            <span>
              Ты отдал "{tradeState.result?.mySentArticle?.title}" и получил "{tradeState.result?.myReceivedArticle?.title}".
            </span>
          </div>
        ) : null}

        {isTradeCancelled ? (
          <div className="duel-result-chip">
            <strong>Обмен отменён</strong>
            <span>
              {tradeState.result?.cancelledByUserId === tradeState.me.id
                ? 'Ты отменил обмен до завершения.'
                : `${tradeState.result?.cancelledByUsername || 'Соперник'} отменил обмен.`}
            </span>
          </div>
        ) : null}

        {inviteActionError ? <div className="auth-error">{inviteActionError}</div> : null}
      </article>
    );
  };

  const renderTradePanel = () => {
    if (!tradeState) {
      return (
        <div className="boss-mobile-block trade-mobile-pane">
          <div className="auth-status">Выбери соперника выше, чтобы начать новый обмен картами.</div>
        </div>
      );
    }

    if (tradeState.status === 'pending') {
      return (
        <div className="boss-mobile-block trade-mobile-pane">
          <div className="auth-status">
            {tradeState.isIncomingInvite
              ? 'Прими приглашение, чтобы открыть слоты обмена картами.'
              : 'Ждём, пока соперник ответит на приглашение на обмен.'}
          </div>
        </div>
      );
    }

    if (tradeState.status === 'finished') {
      return (
        <div className="boss-mobile-block trade-mobile-pane">
          {isTradeCompleted ? (
            <>
              <div className="duel-note">
                Обмен уже завершён. Можно посмотреть итог или сразу перейти во вкладку нового приглашения.
              </div>
              <div className="trade-mobile-result-grid">
                {renderOfferSlot('Ты отдал', tradeState.result?.mySentArticle, true, true)}
                {renderOfferSlot('Ты получил', tradeState.result?.myReceivedArticle, true, false)}
              </div>
            </>
          ) : (
            <div className="duel-note">
              {tradeState.result?.cancelledByUserId === tradeState.me.id
                ? 'Ты отменил этот обмен до завершения.'
                : `${tradeState.result?.cancelledByUsername || 'Соперник'} отменил обмен до свапа карт.`}
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="boss-mobile-block trade-mobile-pane">
        <div className="boss-mobile-block-head">
          <div>
            <div className="library-kicker">Обмен</div>
            <strong className="boss-mobile-section-title">Выбери карту для сделки</strong>
          </div>
        </div>

        <div className="trade-mobile-offer-board">
          {renderOfferSlot('Твой слот', tradeState.myOffer, tradeState.myOfferConfirmed, true)}
          <div className="trade-mobile-offer-link">
            <span>Обмен</span>
            <strong>{tradeState.myOffer && tradeState.opponentOffer ? 'Готов к подтверждению' : 'Ждём выбор карт'}</strong>
          </div>
          {renderOfferSlot('Слот соперника', tradeState.opponentOffer, tradeState.opponentOfferConfirmed, false)}
        </div>

        <div className="duel-note">
          Когда обе карты выбраны, каждая сторона отдельно подтверждает обмен. После двух подтверждений сервер атомарно меняет карты местами.
        </div>

        <label className="admin-panel-field boss-search-field">
          <span>Поиск по своей коллекции</span>
          <input
            type="text"
            value={cardSearchInput}
            onChange={(event) => onCardSearchInputChange(event.target.value)}
            placeholder="Название статьи"
          />
        </label>

        <div className="admin-search-results boss-search-results duel-search-results trade-mobile-search-results">
          {isCardLoading ? (
            <div className="auth-status">Ищем карты для обмена...</div>
          ) : cardError ? (
            <div className="auth-error">{cardError}</div>
          ) : orderedCardCandidates.length > 0 ? (
            orderedCardCandidates.map((article) => {
              const rarity = resolveArticleRarity(article, rarityLevels);
              const rarityData = rarityLevels[rarity];
              const isSelected = Number(article.id) === selectedOfferId;

              return (
                <button
                  key={article.id}
                  type="button"
                  className={`admin-search-result trade-mobile-candidate ${isSelected ? 'selected' : ''}`}
                  style={{ '--trade-candidate-accent': rarityData?.color || '#66bcff' }}
                  onClick={() => onSelectOffer(article.id)}
                  disabled={isOfferSubmitting || isConfirmingOffer}
                >
                  <div className="trade-mobile-candidate-copy">
                    <strong>{article.title}</strong>
                    <span>{describeTradeArticle(article, rarityLevels)}</span>
                    {isSelected ? <span className="boss-selected-note">В твоём слоте</span> : null}
                  </div>
                  <div className="trade-mobile-candidate-meta">
                    <em className="trade-mobile-candidate-action">{isSelected ? 'Выбрана' : '+ В слот'}</em>
                    <span>{formatCompactNumber(article.viewCount)} просмотров</span>
                  </div>
                </button>
              );
            })
          ) : (
            <div className="auth-status">
              {cardSearchQuery
                ? 'По этому запросу в коллекции ничего не найдено.'
                : 'Открой паки, чтобы получить карты для обменов.'}
            </div>
          )}
        </div>

        {offerActionError ? <div className="auth-error">{offerActionError}</div> : null}

        <div className="trade-mobile-footer">
          <button
            type="button"
            className="duel-invite-btn duel-invite-btn-muted"
            onClick={onClearOffer}
            disabled={!tradeState.myOffer || isOfferSubmitting || isConfirmingOffer}
          >
            {isOfferSubmitting ? 'Очищаем...' : 'Очистить слот'}
          </button>
          <button
            type="button"
            className="auth-submit-btn boss-fight-btn"
            onClick={onConfirmOffer}
            disabled={!tradeState.canConfirmOffer || isOfferSubmitting || isConfirmingOffer}
          >
            {isConfirmingOffer
              ? 'Подтверждаем...'
              : tradeState.myOfferConfirmed
                ? 'Подтверждено'
                : tradeState.myOffer && tradeState.opponentOffer
                  ? 'Подтвердить обмен'
                  : 'Ждём вторую карту'}
          </button>
        </div>
      </div>
    );
  };

  const tabOptions = [];

  if (showInviteSearchPanel) {
    tabOptions.push({ id: 'invite', label: tradeState ? 'Новый' : 'Поиск' });
  }

  if (tradeState) {
    tabOptions.push({ id: 'trade', label: tradeState.status === 'finished' ? 'Итог' : 'Обмен' });
  }

  return (
    <section className="duel-screen trade-screen trade-screen-mobile">
      <div className="duel-screen-shell trade-screen-shell trade-screen-shell-mobile" ref={scrollContainerRef}>
        <div className="duel-screen-header">
          <div>
            <div className="library-kicker">Сделка</div>
            <h2>Обмен 1v1</h2>
          </div>
        </div>

        {tradeError ? <div className="library-status error">{tradeError}</div> : null}
        {isTradeLoading && !tradeState ? (
          <div className="library-status">Загружаем текущее состояние обмена...</div>
        ) : null}

        {tabOptions.length > 1 ? (
          <div className="boss-mobile-tabs trade-mobile-tabs" role="tablist" aria-label="Режимы обмена">
            {tabOptions.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`boss-mobile-tab ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        ) : null}

        {renderSummaryPanel()}

        <div className="trade-mobile-stage">
          {activeTab === 'invite' && showInviteSearchPanel ? renderInvitePanel() : renderTradePanel()}
        </div>
      </div>
    </section>
  );
}

export default TradeMobileView;
