import { formatNoteDate } from './format.js';

export function matchesOfStage(stage) {
  if (!stage) return [];
  if (stage.type === 'group') return (stage.groups || []).flatMap((group) => group.matches || []);
  if (stage.type === 'knockout') return (stage.rounds || []).flatMap((round) => round.matches || []);
  return [];
}

function allStages(event) {
  return [
    ...(event.stages || []),
    ...(event.categories || []).flatMap((category) => category.stages || []),
  ];
}

export function eventMatches(event) {
  return allStages(event).flatMap((stage) => matchesOfStage(stage));
}

export function eventStats(event) {
  const matches = eventMatches(event);
  const stages = allStages(event);
  const groups = stages
    .filter((stage) => stage.type === 'group')
    .flatMap((stage) => stage.groups || []);
  const rounds = stages
    .filter((stage) => stage.type === 'knockout')
    .flatMap((stage) => stage.rounds || []);
  const days = new Set(
    matches
      .map((match) => match.detail?.playedAt || formatNoteDate(match.detail?.note))
      .filter(Boolean),
  );
  const completed = matches.filter((match) => ['completed', 'draw'].includes(match.status));
  return {
    matches,
    matchCount: matches.length,
    completedCount: completed.length,
    dayCount: days.size,
    participantCount: (event.participants || []).length + (event.categories || []).reduce((sum, category) => sum + (category.participants || []).length, 0),
    groupCount: groups.length,
    roundCount: rounds.length,
    groupMatchCount: groups.flatMap((group) => group.matches || []).length,
    knockoutMatchCount: rounds.flatMap((round) => round.matches || []).length,
    days: Array.from(days).sort(),
  };
}

export function isFixedFourSet(matches) {
  const completed = matches.filter((match) => match.status !== 'bye');
  return completed.length > 0 && completed.every((match) => (match.detail?.sets || []).length === 4);
}

/**
 * 与旧版 calcGroupRanking 保持同一排序逻辑：
 * 胜场降序 → 负场升序 → 净胜局降序 → 净胜分降序 → 直接对战胜负 → 姓名。
 *
 * @param {Array<Record<string, any>>} matches
 * @param {Array<string>} memberNames
 * @param {Array<Record<string, any>>} participants
 */
export function calcGroupRanking(matches, memberNames, participants = [], format = null, options = {}) {
  const fixedFormat = format?.type === 'fixed';
  const advanceCount =
    options.advance === undefined || options.advance === null
      ? fixedFormat ? 1 : 2
      : Number(options.advance);
  const playerInfo = new Map(participants.map((participant) => [participant.name, participant]));
  const players = new Map();

  const ensure = (name) => {
    if (!players.has(name)) {
      players.set(name, {
        name,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        setsFor: 0,
        setsAgainst: 0,
        setDiff: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        pointDiff: 0,
        defaults: 0,
        direct: {},
        qualified: playerInfo.get(name)?.qualified || null,
      });
    }
    return players.get(name);
  };

  memberNames.forEach(ensure);

  matches.forEach((match) => {
    const [p1, p2] = match.players || [];
    if (!p1 || !p2) return;
    const player1 = ensure(p1);
    const player2 = ensure(p2);

    if (match.status === 'bye') {
      player1.wins += 1;
      player1.played += 1;
      player1.direct[p2] = 1;
      return;
    }

    // 弃赛：按 0–3 计入，对手得 1 胜 + 3 胜局，弃赛者得 1 负 + 0 胜局。
    if (match.status === 'default') {
      const retired =
        match.detail?.retired ||
        [p1, p2].find((name) => name !== match.winner) ||
        null;
      const opponent = retired === p1 ? p2 : p1;
      const loser = retired === p1 ? p1 : p2;
      const loserRow = ensure(loser);
      const winnerRow = ensure(opponent);
      const gamesWon = Number(match.score?.gamesWon) || 0;
      const gamesLost = Number(match.score?.gamesLost) || 0;
      const winnerGames = retired === p1 ? gamesLost : gamesWon;
      const loserGames = retired === p1 ? gamesWon : gamesLost;
      loserRow.played += 1;
      winnerRow.played += 1;
      loserRow.losses += 1;
      winnerRow.wins += 1;
      loserRow.defaults += 1;
      loserRow.setsFor += loserGames;
      loserRow.setsAgainst += winnerGames;
      winnerRow.setsFor += winnerGames;
      winnerRow.setsAgainst += loserGames;
      winnerRow.direct[loser] = (winnerRow.direct[loser] || 0) + 1;
      loserRow.setDiff = loserRow.setsFor - loserRow.setsAgainst;
      winnerRow.setDiff = winnerRow.setsFor - winnerRow.setsAgainst;
      return;
    }

    if (match.status !== 'completed' && match.status !== 'draw') return;

    const gamesWon = Number(match.score?.gamesWon) || 0;
    const gamesLost = Number(match.score?.gamesLost) || 0;
    const sets = match.detail?.sets || [];

    player1.played += 1;
    player2.played += 1;
    player1.setsFor += gamesWon;
    player1.setsAgainst += gamesLost;
    player2.setsFor += gamesLost;
    player2.setsAgainst += gamesWon;

    sets.forEach((set) => {
      const pointsWon = Number(set.pointsWon) || 0;
      const pointsLost = Number(set.pointsLost) || 0;
      player1.pointsFor += pointsWon;
      player1.pointsAgainst += pointsLost;
      player2.pointsFor += pointsLost;
      player2.pointsAgainst += pointsWon;
    });

    player1.setDiff = player1.setsFor - player1.setsAgainst;
    player2.setDiff = player2.setsFor - player2.setsAgainst;
    player1.pointDiff = player1.pointsFor - player1.pointsAgainst;
    player2.pointDiff = player2.pointsFor - player2.pointsAgainst;

    if (match.status === 'draw' || (!match.winner && gamesWon === gamesLost)) {
      player1.draws += 1;
      player2.draws += 1;
    } else if (match.winner === p1) {
      player1.wins += 1;
      player2.losses += 1;
    } else if (match.winner === p2) {
      player2.wins += 1;
      player1.losses += 1;
    }

    player1.direct[p2] = (player1.direct[p2] || 0) + (match.winner === p1 ? 1 : 0);
    player2.direct[p1] = (player2.direct[p1] || 0) + (match.winner === p2 ? 1 : 0);
  });

  const ranked = Array.from(players.values()).sort((a, b) => {
    // 弃赛场次少者优先，避免弃赛选手靠“少打”排到前面。
    if (a.defaults !== b.defaults) return a.defaults - b.defaults;
    if (fixedFormat) {
      if (b.setsFor !== a.setsFor) return b.setsFor - a.setsFor;
      if (a.setsAgainst !== b.setsAgainst) return a.setsAgainst - b.setsAgainst;
      const directA = a.direct[b.name] || 0;
      const directB = b.direct[a.name] || 0;
      if (directA !== directB) return directB - directA;
      if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;
      return a.name.localeCompare(b.name, 'zh-Hans-CN');
    }
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (a.losses !== b.losses) return a.losses - b.losses;
    if (b.setDiff !== a.setDiff) return b.setDiff - a.setDiff;
    if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;
    const directA = a.direct[b.name] || 0;
    const directB = b.direct[a.name] || 0;
    if (directA !== directB) return directB - directA;
    return a.name.localeCompare(b.name, 'zh-Hans-CN');
  });

  const MEDAL_LABELS = ['冠军', '亚军', '季军'];
  const medals = Number(options.medals) || 0;
  return ranked.map((player, index) => ({
    ...player,
    position: index + 1,
    qualified:
      player.qualified ||
      (medals > 0 && index < medals
        ? MEDAL_LABELS[index]
        : advanceCount > 0 && index < advanceCount
          ? '✓'
          : ''),
  }));
}

export function membersForGroup(matches, participants, groupName) {
  const names = new Set();
  matches.forEach((match) => {
    (match.players || []).forEach((name) => {
      if (name && name !== '轮空') names.add(name);
    });
  });
  participants.forEach((participant) => {
    if (participant.group === groupName) names.add(participant.name);
  });
  return Array.from(names).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
}

/** 附加循环等无 group 字段的小组：用参赛者或比赛对阵列兜底。 */
export function resolveGroupMembers(group, participants) {
  const byGroup = participants.filter((participant) => participant.group === group.name);
  if (byGroup.length) return byGroup.map((participant) => participant.name);
  const names = new Set();
  (group.matches || []).forEach((match) => {
    (match.players || []).forEach((name) => {
      if (name && name !== '轮空') names.add(name);
    });
  });
  return Array.from(names);
}

export function groupRows(event, group, format = null) {
  const participants = [
    ...(event.participants || []),
    ...(event.categories || []).flatMap((category) => category.participants || []),
  ];
  const members = membersForGroup(group.matches || [], participants, group.name);
  return calcGroupRanking(group.matches || [], members, participants, format, {
    advance: group.advance,
    medals: group.medals,
  });
}

export function matchDayLabel(match) {
  return match.detail?.playedAt || formatNoteDate(match.detail?.note) || '日期未记录';
}
