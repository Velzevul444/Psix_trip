import React, { useEffect, useRef, useState } from 'react';
import {
  fetchDuelState,
  fetchMyArticlesPage,
  leaveCurrentDuelRequest,
  respondToDuelInvite,
  searchDuelUsers,
  sendDuelInvite,
  submitDuelTeamSelection
} from '../api';
import {
  DUEL_TEAM_SEARCH_LIMIT,
  DUEL_TEAM_SIZE,
  DUEL_USER_SEARCH_MIN_LENGTH
} from '../constants';
import {
  buildDuelTurnLines,
  formatCompactNumber,
  resolveClassMeta,
  resolveArticleRarity
} from '../utils';
import useIsMobileViewport from '../hooks/useIsMobileViewport';
import DuelMobileView from './DuelMobileView';

function DuelView({
  authUser,
  authToken,
  rarityLevels,
  onRarityLevelsChange,
  refreshToken,
  onDuelRefresh
}) {
  const [duelState, setDuelState] = useState(null);
  const [isDuelLoading, setIsDuelLoading] = useState(false);
  const [duelError, setDuelError] = useState('');
  const [inviteSearchInput, setInviteSearchInput] = useState('');
  const [inviteSearchQuery, setInviteSearchQuery] = useState('');
  const [inviteResults, setInviteResults] = useState([]);
  const [isInviteSearchLoading, setIsInviteSearchLoading] = useState(false);
  const [inviteSearchError, setInviteSearchError] = useState('');
  const [inviteActionError, setInviteActionError] = useState('');
  const [isInviteSubmitting, setIsInviteSubmitting] = useState(false);
  const [isInviteResponding, setIsInviteResponding] = useState(false);
  const [isLeavingDuel, setIsLeavingDuel] = useState(false);
  const [teamSearchInput, setTeamSearchInput] = useState('');
  const [teamSearchQuery, setTeamSearchQuery] = useState('');
  const [teamCandidates, setTeamCandidates] = useState([]);
  const [isTeamLoading, setIsTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState('');
  const [selectedTeam, setSelectedTeam] = useState([]);
  const [teamSubmitError, setTeamSubmitError] = useState('');
  const [isTeamSubmitting, setIsTeamSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('team');
  const inviteSearchRequestIdRef = useRef(0);
  const teamSearchRequestIdRef = useRef(0);
  const isMobileViewport = useIsMobileViewport();

  const loadState = async () => {
    if (!authToken || !authUser) {
      setDuelState(null);
      setDuelError('');
      return;
    }

    setIsDuelLoading(true);
    setDuelError('');

    try {
      const payload = await fetchDuelState(authToken);

      if (payload.rarityLevels) {
        onRarityLevelsChange(payload.rarityLevels);
      }

      setDuelState(payload.duel || null);
    } catch (error) {
      setDuelState(null);
      setDuelError(error.message || 'Не удалось загрузить дуэль.');
    } finally {
      setIsDuelLoading(false);
    }
  };

  useEffect(() => {
    void loadState();
  }, [authToken, authUser, refreshToken]);

  useEffect(() => {
    setSelectedTeam(Array.isArray(duelState?.myTeam) ? duelState.myTeam : []);
  }, [duelState?.id, duelState?.status, duelState?.updatedAt]);

  useEffect(() => {
    if (duelState?.battleResult) {
      setActiveTab('log');
    } else if (activeTab === 'log') {
      setActiveTab('team');
    }
  }, [activeTab, duelState?.battleResult]);

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

    if (normalizedQuery.length < DUEL_USER_SEARCH_MIN_LENGTH) {
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
        const payload = await searchDuelUsers(normalizedQuery, authToken);

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
      setTeamSearchQuery(teamSearchInput.trim());
    }, 240);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [authUser, teamSearchInput]);

  useEffect(() => {
    if (!authToken || !authUser || duelState?.status !== 'active') {
      setTeamCandidates([]);
      setTeamError('');
      setIsTeamLoading(false);
      return;
    }

    const requestId = teamSearchRequestIdRef.current + 1;
    teamSearchRequestIdRef.current = requestId;
    setIsTeamLoading(true);
    setTeamError('');

    const loadTeamCandidates = async () => {
      try {
        const payload = await fetchMyArticlesPage(0, DUEL_TEAM_SEARCH_LIMIT, authToken, {
          search: teamSearchQuery
        });

        if (requestId !== teamSearchRequestIdRef.current) {
          return;
        }

        if (payload.rarityLevels) {
          onRarityLevelsChange(payload.rarityLevels);
        }

        setTeamCandidates(Array.isArray(payload.articles) ? payload.articles : []);
      } catch (error) {
        if (requestId === teamSearchRequestIdRef.current) {
          setTeamCandidates([]);
          setTeamError(error.message || 'Не удалось загрузить карты для дуэли.');
        }
      } finally {
        if (requestId === teamSearchRequestIdRef.current) {
          setIsTeamLoading(false);
        }
      }
    };

    void loadTeamCandidates();
  }, [authToken, authUser, duelState?.status, teamSearchQuery]);

  const selectedTeamIdSet = new Set(selectedTeam.map((article) => article.id));
  const selectedTeamOrder = new Map(selectedTeam.map((article, index) => [article.id, index]));
  const mergedTeamCandidates = [
    ...selectedTeam,
    ...teamCandidates.filter((article) => !selectedTeamIdSet.has(article.id))
  ];
  const orderedTeamCandidates = mergedTeamCandidates
    .map((article, index) => ({ article, index }))
    .sort((left, right) => {
      const leftSelected = selectedTeamOrder.has(left.article.id);
      const rightSelected = selectedTeamOrder.has(right.article.id);

      if (leftSelected && rightSelected) {
        return selectedTeamOrder.get(left.article.id) - selectedTeamOrder.get(right.article.id);
      }

      if (leftSelected) {
        return -1;
      }

      if (rightSelected) {
        return 1;
      }

      return left.index - right.index;
    })
    .map(({ article }) => article);

  const showInviteSearchPanel = !duelState || duelState.status === 'finished';
  const showLogTab = Boolean(duelState?.battleResult);
  const hasBattleLog = Array.isArray(duelState?.battleResult?.turns) && duelState.battleResult.turns.length > 0;
  const shouldShowFinishedLogInline = duelState?.status === 'finished' && showLogTab;
  const myTeamReady = selectedTeam.length === DUEL_TEAM_SIZE;
  const isForfeitResult = duelState?.battleResult?.resolution === 'forfeit';

  const handleInvite = async (targetUser) => {
    if (!authToken) {
      return;
    }

    setIsInviteSubmitting(true);
    setInviteActionError('');

    try {
      const payload = await sendDuelInvite({ targetUserId: targetUser.id }, authToken);
      setDuelState(payload.duel || null);
      setInviteSearchInput('');
      setInviteSearchQuery('');
      setInviteResults([]);
      onDuelRefresh?.();
    } catch (error) {
      setInviteActionError(error.message || 'Не удалось отправить приглашение.');
    } finally {
      setIsInviteSubmitting(false);
    }
  };

  const handleRespondToInvite = async (action) => {
    if (!duelState?.id || !authToken) {
      return;
    }

    setIsInviteResponding(true);
    setInviteActionError('');

    try {
      const payload = await respondToDuelInvite(duelState.id, action, authToken);
      setDuelState(payload.duel || null);
      onDuelRefresh?.();
    } catch (error) {
      setInviteActionError(error.message || 'Не удалось ответить на приглашение.');
    } finally {
      setIsInviteResponding(false);
    }
  };

  const handleLeaveDuel = async () => {
    if (!authToken || !duelState?.id) {
      return;
    }

    setIsLeavingDuel(true);
    setInviteActionError('');

    try {
      const payload = await leaveCurrentDuelRequest(duelState.id, authToken);
      setDuelState(payload.duel || null);
      onDuelRefresh?.();
    } catch (error) {
      setInviteActionError(error.message || 'Не удалось выйти из дуэли.');
    } finally {
      setIsLeavingDuel(false);
    }
  };

  const toggleSelectedTeamMember = (article) => {
    setTeamSubmitError('');
    setSelectedTeam((current) => {
      if (current.some((item) => item.id === article.id)) {
        return current.filter((item) => item.id !== article.id);
      }

      if (current.length >= DUEL_TEAM_SIZE) {
        return current;
      }

      return [article, ...current];
    });
  };

  const handleSubmitTeam = async () => {
    if (!authToken || !duelState?.id) {
      return;
    }

    if (selectedTeam.length !== DUEL_TEAM_SIZE) {
      setTeamSubmitError(`Собери команду из ${DUEL_TEAM_SIZE} карт.`);
      return;
    }

    setIsTeamSubmitting(true);
    setTeamSubmitError('');

    try {
      const payload = await submitDuelTeamSelection(
        duelState.id,
        selectedTeam.map((article) => article.id),
        authToken
      );

      if (payload.rarityLevels) {
        onRarityLevelsChange(payload.rarityLevels);
      }

      setDuelState(payload.duel || null);
      onDuelRefresh?.();
    } catch (error) {
      setTeamSubmitError(error.message || 'Не удалось зафиксировать команду.');
    } finally {
      setIsTeamSubmitting(false);
    }
  };

  const renderInviteSearchPanel = () => (
    <div className="duel-invite-panel">
      <div className="duel-panel-head">
        <div>
          <div className="library-kicker">Новый вызов</div>
          <h3>Пригласи игрока на дуэль 1v1</h3>
        </div>
      </div>

      <label className="admin-panel-field duel-search-field">
        <span>Поиск по никнейму</span>
        <input
          type="text"
          value={inviteSearchInput}
          onChange={(event) => setInviteSearchInput(event.target.value)}
          placeholder="Например, maximilianus06"
        />
      </label>

      {inviteActionError ? <div className="auth-error">{inviteActionError}</div> : null}

      <div className="admin-search-results duel-search-results">
        {isInviteSearchLoading ? (
          <div className="auth-status">Ищем игроков...</div>
        ) : inviteSearchError ? (
          <div className="auth-error">{inviteSearchError}</div>
        ) : inviteSearchQuery.length < DUEL_USER_SEARCH_MIN_LENGTH ? (
          <div className="auth-status">Введи хотя бы 2 символа, чтобы найти соперника.</div>
        ) : inviteResults.length > 0 ? (
          inviteResults.map((user) => (
            <button
              key={user.id}
              type="button"
              className="admin-search-result duel-opponent-result"
              onClick={() => handleInvite(user)}
              disabled={isInviteSubmitting}
            >
              <div>
                <strong>{user.username}</strong>
                <span>Никнейм игрока</span>
              </div>
              <em>{isInviteSubmitting ? 'Отправляем...' : 'Вызвать'}</em>
            </button>
          ))
        ) : (
          <div className="auth-status">Игроков с таким ником не найдено.</div>
        )}
      </div>
    </div>
  );

  const renderParticipantsSummary = () => {
    if (!duelState) {
      return null;
    }

    const resultLabel = duelState.battleResult
      ? duelState.winner?.id === duelState.me.id
        ? isForfeitResult
          ? 'Победа'
          : 'Победа'
        : 'Поражение'
      : duelState.status === 'pending'
        ? duelState.isIncomingInvite
          ? 'Входящий вызов'
          : 'Ожидание ответа'
        : duelState.status === 'active'
          ? 'Подготовка к бою'
          : 'Завершено';

    return (
      <div className="duel-summary-panel">
        <div className="duel-panel-head duel-panel-head-tight">
          <div>
            <div className="library-kicker">Текущая дуэль</div>
            <h3>{resultLabel}</h3>
          </div>
          <div className="boss-team-count">
            {duelState.myTeam.length}/{DUEL_TEAM_SIZE}
          </div>
        </div>

        <div className="duel-participants">
          <article className="duel-participant-card duel-participant-card-me">
            <span>Ты</span>
            <strong>{duelState.me.username}</strong>
            <em>{duelState.myTeamSubmitted ? 'Команда готова' : 'Команда не выбрана'}</em>
          </article>

          <div className="duel-versus-badge">VS</div>

          <article className="duel-participant-card">
            <span>Соперник</span>
            <strong>{duelState.opponent.username}</strong>
            <em>
              {duelState.opponentTeamSubmitted
                ? 'Команда готова'
                : duelState.status === 'pending'
                  ? 'Ждём ответа'
                  : 'Команда не выбрана'}
            </em>
          </article>
        </div>

        {duelState.status === 'pending' && duelState.isIncomingInvite ? (
          <div className="duel-pending-actions">
            <button
              type="button"
              className="duel-invite-btn duel-invite-btn-muted"
              onClick={() => handleRespondToInvite('decline')}
              disabled={isInviteResponding}
            >
              Отклонить
            </button>
            <button
              type="button"
              className="auth-submit-btn duel-invite-btn"
              onClick={() => handleRespondToInvite('accept')}
              disabled={isInviteResponding}
            >
              {isInviteResponding ? 'Обрабатываем...' : 'Принять вызов'}
            </button>
          </div>
        ) : null}

        {duelState.status === 'pending' && duelState.isOutgoingInvite ? (
          <>
            <div className="duel-note">
              Приглашение отправлено. Как только соперник согласится, оба сможете выбрать по 5 карт.
            </div>
            <div className="duel-secondary-actions">
              <button
                type="button"
                className="duel-invite-btn duel-invite-btn-muted"
                onClick={() => void handleLeaveDuel()}
                disabled={isLeavingDuel}
              >
                {isLeavingDuel ? 'Отменяем...' : 'Отменить вызов'}
              </button>
            </div>
          </>
        ) : null}

        {duelState.status === 'active' ? (
          <>
            <div className="duel-note">
              Карты атакуют случайно, а лог боя появится сразу после того, как обе команды будут зафиксированы.
            </div>
            <div className="duel-secondary-actions">
              <button
                type="button"
                className="duel-invite-btn duel-invite-btn-muted"
                onClick={() => void handleLeaveDuel()}
                disabled={isLeavingDuel}
              >
                {isLeavingDuel ? 'Выходим...' : 'Выйти из дуэли'}
              </button>
            </div>
          </>
        ) : null}

        {duelState.battleResult ? (
          <div className="duel-result-chip">
            <strong>{duelState.winner?.username} победил</strong>
            <span>
              {isForfeitResult
                ? duelState.winner?.id === duelState.me.id
                  ? `${duelState.opponent.username} покинул дуэль до завершения боя.`
                  : 'Ты покинул дуэль до завершения боя.'
                : duelState.winner?.id === duelState.me.id
                  ? 'Твоя команда пережила дуэль.'
                  : 'Соперник пережил больше ударов.'}
            </span>
          </div>
        ) : null}

        {inviteActionError ? <div className="auth-error duel-inline-error">{inviteActionError}</div> : null}
      </div>
    );
  };

  const renderTeamPanel = () => {
    if (!duelState) {
      return (
        <div className="duel-panel-body duel-empty-state">
          <div className="auth-status">Выбери соперника выше, чтобы начать новую дуэль.</div>
        </div>
      );
    }

    if (duelState.status === 'pending') {
      return (
        <div className="duel-panel-body duel-empty-state">
          <div className="auth-status">
            {duelState.isIncomingInvite
              ? 'Прими вызов, чтобы открыть выбор из 5 карт.'
              : 'Ждём, пока соперник ответит на приглашение.'}
          </div>
        </div>
      );
    }

    if (duelState.status === 'finished' && duelState.battleResult) {
      return (
        <div className="duel-panel-body duel-finished-team">
          <div className="duel-note">
            Команды уже сыграли. Ниже доступен лог боя, а сверху можно сразу создать новый вызов.
          </div>
        </div>
      );
    }

    return (
      <div className="boss-team-panel duel-team-panel">
        <div className="boss-team-top">
          <div>
            <div className="library-kicker">Твоя команда</div>
            <h3>Выбери 5 карт для дуэли</h3>
          </div>
          <div className="boss-team-count">
            {selectedTeam.length}/{DUEL_TEAM_SIZE}
          </div>
        </div>

        <div className="boss-team-body">
          <label className="admin-panel-field boss-search-field">
            <span>Поиск по своей коллекции</span>
            <input
              type="text"
              value={teamSearchInput}
              onChange={(event) => {
                setTeamSearchInput(event.target.value);
                setTeamSubmitError('');
              }}
              placeholder="Название статьи"
            />
          </label>

          {duelState.myTeamSubmitted ? (
            <div className="duel-note">
              Твоя команда уже зафиксирована. Пока соперник выбирает карты, ты можешь посмотреть состав сверху списка.
            </div>
          ) : null}

          {!duelState.opponentTeamSubmitted ? (
            <div className="duel-note duel-note-soft">
              {duelState.myTeamSubmitted
                ? 'Ждём, пока соперник соберёт свою пятёрку.'
                : 'Выбранные карты поднимаются в начало списка, чтобы было удобнее собрать пятёрку.'}
            </div>
          ) : null}

          <div className="admin-search-results boss-search-results duel-search-results">
            {isTeamLoading ? (
              <div className="auth-status">Ищем карты из твоей коллекции...</div>
            ) : teamError ? (
              <div className="auth-error">{teamError}</div>
            ) : orderedTeamCandidates.length > 0 ? (
              orderedTeamCandidates.map((article) => {
                const rarity = resolveArticleRarity(article, rarityLevels);
                const rarityData = rarityLevels[rarity];
                const classMeta = resolveClassMeta({ ...article, rarity }, rarityLevels);
                const isSelected = selectedTeamIdSet.has(article.id);
                const isDisabled = !isSelected && selectedTeam.length >= DUEL_TEAM_SIZE;

                return (
                  <button
                    key={article.id}
                    type="button"
                    className={`admin-search-result ${isSelected ? 'selected' : ''}`}
                    onClick={() => toggleSelectedTeamMember(article)}
                    disabled={isDisabled || isTeamSubmitting}
                  >
                    <div>
                      <strong>{article.title}</strong>
                      <span>{`${rarityData?.name || rarity} • ${classMeta.label}`}</span>
                      {isSelected ? (
                        <span className="boss-selected-note">В команде</span>
                      ) : null}
                    </div>
                    <em>{isSelected ? 'Убрать' : formatCompactNumber(article.viewCount)}</em>
                  </button>
                );
              })
            ) : (
              <div className="auth-status">
                {teamSearchQuery
                  ? 'Ничего не найдено в твоей коллекции.'
                  : 'Открой паки и собери хотя бы 5 уникальных карт для дуэлей.'}
              </div>
            )}
          </div>
        </div>

        {teamSubmitError ? <div className="auth-error">{teamSubmitError}</div> : null}

        <div className="boss-action-row">
          <button
            type="button"
            className="auth-submit-btn boss-fight-btn"
            onClick={handleSubmitTeam}
            disabled={isTeamSubmitting}
          >
            {isTeamSubmitting
              ? 'Фиксируем команду...'
              : duelState.myTeamSubmitted
                ? 'Обновить команду'
                : myTeamReady
                  ? 'Зафиксировать команду'
                  : `Команда ${selectedTeam.length}/${DUEL_TEAM_SIZE}`}
          </button>
        </div>
      </div>
    );
  };

  const renderLogPanel = () => {
    if (!duelState?.battleResult) {
      return (
        <div className="duel-panel-body duel-empty-state">
          <div className="auth-status">Лог боя появится после того, как обе стороны соберут по 5 карт.</div>
        </div>
      );
    }

    return (
      <div className="boss-battle-log duel-battle-log">
        <div className="boss-battle-summary duel-battle-summary">
          <strong>{duelState.winner?.username} победил в дуэли</strong>
          <span>
            {isForfeitResult
              ? duelState.winner?.id === duelState.me.id
                ? `${duelState.opponent.username} покинул дуэль до начала финального боя.`
                : 'Ты покинул дуэль до завершения боя.'
              : duelState.winner?.id === duelState.me.id
                ? 'Твоя команда лучше разыграла роли, эффекты и синергию.'
                : 'Соперник лучше реализовал роли и контроль по ходу боя.'}
          </span>
        </div>

        <div className="boss-rounds duel-rounds">
          {isForfeitResult ? (
            <div className="duel-note duel-log-empty">
              Дуэль завершилась досрочно: {duelState.battleResult?.forfeitedUsername || 'игрок'} покинул бой.
            </div>
          ) : hasBattleLog ? (
            duelState.battleResult.turns.map((turn) => (
              <div key={turn.turn} className="boss-round duel-round">
                <div className="boss-round-title">Ход {turn.turn}</div>
                {buildDuelTurnLines(turn).map((line, index) => (
                  <div key={`${turn.turn}-${index}`} className="boss-round-line">
                    {line}
                  </div>
                ))}
              </div>
            ))
          ) : (
            <div className="duel-note duel-log-empty">
              Бой завершился, но подробный лог ходов не сохранился. Сейчас доступен только итог дуэли.
            </div>
          )}
        </div>
      </div>
    );
  };

  if (!authUser) {
    return (
      <section className="duel-screen">
        <div className="duel-screen-shell">
          <div className="duel-screen-header">
            <div>
              <div className="library-kicker">Арена</div>
              <h2>Дуэль 1v1</h2>
            </div>
          </div>
          <div className="library-status">Войди в аккаунт, чтобы приглашать других игроков на дуэли.</div>
        </div>
      </section>
    );
  }

  if (isMobileViewport) {
    return (
      <DuelMobileView
        rarityLevels={rarityLevels}
        duelError={duelError}
        isDuelLoading={isDuelLoading}
        duelState={duelState}
        showInviteSearchPanel={showInviteSearchPanel}
        showLogTab={showLogTab}
        hasBattleLog={hasBattleLog}
        inviteSearchInput={inviteSearchInput}
        onInviteSearchInputChange={(nextValue) => setInviteSearchInput(nextValue)}
        inviteSearchQuery={inviteSearchQuery}
        inviteResults={inviteResults}
        isInviteSearchLoading={isInviteSearchLoading}
        inviteSearchError={inviteSearchError}
        inviteActionError={inviteActionError}
        isInviteSubmitting={isInviteSubmitting}
        isInviteResponding={isInviteResponding}
        isLeavingDuel={isLeavingDuel}
        onInvite={handleInvite}
        onRespondToInvite={handleRespondToInvite}
        onLeaveDuel={() => void handleLeaveDuel()}
        selectedTeam={selectedTeam}
        teamSearchInput={teamSearchInput}
        onTeamSearchInputChange={(nextValue) => {
          setTeamSearchInput(nextValue);
          setTeamSubmitError('');
        }}
        isTeamLoading={isTeamLoading}
        teamError={teamError}
        orderedTeamCandidates={orderedTeamCandidates}
        selectedTeamIdSet={selectedTeamIdSet}
        onToggleSelectedTeamMember={toggleSelectedTeamMember}
        teamSubmitError={teamSubmitError}
        isTeamSubmitting={isTeamSubmitting}
        onSubmitTeam={() => void handleSubmitTeam()}
      />
    );
  }

  return (
    <section className="duel-screen">
      <div className="duel-screen-shell">
        <div className="duel-screen-header">
          <div>
            <div className="library-kicker">Арена</div>
            <h2>Дуэль 1v1</h2>
          </div>
        </div>

        {duelError ? <div className="library-status error">{duelError}</div> : null}
        {isDuelLoading && !duelState ? (
          <div className="library-status">Загружаем текущее состояние дуэлей...</div>
        ) : null}

        {showInviteSearchPanel ? renderInviteSearchPanel() : null}

        {duelState ? (
          <div className="duel-layout">
            {renderParticipantsSummary()}

            <div className="duel-main-panel">
              {shouldShowFinishedLogInline ? (
                renderLogPanel()
              ) : (
                <>
                  <div className="boss-mobile-tabs duel-tabs" role="tablist" aria-label="Режимы дуэли">
                    <button
                      type="button"
                      className={`boss-mobile-tab ${activeTab === 'team' ? 'active' : ''}`}
                      onClick={() => setActiveTab('team')}
                    >
                      Выбор карт
                    </button>
                    {showLogTab ? (
                      <button
                        type="button"
                        className={`boss-mobile-tab ${activeTab === 'log' ? 'active' : ''}`}
                        onClick={() => setActiveTab('log')}
                      >
                        Логи
                      </button>
                    ) : null}
                  </div>

                  {activeTab === 'team' ? renderTeamPanel() : renderLogPanel()}
                </>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default DuelView;
