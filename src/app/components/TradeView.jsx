import React, { useEffect, useRef, useState } from 'react';
import {
  confirmTradeOfferRequest,
  fetchMyArticlesPage,
  fetchTradeState,
  leaveCurrentTradeRequest,
  respondToTradeInvite,
  searchTradeUsers,
  sendTradeInvite,
  submitTradeOfferSelection
} from '../api';
import {
  TRADE_CARD_SEARCH_LIMIT,
  TRADE_STATE_POLL_MS,
  TRADE_USER_SEARCH_MIN_LENGTH
} from '../constants';
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

function TradeView({
  authUser,
  authToken,
  isActive = false,
  rarityLevels,
  onRarityLevelsChange,
  refreshToken,
  onTradeRefresh,
  onCollectionRefresh
}) {
  const [tradeState, setTradeState] = useState(null);
  const [isTradeLoading, setIsTradeLoading] = useState(false);
  const [tradeError, setTradeError] = useState('');
  const [inviteSearchInput, setInviteSearchInput] = useState('');
  const [inviteSearchQuery, setInviteSearchQuery] = useState('');
  const [inviteResults, setInviteResults] = useState([]);
  const [isInviteSearchLoading, setIsInviteSearchLoading] = useState(false);
  const [inviteSearchError, setInviteSearchError] = useState('');
  const [inviteActionError, setInviteActionError] = useState('');
  const [isInviteSubmitting, setIsInviteSubmitting] = useState(false);
  const [isInviteResponding, setIsInviteResponding] = useState(false);
  const [isLeavingTrade, setIsLeavingTrade] = useState(false);
  const [cardSearchInput, setCardSearchInput] = useState('');
  const [cardSearchQuery, setCardSearchQuery] = useState('');
  const [cardCandidates, setCardCandidates] = useState([]);
  const [isCardLoading, setIsCardLoading] = useState(false);
  const [cardError, setCardError] = useState('');
  const [offerActionError, setOfferActionError] = useState('');
  const [isOfferSubmitting, setIsOfferSubmitting] = useState(false);
  const [isConfirmingOffer, setIsConfirmingOffer] = useState(false);
  const inviteSearchRequestIdRef = useRef(0);
  const cardSearchRequestIdRef = useRef(0);
  const completedTradeIdRef = useRef(null);

  const loadState = async ({ silent = false } = {}) => {
    if (!authToken || !authUser) {
      setTradeState(null);
      setTradeError('');
      return;
    }

    if (!silent) {
      setIsTradeLoading(true);
      setTradeError('');
    }

    try {
      const payload = await fetchTradeState(authToken);

      if (payload.rarityLevels) {
        onRarityLevelsChange(payload.rarityLevels);
      }

      setTradeState(payload.trade || null);
    } catch (error) {
      if (!silent) {
        setTradeState(null);
        setTradeError(error.message || 'Не удалось загрузить обмен.');
      }
    } finally {
      if (!silent) {
        setIsTradeLoading(false);
      }
    }
  };

  useEffect(() => {
    void loadState();
  }, [authToken, authUser, refreshToken]);

  useEffect(() => {
    if (!authToken || !authUser || !isActive) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      void loadState({ silent: true });
    }, TRADE_STATE_POLL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [authToken, authUser, isActive]);

  useEffect(() => {
    if (
      tradeState?.status === 'finished' &&
      tradeState?.result?.resolution === 'completed' &&
      completedTradeIdRef.current !== tradeState.id
    ) {
      completedTradeIdRef.current = tradeState.id;
      onCollectionRefresh();
    }
  }, [onCollectionRefresh, tradeState?.id, tradeState?.result?.resolution, tradeState?.status]);

  useEffect(() => {
    if (!authUser) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setInviteSearchQuery(inviteSearchInput.trim());
    }, 240);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [authUser, inviteSearchInput]);

  useEffect(() => {
    if (!authToken || !authUser) {
      setInviteResults([]);
      setInviteSearchError('');
      setIsInviteSearchLoading(false);
      return;
    }

    const normalizedQuery = inviteSearchQuery.trim();

    if (normalizedQuery.length < TRADE_USER_SEARCH_MIN_LENGTH) {
      setInviteResults([]);
      setInviteSearchError('');
      setIsInviteSearchLoading(false);
      return;
    }

    const requestId = inviteSearchRequestIdRef.current + 1;
    inviteSearchRequestIdRef.current = requestId;
    setIsInviteSearchLoading(true);
    setInviteSearchError('');

    const loadInviteResults = async () => {
      try {
        const payload = await searchTradeUsers(normalizedQuery, authToken);

        if (requestId !== inviteSearchRequestIdRef.current) {
          return;
        }

        setInviteResults(Array.isArray(payload.users) ? payload.users : []);
      } catch (error) {
        if (requestId === inviteSearchRequestIdRef.current) {
          setInviteResults([]);
          setInviteSearchError(error.message || 'Не удалось найти игроков.');
        }
      } finally {
        if (requestId === inviteSearchRequestIdRef.current) {
          setIsInviteSearchLoading(false);
        }
      }
    };

    void loadInviteResults();
  }, [authToken, authUser, inviteSearchQuery]);

  useEffect(() => {
    if (!authUser) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setCardSearchQuery(cardSearchInput.trim());
    }, 240);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [authUser, cardSearchInput]);

  useEffect(() => {
    if (!authToken || !authUser || tradeState?.status !== 'active') {
      setCardCandidates([]);
      setCardError('');
      setIsCardLoading(false);
      return;
    }

    const requestId = cardSearchRequestIdRef.current + 1;
    cardSearchRequestIdRef.current = requestId;
    setIsCardLoading(true);
    setCardError('');

    const loadCardCandidates = async () => {
      try {
        const payload = await fetchMyArticlesPage(0, TRADE_CARD_SEARCH_LIMIT, authToken, {
          search: cardSearchQuery
        });

        if (requestId !== cardSearchRequestIdRef.current) {
          return;
        }

        if (payload.rarityLevels) {
          onRarityLevelsChange(payload.rarityLevels);
        }

        setCardCandidates(Array.isArray(payload.articles) ? payload.articles : []);
      } catch (error) {
        if (requestId === cardSearchRequestIdRef.current) {
          setCardCandidates([]);
          setCardError(error.message || 'Не удалось загрузить карты для обмена.');
        }
      } finally {
        if (requestId === cardSearchRequestIdRef.current) {
          setIsCardLoading(false);
        }
      }
    };

    void loadCardCandidates();
  }, [authToken, authUser, cardSearchQuery, tradeState?.status]);

  const selectedOfferId = Number(tradeState?.myOffer?.id || 0);
  const orderedCardCandidates = [
    ...(tradeState?.myOffer ? [tradeState.myOffer] : []),
    ...cardCandidates.filter((article) => Number(article.id) !== selectedOfferId)
  ];

  const showInviteSearchPanel = !tradeState || tradeState.status === 'finished';
  const isTradeCompleted = tradeState?.status === 'finished' && tradeState?.result?.resolution === 'completed';
  const isTradeCancelled = tradeState?.status === 'finished' && tradeState?.result?.resolution === 'cancelled';

  const applyTradePayload = (payload) => {
    if (payload?.rarityLevels) {
      onRarityLevelsChange(payload.rarityLevels);
    }

    setTradeState(payload?.trade || null);
    onTradeRefresh();
  };

  const handleInvite = async (targetUser) => {
    if (!authToken) {
      return;
    }

    setIsInviteSubmitting(true);
    setInviteActionError('');

    try {
      const payload = await sendTradeInvite({ targetUserId: targetUser.id }, authToken);
      applyTradePayload(payload);
    } catch (error) {
      setInviteActionError(error.message || 'Не удалось отправить приглашение на обмен.');
    } finally {
      setIsInviteSubmitting(false);
    }
  };

  const handleRespondToInvite = async (action) => {
    if (!authToken || !tradeState?.id) {
      return;
    }

    setIsInviteResponding(true);
    setInviteActionError('');

    try {
      const payload = await respondToTradeInvite(tradeState.id, action, authToken);
      applyTradePayload(payload);
    } catch (error) {
      setInviteActionError(error.message || 'Не удалось ответить на приглашение.');
    } finally {
      setIsInviteResponding(false);
    }
  };

  const handleLeaveTrade = async () => {
    if (!authToken || !tradeState?.id) {
      return;
    }

    setIsLeavingTrade(true);
    setInviteActionError('');

    try {
      const payload = await leaveCurrentTradeRequest(tradeState.id, authToken);
      applyTradePayload(payload);
    } catch (error) {
      setInviteActionError(error.message || 'Не удалось отменить обмен.');
    } finally {
      setIsLeavingTrade(false);
    }
  };

  const handleSelectOffer = async (articleId) => {
    if (!authToken || !tradeState?.id) {
      return;
    }

    setIsOfferSubmitting(true);
    setOfferActionError('');

    try {
      const payload = await submitTradeOfferSelection(tradeState.id, articleId, authToken);
      applyTradePayload(payload);
    } catch (error) {
      setOfferActionError(error.message || 'Не удалось выбрать карту для обмена.');
    } finally {
      setIsOfferSubmitting(false);
    }
  };

  const handleClearOffer = async () => {
    if (!authToken || !tradeState?.id) {
      return;
    }

    setIsOfferSubmitting(true);
    setOfferActionError('');

    try {
      const payload = await submitTradeOfferSelection(tradeState.id, null, authToken);
      applyTradePayload(payload);
    } catch (error) {
      setOfferActionError(error.message || 'Не удалось очистить слот обмена.');
    } finally {
      setIsOfferSubmitting(false);
    }
  };

  const handleConfirmOffer = async () => {
    if (!authToken || !tradeState?.id) {
      return;
    }

    setIsConfirmingOffer(true);
    setOfferActionError('');

    try {
      const payload = await confirmTradeOfferRequest(tradeState.id, authToken);
      applyTradePayload(payload);
    } catch (error) {
      setOfferActionError(error.message || 'Не удалось подтвердить обмен.');
    } finally {
      setIsConfirmingOffer(false);
    }
  };

  const renderInviteSearchPanel = () => (
    <div className="duel-invite-panel trade-invite-panel">
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
          onChange={(event) => {
            setInviteSearchInput(event.target.value);
            setInviteActionError('');
          }}
          placeholder="Начни вводить ник"
        />
      </label>

      {inviteActionError ? <div className="auth-error">{inviteActionError}</div> : null}

      <div className="admin-search-results duel-search-results">
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
              className="admin-search-result duel-opponent-result"
              onClick={() => void handleInvite(user)}
              disabled={isInviteSubmitting}
            >
              <div>
                <strong>{user.username}</strong>
                <span>Игрок доступен для обмена 1 на 1</span>
              </div>
              <em>{isInviteSubmitting ? 'Отправляем...' : 'Пригласить'}</em>
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
      <article className={`trade-offer-slot ${article ? 'filled' : 'empty'} ${isMine ? 'mine' : 'opponent'}`}>
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
            <em>{isMine ? 'Нажми на карту ниже, чтобы положить её в слот.' : 'Слот соперника пока пуст.'}</em>
          </>
        )}
      </article>
    );
  };

  const renderParticipantsSummary = () => {
    if (!tradeState) {
      return null;
    }

    return (
      <div className="duel-summary-panel trade-summary-panel">
        <div className="duel-panel-head duel-panel-head-tight">
          <div>
            <div className="library-kicker">Сделка</div>
            <h3>Текущий обмен</h3>
          </div>
        </div>

        <div className="duel-participants">
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

          <div className="duel-versus-badge">1v1</div>

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
              onClick={() => void handleRespondToInvite('decline')}
              disabled={isInviteResponding}
            >
              Отклонить
            </button>
            <button
              type="button"
              className="auth-submit-btn duel-invite-btn"
              onClick={() => void handleRespondToInvite('accept')}
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
                onClick={() => void handleLeaveTrade()}
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
                onClick={() => void handleLeaveTrade()}
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

        {inviteActionError ? <div className="auth-error duel-inline-error">{inviteActionError}</div> : null}
      </div>
    );
  };

  const renderTradePanel = () => {
    if (!tradeState) {
      return (
        <div className="duel-panel-body duel-empty-state">
          <div className="auth-status">Выбери соперника выше, чтобы начать новый обмен картами.</div>
        </div>
      );
    }

    if (tradeState.status === 'pending') {
      return (
        <div className="duel-panel-body duel-empty-state">
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
        <div className="duel-panel-body trade-result-panel">
          {isTradeCompleted ? (
            <>
              <div className="duel-note">
                Обмен уже завершён. Сверху можно сразу пригласить другого игрока в новую сделку.
              </div>
              <div className="trade-result-grid">
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
      <div className="trade-panel-body">
        <div className="trade-offer-board">
          {renderOfferSlot('Твой слот', tradeState.myOffer, tradeState.myOfferConfirmed, true)}
          <div className="trade-offer-link">
            <span>Обмен</span>
            <strong>{tradeState.myOffer && tradeState.opponentOffer ? 'Готов к подтверждению' : 'Ждём выбор карт'}</strong>
          </div>
          {renderOfferSlot(
            'Слот соперника',
            tradeState.opponentOffer,
            tradeState.opponentOfferConfirmed,
            false
          )}
        </div>

        <div className="duel-note">
          Когда обе карты выбраны, каждая сторона отдельно подтверждает обмен. Как только подтверждения есть с двух сторон, сервер атомарно меняет карты местами.
        </div>

        <label className="admin-panel-field boss-search-field">
          <span>Поиск по своей коллекции</span>
          <input
            type="text"
            value={cardSearchInput}
            onChange={(event) => {
              setCardSearchInput(event.target.value);
              setOfferActionError('');
            }}
            placeholder="Название статьи"
          />
        </label>

        <div className="admin-search-results boss-search-results duel-search-results trade-search-results">
          {isCardLoading ? (
            <div className="auth-status">Ищем карты для обмена...</div>
          ) : cardError ? (
            <div className="auth-error">{cardError}</div>
          ) : orderedCardCandidates.length > 0 ? (
            orderedCardCandidates.map((article) => {
              const isSelected = Number(article.id) === selectedOfferId;

              return (
                <button
                  key={article.id}
                  type="button"
                  className={`admin-search-result trade-candidate ${isSelected ? 'selected' : ''}`}
                  onClick={() => void handleSelectOffer(article.id)}
                  disabled={isOfferSubmitting || isConfirmingOffer}
                >
                  <div>
                    <strong>{article.title}</strong>
                    <span>{describeTradeArticle(article, rarityLevels)}</span>
                    {isSelected ? <span className="boss-selected-note">В твоём слоте</span> : null}
                  </div>
                  <em>{isSelected ? 'Выбрана' : formatCompactNumber(article.viewCount)}</em>
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

        <div className="boss-action-row trade-action-row">
          <button
            type="button"
            className="duel-invite-btn duel-invite-btn-muted"
            onClick={() => void handleClearOffer()}
            disabled={!tradeState.myOffer || isOfferSubmitting || isConfirmingOffer}
          >
            {isOfferSubmitting ? 'Очищаем...' : 'Очистить слот'}
          </button>
          <button
            type="button"
            className="auth-submit-btn boss-fight-btn"
            onClick={() => void handleConfirmOffer()}
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

  if (!authUser) {
    return (
      <section className="duel-screen trade-screen">
        <div className="duel-screen-shell trade-screen-shell">
          <div className="duel-screen-header">
            <div>
              <div className="library-kicker">Сделка</div>
              <h2>Обмен 1v1</h2>
            </div>
          </div>
          <div className="library-status">Войди в аккаунт, чтобы обмениваться картами с другими игроками.</div>
        </div>
      </section>
    );
  }

  return (
    <section className="duel-screen trade-screen">
      <div className="duel-screen-shell trade-screen-shell">
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

        {showInviteSearchPanel ? renderInviteSearchPanel() : null}

        {tradeState ? (
          <div className="duel-layout trade-layout">
            {renderParticipantsSummary()}
            <div className="duel-main-panel trade-main-panel">{renderTradePanel()}</div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default TradeView;
