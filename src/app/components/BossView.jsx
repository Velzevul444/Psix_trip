import React, { useEffect, useRef, useState } from 'react';
import Card from '../../components/Card';
import CardStats from '../../components/CardStats';
import { fetchCurrentBoss, fetchMyArticlesPage, fetchPageSummary, submitBossBattle } from '../api';
import useIsMobileViewport from '../hooks/useIsMobileViewport';
import { BOSS_TEAM_SEARCH_LIMIT, BOSS_TEAM_SIZE } from '../constants';
import {
  buildCardData,
  formatCompactNumber,
  formatFullNumber,
  getStatLabel,
  resolveArticleRarity
} from '../utils';
import BossMobileView from './BossMobileView';

function BossView({
  authUser,
  authToken,
  rarityLevels,
  onRarityLevelsChange,
  refreshToken,
  onCollectionRefresh
}) {
  const [bossData, setBossData] = useState(null);
  const [bossDisplayCard, setBossDisplayCard] = useState(null);
  const [isBossLoading, setIsBossLoading] = useState(false);
  const [bossError, setBossError] = useState('');
  const [bossTeamSearchInput, setBossTeamSearchInput] = useState('');
  const [bossTeamSearchQuery, setBossTeamSearchQuery] = useState('');
  const [bossTeamCandidates, setBossTeamCandidates] = useState([]);
  const [isBossTeamLoading, setIsBossTeamLoading] = useState(false);
  const [bossTeamError, setBossTeamError] = useState('');
  const [cardCooldowns, setCardCooldowns] = useState([]);
  const [cooldownNow, setCooldownNow] = useState(() => Date.now());
  const [selectedBossTeam, setSelectedBossTeam] = useState([]);
  const [bossBattleResult, setBossBattleResult] = useState(null);
  const [bossBattleError, setBossBattleError] = useState('');
  const [isBossBattleSubmitting, setIsBossBattleSubmitting] = useState(false);
  const [activeDesktopTab, setActiveDesktopTab] = useState('team');
  const summaryCacheRef = useRef(new Map());
  const bossTeamRequestIdRef = useRef(0);
  const isMobileViewport = useIsMobileViewport();

  useEffect(() => {
    loadBoss();
  }, [refreshToken, authToken]);

  useEffect(() => {
    if (!authUser) {
      resetBossSelection();
      setCardCooldowns([]);
      setActiveDesktopTab('team');
    }
  }, [authUser]);

  useEffect(() => {
    if (bossBattleResult) {
      setActiveDesktopTab('log');
    }
  }, [bossBattleResult]);

  useEffect(() => {
    if (!bossBattleResult && activeDesktopTab === 'log') {
      setActiveDesktopTab('team');
    }
  }, [activeDesktopTab, bossBattleResult]);

  useEffect(() => {
    setCooldownNow(Date.now());

    if (!cardCooldowns.some((cooldown) => new Date(cooldown.availableAt).getTime() > Date.now())) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setCooldownNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [cardCooldowns]);

  useEffect(() => {
    if (!authUser) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setBossTeamSearchQuery(bossTeamSearchInput.trim());
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [authUser, bossTeamSearchInput]);

  useEffect(() => {
    if (!authToken || !authUser) {
      return;
    }

    const requestId = bossTeamRequestIdRef.current + 1;
    bossTeamRequestIdRef.current = requestId;
    setIsBossTeamLoading(true);
    setBossTeamError('');

    const loadBossTeamCandidates = async () => {
      try {
        const payload = await fetchMyArticlesPage(0, BOSS_TEAM_SEARCH_LIMIT, authToken, {
          search: bossTeamSearchQuery
        });

        if (requestId !== bossTeamRequestIdRef.current) {
          return;
        }

        if (payload.rarityLevels) {
          onRarityLevelsChange(payload.rarityLevels);
        }

        setBossTeamCandidates(Array.isArray(payload.articles) ? payload.articles : []);
      } catch (error) {
        if (requestId === bossTeamRequestIdRef.current) {
          setBossTeamCandidates([]);
          setBossTeamError(error.message || 'Не удалось загрузить карты для боя.');
        }
      } finally {
        if (requestId === bossTeamRequestIdRef.current) {
          setIsBossTeamLoading(false);
        }
      }
    };

    loadBossTeamCandidates();
  }, [authToken, authUser, bossTeamSearchQuery]);

  useEffect(() => {
    if (!bossData) {
      setBossDisplayCard(null);
      return;
    }

    let isCancelled = false;

    const hydrateBossCard = async () => {
      const summary = await getCachedPageSummary(bossData.title);
      if (isCancelled) {
        return;
      }

      const card = {
        ...buildCardData(bossData, summary, rarityLevels),
        remainingHp: bossData.remainingHp,
        maxHp: bossData.maxHp,
        status: bossData.status
      };

      setBossDisplayCard(card);
    };

    hydrateBossCard();

    return () => {
      isCancelled = true;
    };
  }, [bossData, rarityLevels]);

  const getCachedPageSummary = async (title) => {
    const key = title.trim().toLowerCase();
    const cache = summaryCacheRef.current;

    if (!cache.has(key)) {
      const request = fetchPageSummary(title)
        .then((data) => {
          if (data) {
            cache.set(data.title.trim().toLowerCase(), Promise.resolve(data));
          } else {
            cache.delete(key);
          }

          return data;
        })
        .catch(() => {
          cache.delete(key);
          return null;
        });

      cache.set(key, request);
    }

    return cache.get(key);
  };

  const resetBossBattleState = () => {
    setBossBattleResult(null);
    setBossBattleError('');
  };

  const resetBossSelection = () => {
    setBossTeamSearchInput('');
    setBossTeamSearchQuery('');
    setBossTeamCandidates([]);
    setBossTeamError('');
    setSelectedBossTeam([]);
    setIsBossTeamLoading(false);
    resetBossBattleState();
  };

  const loadBoss = async () => {
    setIsBossLoading(true);
    setBossError('');

    try {
      const payload = await fetchCurrentBoss(authToken);

      if (payload.rarityLevels) {
        onRarityLevelsChange(payload.rarityLevels);
      }

      setBossData(payload.boss || null);
      setCardCooldowns(Array.isArray(payload.cardCooldowns) ? payload.cardCooldowns : []);
    } catch (error) {
      setBossError(error.message || 'Не удалось загрузить босса.');
      setCardCooldowns([]);
    } finally {
      setIsBossLoading(false);
    }
  };

  const addBossTeamMember = (article) => {
    resetBossBattleState();
    setSelectedBossTeam((current) => {
      if (current.some((item) => item.id === article.id) || current.length >= BOSS_TEAM_SIZE) {
        return current;
      }

      return [article, ...current];
    });
  };

  const removeBossTeamMember = (articleId) => {
    resetBossBattleState();
    setSelectedBossTeam((current) => current.filter((item) => item.id !== articleId));
  };

  const handleBossBattleSubmit = async () => {
    if (!authToken) {
      setBossBattleError('Войди в аккаунт, чтобы начать бой.');
      return;
    }

    if (selectedBossTeam.length !== BOSS_TEAM_SIZE) {
      setBossBattleError(`Собери команду из ${BOSS_TEAM_SIZE} карт, чтобы начать бой.`);
      return;
    }

    setIsBossBattleSubmitting(true);
    setBossBattleError('');
    setBossBattleResult(null);

    try {
      const payload = await submitBossBattle(
        selectedBossTeam.map((article) => article.id),
        authToken
      );

      if (payload.rarityLevels) {
        onRarityLevelsChange(payload.rarityLevels);
      }

      setBossData(payload.boss || null);
      setCardCooldowns(Array.isArray(payload.cardCooldowns) ? payload.cardCooldowns : []);
      setBossBattleResult(payload);
      setSelectedBossTeam([]);

      if (payload.outcome === 'victory') {
        onCollectionRefresh();
      }
    } catch (error) {
      setBossBattleError(error.message || 'Не удалось провести бой.');
    } finally {
      setIsBossBattleSubmitting(false);
    }
  };

  const selectedBossTeamIdSet = new Set(selectedBossTeam.map((article) => article.id));
  const selectedBossTeamOrder = new Map(selectedBossTeam.map((article, index) => [article.id, index]));
  const cooldownsByArticleId = new Map(
    cardCooldowns.map((cooldown) => [Number(cooldown.articleId), cooldown])
  );
  const isArticleCoolingDown = (articleId) => {
    const cooldown = cooldownsByArticleId.get(Number(articleId));

    if (!cooldown) {
      return false;
    }

    const availableAtMs = new Date(cooldown.availableAt).getTime();
    return Number.isFinite(availableAtMs) && availableAtMs > cooldownNow;
  };
  const bossTeamCandidatesPool = bossTeamCandidates.filter(
    (article) => !selectedBossTeamIdSet.has(article.id)
  );
  const orderedBossTeamCandidates = bossTeamCandidates
    .map((article, index) => ({ article, index }))
    .sort((left, right) => {
      const leftSelected = selectedBossTeamOrder.has(left.article.id);
      const rightSelected = selectedBossTeamOrder.has(right.article.id);

      if (leftSelected && rightSelected) {
        return selectedBossTeamOrder.get(left.article.id) - selectedBossTeamOrder.get(right.article.id);
      }

      if (leftSelected) {
        return -1;
      }

      if (rightSelected) {
        return 1;
      }

      const leftCoolingDown = isArticleCoolingDown(left.article.id);
      const rightCoolingDown = isArticleCoolingDown(right.article.id);

      if (leftCoolingDown !== rightCoolingDown) {
        return leftCoolingDown ? 1 : -1;
      }

      return left.index - right.index;
    })
    .map(({ article }) => article);
  const getCardCooldown = (articleId) => {
    const cooldown = cooldownsByArticleId.get(Number(articleId));

    if (!cooldown) {
      return null;
    }

    const availableAtMs = new Date(cooldown.availableAt).getTime();
    if (!Number.isFinite(availableAtMs) || availableAtMs <= cooldownNow) {
      return null;
    }

    return {
      ...cooldown,
      remainingMs: availableAtMs - cooldownNow
    };
  };
  const formatCooldownRemaining = (remainingMs) => {
    const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };
  const bossHpPercent = bossDisplayCard?.maxHp
    ? Math.max(0, Math.min(100, Math.round((bossDisplayCard.remainingHp / bossDisplayCard.maxHp) * 100)))
    : 0;
  const showDesktopLogTab = Boolean(bossBattleResult);

  if (isMobileViewport) {
    return (
      <BossMobileView
        authUser={authUser}
        rarityLevels={rarityLevels}
        bossError={bossError}
        isBossLoading={isBossLoading}
        bossDisplayCard={bossDisplayCard}
        bossHpPercent={bossHpPercent}
        selectedBossTeam={selectedBossTeam}
        bossTeamSearchInput={bossTeamSearchInput}
        onBossTeamSearchInputChange={(nextValue) => {
          setBossTeamSearchInput(nextValue);
          resetBossBattleState();
        }}
        isBossTeamLoading={isBossTeamLoading}
        bossTeamError={bossTeamError}
        bossTeamCandidatesPool={bossTeamCandidatesPool}
        bossBattleError={bossBattleError}
        bossBattleResult={bossBattleResult}
        isBossBattleSubmitting={isBossBattleSubmitting}
        addBossTeamMember={addBossTeamMember}
        removeBossTeamMember={removeBossTeamMember}
        getCardCooldown={getCardCooldown}
        formatCooldownRemaining={formatCooldownRemaining}
        handleBossBattleSubmit={handleBossBattleSubmit}
        loadBoss={loadBoss}
      />
    );
  }

  return (
    <section className="boss-screen">
      <div className="boss-screen-shell">
        <div className="boss-screen-header">
          <div>
            <div className="library-kicker">Рейд</div>
            <h2>Бой с боссом</h2>
          </div>
        </div>

        {bossError ? <div className="library-status error">{bossError}</div> : null}

        {isBossLoading ? (
          <div className="library-status">Загружаем текущего босса...</div>
        ) : bossDisplayCard ? (
          <>
            <div className="boss-status-bar">
              <div className="boss-status-copy">
                <strong>{bossDisplayCard.title}</strong>
                <span>
                  HP {formatFullNumber(bossDisplayCard.remainingHp)} / {formatFullNumber(bossDisplayCard.maxHp)}
                </span>
              </div>
              <div className="boss-hp-track">
                <div
                  className="boss-hp-fill"
                  style={{
                    width: `${bossHpPercent}%`,
                    background: bossDisplayCard.color
                  }}
                ></div>
              </div>
            </div>

            <div className="boss-layout">
              <div className="boss-card-column">
                <div className="card-showcase boss-showcase">
                  <Card card={bossDisplayCard} />
                  <CardStats card={bossDisplayCard} />
                </div>

                {authUser ? (
                  <div className="boss-primary-action">
                    <button
                      type="button"
                      className="auth-submit-btn boss-fight-btn"
                      onClick={handleBossBattleSubmit}
                      disabled={isBossBattleSubmitting}
                    >
                      {isBossBattleSubmitting
                        ? 'Идёт бой...'
                        : selectedBossTeam.length === BOSS_TEAM_SIZE
                          ? 'Начать бой'
                          : `Бой ${selectedBossTeam.length}/${BOSS_TEAM_SIZE}`}
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="boss-team-column">
                {!authUser ? (
                  <div className="library-status">Войди в аккаунт, чтобы выбрать 5 своих статей и начать бой.</div>
                ) : (
                  <>
                    <div className="boss-mobile-tabs boss-desktop-tabs" role="tablist" aria-label="Режимы рейда">
                      <button
                        type="button"
                        className={`boss-mobile-tab ${activeDesktopTab === 'team' ? 'active' : ''}`}
                        onClick={() => setActiveDesktopTab('team')}
                      >
                        Выбор карт
                      </button>
                      {showDesktopLogTab ? (
                        <button
                          type="button"
                          className={`boss-mobile-tab ${activeDesktopTab === 'log' ? 'active' : ''}`}
                          onClick={() => setActiveDesktopTab('log')}
                        >
                          Логи
                        </button>
                      ) : null}
                    </div>

                    {activeDesktopTab === 'team' ? (
                      <div className="boss-team-panel">
                        <div className="boss-team-top">
                          <div>
                            <div className="library-kicker">Твоя команда</div>
                            <h3>Выбери 5 карт</h3>
                          </div>
                          <div className="boss-team-count">
                            {selectedBossTeam.length}/{BOSS_TEAM_SIZE}
                          </div>
                        </div>

                        <div className="boss-team-body">
                          <label className="admin-panel-field boss-search-field">
                            <span>Поиск по своей коллекции</span>
                            <input
                              type="text"
                              value={bossTeamSearchInput}
                              onChange={(event) => {
                                setBossTeamSearchInput(event.target.value);
                                resetBossBattleState();
                              }}
                              placeholder="Название статьи"
                            />
                          </label>

                          <div className="admin-search-results boss-search-results">
                            {isBossTeamLoading ? (
                              <div className="auth-status">Ищем карты из твоей коллекции...</div>
                            ) : bossTeamError ? (
                              <div className="auth-error">{bossTeamError}</div>
                            ) : orderedBossTeamCandidates.length > 0 ? (
                              orderedBossTeamCandidates.map((article) => {
                                const rarity = resolveArticleRarity(article, rarityLevels);
                                const rarityData = rarityLevels[rarity];
                                const cardCooldown = getCardCooldown(article.id);
                                const isCoolingDown = Boolean(cardCooldown);
                                const isSelected = selectedBossTeamIdSet.has(article.id);
                                const isDisabled = !isSelected && (selectedBossTeam.length >= BOSS_TEAM_SIZE || isCoolingDown);

                                return (
                                  <button
                                    key={article.id}
                                    type="button"
                                    className={`admin-search-result ${isCoolingDown ? 'cooldown-active' : ''} ${isSelected ? 'selected' : ''}`}
                                    onClick={() => {
                                      if (isSelected) {
                                        removeBossTeamMember(article.id);
                                        return;
                                      }

                                      addBossTeamMember(article);
                                    }}
                                    disabled={isDisabled}
                                  >
                                    <div>
                                      <strong>{article.title}</strong>
                                      <span>{rarityData?.name || rarity}</span>
                                      {isSelected ? (
                                        <span className="boss-selected-note">Уже в команде</span>
                                      ) : isCoolingDown ? (
                                        <span className="boss-cooldown-note">
                                          Восстановление через {formatCooldownRemaining(cardCooldown.remainingMs)}
                                        </span>
                                      ) : null}
                                    </div>
                                    <em className={isCoolingDown ? 'boss-cooldown-timer' : ''}>
                                      {isSelected
                                        ? 'Убрать'
                                        : isCoolingDown
                                        ? formatCooldownRemaining(cardCooldown.remainingMs)
                                        : formatCompactNumber(article.viewCount)}
                                    </em>
                                  </button>
                                );
                              })
                            ) : (
                              <div className="auth-status">
                                {bossTeamSearchQuery
                                  ? 'Ничего не найдено в твоей коллекции.'
                                  : 'Открой паки и выбей хотя бы 5 уникальных карт.'}
                              </div>
                            )}
                          </div>
                        </div>

                        {bossBattleError ? <div className="auth-error">{bossBattleError}</div> : null}

                        {bossDisplayCard.status === 'defeated' ? (
                          <div className="boss-action-row">
                            <button type="button" className="library-more-btn" onClick={loadBoss}>
                              Новый босс
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : bossBattleResult ? (
                      <div className="boss-battle-log">
                        <div className="boss-battle-summary">
                          <strong>
                            {bossBattleResult.outcome === 'victory'
                              ? 'Босс побеждён'
                              : 'Команда пала'}
                          </strong>
                          <span>
                            {bossBattleResult.outcome === 'victory'
                              ? `Статья "${bossBattleResult.grantedArticle?.title}" добавлена в коллекцию.`
                              : `У босса осталось ${formatFullNumber(bossBattleResult.boss.remainingHp)} HP.`}
                          </span>
                        </div>

                        <div className="boss-rounds">
                          {bossBattleResult.rounds.map((round) => (
                            <div key={round.turn} className="boss-round">
                              <div className="boss-round-title">Ход {round.turn}</div>
                              <div className="boss-round-line">
                                Босс ударил карту "{round.bossAttack.targetTitle}" через {getStatLabel(round.bossAttack.statKey)}:
                                {` ${formatFullNumber(round.bossAttack.attackValue)} - ${formatFullNumber(round.bossAttack.defenseValue)} = ${formatFullNumber(round.bossAttack.damage)} урона.`}
                              </div>
                              {round.playerAttacks.map((attack) => (
                                <div key={`${round.turn}-${attack.articleId}`} className="boss-round-line">
                                  {attack.blocked
                                    ? `Босс заблокировал атаку карты "${attack.title}".`
                                    : attack.damage === 0
                                      ? `Карта "${attack.title}" атаковала через ${getStatLabel(attack.statKey)}, но не пробила защиту босса: ${formatFullNumber(attack.attackValue)} - ${formatFullNumber(attack.defenseValue)} = 0.`
                                      : `Карта "${attack.title}" ударила через ${getStatLabel(attack.statKey)} на ${formatFullNumber(attack.damage)} урона. У босса осталось ${formatFullNumber(attack.bossRemainingHp)} HP.`}
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}

export default BossView;
