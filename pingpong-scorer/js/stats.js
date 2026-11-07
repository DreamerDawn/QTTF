/*!
 * stats.js —— 由逐球记录重放计算全部统计口径（不手工维护任何计数）
 *
 * 逐球记录 entry：
 *   { t, game, ball, serve: 'A'|'B', scorer: 'A'|'B',
 *     serverPlayer, receiverPlayer, scoreBefore: {A,B}, deuce: bool }
 *
 * 口径（与页面“规则说明”一致）：
 *   Points won / Biggest lead / 发球四项 / Most consecutive won-lost /
 *   Greatest deficit overcome（仅单局胜方，负方 0，未落后记 0）
 *   Greatest lead against（默认定义 = 单局胜方在该局中曾建立的最大领先分差，负方 0）
 *   全场：Points 求和；Biggest lead 与 consecutive 取各局单局最大值（不跨局）；Greatest 类取各局胜方值最大值。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PPStats = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var OTHER = { A: 'B', B: 'A' };

  function emptySide() { return { A: 0, B: 0 }; }
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
      leadAgainst: emptySide()
    };
  }
  function maxInto(target, src) {
    target.A = Math.max(target.A, src.A || 0);
    target.B = Math.max(target.B, src.B || 0);
  }

  function sortBalls(list) {
    return list.slice().sort(function (x, y) {
      if (x.game !== y.game) return x.game - y.game;
      if ((x.t || 0) !== (y.t || 0)) return (x.t || 0) - (y.t || 0);
      return (x.ball || 0) - (y.ball || 0);
    });
  }

  function ballsOf(entries, gameNo) {
    return sortBalls((entries || []).filter(function (e) { return e.game === gameNo; }));
  }

  function groupByGame(entries) {
    var map = {};
    (entries || []).forEach(function (e) {
      if (!map[e.game]) map[e.game] = [];
      map[e.game].push(e);
    });
    Object.keys(map).forEach(function (k) { map[k] = sortBalls(map[k]); });
    return map;
  }

  /* 单局逐球重放：返回该局账本与全部单局统计 */
  function analyzeGame(cfg, balls, gameNo, winner) {
    var acc = newAcc();
    var ledger = [];
    var list = sortBalls(balls || []);
    var A = 0, B = 0;
    var runSide = null, run = 0;
    var states = [];

    /* 起点比分取第一球的 scoreBefore（正常为 0:0） */
    if (list.length && list[0].scoreBefore) {
      A = isFinite(list[0].scoreBefore.A) ? list[0].scoreBefore.A : 0;
      B = isFinite(list[0].scoreBefore.B) ? list[0].scoreBefore.B : 0;
    }
    states.push({ A: A, B: B });

    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      var sb = { A: A, B: B };
      var sc = e.scorer === 'B' ? 'B' : 'A';
      var sv = e.serve === 'B' ? 'B' : 'A';

      acc.points[sc] += 1;
      if (sv === sc) {
        /* 发球方=得分方：己方发球轮得分；对方在己方发球轮失分 */
        acc.ownWon[sv] += 1;
        acc.oppLost[OTHER[sv]] += 1;
      } else {
        /* 发球方≠得分方：发球方在己方发球轮失分；得分方在对方发球轮得分 */
        acc.ownLost[sv] += 1;
        acc.oppWon[sc] += 1;
      }

      if (runSide === sc) run += 1; else { runSide = sc; run = 1; }
      if (run > acc.consWon[sc]) acc.consWon[sc] = run;

      A += (sc === 'A' ? 1 : 0);
      B += (sc === 'B' ? 1 : 0);
      states.push({ A: A, B: B });

      ledger.push({
        n: i + 1,
        ball: e.ball,
        serve: sv,
        scorer: sc,
        serverPlayer: e.serverPlayer || null,
        receiverPlayer: e.receiverPlayer || null,
        t: e.t,
        scoreBefore: sb,
        scoreAfter: { A: A, B: B },
        cumA: A,
        cumB: B
      });
    }

    /* Biggest lead：包含每球之后的比分状态（含该局最终比分） */
    states.forEach(function (s) {
      var la = s.A - s.B, lb = s.B - s.A;
      if (la > acc.maxLead.A) acc.maxLead.A = la;
      if (lb > acc.maxLead.B) acc.maxLead.B = lb;
    });

    /* consWon 的镜像即对方 consLost，保证两口径严格一致 */
    acc.consLost.A = acc.consWon.B;
    acc.consLost.B = acc.consWon.A;

    /* Greatest deficit overcome / Greatest lead against：仅最终胜方，负方 0 */
    var deficit = emptySide();
    if (winner === 'A' || winner === 'B') {
      var maxBehind = 0;
      states.forEach(function (s) {
        var behind = winner === 'A' ? (s.B - s.A) : (s.A - s.B);
        if (behind > maxBehind) maxBehind = behind;
      });
      deficit[winner] = Math.max(0, maxBehind);
      acc.leadAgainst[winner] = Math.max(0, acc.maxLead[winner]);
    }

    return {
      game: gameNo,
      balls: list.length,
      points: { A: acc.points.A, B: acc.points.B },
      ledger: ledger,
      maxLead: acc.maxLead,
      consWon: acc.consWon,
      consLost: acc.consLost,
      ownWon: acc.ownWon,
      ownLost: acc.ownLost,
      oppWon: acc.oppWon,
      oppLost: acc.oppLost,
      deficit: deficit,
      leadAgainst: acc.leadAgainst,
      winner: winner || null
    };
  }

  /* 全场：各局聚合（Biggest lead / consecutive 取单局最大值，不跨局） */
  function analyzeMatch(cfg, entries, gameWinners) {
    var byGame = groupByGame(entries);
    var acc = newAcc();
    var games = Object.keys(byGame).map(Number).sort(function (a, b) { return a - b; });
    var perGame = {};

    games.forEach(function (g) {
      var w = gameWinners ? gameWinners[g] || null : null;
      var an = analyzeGame(cfg, byGame[g], g, w);
      perGame[g] = an;
      acc.points.A += an.points.A; acc.points.B += an.points.B;
      maxInto(acc.maxLead, an.maxLead);
      maxInto(acc.consWon, an.consWon);
      maxInto(acc.consLost, an.consLost);
      ['ownWon', 'ownLost', 'oppWon', 'oppLost'].forEach(function (k) {
        acc[k].A += an[k].A; acc[k].B += an[k].B;
      });
      maxInto(acc.deficit, an.deficit);
      maxInto(acc.leadAgainst, an.leadAgainst);
    });

    acc.games = games;
    acc.perGame = perGame;
    return acc;
  }

  /* 统一入口：gameNo 为 null/0 时返回全场（含 perGame 供图表用） */
  function compute(cfg, entries, gameNo, gameWinners) {
    if (!gameNo) {
      var m = analyzeMatch(cfg, entries, gameWinners);
      m.scope = 'match';
      m.game = null;
      m.ledger = [];
      return m;
    }
    var balls = ballsOf(entries, gameNo);
    var w = gameWinners ? gameWinners[gameNo] || null : null;
    var g = analyzeGame(cfg, balls, gameNo, w);
    g.scope = 'game';
    return g;
  }

  /* 表格行定义（顺序即 UI 顺序） */
  var ROWS = [
    { key: 'points', label: 'Points won', hint: '该范围内该方总得分' },
    { key: 'maxLead', label: 'Biggest lead', hint: '曾达到的最大领先分差；全场取各局最大值' },
    { key: 'ownWon', label: 'Points won on own serve', hint: '己方发球轮中得分' },
    { key: 'ownLost', label: 'Points lost on own serve', hint: '己方发球轮中失分' },
    { key: 'oppWon', label: 'Points won on opp serve', hint: '对方发球轮中得分' },
    { key: 'oppLost', label: 'Points lost on opp serve', hint: '对方发球轮中失分' },
    { key: 'consWon', label: 'Most consecutive points won', hint: '连续得分最大值；全场取各局最大值，不跨局' },
    { key: 'consLost', label: 'Most consecutive points lost', hint: '连续失分最大值；全场取各局最大值，不跨局' },
    { key: 'deficit', label: 'Greatest deficit overcome', hint: '仅单局胜方：曾落后的最大分差且最终获胜；负方 0' },
    { key: 'leadAgainst', label: 'Greatest lead against', hint: '单局胜方在该局中曾建立的最大领先分差；负方 0' }
  ];

  return {
    OTHER: OTHER,
    ROWS: ROWS,
    sortBalls: sortBalls,
    ballsOf: ballsOf,
    groupByGame: groupByGame,
    analyzeGame: analyzeGame,
    analyzeMatch: analyzeMatch,
    compute: compute
  };
});