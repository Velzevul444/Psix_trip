const ROLE_STAT_KEYS = ['stamina', 'strength', 'dexterity', 'intelligence', 'charisma'];
const MAGIC_STAT_KEYS = new Set(['intelligence', 'charisma']);
const STAT_LABELS = {
  stamina: 'ST',
  strength: 'STR',
  dexterity: 'DEX',
  intelligence: 'INT',
  charisma: 'CHA'
};
const DUEL_MARK_MULTIPLIER = 1.75;
const BOSS_MARK_MULTIPLIER = 1.5;
const FREEZE_MAGIC_MULTIPLIER = 1.3;
const BOSS_FREEZE_MAGIC_MULTIPLIER = 1.15;
const BOSS_DOT_MAX_PERCENT = 0.04;
const BARD_BUFF_MULTIPLIER = 1.25;
const BARD_BUFF_DURATION = 2;
const BARD_REVIVE_RATIO = 0.1;
const BARD_HEAL_RATIO = 0.7;
const TANK_INTERCEPT_CHANCE = 0.4;
const WARRIOR_DOUBLE_HIT_CHANCE = 0.25;
const WARRIOR_SPLASH_CHANCE = 0.2;
const WARRIOR_SPLASH_RATIO = 0.6;
const ROGUE_MARK_CHANCE = 0.25;
const ROGUE_POISON_CHANCE = 0.2;
const ROGUE_SLEEP_CHANCE = 0.15;
const ROGUE_POISON_TURNS = 5;
const ROGUE_POISON_RATIO = 0.05;
const ROGUE_SLEEP_TURNS = 1;
const MAGE_FREEZE_CHANCE = 0.25;
const MAGE_BURN_CHANCE = 0.25;
const MAGE_FREEZE_TURNS = 2;
const MAGE_BURN_TURNS = 5;
const MAGE_BURN_RATIO = 0.15;
const BARD_REVIVE_CHANCE = 0.25;
const MAX_BATTLE_TURNS = 400;

function toNumber(value) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : 0;
}

function roundValue(value) {
  return Math.max(0, Math.round(value));
}

function clampDamage(value) {
  return Math.max(1, roundValue(value));
}

function sample(list, randomFn) {
  if (!Array.isArray(list) || list.length === 0) {
    return null;
  }

  return list[Math.floor(randomFn() * list.length)];
}

function buildTeamsIndex(teams) {
  return new Map(teams.map((team) => [team.key, team]));
}

function getAliveActors(team) {
  return team.actors.filter((actor) => actor.currentHp > 0);
}

function getDeadActors(team) {
  return team.actors.filter((actor) => actor.currentHp <= 0);
}

function getMarkedTargets(team) {
  return getAliveActors(team).filter((actor) => actor.statuses.mark);
}

function createEmptyStatuses() {
  return {
    mark: null,
    poison: null,
    sleep: null,
    freeze: null,
    burn: null,
    primaryBuff: null
  };
}

function cloneStatuses(statuses) {
  return {
    mark: statuses.mark ? { ...statuses.mark } : null,
    poison: statuses.poison ? { ...statuses.poison } : null,
    sleep: statuses.sleep ? { ...statuses.sleep } : null,
    freeze: statuses.freeze ? { ...statuses.freeze } : null,
    burn: statuses.burn ? { ...statuses.burn } : null,
    primaryBuff: statuses.primaryBuff ? { ...statuses.primaryBuff } : null
  };
}

export function resolveCombatRole(stats) {
  let roleKey = ROLE_STAT_KEYS[0];
  let strongestValue = toNumber(stats?.[roleKey]);

  for (const key of ROLE_STAT_KEYS.slice(1)) {
    const value = toNumber(stats?.[key]);

    if (value > strongestValue) {
      strongestValue = value;
      roleKey = key;
    }
  }

  return {
    key: roleKey,
    statKey: roleKey
  };
}

export function createCombatActor(entity, teamKey, options = {}) {
  const role = options.role || resolveCombatRole(entity.stats);

  return {
    id: Number(entity.id),
    teamKey,
    title: entity.title,
    rarity: entity.rarity,
    stats: entity.stats,
    maxHp: Math.max(1, toNumber(entity.maxHp || entity.stats?.hp)),
    currentHp: Math.max(
      0,
      toNumber(
        entity.currentHp === undefined ? entity.remainingHp ?? entity.maxHp ?? entity.stats?.hp : entity.currentHp
      )
    ),
    roleKey: role.key,
    primaryStatKey: role.statKey,
    statuses: cloneStatuses(options.statuses || createEmptyStatuses()),
    reviveUsed: Boolean(options.reviveUsed),
    isBoss: Boolean(options.isBoss),
    userId: options.userId ? Number(options.userId) : null,
    username: options.username || null
  };
}

function getEffectiveStat(actor, statKey) {
  const baseValue = toNumber(actor.stats?.[statKey]);
  const primaryBuff = actor.statuses.primaryBuff;

  if (
    primaryBuff &&
    primaryBuff.statKey === statKey &&
    actor.currentHp > 0
  ) {
    return roundValue(baseValue * primaryBuff.multiplier);
  }

  return baseValue;
}

function getInitiativeValue(actor) {
  return {
    dexterity: getEffectiveStat(actor, 'dexterity'),
    stamina: getEffectiveStat(actor, 'stamina')
  };
}

function buildActorSummary(actor) {
  return {
    id: actor.id,
    title: actor.title,
    rarity: actor.rarity,
    stats: actor.stats,
    maxHp: actor.maxHp,
    remainingHp: actor.currentHp,
    defeated: actor.currentHp <= 0,
    roleKey: actor.roleKey,
    primaryStatKey: actor.primaryStatKey
  };
}

function serializeTeams(teams) {
  const serialized = {};

  for (const team of teams) {
    serialized[team.key] = team.actors.map((actor) => buildActorSummary(actor));
  }

  return serialized;
}

function decreaseStatusDuration(status) {
  if (!status) {
    return null;
  }

  return status.duration > 1 ? { ...status, duration: status.duration - 1 } : null;
}

function chooseSingleTarget(enemyTeam, randomFn) {
  const markedTargets = getMarkedTargets(enemyTeam);

  if (markedTargets.length > 0) {
    return sample(markedTargets, randomFn);
  }

  return sample(getAliveActors(enemyTeam), randomFn);
}

function chooseRandomAliveTarget(enemyTeam, randomFn) {
  return sample(getAliveActors(enemyTeam), randomFn);
}

function chooseTankInterceptor(target, teamsByKey, randomFn) {
  const team = teamsByKey.get(target.teamKey);

  if (!team || target.currentHp <= 0) {
    return null;
  }

  const tanks = getAliveActors(team).filter(
    (ally) => ally.id !== target.id && ally.roleKey === 'stamina'
  );

  if (tanks.length === 0) {
    return null;
  }

  const frontlineTank = tanks.sort(
    (left, right) => getEffectiveStat(right, 'stamina') - getEffectiveStat(left, 'stamina')
  )[0];

  return randomFn() < TANK_INTERCEPT_CHANCE ? frontlineTank : null;
}

function calculateDamage({ attackValue, defenseActor, statKey, attackType, damageMultiplier = 1 }) {
  const defenseValue = attackType === 'magic'
    ? getEffectiveStat(defenseActor, 'intelligence') * 0.45
    : getEffectiveStat(defenseActor, 'stamina') * 0.6;
  const rawDamage = attackValue * damageMultiplier - defenseValue;

  return {
    defenseValue: roundValue(defenseValue),
    damage: clampDamage(rawDamage)
  };
}

function applyDamage(target, damage) {
  target.currentHp = Math.max(0, target.currentHp - damage);
}

function formatHpLine(actor) {
  return `"${actor.title}" осталось ${actor.currentHp} HP.`;
}

function addTurnLine(turn, line) {
  turn.lines.push(line);
}

function getStatLabel(statKey) {
  return STAT_LABELS[statKey] || statKey.toUpperCase();
}

function buildTurn(index, actor, options = {}) {
  return {
    turn: index,
    actorId: actor.id,
    actorTitle: actor.title,
    actorRole: actor.roleKey,
    actorUsername: actor.username,
    kind: options.kind || 'action',
    lines: []
  };
}

function consumeDots(actor, turn, battleMode) {
  const dotStatuses = [
    { key: 'poison', label: 'Яд' },
    { key: 'burn', label: 'Поджог' }
  ];

  for (const descriptor of dotStatuses) {
    const effect = actor.statuses[descriptor.key];

    if (!effect || actor.currentHp <= 0) {
      continue;
    }

    const baseDamage =
      descriptor.key === 'poison'
        ? roundValue(actor.maxHp * effect.ratio)
        : roundValue(effect.damage);
    const damageCap =
      actor.isBoss && battleMode === 'boss'
        ? roundValue(actor.maxHp * BOSS_DOT_MAX_PERCENT)
        : baseDamage;
    const damage = Math.max(1, Math.min(baseDamage, damageCap));

    applyDamage(actor, damage);
    addTurnLine(
      turn,
      `${descriptor.label} наносит "${actor.title}" ${damage} урона. ${formatHpLine(actor)}`
    );
  }
}

function resolveControlEffects(actor, turn, battleMode, randomFn) {
  const sleep = actor.statuses.sleep;

  if (sleep) {
    addTurnLine(turn, `"${actor.title}" спит и пропускает ход.`);
    actor.statuses.sleep = decreaseStatusDuration(sleep);
    return true;
  }

  const freeze = actor.statuses.freeze;

  if (!freeze) {
    return false;
  }

  if (actor.isBoss && battleMode === 'boss') {
    addTurnLine(turn, `"${actor.title}" под заморозкой: по нему проходит усиленный магический урон.`);
    return false;
  }

  if (randomFn() < freeze.skipChance) {
    addTurnLine(turn, `"${actor.title}" заморожен и не успевает сделать ход.`);
    return true;
  }

  addTurnLine(turn, `"${actor.title}" преодолел заморозку и всё же действует.`);
  return false;
}

function tickEndOfTurnStatuses(actor) {
  actor.statuses.mark = decreaseStatusDuration(actor.statuses.mark);
  actor.statuses.poison = decreaseStatusDuration(actor.statuses.poison);
  actor.statuses.freeze = decreaseStatusDuration(actor.statuses.freeze);
  actor.statuses.burn = decreaseStatusDuration(actor.statuses.burn);
  actor.statuses.primaryBuff = decreaseStatusDuration(actor.statuses.primaryBuff);
}

function maybeApplyTankDefense(target, teamsByKey, randomFn, turn, options = {}) {
  if (!options.allowIntercept) {
    return {
      finalTarget: target,
      damageMultiplier: 1
    };
  }

  const interceptor = chooseTankInterceptor(target, teamsByKey, randomFn);

  if (!interceptor) {
    return {
      finalTarget: target,
      damageMultiplier: 1
    };
  }

  addTurnLine(
    turn,
    `Танк "${interceptor.title}" перехватывает удар, который шёл в "${target.title}".`
  );

  return {
    finalTarget: interceptor,
    damageMultiplier: 1
  };
}

function applyMarkedDamageMultiplier(target, battleMode, options = {}) {
  if (!options.isDirect) {
    return 1;
  }

  if (!target.statuses.mark) {
    return 1;
  }

  if (target.isBoss && battleMode === 'boss') {
    return BOSS_MARK_MULTIPLIER;
  }

  return DUEL_MARK_MULTIPLIER;
}

function applyFreezeMagicMultiplier(target, battleMode, attackType) {
  if (attackType !== 'magic' || !target.statuses.freeze) {
    return 1;
  }

  if (target.isBoss && battleMode === 'boss') {
    return BOSS_FREEZE_MAGIC_MULTIPLIER;
  }

  return FREEZE_MAGIC_MULTIPLIER;
}

function executeDirectAttack({
  actor,
  target,
  turn,
  teamsByKey,
  randomFn,
  battleMode,
  statKey,
  attackType,
  attackLabel,
  damageMultiplier = 1,
  allowIntercept = true,
  isDirect = true
}) {
  if (!target || target.currentHp <= 0) {
    return null;
  }

  const defenseResolution = maybeApplyTankDefense(target, teamsByKey, randomFn, turn, {
    allowIntercept: allowIntercept && isDirect
  });
  const finalTarget = defenseResolution.finalTarget;
  const totalMultiplier =
    damageMultiplier *
    defenseResolution.damageMultiplier *
    applyMarkedDamageMultiplier(finalTarget, battleMode, { isDirect }) *
    applyFreezeMagicMultiplier(finalTarget, battleMode, attackType);
  const attackValue = getEffectiveStat(actor, statKey);
  const { defenseValue, damage } = calculateDamage({
    attackValue,
    defenseActor: finalTarget,
    statKey,
    attackType,
    damageMultiplier: totalMultiplier
  });

  applyDamage(finalTarget, damage);

  addTurnLine(
    turn,
    `${attackLabel} "${finalTarget.title}" через ${getStatLabel(statKey)}: ${attackValue} - ${defenseValue} = ${damage}. ${formatHpLine(finalTarget)}`
  );

  if (finalTarget.currentHp <= 0) {
    addTurnLine(turn, `"${finalTarget.title}" падает.`);
  }

  return {
    target: finalTarget,
    attackValue,
    defenseValue,
    damage
  };
}

function applyMark(actor, target, turn, battleMode) {
  target.statuses.mark = {
    duration: 2
  };
  addTurnLine(
    turn,
    `"${actor.title}" помечает "${target.title}". Одиночные атаки по цели усиливаются.`
  );

  if (target.isBoss && battleMode === 'boss') {
    addTurnLine(turn, 'На боссе метка даёт ослабленный бонус к урону.');
  }
}

function applyPoison(actor, target, turn, battleMode) {
  target.statuses.poison = {
    duration: ROGUE_POISON_TURNS,
    ratio: ROGUE_POISON_RATIO
  };
  addTurnLine(turn, `"${actor.title}" отравляет "${target.title}" на ${ROGUE_POISON_TURNS} ходов.`);

  if (target.isBoss && battleMode === 'boss') {
    addTurnLine(turn, 'На боссе урон от яда ограничен 4% максимального HP за ход.');
  }
}

function applySleep(actor, target, turn, battleMode) {
  if (target.isBoss && battleMode === 'boss') {
    addTurnLine(turn, `"${actor.title}" пытается усыпить босса, но тот игнорирует сон.`);
    return;
  }

  target.statuses.sleep = {
    duration: ROGUE_SLEEP_TURNS
  };
  addTurnLine(turn, `"${actor.title}" усыпляет "${target.title}" на 1 ход.`);
}

function applyFreeze(actor, target, turn, battleMode) {
  target.statuses.freeze = {
    duration: MAGE_FREEZE_TURNS,
    skipChance: 0.5
  };

  if (target.isBoss && battleMode === 'boss') {
    addTurnLine(
      turn,
      `"${actor.title}" замораживает босса: ходы он не пропустит, но будет получать больше магического урона.`
    );
    return;
  }

  addTurnLine(turn, `"${actor.title}" накладывает заморозку на "${target.title}" на ${MAGE_FREEZE_TURNS} хода.`);
}

function applyBurn(actor, target, turn, battleMode) {
  const damage = Math.max(1, roundValue(getEffectiveStat(actor, 'intelligence') * MAGE_BURN_RATIO));
  target.statuses.burn = {
    duration: MAGE_BURN_TURNS,
    damage
  };
  addTurnLine(turn, `"${actor.title}" поджигает "${target.title}" на ${MAGE_BURN_TURNS} ходов.`);

  if (target.isBoss && battleMode === 'boss') {
    addTurnLine(turn, 'На боссе урон от горения ограничен 4% максимального HP за ход.');
  }
}

function runTankTurn(context) {
  const { actor, enemyTeam, turn, teamsByKey, randomFn, battleMode } = context;
  const target = chooseSingleTarget(enemyTeam, randomFn);

  if (!target) {
    return;
  }

  executeDirectAttack({
    actor,
    target,
    turn,
    teamsByKey,
    randomFn,
    battleMode,
    statKey: 'stamina',
    attackType: 'physical',
    attackLabel: `"${actor.title}" бьёт`
  });
}

function runWarriorTurn(context) {
  const { actor, enemyTeam, turn, teamsByKey, randomFn, battleMode } = context;
  let target = chooseSingleTarget(enemyTeam, randomFn);

  if (!target) {
    return;
  }

  executeDirectAttack({
    actor,
    target,
    turn,
    teamsByKey,
    randomFn,
    battleMode,
    statKey: 'strength',
    attackType: 'physical',
    attackLabel: `"${actor.title}" атакует`
  });

  if (randomFn() < WARRIOR_DOUBLE_HIT_CHANCE) {
    target = target.currentHp > 0 ? target : chooseSingleTarget(enemyTeam, randomFn);

    if (target) {
      addTurnLine(turn, `"${actor.title}" получает шанс на второй удар.`);
      executeDirectAttack({
        actor,
        target,
        turn,
        teamsByKey,
        randomFn,
        battleMode,
        statKey: 'strength',
        attackType: 'physical',
        attackLabel: `Второй удар "${actor.title}" достаёт`
      });
    }
  }

  if (randomFn() < WARRIOR_SPLASH_CHANCE) {
    const splashTargets = getAliveActors(enemyTeam)
      .sort(() => randomFn() - 0.5)
      .slice(0, 2);

    if (splashTargets.length > 0) {
      addTurnLine(turn, `"${actor.title}" размахивается сплэш-ударом по соседним целям.`);
    }

    for (const splashTarget of splashTargets) {
      executeDirectAttack({
        actor,
        target: splashTarget,
        turn,
        teamsByKey,
        randomFn,
        battleMode,
        statKey: 'strength',
        attackType: 'physical',
        attackLabel: `Сплэш "${actor.title}" цепляет`,
        damageMultiplier: WARRIOR_SPLASH_RATIO,
        allowIntercept: false,
        isDirect: false
      });
    }
  }
}

function runRogueTurn(context) {
  const { actor, enemyTeam, turn, randomFn, battleMode } = context;
  const roll = randomFn();
  const randomTarget = chooseRandomAliveTarget(enemyTeam, randomFn);

  if (!randomTarget) {
    return;
  }

  if (roll < ROGUE_MARK_CHANCE) {
    applyMark(actor, randomTarget, turn, battleMode);
    return;
  }

  if (roll < ROGUE_MARK_CHANCE + ROGUE_POISON_CHANCE) {
    applyPoison(actor, randomTarget, turn, battleMode);
    return;
  }

  if (roll < ROGUE_MARK_CHANCE + ROGUE_POISON_CHANCE + ROGUE_SLEEP_CHANCE) {
    applySleep(actor, randomTarget, turn, battleMode);
    return;
  }

  applyMark(actor, randomTarget, turn, battleMode);
}

function runMageTurn(context) {
  const { actor, enemyTeam, turn, randomFn, battleMode } = context;
  const roll = randomFn();
  const randomTarget = chooseRandomAliveTarget(enemyTeam, randomFn);

  if (!randomTarget) {
    return;
  }

  if (roll < MAGE_FREEZE_CHANCE) {
    applyFreeze(actor, randomTarget, turn, battleMode);
    return;
  }

  if (roll < MAGE_FREEZE_CHANCE + MAGE_BURN_CHANCE) {
    applyBurn(actor, randomTarget, turn, battleMode);
    return;
  }

  applyFreeze(actor, randomTarget, turn, battleMode);
}

function findLowestHealthAlly(team) {
  return getAliveActors(team).reduce((lowestActor, currentActor) => {
    const currentRatio = currentActor.currentHp / currentActor.maxHp;
    const lowestRatio = lowestActor ? lowestActor.currentHp / lowestActor.maxHp : Number.POSITIVE_INFINITY;
    return currentRatio < lowestRatio ? currentActor : lowestActor;
  }, null);
}

function runBardTurn(context) {
  const { actor, ownTeam, turn, randomFn } = context;
  const deadAllies = getDeadActors(ownTeam).filter((ally) => ally.id !== actor.id);

  if (!actor.reviveUsed && deadAllies.length > 0 && randomFn() < BARD_REVIVE_CHANCE) {
    const reviveTarget = sample(deadAllies, randomFn);
    const restoredHp = Math.max(1, roundValue(reviveTarget.maxHp * BARD_REVIVE_RATIO));
    reviveTarget.currentHp = restoredHp;
    reviveTarget.statuses = createEmptyStatuses();
    actor.reviveUsed = true;
    addTurnLine(
      turn,
      `"${actor.title}" поднимает "${reviveTarget.title}" и возвращает его в бой с ${restoredHp} HP.`
    );
    return;
  }

  const lowestAlly = findLowestHealthAlly(ownTeam);

  if (lowestAlly && lowestAlly.currentHp / lowestAlly.maxHp < 0.7) {
    const healValue = Math.max(1, roundValue(getEffectiveStat(actor, 'charisma') * BARD_HEAL_RATIO));
    lowestAlly.currentHp = Math.min(lowestAlly.maxHp, lowestAlly.currentHp + healValue);
    addTurnLine(
      turn,
    `"${actor.title}" поддерживает "${lowestAlly.title}" и восстанавливает ${healValue} HP. ${formatHpLine(lowestAlly)}`
  );
    return;
  }

  const aliveAllies = getAliveActors(ownTeam);
  const buffTarget = sample(aliveAllies, randomFn);

  if (!buffTarget) {
    return;
  }

  buffTarget.statuses.primaryBuff = {
    duration: BARD_BUFF_DURATION,
    multiplier: BARD_BUFF_MULTIPLIER,
    statKey: buffTarget.primaryStatKey
  };
  addTurnLine(
    turn,
    `"${actor.title}" усиливает "${buffTarget.title}" и поднимает ${getStatLabel(buffTarget.primaryStatKey)} на 25% на ${BARD_BUFF_DURATION} хода.`
  );
}

function runBossTurn(context) {
  const { actor, enemyTeam, turn, teamsByKey, randomFn, battleMode } = context;
  const target = chooseRandomAliveTarget(enemyTeam, randomFn);

  if (!target) {
    return;
  }

  const attackStatKey = actor.primaryStatKey;

  executeDirectAttack({
    actor,
    target,
    turn,
    teamsByKey,
    randomFn,
    battleMode,
    statKey: attackStatKey,
    attackType: MAGIC_STAT_KEYS.has(attackStatKey) ? 'magic' : 'physical',
    attackLabel: `Босс "${actor.title}" обрушивает удар на`
  });
}

function runActorTurn(context) {
  const { actor } = context;

  if (actor.isBoss) {
    runBossTurn(context);
    return;
  }

  switch (actor.roleKey) {
    case 'stamina':
      runTankTurn(context);
      break;
    case 'strength':
      runWarriorTurn(context);
      break;
    case 'dexterity':
      runRogueTurn(context);
      break;
    case 'intelligence':
      runMageTurn(context);
      break;
    case 'charisma':
      runBardTurn(context);
      break;
    default:
      runTankTurn(context);
      break;
  }
}

function getWinnerTeam(teams) {
  const aliveTeams = teams.filter((team) => getAliveActors(team).length > 0);

  if (aliveTeams.length === 1) {
    return aliveTeams[0];
  }

  return teams
    .map((team) => ({
      team,
      totalHp: team.actors.reduce((sum, actor) => sum + actor.currentHp, 0)
    }))
    .sort((left, right) => right.totalHp - left.totalHp)[0]?.team || null;
}

function buildInitiativeOrder(teams, randomFn) {
  return teams
    .flatMap((team) => getAliveActors(team))
    .map((actor) => ({
      actor,
      initiative: getInitiativeValue(actor),
      tieBreaker: randomFn()
    }))
    .sort((left, right) => {
      if (right.initiative.dexterity !== left.initiative.dexterity) {
        return right.initiative.dexterity - left.initiative.dexterity;
      }

      if (right.initiative.stamina !== left.initiative.stamina) {
        return right.initiative.stamina - left.initiative.stamina;
      }

      return right.tieBreaker - left.tieBreaker;
    })
    .map((entry) => entry.actor);
}

function buildTeam(key, actors, options = {}) {
  return {
    key,
    userId: options.userId ? Number(options.userId) : null,
    username: options.username || null,
    actors: actors.map((actor) =>
      createCombatActor(actor, key, {
        userId: options.userId,
        username: options.username,
        isBoss: options.isBoss
      })
    )
  };
}

export function simulateRoleBattle({ teams: rawTeams, battleMode = 'duel', randomFn = Math.random }) {
  const teams = rawTeams.map((team) =>
    buildTeam(team.key, team.actors, {
      userId: team.userId,
      username: team.username,
      isBoss: team.isBoss
    })
  );
  const teamsByKey = buildTeamsIndex(teams);
  const turns = [];
  let turnIndex = 1;

  while (
    teams.filter((team) => getAliveActors(team).length > 0).length > 1 &&
    turnIndex <= MAX_BATTLE_TURNS
  ) {
    const initiativeOrder = buildInitiativeOrder(teams, randomFn);

    for (const actor of initiativeOrder) {
      if (actor.currentHp <= 0) {
        continue;
      }

      const ownTeam = teamsByKey.get(actor.teamKey);
      const enemyTeams = teams.filter((team) => team.key !== actor.teamKey && getAliveActors(team).length > 0);

      if (!ownTeam || enemyTeams.length === 0) {
        continue;
      }

      const enemyTeam = enemyTeams[0];
      const turn = buildTurn(turnIndex, actor, {
        kind: actor.isBoss ? 'boss' : 'action'
      });

      consumeDots(actor, turn, battleMode);

      if (actor.currentHp <= 0) {
        addTurnLine(turn, `"${actor.title}" не переживает эффекты начала хода.`);
        tickEndOfTurnStatuses(actor);
        turns.push(turn);
        turnIndex += 1;
        if (teams.filter((team) => getAliveActors(team).length > 0).length <= 1) {
          break;
        }
        continue;
      }

      const shouldSkipTurn = resolveControlEffects(actor, turn, battleMode, randomFn);

      if (!shouldSkipTurn) {
        runActorTurn({
          actor,
          ownTeam,
          enemyTeam,
          teamsByKey,
          randomFn,
          battleMode,
          turn
        });
      }

      tickEndOfTurnStatuses(actor);
      turns.push(turn);
      turnIndex += 1;

      if (teams.filter((team) => getAliveActors(team).length > 0).length <= 1) {
        break;
      }
    }
  }

  const winnerTeam = getWinnerTeam(teams);

  return {
    winnerTeamKey: winnerTeam?.key || null,
    turns,
    teams: serializeTeams(teams)
  };
}
