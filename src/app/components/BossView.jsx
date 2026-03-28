import React, { useEffect, useRef, useState } from 'react';
import Card from '../../components/Card';
import CardStats from '../../components/CardStats';
import { fetchCurrentBoss, fetchMyArticlesPage, fetchPageSummary, submitBossBattle } from '../api';
import { BOSS_TEAM_SEARCH_LIMIT, BOSS_TEAM_SIZE } from '../constants';
import {
  buildCardData,
  formatCompactNumber,
  formatFullNumber,
  getStatLabel,
  resolveArticleRarity
} from '../utils';

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
  const [selectedBossTeam, setSelectedBossTeam] = useState([]);
  const [bossBattleResult, setBossBattleResult] = useState(null);
  const [bossBattleError, setBossBattleError] = useState('');
  const [isBossBattleSubmitting, setIsBossBattleSubmitting] = useState(false);
  const summaryCacheRef = useRef(new Map());
  const bossTeamRequestIdRef = useRef(0);

  useEffect(() => {
    loadBoss();
  }, [refreshToken]);

  useEffect(() => {
    if (!authUser) {
      resetBossSelection();
    }
  }, [authUser]);

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
      const payload = await fetchCurrentBoss();

      if (payload.rarityLevels) {
        onRarityLevelsChange(payload.rarityLevels);
      }

      setBossData(payload.boss || null);
    } catch (error) {
      setBossError(error.message || 'Не удалось загрузить босса.');
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

      return [...current, article];
    });
  };

  const removeBossTeamMember = (articleId) => {
    resetBossBattleState();
    setSelectedBossTeam((current) => current.filter((item) => item.id !== articleId));
  };

  const handleBossBattleSubmit = async () => {
    if (!authToken || selectedBossTeam.length !== BOSS_TEAM_SIZE) {
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
      setBossBattleResult(payload);

      if (payload.outcome === 'victory') {
        onCollectionRefresh();
      }
    } catch (error) {
      setBossBattleError(error.message || 'Не удалось провести бой.');
    } finally {
      setIsBossBattleSubmitting(false);
    }
  };

  const availableBossTeamCandidates = bossTeamCandidates.filter(
    (article) => !selectedBossTeam.some((selectedArticle) => selectedArticle.id === article.id)
  );
  const bossHpPercent = bossDisplayCard?.maxHp
    ? Math.max(0, Math.min(100, Math.round((bossDisplayCard.remainingHp / bossDisplayCard.maxHp) * 100)))
    : 0;

  return (
    <section className="boss-screen">
      <div className="boss-screen-shell">
        <div className="boss-screen-header">
          <div>
            <div className="library-kicker">Рейд</div>
            <h2>Бой с боссом</h2>
            <p>Босс выбирается случайно из божественных статей и сохраняет полученный урон между боями.</p>
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
              </div>

              <div className="boss-team-column">
                {!authUser ? (
                  <div className="library-status">Войди в аккаунт, чтобы выбрать 5 своих статей и начать бой.</div>
                ) : (
                  <>
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

                      <div className="boss-selected-team">
                        {selectedBossTeam.length > 0 ? (
                          selectedBossTeam.map((article) => {
                            const rarity = resolveArticleRarity(article, rarityLevels);
                            const rarityData = rarityLevels[rarity];

                            return (
                              <button
                                key={article.id}
                                type="button"
                                className="boss-selected-card"
                                onClick={() => removeBossTeamMember(article.id)}
                              >
                                <div>
                                  <strong>{article.title}</strong>
                                  <span style={{ color: rarityData?.color || '#fff' }}>
                                    {rarityData?.name || rarity}
                                  </span>
                                </div>
                                <em>Убрать</em>
                              </button>
                            );
                          })
                        ) : (
                          <div className="auth-status">Пока не выбрано ни одной карты.</div>
                        )}
                      </div>

                      <div className="admin-search-results boss-search-results">
                        {isBossTeamLoading ? (
                          <div className="auth-status">Ищем карты из твоей коллекции...</div>
                        ) : bossTeamError ? (
                          <div className="auth-error">{bossTeamError}</div>
                        ) : availableBossTeamCandidates.length > 0 ? (
                          availableBossTeamCandidates.map((article) => {
                            const rarity = resolveArticleRarity(article, rarityLevels);
                            const rarityData = rarityLevels[rarity];

                            return (
                              <button
                                key={article.id}
                                type="button"
                                className="admin-search-result"
                                onClick={() => addBossTeamMember(article)}
                                disabled={selectedBossTeam.length >= BOSS_TEAM_SIZE}
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
                          <div className="auth-status">
                            {bossTeamSearchQuery ? 'Ничего не найдено в твоей коллекции.' : 'Открой паки и выбей хотя бы 5 уникальных карт.'}
                          </div>
                        )}
                      </div>

                      {bossBattleError ? <div className="auth-error">{bossBattleError}</div> : null}

                      <div className="boss-action-row">
                        <button
                          type="button"
                          className="auth-submit-btn boss-fight-btn"
                          onClick={handleBossBattleSubmit}
                          disabled={isBossBattleSubmitting || selectedBossTeam.length !== BOSS_TEAM_SIZE}
                        >
                          {isBossBattleSubmitting ? 'Идёт бой...' : 'Бой'}
                        </button>

                        {bossDisplayCard.status === 'defeated' ? (
                          <button type="button" className="library-more-btn" onClick={loadBoss}>
                            Новый босс
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {bossBattleResult ? (
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
