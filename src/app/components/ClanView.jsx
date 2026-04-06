import React, { useEffect, useRef, useState } from 'react';
import {
  createClanRequest,
  fetchClanMessages,
  fetchClanState,
  fetchClansPage,
  joinClanRequest,
  leaveClanRequest,
  removeClanMemberRequest,
  sendClanMessageRequest,
  updateCurrentClanRequest
} from '../api';
import {
  CLAN_CHAT_MESSAGE_LIMIT,
  CLAN_CHAT_MESSAGE_MAX_LENGTH,
  CLAN_CHAT_POLL_MS,
  CLAN_PAGE_SIZE
} from '../constants';
import useIsMobileViewport from '../hooks/useIsMobileViewport';
import ClanMobileView from './ClanMobileView';

function formatClanChatTimestamp(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const now = new Date();
  const isSameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  return date.toLocaleString('ru-RU', {
    day: isSameDay ? undefined : '2-digit',
    month: isSameDay ? undefined : '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function ClanView({ authUser, authToken, isActive = false, refreshToken, onClanRefresh }) {
  const [clan, setClan] = useState(null);
  const [isClanLoading, setIsClanLoading] = useState(false);
  const [clanError, setClanError] = useState('');
  const [activeTab, setActiveTab] = useState('join');
  const [clanSearchInput, setClanSearchInput] = useState('');
  const [clanSearchQuery, setClanSearchQuery] = useState('');
  const [clanDirectory, setClanDirectory] = useState([]);
  const [clanDirectoryTotal, setClanDirectoryTotal] = useState(0);
  const [hasMoreClans, setHasMoreClans] = useState(true);
  const [isClanDirectoryLoading, setIsClanDirectoryLoading] = useState(false);
  const [clanDirectoryError, setClanDirectoryError] = useState('');
  const [isJoiningClanId, setIsJoiningClanId] = useState(null);
  const [joinClanError, setJoinClanError] = useState('');
  const [createClanName, setCreateClanName] = useState('');
  const [createClanDescription, setCreateClanDescription] = useState('');
  const [createClanError, setCreateClanError] = useState('');
  const [isCreatingClan, setIsCreatingClan] = useState(false);
  const [isEditingClan, setIsEditingClan] = useState(false);
  const [editClanName, setEditClanName] = useState('');
  const [editClanDescription, setEditClanDescription] = useState('');
  const [editClanError, setEditClanError] = useState('');
  const [isSavingClan, setIsSavingClan] = useState(false);
  const [leaveClanError, setLeaveClanError] = useState('');
  const [isLeavingClan, setIsLeavingClan] = useState(false);
  const [memberActionError, setMemberActionError] = useState('');
  const [isRemovingMemberId, setIsRemovingMemberId] = useState(null);
  const [clanMessages, setClanMessages] = useState([]);
  const [isClanMessagesLoading, setIsClanMessagesLoading] = useState(false);
  const [clanMessagesError, setClanMessagesError] = useState('');
  const [clanMessageInput, setClanMessageInput] = useState('');
  const [isSendingClanMessage, setIsSendingClanMessage] = useState(false);
  const clanDirectoryRequestIdRef = useRef(0);
  const clanMessagesRequestIdRef = useRef(0);
  const clanChatListRef = useRef(null);
  const shouldStickChatToBottomRef = useRef(true);
  const isMobileViewport = useIsMobileViewport();

  const loadClanState = async () => {
    if (!authToken || !authUser) {
      setClan(null);
      setClanError('');
      setIsClanLoading(false);
      return;
    }

    setIsClanLoading(true);
    setClanError('');

    try {
      const payload = await fetchClanState(authToken);
      setClan(payload.clan || null);
    } catch (error) {
      setClan(null);
      setClanError(error.message || 'Не удалось загрузить состояние клана.');
    } finally {
      setIsClanLoading(false);
    }
  };

  useEffect(() => {
    void loadClanState();
  }, [authToken, authUser, refreshToken]);

  useEffect(() => {
    if (!authUser || clan || activeTab !== 'join') {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setClanSearchQuery(clanSearchInput.trim());
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeTab, authUser, clan, clanSearchInput]);

  useEffect(() => {
    if (!authToken || !authUser || clan || activeTab !== 'join') {
      setClanDirectory([]);
      setClanDirectoryTotal(0);
      setHasMoreClans(true);
      setClanDirectoryError('');
      setIsClanDirectoryLoading(false);
      return;
    }

    void loadClanDirectory(true);
  }, [activeTab, authToken, authUser, clan, clanSearchQuery]);

  useEffect(() => {
    if (!clan) {
      setIsEditingClan(false);
      setClanMessages([]);
      setClanMessagesError('');
      setClanMessageInput('');
      setIsClanMessagesLoading(false);
      setIsSendingClanMessage(false);
      return;
    }

    setEditClanName(clan.name || '');
    setEditClanDescription(clan.description || '');
    setEditClanError('');
    setLeaveClanError('');
    setMemberActionError('');
  }, [clan?.id, clan?.name, clan?.description]);

  const loadClanMessages = async ({ silent = false } = {}) => {
    if (!authToken || !authUser || !clan?.id) {
      setClanMessages([]);
      setClanMessagesError('');
      setIsClanMessagesLoading(false);
      return;
    }

    const requestId = clanMessagesRequestIdRef.current + 1;
    clanMessagesRequestIdRef.current = requestId;

    if (!silent || clanMessages.length === 0) {
      setIsClanMessagesLoading(true);
    }

    setClanMessagesError('');

    try {
      const payload = await fetchClanMessages(authToken, CLAN_CHAT_MESSAGE_LIMIT);

      if (requestId !== clanMessagesRequestIdRef.current) {
        return;
      }

      setClanMessages(Array.isArray(payload.messages) ? payload.messages : []);
    } catch (error) {
      if (requestId === clanMessagesRequestIdRef.current) {
        setClanMessagesError(error.message || 'Не удалось загрузить сообщения клана.');
      }
    } finally {
      if (requestId === clanMessagesRequestIdRef.current) {
        setIsClanMessagesLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!authToken || !authUser || !clan?.id) {
      setClanMessages([]);
      setClanMessagesError('');
      setIsClanMessagesLoading(false);
      return undefined;
    }

    void loadClanMessages();

    if (!isActive) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      void loadClanMessages({ silent: true });
    }, CLAN_CHAT_POLL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [authToken, authUser, clan?.id, refreshToken, isActive]);

  useEffect(() => {
    const listElement = clanChatListRef.current;

    if (!listElement || !shouldStickChatToBottomRef.current) {
      return;
    }

    listElement.scrollTop = listElement.scrollHeight;
  }, [clan?.id, clanMessages]);

  const loadClanDirectory = async (reset = false) => {
    if (!authToken || isClanDirectoryLoading) {
      return;
    }

    const requestId = clanDirectoryRequestIdRef.current + 1;
    clanDirectoryRequestIdRef.current = requestId;
    setIsClanDirectoryLoading(true);

    if (reset) {
      setClanDirectoryError('');
    }

    try {
      const offset = reset ? 0 : clanDirectory.length;
      const payload = await fetchClansPage(offset, CLAN_PAGE_SIZE, authToken, {
        search: clanSearchQuery
      });

      if (requestId !== clanDirectoryRequestIdRef.current) {
        return;
      }

      const incomingClans = Array.isArray(payload.clans) ? payload.clans : [];
      const total = Number(payload.total || 0);

      setClanDirectory((current) => (reset ? incomingClans : [...current, ...incomingClans]));
      setClanDirectoryTotal(total);
      setHasMoreClans(offset + incomingClans.length < total);
    } catch (error) {
      if (requestId === clanDirectoryRequestIdRef.current) {
        setClanDirectoryError(error.message || 'Не удалось загрузить список кланов.');
      }
    } finally {
      if (requestId === clanDirectoryRequestIdRef.current) {
        setIsClanDirectoryLoading(false);
      }
    }
  };

  const handleJoinClan = async (targetClanId) => {
    if (!authToken) {
      return;
    }

    setIsJoiningClanId(targetClanId);
    setJoinClanError('');

    try {
      const payload = await joinClanRequest(targetClanId, authToken);
      setClan(payload.clan || null);
      onClanRefresh?.();
    } catch (error) {
      setJoinClanError(error.message || 'Не удалось вступить в клан.');
    } finally {
      setIsJoiningClanId(null);
    }
  };

  const handleCreateClan = async () => {
    if (!authToken) {
      return;
    }

    setIsCreatingClan(true);
    setCreateClanError('');

    try {
      const payload = await createClanRequest(
        {
          name: createClanName,
          description: createClanDescription
        },
        authToken
      );

      setClan(payload.clan || null);
      setCreateClanName('');
      setCreateClanDescription('');
      onClanRefresh?.();
    } catch (error) {
      setCreateClanError(error.message || 'Не удалось создать клан.');
    } finally {
      setIsCreatingClan(false);
    }
  };

  const handleLeaveClan = async () => {
    if (!authToken) {
      return;
    }

    setIsLeavingClan(true);
    setLeaveClanError('');

    try {
      await leaveClanRequest(authToken);
      setClan(null);
      setIsEditingClan(false);
      onClanRefresh?.();
    } catch (error) {
      setLeaveClanError(error.message || 'Не удалось выйти из клана.');
    } finally {
      setIsLeavingClan(false);
    }
  };

  const handleUpdateClan = async () => {
    if (!authToken) {
      return;
    }

    setIsSavingClan(true);
    setEditClanError('');

    try {
      const payload = await updateCurrentClanRequest(
        {
          name: editClanName,
          description: editClanDescription
        },
        authToken
      );

      setClan(payload.clan || null);
      setIsEditingClan(false);
      onClanRefresh?.();
    } catch (error) {
      setEditClanError(error.message || 'Не удалось обновить клан.');
    } finally {
      setIsSavingClan(false);
    }
  };

  const handleRemoveMember = async (memberId) => {
    if (!authToken) {
      return;
    }

    setIsRemovingMemberId(memberId);
    setMemberActionError('');

    try {
      const payload = await removeClanMemberRequest(memberId, authToken);
      setClan(payload.clan || null);
      onClanRefresh?.();
    } catch (error) {
      setMemberActionError(error.message || 'Не удалось удалить участника из клана.');
    } finally {
      setIsRemovingMemberId(null);
    }
  };

  const handleClanChatScroll = (event) => {
    const element = event.currentTarget;
    const distanceToBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    shouldStickChatToBottomRef.current = distanceToBottom < 42;
  };

  const handleSendClanMessage = async () => {
    if (!authToken || !clan?.id) {
      return;
    }

    const nextMessage = clanMessageInput.replace(/\r\n/g, '\n').trim();

    if (!nextMessage || nextMessage.length > CLAN_CHAT_MESSAGE_MAX_LENGTH) {
      return;
    }

    shouldStickChatToBottomRef.current = true;
    setIsSendingClanMessage(true);
    setClanMessagesError('');

    try {
      const payload = await sendClanMessageRequest(nextMessage, authToken);
      setClanMessages(Array.isArray(payload.messages) ? payload.messages : []);
      setClanMessageInput('');
    } catch (error) {
      setClanMessagesError(error.message || 'Не удалось отправить сообщение.');
    } finally {
      setIsSendingClanMessage(false);
    }
  };

  const handleClanMessageKeyDown = (event) => {
    if (event.key !== 'Enter' || event.shiftKey) {
      return;
    }

    event.preventDefault();
    void handleSendClanMessage();
  };

  const memberCount = Array.isArray(clan?.members) ? clan.members.length : 0;
  const normalizedClanMessageInput = clanMessageInput.replace(/\r\n/g, '\n').trim();
  const clanMessageLength = normalizedClanMessageInput.length;
  const isClanMessageTooLong = clanMessageLength > CLAN_CHAT_MESSAGE_MAX_LENGTH;

  if (!authUser) {
    return (
      <section className="clan-screen">
        <div className="clan-screen-shell">
          <div className="clan-screen-header">
            <div>
              <h2>Кланы</h2>
            </div>
          </div>
          <div className="library-status">Войди в аккаунт, чтобы создать клан или вступить в уже существующий.</div>
        </div>
      </section>
    );
  }

  if (isMobileViewport) {
    return (
      <ClanMobileView
        clan={clan}
        clanError={clanError}
        isClanLoading={isClanLoading}
        activeTab={activeTab}
        onActiveTabChange={setActiveTab}
        clanSearchInput={clanSearchInput}
        onClanSearchInputChange={setClanSearchInput}
        clanSearchQuery={clanSearchQuery}
        clanDirectory={clanDirectory}
        clanDirectoryTotal={clanDirectoryTotal}
        hasMoreClans={hasMoreClans}
        isClanDirectoryLoading={isClanDirectoryLoading}
        clanDirectoryError={clanDirectoryError}
        isJoiningClanId={isJoiningClanId}
        joinClanError={joinClanError}
        onJoinClan={handleJoinClan}
        onLoadMoreClans={loadClanDirectory}
        createClanName={createClanName}
        onCreateClanNameChange={setCreateClanName}
        createClanDescription={createClanDescription}
        onCreateClanDescriptionChange={setCreateClanDescription}
        createClanError={createClanError}
        isCreatingClan={isCreatingClan}
        onCreateClan={() => void handleCreateClan()}
        memberCount={memberCount}
        isEditingClan={isEditingClan}
        onToggleEditingClan={() => setIsEditingClan((current) => !current)}
        editClanName={editClanName}
        onEditClanNameChange={setEditClanName}
        editClanDescription={editClanDescription}
        onEditClanDescriptionChange={setEditClanDescription}
        editClanError={editClanError}
        isSavingClan={isSavingClan}
        onSaveClan={() => void handleUpdateClan()}
        onCancelEdit={() => {
          setIsEditingClan(false);
          setEditClanName(clan?.name || '');
          setEditClanDescription(clan?.description || '');
          setEditClanError('');
        }}
        leaveClanError={leaveClanError}
        isLeavingClan={isLeavingClan}
        onLeaveClan={() => void handleLeaveClan()}
        memberActionError={memberActionError}
        isRemovingMemberId={isRemovingMemberId}
        onRemoveMember={handleRemoveMember}
        clanMessages={clanMessages}
        isClanMessagesLoading={isClanMessagesLoading}
        clanMessagesError={clanMessagesError}
        clanChatListRef={clanChatListRef}
        onClanChatScroll={handleClanChatScroll}
        formatClanChatTimestamp={formatClanChatTimestamp}
        clanMessageInput={clanMessageInput}
        onClanMessageInputChange={setClanMessageInput}
        onClanMessageKeyDown={handleClanMessageKeyDown}
        normalizedClanMessageInput={normalizedClanMessageInput}
        clanMessageLength={clanMessageLength}
        isClanMessageTooLong={isClanMessageTooLong}
        isSendingClanMessage={isSendingClanMessage}
        onSendClanMessage={() => void handleSendClanMessage()}
      />
    );
  }

  return (
    <section className="clan-screen">
      <div className="clan-screen-shell">
        <div className="clan-screen-header">
          <div>
            <h2>Кланы</h2>
          </div>
        </div>

        {clanError ? <div className="library-status error">{clanError}</div> : null}
        {isClanLoading && !clan ? <div className="library-status">Загружаем состояние клана...</div> : null}

        {clan ? (
          <div className="clan-layout">
            <div className="clan-info-panel">
              <div className="clan-panel-head">
                <div>
                  <h3>{clan.name}</h3>
                </div>
                <div className="clan-panel-actions">
                  <button
                    type="button"
                    className={`clan-icon-btn ${isEditingClan ? 'active' : ''}`}
                    onClick={() => setIsEditingClan((current) => !current)}
                    aria-label={isEditingClan ? 'Закрыть редактирование клана' : 'Редактировать клан'}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                      <path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4" />
                      <path d="M13.5 6.5l4 4" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="clan-leave-btn"
                    onClick={handleLeaveClan}
                    disabled={isLeavingClan}
                  >
                    {isLeavingClan ? 'Выходим...' : 'Выйти из клана'}
                  </button>
                </div>
              </div>

              <div className="clan-info-grid">
                <article className="clan-overview-card">
                  <span>Описание</span>
                  <p>{clan.description || 'Описание пока не заполнено.'}</p>
                </article>
                <article className="clan-overview-card">
                  <span>Лидер</span>
                  <strong>{clan.owner?.username}</strong>
                  <small>{memberCount} участников в составе</small>
                </article>
              </div>

              {isEditingClan ? (
                <div className="clan-edit-panel">
                  <label className="admin-panel-field">
                    <span>Название клана</span>
                    <input
                      type="text"
                      value={editClanName}
                      onChange={(event) => setEditClanName(event.target.value)}
                      placeholder="Например, Night Watch"
                    />
                  </label>

                  <label className="admin-panel-field clan-textarea-field">
                    <span>Описание клана</span>
                    <textarea
                      value={editClanDescription}
                      onChange={(event) => setEditClanDescription(event.target.value)}
                      placeholder="Расскажи, чем живёт ваш клан."
                      rows={4}
                    />
                  </label>

                  {editClanError ? <div className="auth-error">{editClanError}</div> : null}

                  <div className="clan-edit-actions">
                    <button
                      type="button"
                      className="library-more-btn"
                      onClick={() => {
                        setIsEditingClan(false);
                        setEditClanName(clan.name || '');
                        setEditClanDescription(clan.description || '');
                        setEditClanError('');
                      }}
                    >
                      Отмена
                    </button>
                    <button
                      type="button"
                      className="auth-submit-btn"
                      onClick={handleUpdateClan}
                      disabled={isSavingClan}
                    >
                      {isSavingClan ? 'Сохраняем...' : 'Сохранить изменения'}
                    </button>
                  </div>
                </div>
              ) : null}

              {leaveClanError ? <div className="auth-error">{leaveClanError}</div> : null}
            </div>

            <div className="clan-side-column">
              <div className="clan-members-panel">
                <div className="clan-panel-head">
                  <div>
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
                            onClick={() => handleRemoveMember(member.id)}
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

              <div className="clan-chat-panel">
                <div className="clan-panel-head">
                  <div>
                    <h3>Чат клана</h3>
                  </div>
                  <div className="clan-member-count">{clanMessages.length}</div>
                </div>

                {clanMessagesError ? <div className="auth-error">{clanMessagesError}</div> : null}

                <div
                  className="clan-chat-list"
                  ref={clanChatListRef}
                  onScroll={handleClanChatScroll}
                >
                  {isClanMessagesLoading && clanMessages.length === 0 ? (
                    <div className="auth-status">Загружаем сообщения клана...</div>
                  ) : clanMessages.length > 0 ? (
                    clanMessages.map((message) => (
                      <article
                        key={message.id}
                        className={`clan-chat-message ${message.isMine ? 'mine' : ''}`}
                      >
                        <div className="clan-chat-message-top">
                          <strong>{message.author?.username || 'Игрок'}</strong>
                          <span>{formatClanChatTimestamp(message.createdAt)}</span>
                        </div>
                        <p>{message.message}</p>
                      </article>
                    ))
                  ) : (
                    <div className="auth-status">
                      В чате пока тихо. Напиши первое сообщение для соклановцев.
                    </div>
                  )}
                </div>

                <div className="clan-chat-composer">
                  <label className="admin-panel-field clan-textarea-field clan-chat-input">
                    <span>Сообщение</span>
                    <textarea
                      value={clanMessageInput}
                      onChange={(event) => setClanMessageInput(event.target.value)}
                      onKeyDown={handleClanMessageKeyDown}
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
                      onClick={() => void handleSendClanMessage()}
                      disabled={!normalizedClanMessageInput || isClanMessageTooLong || isSendingClanMessage}
                    >
                      {isSendingClanMessage ? 'Отправляем...' : 'Отправить'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="clan-empty-layout">
            <div className="boss-mobile-tabs clan-tabs" role="tablist" aria-label="Режимы кланов">
              <button
                type="button"
                className={`boss-mobile-tab ${activeTab === 'join' ? 'active' : ''}`}
                onClick={() => setActiveTab('join')}
              >
                Вступить в клан
              </button>
              <button
                type="button"
                className={`boss-mobile-tab ${activeTab === 'create' ? 'active' : ''}`}
                onClick={() => setActiveTab('create')}
              >
                Создать клан
              </button>
            </div>

            {activeTab === 'join' ? (
              <div className="clan-directory-panel">
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
                    onChange={(event) => setClanSearchInput(event.target.value)}
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
                          onClick={() => handleJoinClan(directoryClan.id)}
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
                      onClick={() => loadClanDirectory(false)}
                      disabled={isClanDirectoryLoading}
                    >
                      {isClanDirectoryLoading ? 'Загружаем...' : 'Показать ещё кланы'}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="clan-create-panel">
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
                    onChange={(event) => setCreateClanName(event.target.value)}
                    placeholder="Например, Iron Circle"
                  />
                </label>

                <label className="admin-panel-field clan-textarea-field">
                  <span>Описание клана</span>
                  <textarea
                    value={createClanDescription}
                    onChange={(event) => setCreateClanDescription(event.target.value)}
                    placeholder="Коротко опиши атмосферу, цель и характер вашего клана."
                    rows={5}
                  />
                </label>

                {createClanError ? <div className="auth-error">{createClanError}</div> : null}

                <div className="clan-create-actions">
                  <button
                    type="button"
                    className="auth-submit-btn"
                    onClick={handleCreateClan}
                    disabled={isCreatingClan}
                  >
                    {isCreatingClan ? 'Создаём клан...' : 'Создать клан'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export default ClanView;
