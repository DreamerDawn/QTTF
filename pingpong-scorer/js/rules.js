/*!
 * rules.js —— 赛制 / 加球 / 发球轮转 / 局与场判定
 * 纯函数：无 DOM、无时间依赖，可在浏览器与 Node 中共用。
 *
 * 发球引擎（双打 4 人循环模型）：
 *   order = [先发球员, 首先接发球员, 先发球员的搭档, 首先接发球员的搭档]
 *   例如 A1 先发、B1 先接 -> order = [A1, B1, A2, B2]
 *   普通阶段每人连发 2 球（k = floor((n-1)/2)），加球阶段每人 1 球（k = (T-1) + (n-1-phaseBase)）。
 *   两段公式在交界处天然连续（floor(phaseBase/2) === T-1），因此加球只是“继续轮转”，不重置循环。
 *   接发人 = order[(索引 + 1) % size]（单打即“对方”）。
 *
 * 下一局的发球：由上一局接发球队先发；该队先发球员 = 上一局该队首先接发球员；
 * 接发球队 = 上一局发球队，接发球员 = 上一局该队首先发球员。
 * 实现上等价于 order_{g+1} = [order_g[1], order_g[0], P(order_g[1]), P(order_g[0])]，
 * 因此可完全由 config + 局号推导（无隐藏状态，撤销/刷新天然一致）。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PPRules = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var SIDES = ['A', 'B'];
  var PARTNER = { A1: 'A2', A2: 'A1', B1: 'B2', B2: 'B1' };

  function other(side) { return side === 'A' ? 'B' : 'A'; }
  function partner(p) { return PARTNER[p] || null; }
  function teamOfPlayer(p) { return p ? String(p).charAt(0) : null; }
  function isPlayerKey(p) { return /^[AB][12]$/.test(String(p || '')); }

  function clampInt(v, min, max, dflt) {
    var n = parseInt(v, 10);
    if (!isFinite(n)) return dflt;
    return Math.min(max, Math.max(min, n));
  }

  /* ---------- 赛制 ---------- */
  function formatInfo(cfg) {
    var f = (cfg && cfg.format) || {};
    if (f.kind === 'fixed') {
      return { kind: 'fixed', totalGames: clampInt(f.games, 1, 9, 4), needed: null, decider: null, label: '固定 ' + clampInt(f.games, 1, 9, 4) + ' 局' };
    }
    var bestOf = [3, 5, 7].indexOf(parseInt(f.bestOf, 10)) >= 0 ? parseInt(f.bestOf, 10) : 3;
    return { kind: 'bo', totalGames: bestOf, needed: Math.floor(bestOf / 2) + 1, decider: bestOf, label: 'BO' + bestOf };
  }

  /* ---------- 加球 ---------- */
  function deuceEnabled(cfg) { return !!cfg.deuce && cfg.target > 1; }
  /** 普通阶段（每人 2 球）的球数；此后进入 1 球轮换。 */
  function phaseBase(cfg) { return deuceEnabled(cfg) ? 2 * (cfg.target - 1) : Infinity; }
  /** 是否为“加球阶段”比分（双方均达到 T-1），仅用于显示。 */
  function isDeuceScore(cfg, a, b) { return deuceEnabled(cfg) && a >= cfg.target - 1 && b >= cfg.target - 1; }

  /* ---------- 每局发球计划（由 config + 局号推导） ---------- */
  function gamePlan(cfg, gameNo) {
    var g = Math.max(1, parseInt(gameNo, 10) || 1);
    if (cfg.type === 'doubles') {
      var s = cfg.firstServer.player;
      var r = cfg.firstServer.receiver;
      var order = [s, r, partner(s), partner(r)];
      for (var i = 1; i < g; i++) {
        order = [order[1], order[0], partner(order[1]), partner(order[0])];
      }
      return { order: order.slice(), size: 4, firstServerTeam: teamOfPlayer(order[0]), firstServerPlayer: order[0], firstReceiverPlayer: order[1], gameNo: g };
    }
    var t1 = cfg.firstServer.team;
    var first = (g % 2 === 1) ? t1 : other(t1);
    return { order: [first, other(first)], size: 2, firstServerTeam: first, firstServerPlayer: null, firstReceiverPlayer: null, gameNo: g };
  }

  /* ---------- 第 n 球（局内 1 起）的发球信息 ---------- */
  function serveAt(cfg, plan, n) {
    var base = phaseBase(cfg);
    var k;
    var inDeuce = (n - 1) >= base;
    if (!inDeuce) k = Math.floor((n - 1) / 2);
    else k = (base / 2) + (n - 1 - base);

    var idx = ((k % plan.size) + plan.size) % plan.size;
    var serverKey = plan.order[idx];
    var receiverKey = plan.order[(idx + 1) % plan.size];
    var doubles = cfg.type === 'doubles';
    var roundLen = inDeuce ? 1 : 2;

    return {
      ballNo: n,
      index: idx,
      deuce: inDeuce,
      roundLen: roundLen,
      /* 本发球轮“已发球数”：即将发第 n 球时，本轮已发出的球数 */
      servedInRound: (n - 1) % roundLen,
      /* 当前这球在本轮中的序号（1 起） */
      roundPos: ((n - 1) % roundLen) + 1,
      serverTeam: doubles ? teamOfPlayer(serverKey) : serverKey,
      receiverTeam: doubles ? teamOfPlayer(receiverKey) : receiverKey,
      serverPlayer: doubles ? serverKey : null,
      receiverPlayer: doubles ? receiverKey : null
    };
  }

  /* ---------- 局胜负 ---------- */
  function gameWinner(cfg, a, b) {
    var T = cfg.target;
    if (deuceEnabled(cfg)) {
      if (a >= T && a - b >= 2) return 'A';
      if (b >= T && b - a >= 2) return 'B';
      return null;
    }
    if (a >= T) return 'A';
    if (b >= T) return 'B';
    return null;
  }
  function gameScoreReached(cfg, a, b) { return { A: a, B: b, T: cfg.target, deuce: deuceEnabled(cfg) }; }
  function wouldWinGame(cfg, a, b, side) {
    var na = a + (side === 'A' ? 1 : 0);
    var nb = b + (side === 'B' ? 1 : 0);
    return gameWinner(cfg, na, nb) === side;
  }
  function isGamePoint(cfg, a, b, side) { return wouldWinGame(cfg, a, b, side); }

  /* ---------- 场胜负 ---------- */
  function isMatchPoint(cfg, a, b, side, wins) {
    var f = formatInfo(cfg);
    if (f.kind !== 'bo') return false; /* 固定 K 局不显示赛点 */
    if (!wouldWinGame(cfg, a, b, side)) return false;
    return (wins[side] + 1) >= f.needed;
  }
  /** 返回 'A' | 'B' | 'draw' | null（null = 未结束） */
  function matchOutcome(cfg, wins, gamesPlayed) {
    var f = formatInfo(cfg);
    if (f.kind === 'bo') {
      if (wins.A >= f.needed) return 'A';
      if (wins.B >= f.needed) return 'B';
      return null;
    }
    if (gamesPlayed >= f.totalGames) {
      if (wins.A > wins.B) return 'A';
      if (wins.B > wins.A) return 'B';
      return 'draw';
    }
    return null;
  }

  /* ---------- 换边 ---------- */
  function changeEndThreshold(cfg) { return Math.ceil(cfg.target / 2); }
  function isChangeEndGame(cfg, gameNo) {
    var f = formatInfo(cfg);
    return f.kind === 'bo' && gameNo === f.totalGames;
  }

  /* ---------- 配置规范化 ---------- */
  function normalizeConfig(raw) {
    var c = JSON.parse(JSON.stringify(raw || {}));
    c.type = c.type === 'doubles' ? 'doubles' : 'singles';

    var t = clampInt(c.target, 1, 99, 11);
    c.target = t;
    /* 加球开关默认“开启”：仅在显式传入 false 时关闭 */
    c.deuce = (c.deuce === undefined || c.deuce === null) ? true : !!c.deuce;

    var names = c.names || {};
    c.names = {
      A: String(names.A || '').trim() || '选手A',
      B: String(names.B || '').trim() || '选手B',
      A1: String(names.A1 || '').trim() || 'A1',
      A2: String(names.A2 || '').trim() || 'A2',
      B1: String(names.B1 || '').trim() || 'B1',
      B2: String(names.B2 || '').trim() || 'B2'
    };

    var f = c.format || {};
    if (f.kind === 'fixed') {
      c.format = { kind: 'fixed', games: clampInt(f.games, 1, 9, 4) };
    } else {
      var bo = [3, 5, 7].indexOf(parseInt(f.bestOf, 10)) >= 0 ? parseInt(f.bestOf, 10) : 3;
      c.format = { kind: 'bo', bestOf: bo };
    }

    var fs = c.firstServer || {};
    if (c.type === 'doubles') {
      var player = isPlayerKey(fs.player) ? fs.player : 'A1';
      var receiver = fs.receiver;
      if (!isPlayerKey(receiver) || teamOfPlayer(receiver) === teamOfPlayer(player)) {
        receiver = teamOfPlayer(player) === 'A' ? 'B1' : 'A1';
      }
      c.firstServer = { team: teamOfPlayer(player), player: player, receiver: receiver };
    } else {
      var team = (fs.team === 'B' || fs.player === 'B') ? 'B' : 'A';
      c.firstServer = { team: team, player: team, receiver: other(team) };
    }
    return c;
  }

  /** 供 UI 展示：某队的显示名（空名回退到占位名，不写回配置） */
  function teamLabel(cfg, side) {
    if (cfg.type === 'doubles') {
      var p1 = displayName(cfg, side === 'A' ? 'A1' : 'B1', side === 'A' ? 'A1' : 'B1');
      var p2 = displayName(cfg, side === 'A' ? 'A2' : 'B2', side === 'A' ? 'A2' : 'B2');
      return (side === 'A' ? 'A队' : 'B队') + ' · ' + p1 + '/' + p2;
    }
    return displayName(cfg, side, side === 'A' ? '选手A' : '选手B');
  }
  function playerName(cfg, key) {
    if (!key) return '';
    return (cfg.names[key] || '').trim() || key;
  }

  /** 显示名：空串时回退到占位名（仅用于展示，不写回配置） */
  function displayName(cfg, key, fallback) {
    var v = cfg && cfg.names ? cfg.names[key] : '';
    v = (v == null) ? '' : String(v).trim();
    return v || fallback || key;
  }

  return {
    SIDES: SIDES,
    other: other,
    partner: partner,
    teamOfPlayer: teamOfPlayer,
    isPlayerKey: isPlayerKey,
    clampInt: clampInt,
    formatInfo: formatInfo,
    deuceEnabled: deuceEnabled,
    phaseBase: phaseBase,
    isDeuceScore: isDeuceScore,
    gamePlan: gamePlan,
    serveAt: serveAt,
    gameWinner: gameWinner,
    gameScoreReached: gameScoreReached,
    wouldWinGame: wouldWinGame,
    isGamePoint: isGamePoint,
    isMatchPoint: isMatchPoint,
    matchOutcome: matchOutcome,
    changeEndThreshold: changeEndThreshold,
    isChangeEndGame: isChangeEndGame,
    normalizeConfig: normalizeConfig,
    teamLabel: teamLabel,
    displayName: displayName,
    playerName: playerName
  };
});