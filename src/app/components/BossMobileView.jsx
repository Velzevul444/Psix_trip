import React, { useEffect, useState } from 'react';
import { BOSS_TEAM_SIZE, STAT_LABELS } from '../constants';
import {
  calculateTotalPower,
  formatCompactNumber,
  formatFullNumber,
  getStatLabel,
  resolveArticleRarity
} from '../utils';

function BossMobileView({
  authUser,
  rarityLevels,
  bossError,
  isBossLoading,
  bossDisplayCard,
  bossHpPercent,
  selectedBossTeam,
  bossTeamSearchInput,
  onBossTeamSearchInputChange,
  isBossTeamLoading,
  bossTeamError,
  bossTeamCandidatesPool,
  bossBattleError,
  bossBattleResult,
  isBossBattleSubmitting,
  addBossTeamMember,
  removeBossTeamMember,
  getCardCooldown,
  formatCooldownRemaining,
  handleBossBattleSubmit,
  loadBoss
}) {
  const [activeTab, setActiveTab] = useState('raid');

  useEffect(() => {
    if (bossBattleResult) {
      setActiveTab('log');
    }
  }, [bossBattleResult]);

  useEffect(() => {
    if (!bossBattleResult && activeTab === 'log') {
      setActiveTab('raid');
    }
  }, [activeTab, bossBattleResult]);

  const showLogTab = Boolean(bossBattleResult);
  const bossTotalPower = bossDisplayCard ? calculateTotalPower(bossDisplayCard.stats) : 0;
  const selectedTeamSlots = Array.from({ length: BOSS_TEAM_SIZE }, (_, index) => selectedBossTeam[index] || null);
  const fightButtonLabel = isBossBattleSubmitting
    ? 'Идёт бой...'
    : selectedBossTeam.length === BOSS_TEAM_SIZE
      ? 'Начать бой'
      : `Бой ${selectedBossTeam.length}/${BOSS_TEAM_SIZE}`;

  const renderSelectedBossTeam = () => {
    return selectedTeamSlots.map((article, index) => {
      if (!article) {
        return (
          <div key={`slot-${index + 1}`} className="boss-mobile-slot boss-mobile-slot-empty">
            <span className="boss-mobile-slot-index">Слот {index + 1}</span>
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
          className="boss-mobile-slot boss-mobile-slot-filled"
          style={{ '--boss-slot-accent': rarityData?.color || '#f8f3ea' }}
          onClick={() => removeBossTeamMember(article.id)}
        >
          <span className="boss-mobile-slot-index">Слот {index + 1}</span>
          <strong>{article.title}</strong>
          <em>{rarityData?.name || rarity}</em>
          <i>Убрать</i>
        </button>
      );
    });
  };

  const renderBossCandidates = () => {
    if (isBossTeamLoading) {
      return <div className="auth-status">Ищем карты из твоей коллекции...</div>;
    }

    if (bossTeamError) {
      return <div className="auth-error">{bossTeamError}</div>;
    }

    if (bossTeamCandidatesPool.length === 0) {
      return (
        <div className="auth-status">
          {bossTeamSearchInput
            ? 'Ничего не найдено в твоей коллекции.'
            : 'Открой паки и выбей хотя бы 5 уникальных карт.'}
        </div>
      );
    }

    return bossTeamCandidatesPool.map((article) => {
      const rarity = resolveArticleRarity(article, rarityLevels);
      const rarityData = rarityLevels[rarity];
      const cardCooldown = getCardCooldown(article.id);
      const isCoolingDown = Boolean(cardCooldown);

      return (
        <button
          key={article.id}
          type="button"
          className={`admin-search-result boss-mobile-candidate ${isCoolingDown ? 'cooldown-active' : ''}`}
          style={{ '--boss-candidate-accent': rarityData?.color || '#c9a36a' }}
          onClick={() => addBossTeamMember(article)}
          disabled={selectedBossTeam.length >= BOSS_TEAM_SIZE || isCoolingDown}
        >
          <div className="boss-mobile-candidate-copy">
            <span className="boss-mobile-candidate-rarity">{rarityData?.name || rarity}</span>
            <strong>{article.title}</strong>
            {isCoolingDown ? (
              <span className="boss-cooldown-note">
                Восстановление через {formatCooldownRemaining(cardCooldown.remainingMs)}
              </span>
            ) : (
              <span className="boss-mobile-candidate-note">Нажми, чтобы добавить в команду</span>
            )}
          </div>
          <div className="boss-mobile-candidate-meta">
            <em className={isCoolingDown ? 'boss-cooldown-timer' : 'boss-mobile-candidate-action'}>
              {isCoolingDown ? formatCooldownRemaining(cardCooldown.remainingMs) : '+ В бой'}
            </em>
            <span>{formatCompactNumber(article.viewCount)} просмотров</span>
          </div>
        </button>
      );
    });
  };

  return (
    <section className="boss-screen boss-screen-mobile">
      <div className="boss-screen-shell boss-screen-shell-mobile">
        <div className="boss-screen-header boss-mobile-header">
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
            <div className="boss-mobile-tabs" role="tablist" aria-label="Режимы рейда">
              <button
                type="button"
                className={`boss-mobile-tab ${activeTab === 'raid' ? 'active' : ''}`}
                onClick={() => setActiveTab('raid')}
              >
                Рейд
              </button>
              {showLogTab ? (
                <button
                  type="button"
                  className={`boss-mobile-tab ${activeTab === 'log' ? 'active' : ''}`}
                  onClick={() => setActiveTab('log')}
                >
                  Лог
                </button>
              ) : null}
            </div>

            <div className="boss-mobile-stage">
              {activeTab === 'raid' ? (
                <div className="boss-mobile-pane boss-mobile-pane-raid">
                  <article className="boss-mobile-summary" style={{ '--boss-summary-accent': bossDisplayCard.color }}>
                    <div className="boss-mobile-summary-top">
                      <div className="boss-mobile-summary-art">
                        {bossDisplayCard.image ? (
                          <img src={bossDisplayCard.image} alt={bossDisplayCard.title} />
                        ) : (
                          <div className="boss-mobile-summary-fallback">BOSS</div>
                        )}
                      </div>

                      <div className="boss-mobile-summary-copy">
                        <div className="library-kicker">Цель рейда</div>
                        <strong>{bossDisplayCard.title}</strong>
                        <span className="boss-mobile-summary-rarity" style={{ color: bossDisplayCard.color }}>
                          {bossDisplayCard.name}
                        </span>
                        <p>{bossDisplayCard.extract}</p>
                      </div>
                    </div>

                    <div className="boss-mobile-summary-meter">
                      <div className="boss-mobile-summary-meter-head">
                        <span>
                          HP {formatFullNumber(bossDisplayCard.remainingHp)} / {formatFullNumber(bossDisplayCard.maxHp)}
                        </span>
                        <strong>{bossHpPercent}%</strong>
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

                    <div className="boss-mobile-stats">
                      {STAT_LABELS.map((stat) => (
                        <article key={stat.key} className="boss-mobile-stat">
                          <span>{stat.label}</span>
                          <strong>{formatFullNumber(bossDisplayCard.stats?.[stat.key] || 0)}</strong>
                        </article>
                      ))}
                    </div>

                    <div className="boss-mobile-summary-footer">
                      <div className="boss-mobile-power">
                        <span>Total Power</span>
                        <strong>{formatFullNumber(bossTotalPower)}</strong>
                      </div>

                      {bossDisplayCard.status === 'defeated' ? (
                        <button type="button" className="boss-mobile-refresh-btn" onClick={loadBoss}>
                          Новый босс
                        </button>
                      ) : null}
                    </div>
                  </article>

                  {authUser ? (
                    <div className="boss-mobile-team-flow">
                      <div className="boss-mobile-block boss-mobile-team-summary">
                        <div className="boss-mobile-block-head">
                          <div>
                            <div className="library-kicker">Твоя команда</div>
                            <strong className="boss-mobile-section-title">Собери 5 бойцов</strong>
                          </div>
                          <div className="boss-team-count">
                            {selectedBossTeam.length}/{BOSS_TEAM_SIZE}
                          </div>
                        </div>

                        <div className="boss-selected-team boss-selected-team-mobile">
                          {renderSelectedBossTeam()}
                        </div>
                      </div>

                      <div className="boss-mobile-block boss-mobile-candidates">
                        <div className="boss-mobile-block-head boss-mobile-block-head-stack">
                          <div>
                            <div className="library-kicker">Коллекция</div>
                            <strong className="boss-mobile-section-title">Добавь бойцов в рейд</strong>
                          </div>
                          <span className="boss-mobile-candidate-count">
                            {formatFullNumber(bossTeamCandidatesPool.length)} доступно
                          </span>
                        </div>

                        <label className="admin-panel-field boss-search-field">
                          <span>Поиск по своей коллекции</span>
                          <input
                            type="text"
                            value={bossTeamSearchInput}
                            onChange={(event) => onBossTeamSearchInputChange(event.target.value)}
                            placeholder="Название статьи"
                          />
                        </label>

                        <div className="admin-search-results boss-search-results boss-mobile-search-results">
                          {renderBossCandidates()}
                        </div>
                      </div>

                    </div>
                  ) : (
                    <div className="library-status">Войди в аккаунт, чтобы выбрать 5 своих статей и начать бой.</div>
                  )}
                </div>
              ) : bossBattleResult ? (
                <div className="boss-mobile-pane boss-mobile-pane-log">
                  <div className="boss-battle-log boss-battle-log-mobile">
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
                </div>
              ) : null}
            </div>

            {authUser ? (
              <div className="boss-mobile-footer">
                {bossBattleError ? <div className="auth-error boss-mobile-footer-error">{bossBattleError}</div> : null}

                <button
                  type="button"
                  className="auth-submit-btn boss-fight-btn"
                  onClick={handleBossBattleSubmit}
                  disabled={isBossBattleSubmitting}
                >
                  {fightButtonLabel}
                </button>

                {bossDisplayCard.status === 'defeated' ? (
                  <button type="button" className="library-more-btn" onClick={loadBoss}>
                    Новый босс
                  </button>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
}

export default BossMobileView;
