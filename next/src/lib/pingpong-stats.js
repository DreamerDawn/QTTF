/**
 * Derive table-tennis match statistics from a point log.
 *
 * The definitions intentionally mirror the standalone QTTF scorer:
 * - Biggest lead is the largest lead reached inside a game; match value is the max game value.
 * - Consecutive points never carry across games.
 * - Deficit / lead-against only apply to the winner of that game.
 *
 * @typedef {object} PointLogEntry
 * @property {number} game
 * @property {number} ball
 * @property {'A'|'B'} scorer
 * @property {'A'|'B'} serve
 * @property {{A: number, B: number}} scoreBefore
 * @property {{A: number, B: number}} scoreAfter
 * @property {boolean} [deuce]
 */

const OTHER = { A: 'B', B: 'A' };

function emptySide() {
  return { A: 0, B: 0 };
}

function newAcc() {
  return {
    points: emptySide(),
    maxLead: emptySide(),
    consWon: emptySide(),
    consLost: emptySide(),
    ownWon: emptySide(),
    ownLost: emptySide(),
    oppWon: emptySide(),
    oppLost: emptySide(),
    deficit: emptySide(),
    leadAgainst: emptySide(),
  };
}

function maxInto(target, source) {
  target.A = Math.max(target.A, source.A || 0);
  target.B = Math.max(target.B, source.B || 0);
}

function sortBalls(list) {
  return [...list].sort((a, b) => {
    if (a.game !== b.game) return a.game - b.game;
    return (a.ball || 0) - (b.ball || 0);
  });
}

function ballsOf(pointLog, gameNo) {
  return sortBalls((pointLog || []).filter((entry) => entry.game === gameNo));
}

function groupByGame(pointLog) {
  const map = new Map();
  (pointLog || []).forEach((entry) => {
    if (!map.has(entry.game)) map.set(entry.game, []);
    map.get(entry.game).push(entry);
  });
  for (const [game, balls] of map) map.set(game, sortBalls(balls));
  return map;
}

/**
 * @param {PointLogEntry[]} balls
 * @param {number} gameNo
 * @param {'A'|'B'|null} winner
 * @param {number} target
 */
export function analyzeGame(balls, gameNo, winner = null, target = 11) {
  const acc = newAcc();
  const ledger = [];
  const list = sortBalls(balls || []);
  let a = list[0]?.scoreBefore?.A ?? 0;
  let b = list[0]?.scoreBefore?.B ?? 0;
  let runSide = null;
  let run = 0;
  const states = [{ A: a, B: b }];

  list.forEach((entry, index) => {
    const scoreBefore = { A: a, B: b };
    const scorer = entry.scorer === 'B' ? 'B' : 'A';
    const serve = entry.serve === 'B' ? 'B' : 'A';

    acc.points[scorer] += 1;
    if (serve === scorer) {
      acc.ownWon[serve] += 1;
      acc.oppLost[OTHER[serve]] += 1;
    } else {
      acc.ownLost[serve] += 1;
      acc.oppWon[scorer] += 1;
    }

    if (runSide === scorer) run += 1;
    else {
      runSide = scorer;
      run = 1;
    }
    if (run > acc.consWon[scorer]) acc.consWon[scorer] = run;

    a += scorer === 'A' ? 1 : 0;
    b += scorer === 'B' ? 1 : 0;
    states.push({ A: a, B: b });

    ledger.push({
      n: index + 1,
      ball: entry.ball,
      serve,
      scorer,
      scoreBefore,
      scoreAfter: { A: a, B: b },
      cumA: a,
      cumB: b,
      deuce: Boolean(entry.deuce),
    });
  });

  states.forEach((state) => {
    const leadA = state.A - state.B;
    const leadB = state.B - state.A;
    if (leadA > acc.maxLead.A) acc.maxLead.A = leadA;
    if (leadB > acc.maxLead.B) acc.maxLead.B = leadB;
  });

  acc.consLost.A = acc.consWon.B;
  acc.consLost.B = acc.consWon.A;

  const deficit = emptySide();
  if (winner === 'A' || winner === 'B') {
    let maxBehind = 0;
    states.forEach((state) => {
      const behind = winner === 'A' ? state.B - state.A : state.A - state.B;
      if (behind > maxBehind) maxBehind = behind;
    });
    deficit[winner] = Math.max(0, maxBehind);
    acc.leadAgainst[winner] = Math.max(0, acc.maxLead[winner]);
  }

  return {
    game: gameNo,
    balls: list.length,
    points: { A: acc.points.A, B: acc.points.B },
    ledger,
    maxLead: acc.maxLead,
    consWon: acc.consWon,
    consLost: acc.consLost,
    ownWon: acc.ownWon,
    ownLost: acc.ownLost,
    oppWon: acc.oppWon,
    oppLost: acc.oppLost,
    deficit,
    leadAgainst: acc.leadAgainst,
    winner: winner || null,
    target,
  };
}

/**
 * @param {PointLogEntry[]} pointLog
 * @param {Record<number, 'A'|'B'>} gameWinners
 * @param {number} target
 */
export function analyzeMatch(pointLog, gameWinners = {}, target = 11) {
  const byGame = groupByGame(pointLog);
  const acc = newAcc();
  const games = [...byGame.keys()].sort((a, b) => a - b);
  const perGame = {};

  games.forEach((game) => {
    const analysis = analyzeGame(byGame.get(game), game, gameWinners[game] || null, target);
    perGame[game] = analysis;
    acc.points.A += analysis.points.A;
    acc.points.B += analysis.points.B;
    maxInto(acc.maxLead, analysis.maxLead);
    maxInto(acc.consWon, analysis.consWon);
    maxInto(acc.consLost, analysis.consLost);
    ['ownWon', 'ownLost', 'oppWon', 'oppLost'].forEach((key) => {
      acc[key].A += analysis[key].A;
      acc[key].B += analysis[key].B;
    });
    maxInto(acc.deficit, analysis.deficit);
    maxInto(acc.leadAgainst, analysis.leadAgainst);
  });

  return {
    ...acc,
    games,
    perGame,
    scope: 'match',
    game: null,
    ledger: [],
    target,
  };
}

export function computeStats(pointLog, gameNo, gameWinners = {}, target = 11) {
  if (!gameNo) return analyzeMatch(pointLog, gameWinners, target);
  const winner = gameWinners[gameNo] || null;
  return {
    ...analyzeGame(ballsOf(pointLog, gameNo), gameNo, winner, target),
    scope: 'game',
  };
}

export const STAT_ROWS = [
  { key: 'points', label: '总得分', hint: '该范围内双方总得分' },
  { key: 'maxLead', label: '最大领先', hint: '曾达到的最大领先分差；全场取各局最大值' },
  { key: 'ownWon', label: '发球轮得分', hint: '己方发球轮中得分' },
  { key: 'ownLost', label: '发球轮失分', hint: '己方发球轮中失分' },
  { key: 'oppWon', label: '接发球轮得分', hint: '对方发球轮中得分' },
  { key: 'oppLost', label: '接发球轮失分', hint: '对方发球轮中失分' },
  { key: 'consWon', label: '最大连续得分', hint: '连续得分最大值；全场取各局最大值，不跨局' },
  { key: 'consLost', label: '最大连续失分', hint: '连续失分最大值；全场取各局最大值，不跨局' },
  { key: 'deficit', label: '最大落后翻盘', hint: '仅单局胜方：曾落后的最大分差并最终获胜' },
  { key: 'leadAgainst', label: '最大领先优势', hint: '单局胜方在该局中曾建立的最大领先分差' },
];

export function statValue(stats, key, side) {
  if (!stats) return 0;
  const value = stats[key];
  if (value && typeof value === 'object') return value[side] ?? 0;
  return 0;
}
