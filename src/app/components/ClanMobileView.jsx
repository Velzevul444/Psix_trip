import React, { useEffect, useState } from 'react';
import { CLAN_CHAT_MESSAGE_MAX_LENGTH } from '../constants';

function ClanMobileView({
  clan,
  clanError,
  isClanLoading,
  activeTab,
  onActiveTabChange,
  clanSearchInput,
  onClanSearchInputChange,
  clanSearchQuery,
  clanDirectory,
  clanDirectoryTotal,
  hasMoreClans,
  isClanDirectoryLoading,
  clanDirectoryError,
  isJoiningClanId,
  joinClanError,
  onJoinClan,
  onLoadMoreClans,
  createClanName,
  onCreateClanNameChange,
  createClanDescription,
  onCreateClanDescriptionChange,
  createClanError,
  isCreatingClan,
  onCreateClan,
  memberCount,
  isEditingClan,
  onToggleEditingClan,
  editClanName,
  onEditClanNameChange,
  editClanDescription,
  onEditClanDescriptionChange,
  editClanError,
  isSavingClan,
  onSaveClan,
  onCancelEdit,
  leaveClanError,
  isLeavingClan,
  onLeaveClan,
  memberActionError,
  isRemovingMemberId,
  onRemoveMember,
  clanMessages,
  isClanMessagesLoading,
  clanMessagesError,
  clanChatListRef,
  onClanChatScroll,
  formatClanChatTimestamp,
  clanMessageInput,
  onClanMessageInputChange,
  onClanMessageKeyDown,
  normalizedClanMessageInput,
  clanMessageLength,
  isClanMessageTooLong,
  isSendingClanMessage,
  onSendClanMessage
}) {
  const [activeClanTab, setActiveClanTab] = useState(clan ? 'overview' : 'join');

  useEffect(() => {
    if (clan) {
      setActiveClanTab((current) =>
        ['overview', 'chat', 'members'].includes(current) ? current : 'overview'
      );
      return;
    }

    setActiveClanTab('join');
  }, [clan?.id]);

  const renderClanOverview = () => {
    if (!clan) {
      return null;
    }

    return (
      <div className="clan-mobile-stack">
        <article className="clan-mobile-summary">
          <div className="clan-mobile-summary-head">
            <div>
              <div className="library-kicker">Текущий клан</div>
              <strong className="clan-mobile-summary-title">{clan.name}</strong>
              <p>{clan.description || 'Описание пока не заполнено.'}</p>
            </div>
            <div className="clan-mobile-role-chip">{clan.isOwner ? 'Лидер' : 'Участник'}</div>
          </div>

          <div className="clan-mobile-summary-grid">
            <article className="clan-mobile-meta-card">
              <span>Лидер</span>
              <strong>{clan.owner?.username || 'Игрок'}</strong>
            </article>
            <article className="clan-mobile-meta-card">
              <span>Состав</span>
              <strong>{memberCount}</strong>
              <em>{memberCount === 1 ? 'участник' : 'участников'}</em>
            </article>
          </div>
        </article>

        <div className="boss-mobile-block clan-mobile-settings">
          <div className="boss-mobile-block-head boss-mobile-block-head-stack">
            <div>
              <div className="library-kicker">Управление</div>
              <strong className="boss-mobile-section-title">Настройки клана</strong>
            </div>
          </div>

          {!isEditingClan ? (
            <>
              <div className="duel-note clan-mobile-note">
                Из этого блока можно обновить название и описание клана или выйти из состава.
              </div>

              <div className="clan-mobile-actions">
                <button
                  type="button"
                  className={`library-more-btn ${isEditingClan ? 'active' : ''}`}
                  onClick={onToggleEditingClan}
                >
                  Редактировать клан
                </button>
                <button
                  type="button"
                  className="clan-leave-btn"
                  onClick={onLeaveClan}
                  disabled={isLeavingClan}
                >
                  {isLeavingClan ? 'Выходим...' : 'Выйти из клана'}
                </button>
              </div>
            </>
          ) : (
            <div className="clan-edit-panel">
              <label className="admin-panel-field">
                <span>Название клана</span>
                <input
                  type="text"
                  value={editClanName}
                  onChange={(event) => onEditClanNameChange(event.target.value)}
                  placeholder="Например, Night Watch"
                />
              </label>

              <label className="admin-panel-field clan-textarea-field">
                <span>Описание клана</span>
                <textarea
                  value={editClanDescription}
                  onChange={(event) => onEditClanDescriptionChange(event.target.value)}
                  placeholder="Расскажи, чем живёт ваш клан."
                  rows={4}
                />
              </label>

              {editClanError ? <div className="auth-error">{editClanError}</div> : null}

              <div className="clan-edit-actions">
                <button type="button" className="library-more-btn" onClick={onCancelEdit}>
                  Отмена
                </button>
                <button
                  type="button"
                  className="auth-submit-btn"
                  onClick={onSaveClan}
                  disabled={isSavingClan}
                >
                  {isSavingClan ? 'Сохраняем...' : 'Сохранить'}
                </button>
              </div>
            </div>
          )}

          {leaveClanError ? <div className="auth-error">{leaveClanError}</div> : null}
        </div>
      </div>
    );
  };

  const renderClanMembers = () => {
    if (!clan) {
      return null;
    }

    return (
      <div className="clan-members-panel clan-members-panel-mobile">
        <div className="clan-panel-head">
          <div>
            <div className="library-kicker">Состав</div>
            <h3>Соклановцы</h3>
          </div>
          <div className="clan-member-count">{memberCount}</div>
        </div>

        <div className="clan-member-list">
          {memberCount > 0 ? (
            clan.members.map((member) => (
              <article key={member.id} className={`clan-member-card ${member.isOwner ? 'owner' : ''}`}>
                <div>
                  <strong>{member.username}</strong>
                  <span>{member.isOwner ? 'Лидер клана' : 'Участник клана'}</span>
                </div>
                {clan.isOwner && !member.isOwner ? (
                  <button
                    type="button"
                    className="clan-member-remove-btn"
                    onClick={() => onRemoveMember(member.id)}
                    disabled={isRemovingMemberId === member.id}
                  >
                    {isRemovingMemberId === member.id ? 'Удаляем...' : 'Удалить'}
                  </button>
                ) : null}
              </article>
            ))
          ) : (
            <div className="auth-status">В этом клане пока нет участников.</div>
          )}
        </div>

        {memberActionError ? <div className="auth-error">{memberActionError}</div> : null}
      </div>
    );
  };

  const renderClanChat = () => {
    if (!clan) {
      return null;
    }

    return (
      <div className="clan-chat-panel clan-chat-panel-mobile">
        <div className="clan-panel-head">
          <div>
            <div className="library-kicker">Общение</div>
            <h3>Чат клана</h3>
          </div>
          <div className="clan-member-count">{clanMessages.length}</div>
        </div>

        {clanMessagesError ? <div className="auth-error">{clanMessagesError}</div> : null}

        <div className="clan-chat-list clan-chat-list-mobile" ref={clanChatListRef} onScroll={onClanChatScroll}>
          {isClanMessagesLoading && clanMessages.length === 0 ? (
            <div className="auth-status">Загружаем сообщения клана...</div>
          ) : clanMessages.length > 0 ? (
            clanMessages.map((message) => (
              <article key={message.id} className={`clan-chat-message ${message.isMine ? 'mine' : ''}`}>
                <div className="clan-chat-message-top">
                  <strong>{message.author?.username || 'Игрок'}</strong>
                  <span>{formatClanChatTimestamp(message.createdAt)}</span>
                </div>
                <p>{message.message}</p>
              </article>
            ))
          ) : (
            <div className="auth-status">В чате пока тихо. Напиши первое сообщение для соклановцев.</div>
          )}
        </div>

        <div className="clan-chat-composer">
          <label className="admin-panel-field clan-textarea-field clan-chat-input">
            <span>Сообщение</span>
            <textarea
              value={clanMessageInput}
              onChange={(event) => onClanMessageInputChange(event.target.value)}
              onKeyDown={onClanMessageKeyDown}
              placeholder="Напиши сообщение для соклановцев..."
              rows={3}
            />
          </label>

          <div className="clan-chat-actions">
            <div className={`clan-chat-counter ${isClanMessageTooLong ? 'danger' : ''}`}>
              {clanMessageLength}/{CLAN_CHAT_MESSAGE_MAX_LENGTH}
            </div>
            <button
              type="button"
              className="auth-submit-btn"
              onClick={onSendClanMessage}
              disabled={!normalizedClanMessageInput || isClanMessageTooLong || isSendingClanMessage}
            >
              {isSendingClanMessage ? 'Отправляем...' : 'Отправить'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderClanJoin = () => (
    <div className="clan-directory-panel clan-directory-panel-mobile">
      <div className="clan-panel-head">
        <div>
          <div className="library-kicker">Поиск кланов</div>
          <h3>Выбери готовый клан</h3>
        </div>
        <div className="clan-member-count">{clanDirectoryTotal}</div>
      </div>

      <label className="library-search clan-search-field">
        <span>Поиск по названию</span>
        <input
          type="text"
          value={clanSearchInput}
          onChange={(event) => onClanSearchInputChange(event.target.value)}
          placeholder="Например, Night Watch"
        />
      </label>

      {joinClanError ? <div className="auth-error">{joinClanError}</div> : null}
      {clanDirectoryError ? <div className="auth-error">{clanDirectoryError}</div> : null}

      <div className="clan-directory-list">
        {isClanDirectoryLoading && clanDirectory.length === 0 ? (
          <div className="auth-status">Ищем доступные кланы...</div>
        ) : clanDirectory.length > 0 ? (
          clanDirectory.map((directoryClan) => (
            <article key={directoryClan.id} className="clan-directory-card">
              <div className="clan-directory-copy">
                <strong>{directoryClan.name}</strong>
                <p>{directoryClan.description || 'Описание пока не добавлено.'}</p>
                <div className="clan-directory-meta">
                  <span>Лидер: {directoryClan.owner?.username}</span>
                  <span>{directoryClan.memberCount} участников</span>
                </div>
              </div>
              <button
                type="button"
                className="auth-submit-btn clan-join-btn"
                onClick={() => onJoinClan(directoryClan.id)}
                disabled={isJoiningClanId === directoryClan.id}
              >
                {isJoiningClanId === directoryClan.id ? 'Вступаем...' : 'Вступить'}
              </button>
            </article>
          ))
        ) : (
          <div className="auth-status">
            {clanSearchQuery
              ? 'Кланы по этому запросу не найдены.'
              : 'Пока никто не создал клан. Стань первым.'}
          </div>
        )}
      </div>

      {hasMoreClans && clanDirectory.length > 0 ? (
        <div className="clan-directory-actions">
          <button
            type="button"
            className="library-more-btn"
            onClick={() => onLoadMoreClans(false)}
            disabled={isClanDirectoryLoading}
          >
            {isClanDirectoryLoading ? 'Загружаем...' : 'Показать ещё кланы'}
          </button>
        </div>
      ) : null}
    </div>
  );

  const renderClanCreate = () => (
    <div className="clan-create-panel clan-create-panel-mobile">
      <div className="clan-panel-head">
        <div>
          <div className="library-kicker">Новый клан</div>
          <h3>Создай свой клан</h3>
        </div>
      </div>

      <label className="admin-panel-field">
        <span>Название клана</span>
        <input
          type="text"
          value={createClanName}
          onChange={(event) => onCreateClanNameChange(event.target.value)}
          placeholder="Например, Iron Circle"
        />
      </label>

      <label className="admin-panel-field clan-textarea-field">
        <span>Описание клана</span>
        <textarea
          value={createClanDescription}
          onChange={(event) => onCreateClanDescriptionChange(event.target.value)}
          placeholder="Коротко опиши атмосферу, цель и характер вашего клана."
          rows={5}
        />
      </label>

      {createClanError ? <div className="auth-error">{createClanError}</div> : null}

      <div className="clan-create-actions">
        <button
          type="button"
          className="auth-submit-btn"
          onClick={onCreateClan}
          disabled={isCreatingClan}
        >
          {isCreatingClan ? 'Создаём клан...' : 'Создать клан'}
        </button>
      </div>
    </div>
  );

  return (
    <section className="clan-screen clan-screen-mobile">
      <div className="clan-screen-shell clan-screen-shell-mobile">
        <div className="clan-screen-header">
          <div>
            <div className="library-kicker">Гильдия</div>
            <h2>Кланы</h2>
          </div>
        </div>

        {clanError ? <div className="library-status error">{clanError}</div> : null}
        {isClanLoading && !clan ? <div className="library-status">Загружаем состояние клана...</div> : null}

        {clan ? (
          <>
            <div className="boss-mobile-tabs clan-mobile-tabs" role="tablist" aria-label="Разделы клана">
              <button
                type="button"
                className={`boss-mobile-tab ${activeClanTab === 'overview' ? 'active' : ''}`}
                onClick={() => setActiveClanTab('overview')}
              >
                Обзор
              </button>
              <button
                type="button"
                className={`boss-mobile-tab ${activeClanTab === 'chat' ? 'active' : ''}`}
                onClick={() => setActiveClanTab('chat')}
              >
                Чат
              </button>
              <button
                type="button"
                className={`boss-mobile-tab ${activeClanTab === 'members' ? 'active' : ''}`}
                onClick={() => setActiveClanTab('members')}
              >
                Состав
              </button>
            </div>

            <div className="clan-mobile-stage">
              {activeClanTab === 'overview'
                ? renderClanOverview()
                : activeClanTab === 'members'
                  ? renderClanMembers()
                  : renderClanChat()}
            </div>
          </>
        ) : (
          <>
            <div className="boss-mobile-tabs clan-mobile-tabs" role="tablist" aria-label="Режимы кланов">
              <button
                type="button"
                className={`boss-mobile-tab ${activeTab === 'join' ? 'active' : ''}`}
                onClick={() => onActiveTabChange('join')}
              >
                Вступить
              </button>
              <button
                type="button"
                className={`boss-mobile-tab ${activeTab === 'create' ? 'active' : ''}`}
                onClick={() => onActiveTabChange('create')}
              >
                Создать
              </button>
            </div>

            <div className="clan-mobile-stage">
              {activeTab === 'join' ? renderClanJoin() : renderClanCreate()}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export default ClanMobileView;
