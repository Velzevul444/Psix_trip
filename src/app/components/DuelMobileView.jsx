import React, { useEffect, useRef, useState } from 'react';
import {
  DUEL_TEAM_SIZE,
  DUEL_USER_SEARCH_MIN_LENGTH
} from '../constants';
import {
  formatCompactNumber,
  formatFullNumber,
  getStatLabel,
  resolveArticleRarity
} from '../utils';

function DuelMobileView({
  rarityLevels,
  duelError,
  isDuelLoading,
  duelState,
  showInviteSearchPanel,
  showLogTab,
  hasBattleLog,
  inviteSearchInput,
  onInviteSearchInputChange,
  inviteSearchQuery,
  inviteResults,
  isInviteSearchLoading,
  inviteSearchError,
  inviteActionError,
  isInviteSubmitting,
  isInviteResponding,
  isLeavingDuel,
  onInvite,
  onRespondToInvite,
  onLeaveDuel,
  selectedTeam,
  teamSearchInput,
  onTeamSearchInputChange,
  isTeamLoading,
  teamError,
  orderedTeamCandidates,
  selectedTeamIdSet,
  onToggleSelectedTeamMember,
  teamSubmitError,
  isTeamSubmitting,
  onSubmitTeam
}) {
  const [activeTab, setActiveTab] = useState(showInviteSearchPanel ? 'invite' : 'team');
  const scrollContainerRef = useRef(null);
  const myTeamReady = selectedTeam.length === DUEL_TEAM_SIZE;
  const isForfeitResult = duelState?.battleResult?.resolution === 'forfeit';
  const selectedTeamSlots = Array.from(
    { length: DUEL_TEAM_SIZE },
    (_, index) => selectedTeam[index] || null
  );

  useEffect(() => {
    if (!duelState) {
      setActiveTab('invite');
      return;
    }

    if (showLogTab && duelState.status === 'finished') {
      setActiveTab((current) => (current === 'invite' && showInviteSearchPanel ? current : 'log'));
      return;
    }

    if (duelState.status !== 'finished' && activeTab === 'invite') {
      setActiveTab('team');
      return;
    }

    if (!showLogTab && activeTab === 'log') {
      setActiveTab(showInviteSearchPanel ? 'invite' : 'team');
    }
  }, [activeTab, duelState, showInviteSearchPanel, showLogTab]);

  useEffect(() => {
    const scrollContainerElement = scrollContainerRef.current;

    if (!scrollContainerElement) {
      return;
    }

    scrollContainerElement.scrollTop = 0;
  }, [activeTab, duelState?.id, duelState?.status, duelState?.updatedAt]);

  const renderInvitePanel = () => (
    <div className="duel-invite-panel duel-mobile-pane">
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
          onChange={(event) => onInviteSearchInputChange(event.target.value)}
          placeholder="Например, maximilianus06"
        />
      </label>

      {inviteActionError ? <div className="auth-error">{inviteActionError}</div> : null}

      <div className="admin-search-results duel-search-results duel-mobile-search-results">
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
              className="admin-search-result duel-mobile-candidate"
              onClick={() => onInvite(user)}
              disabled={isInviteSubmitting}
            >
              <div className="duel-mobile-candidate-copy">
                <strong>{user.username}</strong>
                <span>Никнейм игрока</span>
              </div>
              <em className="duel-mobile-candidate-action">
                {isInviteSubmitting ? 'Отправляем...' : 'Вызвать'}
              </em>
            </button>
          ))
        ) : (
          <div className="auth-status">Игроков с таким ником не найдено.</div>
        )}
      </div>
    </div>
  );

  const renderSummaryPanel = () => {
    if (!duelState) {
      return null;
    }

    const resultLabel = duelState.battleResult
      ? duelState.winner?.id === duelState.me.id
        ? 'Победа'
        : 'Поражение'
      : duelState.status === 'pending'
        ? duelState.isIncomingInvite
          ? 'Входящий вызов'
          : 'Ожидание ответа'
        : duelState.status === 'active'
          ? 'Подготовка к бою'
          : 'Завершено';

    return (
      <article className="duel-mobile-summary">
        <div className="duel-mobile-summary-head">
          <div>
            <div className="library-kicker">Текущая дуэль</div>
            <strong className="duel-mobile-summary-title">{resultLabel}</strong>
          </div>
          <div className="boss-team-count">
            {duelState.myTeam.length}/{DUEL_TEAM_SIZE}
          </div>
        </div>

        <div className="duel-mobile-participants">
          <article className="duel-participant-card duel-participant-card-me">
            <span>Ты</span>
            <strong>{duelState.me.username}</strong>
            <em>{duelState.myTeamSubmitted ? 'Команда готова' : 'Команда не выбрана'}</em>
          </article>

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
                onClick={onLeaveDuel}
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
                onClick={onLeaveDuel}
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

        {inviteActionError ? <div className="auth-error">{inviteActionError}</div> : null}
      </article>
    );
  };

  const renderTeamPanel = () => {
    if (!duelState) {
      return (
        <div className="boss-mobile-block duel-mobile-pane">
          <div className="auth-status">Выбери соперника выше, чтобы начать новую дуэль.</div>
        </div>
      );
    }

    if (duelState.status === 'pending') {
      return (
        <div className="boss-mobile-block duel-mobile-pane">
          <div className="auth-status">
            {duelState.isIncomingInvite
              ? 'Прими вызов, чтобы открыть выбор из 5 карт.'
              : 'Ждём, пока соперник ответит на приглашение.'}
          </div>
        </div>
      );
    }

    if (duelState.status === 'finished') {
      return (
        <div className="boss-mobile-block duel-mobile-pane">
          <div className="duel-note">
            Дуэль уже завершена. Можно посмотреть лог или сразу вернуться к поиску нового соперника.
          </div>
        </div>
      );
    }

    return (
      <div className="boss-mobile-block duel-mobile-pane">
        <div className="boss-mobile-block-head">
          <div>
            <div className="library-kicker">Твоя команда</div>
            <strong className="boss-mobile-section-title">Выбери 5 карт</strong>
          </div>
          <div className="boss-team-count">
            {selectedTeam.length}/{DUEL_TEAM_SIZE}
          </div>
        </div>

        <div className="duel-mobile-slots">
          {selectedTeamSlots.map((article, index) => {
            if (!article) {
              return (
                <div key={`duel-slot-${index + 1}`} className="duel-mobile-slot duel-mobile-slot-empty">
                  <span className="duel-mobile-slot-index">Слот {index + 1}</span>
                  <strong>Свободно</strong>
                  <em>Выбери карту ниже</em>
                </div>
              );
            }

            const rarity = resolveArticleRarity(article, rarityLevels);
            const rarityData = rarityLevels[rarity];

            return (
              <button
                key={article.id}
                type="button"
                className="duel-mobile-slot duel-mobile-slot-filled"
                style={{ '--duel-slot-accent': rarityData?.color || '#6fe69d' }}
                onClick={() => onToggleSelectedTeamMember(article)}
              >
                <span className="duel-mobile-slot-index">Слот {index + 1}</span>
                <strong>{article.title}</strong>
                <em>{rarityData?.name || rarity}</em>
                <i>Убрать</i>
              </button>
            );
          })}
        </div>

        <label className="admin-panel-field boss-search-field">
          <span>Поиск по своей коллекции</span>
          <input
            type="text"
            value={teamSearchInput}
            onChange={(event) => onTeamSearchInputChange(event.target.value)}
            placeholder="Название статьи"
          />
        </label>

        {duelState.myTeamSubmitted ? (
          <div className="duel-note">
            Твоя команда уже зафиксирована. Пока соперник выбирает карты, можно только обновить состав.
          </div>
        ) : null}

        {!duelState.opponentTeamSubmitted ? (
          <div className="duel-note duel-note-soft">
            {duelState.myTeamSubmitted
              ? 'Ждём, пока соперник соберёт свою пятёрку.'
              : 'Выбранные карты поднимаются в начало списка, чтобы пятёрку было удобно собрать с телефона.'}
          </div>
        ) : null}

        <div className="admin-search-results boss-search-results duel-search-results duel-mobile-search-results">
          {isTeamLoading ? (
            <div className="auth-status">Ищем карты из твоей коллекции...</div>
          ) : teamError ? (
            <div className="auth-error">{teamError}</div>
          ) : orderedTeamCandidates.length > 0 ? (
            orderedTeamCandidates.map((article) => {
              const rarity = resolveArticleRarity(article, rarityLevels);
              const rarityData = rarityLevels[rarity];
              const isSelected = selectedTeamIdSet.has(article.id);
              const isDisabled = !isSelected && selectedTeam.length >= DUEL_TEAM_SIZE;

              return (
                <button
                  key={article.id}
                  type="button"
                  className={`admin-search-result duel-mobile-candidate ${isSelected ? 'selected' : ''}`}
                  style={{ '--duel-candidate-accent': rarityData?.color || '#6fe69d' }}
                  onClick={() => onToggleSelectedTeamMember(article)}
                  disabled={isDisabled || isTeamSubmitting}
                >
                  <div className="duel-mobile-candidate-copy">
                    <strong>{article.title}</strong>
                    <span>{rarityData?.name || rarity}</span>
                    {isSelected ? (
                      <span className="boss-selected-note">В команде</span>
                    ) : null}
                  </div>
                  <div className="duel-mobile-candidate-meta">
                    <em className="duel-mobile-candidate-action">
                      {isSelected ? 'Убрать' : '+ В бой'}
                    </em>
                    <span>{formatCompactNumber(article.viewCount)} просмотров</span>
                  </div>
                </button>
              );
            })
          ) : (
            <div className="auth-status">
              {teamSearchInput.trim()
                ? 'Ничего не найдено в твоей коллекции.'
                : 'Открой паки и собери хотя бы 5 уникальных карт для дуэлей.'}
            </div>
          )}
        </div>

        {teamSubmitError ? <div className="auth-error">{teamSubmitError}</div> : null}

        <div className="duel-mobile-footer">
          <button
            type="button"
            className="auth-submit-btn boss-fight-btn"
            onClick={onSubmitTeam}
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
        <div className="boss-mobile-block duel-mobile-pane">
          <div className="auth-status">Лог боя появится после того, как обе стороны соберут по 5 карт.</div>
        </div>
      );
    }

    return (
      <div className="boss-mobile-block duel-mobile-pane duel-mobile-log">
        <div className="boss-battle-summary duel-battle-summary">
          <strong>{duelState.winner?.username} победил в дуэли</strong>
          <span>
            {isForfeitResult
              ? duelState.winner?.id === duelState.me.id
                ? `${duelState.opponent.username} покинул дуэль до начала финального боя.`
                : 'Ты покинул дуэль до завершения боя.'
              : duelState.winner?.id === duelState.me.id
                ? 'Твои карты выдержали больше случайных ударов.'
                : 'Соперник оказался живучее в этом размене.'}
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
                <div className="boss-round-line">
                  {turn.attackerUsername} / "{turn.attackerTitle}" атакует "{turn.targetTitle}" ({turn.targetUsername})
                  через {getStatLabel(turn.statKey)}:{' '}
                  {`${formatFullNumber(turn.attackValue)} - ${formatFullNumber(turn.defenseValue)} = ${formatFullNumber(turn.damage)}`}.
                  Осталось HP: {formatFullNumber(turn.targetRemainingHp)}.
                </div>
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

  const tabOptions = [];

  if (showInviteSearchPanel) {
    tabOptions.push({ id: 'invite', label: 'Вызов' });
  }

  if (duelState && duelState.status !== 'finished') {
    tabOptions.push({ id: 'team', label: 'Команда' });
  }

  if (showLogTab) {
    tabOptions.push({ id: 'log', label: 'Лог' });
  }

  return (
    <section className="duel-screen duel-screen-mobile">
      <div className="duel-screen-shell duel-screen-shell-mobile" ref={scrollContainerRef}>
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

        {tabOptions.length > 1 ? (
          <div className="boss-mobile-tabs duel-mobile-tabs" role="tablist" aria-label="Режимы дуэли">
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

        <div className="duel-mobile-stage">
          {activeTab === 'invite' && showInviteSearchPanel
            ? renderInvitePanel()
            : activeTab === 'log'
              ? renderLogPanel()
              : renderTeamPanel()}
        </div>
      </div>
    </section>
  );
}

export default DuelMobileView;
