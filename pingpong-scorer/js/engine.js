/*!
 * engine.js —— 状态机 + 由逐球记录派生的全部比赛视图
 *
 * 设计要点：
 *   1) 唯一真源 = state.points（逐球记录） + state.gameStarts（各局开始时间） + state.pauses（暂停记录）。
 *      比分、总胜局、局点/赛点、发球方、局分、统计、图表全部由 derive() 重放得出，绝不手工维护。
 *   2) 因此“撤销 = 弹出末球”“重置 = 清空子集”“刷新 = 反序列化”三者天然一致，
 *      且撤销掉导致局结束/比赛结束的一球后，局/场自动回到进行中。
 *   3) 时间统一用绝对时间戳（epoch ms）保存，刷新后按墙钟续算；暂停不冻结任何计时。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./rules.js'));
  } else {
    root.PPEngine = factory(root.PPRules);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (rules) {
  'use strict';

  var NORMAL_PAUSE_SECONDS = 60;
  /* 局间休息：按乒乓球通行惯例 1 分钟；倒计时结束不锁定计分，仅提示 */
  var INTERVAL_SECONDS = 60;

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------------- 状态构造 / 反序列化 ---------------- */

  function newState(rawConfig) {
    return {
      v: 1,
      config: rules.normalizeConfig(rawConfig),
      cfgLocked: false,
      started: false,
      matchStart: null,
      points: [],
      gameStarts: {},
      pauses: [],
      pauseNo: 1,
      pauseUsed: { A: 0, B: 0 },   /* 普通暂停已用次数（每方每场一次），重置本局不返还，重置比赛恢复 */
      ui: { statsScope: 'match', statsGame: null, swapped: false, changeEndDone: {} }
    };
  }

  function sanitize(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var s = newState(raw.config || {});
    s.v = 1;
    s.cfgLocked = !!raw.cfgLocked;
    s.started = !!raw.started;
    s.matchStart = isFinite(raw.matchStart) ? raw.matchStart : null;
    s.points = Array.isArray(raw.points) ? raw.points.filter(function (p) {
      return p && isFinite(p.game) && p.game >= 1 && isFinite(p.t) &&
        (p.scorer === 'A' || p.scorer === 'B') && (p.serve === 'A' || p.serve === 'B');
    }).map(function (p) {
      return {
        game: parseInt(p.game, 10),
        ball: parseInt(p.ball, 10) || 0,
        scorer: p.scorer,
        serve: p.serve,
        serverPlayer: p.serverPlayer || null,
        receiverPlayer: p.receiverPlayer || null,
        t: p.t,
        deuce: !!p.deuce,
        scoreBefore: {
          A: (p.scoreBefore && isFinite(p.scoreBefore.A)) ? p.scoreBefore.A : 0,
          B: (p.scoreBefore && isFinite(p.scoreBefore.B)) ? p.scoreBefore.B : 0
        }
      };
    }) : [];
    s.gameStarts = {};
    if (raw.gameStarts && typeof raw.gameStarts === 'object') {
      Object.keys(raw.gameStarts).forEach(function (k) {
        if (isFinite(raw.gameStarts[k])) s.gameStarts[k] = raw.gameStarts[k];
      });
    }
    s.pauses = Array.isArray(raw.pauses) ? raw.pauses.filter(function (p) {
      return p && (p.type === 'normal' || p.type === 'medical') && (p.side === 'A' || p.side === 'B');
    }).map(function (p) {
      return {
        id: parseInt(p.id, 10) || 1,
        type: p.type,
        side: p.side,
        game: parseInt(p.game, 10) || 1,
        start: isFinite(p.start) ? p.start : Date.now(),
        end: isFinite(p.end) ? p.end : null,
        limitSeconds: p.type === 'normal' ? NORMAL_PAUSE_SECONDS : null
      };
    }) : [];
    s.pauseNo = Math.max(1, parseInt(raw.pauseNo, 10) || 1);
    s.pauseUsed = {
      A: (raw.pauseUsed && isFinite(raw.pauseUsed.A)) ? raw.pauseUsed.A : 0,
      B: (raw.pauseUsed && isFinite(raw.pauseUsed.B)) ? raw.pauseUsed.B : 0
    };
    var ui = raw.ui || {};
    s.ui = {
      statsScope: ui.statsScope === 'game' ? 'game' : 'match',
      statsGame: isFinite(ui.statsGame) ? ui.statsGame : null,
      swapped: !!ui.swapped,
      changeEndDone: (ui.changeEndDone && typeof ui.changeEndDone === 'object') ? ui.changeEndDone : {}
    };
    return s;
  }

  /* ---------------- 基础查询 ---------------- */

  function gameNumbers(state) {
    var set = {};
    state.points.forEach(function (p) { set[p.game] = true; });
    return Object.keys(set).map(Number).sort(function (a, b) { return a - b; });
  }

  function pointsOfGame(state, no) {
    return state.points.filter(function (p) { return p.game === no; });
  }

  function activePause(state) {
    for (var i = state.pauses.length - 1; i >= 0; i--) {
      if (state.pauses[i].end == null) return state.pauses[i];
    }
    return null;
  }

  function mmss(ms) {
    if (!isFinite(ms) || ms < 0) ms = 0;
    var total = Math.floor(ms / 1000);
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    var out = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    return h > 0 ? (h + ':' + out) : out;
  }

  /* ---------------- 核心：派生视图 ---------------- */

  /**
   * @param {Object} state
   * @param {number} [now]
   * @returns {Object} 完整派生视图 d
   */
  function derive(state, now) {
    now = isFinite(now) ? now : Date.now();
    var cfg = state.config;
    var fmt = rules.formatInfo(cfg);

    /* --- 逐局重放 --- */
    var nos = gameNumbers(state);
    var games = [];
    var wins = { A: 0, B: 0 };

    nos.forEach(function (no) {
      var list = pointsOfGame(state, no);
      var a = 0, b = 0, winner = null, endT = null;
      var maxLead = { A: 0, B: 0 };
      var events = [];
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        a += (e.scorer === 'A' ? 1 : 0);
        b += (e.scorer === 'B' ? 1 : 0);
        maxLead.A = Math.max(maxLead.A, a - b);
        maxLead.B = Math.max(maxLead.B, b - a);
        events.push({ ball: i + 1, scorer: e.scorer, serve: e.serve, t: e.t, after: { A: a, B: b } });
        if (!winner) {
          var w = rules.gameWinner(cfg, a, b);
          if (w) { winner = w; endT = e.t; }
        }
      }
      var start = isFinite(state.gameStarts[no]) ? state.gameStarts[no] : (list.length ? list[0].t : null);
      games.push({
        no: no,
        score: { A: a, B: b },
        finalScore: { A: a, B: b },
        winner: winner,
        start: start,
        end: winner ? endT : null,
        balls: list.length,
        maxLead: maxLead,
        points: list,
        events: events,
        pauses: state.pauses.filter(function (p) { return p.game === no; })
      });
      if (winner) wins[winner] += 1;
    });

    var gamesPlayed = games.filter(function (g) { return !!g.winner; }).length;
    var outcome = rules.matchOutcome(cfg, wins, gamesPlayed);
    var matchOver = outcome !== null;

    /* 比赛结束时间 = 导致结束那一球的时刻 */
    var matchEnd = null;
    if (matchOver) {
      for (var gi = games.length - 1; gi >= 0; gi--) {
        if (games[gi].winner) { matchEnd = games[gi].end; break; }
      }
    }

    /* --- 当前局 --- */
    var curGameNo, currentGame, inInterval = false;
    if (matchOver) {
      curGameNo = games.length ? games[games.length - 1].no : 1;
      currentGame = games.length ? games[games.length - 1] : null;
    } else {
      var lastG = games.length ? games[games.length - 1] : null;
      if (!lastG || lastG.winner) {
        curGameNo = lastG ? lastG.no + 1 : 1;
        currentGame = { no: curGameNo, score: { A: 0, B: 0 }, winner: null, start: isFinite(state.gameStarts[curGameNo]) ? state.gameStarts[curGameNo] : null, end: null, balls: 0, maxLead: { A: 0, B: 0 }, points: [], events: [], pauses: state.pauses.filter(function (p) { return p.game === curGameNo; }) };
        inInterval = !!lastG && !isFinite(state.gameStarts[curGameNo]);
      } else {
        curGameNo = lastG.no;
        currentGame = lastG;
      }
    }

    /* --- 发球：下一球 --- */
    var serve = null, plan = null;
    if (!matchOver) {
      plan = rules.gamePlan(cfg, curGameNo);
      serve = rules.serveAt(cfg, plan, currentGame.points.length + 1);
      serve.planFirst = {
        team: plan.firstServerTeam,
        player: plan.firstServerPlayer,
        receiver: plan.firstReceiverPlayer
      };
    }

    /* --- 局点 / 赛点计数 --- */
    var gpCount = { A: 0, B: 0 }, gpActive = { A: false, B: false };
    var mpCount = { A: 0, B: 0 }, mpActive = { A: false, B: false };

    /* 当前局：局点计数（每局独立、分方统计，由逐球记录重放）
         语义 = 该方到目前一共拿到过多少个“局点机会”，即有多少个来球能让该方赢下本局。
         因此不能只按“进入局点状态”计数：当对方把局点救掉后，下一球若仍是该方的
         局点机会，那是该方的**下一个**局点。
         例：A 在 10:7 拿到第 1 个局点；B 得分后 10:8，A 仍有局点 → 第 2 个；
         再看 10:9 → 第 3 个。若 B 追到 10:10，A 的局点消失（不再计数），
         之后 A 再到 11:10 则重新从第 1 个开始。 */
    if (!matchOver && currentGame) {
      var seq = [{ A: 0, B: 0 }];          /* 每个状态 = 某一球开始前的比分 */
      var scorers = [];
      var ra = 0, rb = 0;
      currentGame.points.forEach(function (e) {
        ra += (e.scorer === 'A' ? 1 : 0);
        rb += (e.scorer === 'B' ? 1 : 0);
        seq.push({ A: ra, B: rb });
        scorers.push(e.scorer);
      });
      /* 状态 i 之后还有球（i < points.length）时，该状态才构成“局点机会” */
      var prevG = { A: false, B: false };
      for (var si = 0; si < seq.length; si++) {
        var st = seq[si];
        rules.SIDES.forEach(function (side) {
          /* 该状态下再得 1 分即赢本局 → 下一个来球就是该方的一个局点机会。
             最后一并包含：当前比分的下一球（尚未记录）同样算。
             已赢下的状态由 gameWinner 守卫排除。 */
          var oneAway = !rules.gameWinner(cfg, st.A, st.B) &&
            rules.wouldWinGame(cfg, st.A, st.B, side);
          if (oneAway) {
            /* 对方每救掉一次（上一球是对方得分）就产生一个新的局点机会 */
            var opp = side === 'A' ? 'B' : 'A';
            if (!prevG[side] || (si > 0 && scorers[si - 1] === opp)) gpCount[side] += 1;
          }
          prevG[side] = oneAway;
        });
      }
      gpActive = prevG;
    }

    /* 全场：赛点计数（跨局累计、分方统计）
       与局点同一语义：该方到目前一共拿到过多少个“赛点机会”
       （再得 1 分即赢整场的那个来球）。被对方救掉后再出现的算下一个。
       固定 K 局恒为 false（不显示赛点）。 */
    if (fmt.kind === 'bo' && state.points.length) {
      var all = state.points.slice().sort(function (x, y) {
        if (x.game !== y.game) return x.game - y.game;
        return (x.t || 0) - (y.t || 0) || (x.ball || 0) - (y.ball || 0);
      });
      var winsRun = { A: 0, B: 0 };
      var prevM = { A: false, B: false };
      var a3 = 0, b3 = 0, curNo = null;
      var lastScorer = null;
      all.forEach(function (e) {
        if (e.game !== curNo) { curNo = e.game; a3 = 0; b3 = 0; prevM = { A: false, B: false }; lastScorer = null; }
        a3 += (e.scorer === 'A' ? 1 : 0);
        b3 += (e.scorer === 'B' ? 1 : 0);
        var gw = rules.gameWinner(cfg, a3, b3);
        if (gw) {
          winsRun[gw] += 1;
          prevM = { A: false, B: false };
          lastScorer = null;
          return;
        }
        rules.SIDES.forEach(function (side) {
          var oneAway = rules.isMatchPoint(cfg, a3, b3, side, winsRun);
          if (oneAway) {
            var opp = side === 'A' ? 'B' : 'A';
            if (!prevM[side] || lastScorer === opp) mpCount[side] += 1;
          }
          prevM[side] = oneAway;
        });
        lastScorer = e.scorer;
      });
      /* 当前比分的“下一球”也是一个赛点机会（若该方确实再得 1 分即赢整场） */
      if (!matchOver) {
        var cg2 = currentGame || { score: { A: 0, B: 0 } };
        rules.SIDES.forEach(function (side) {
          var oneAway = rules.isMatchPoint(cfg, cg2.score.A, cg2.score.B, side, winsRun);
          if (oneAway) {
            var opp2 = side === 'A' ? 'B' : 'A';
            if (!prevM[side] || lastScorer === opp2) mpCount[side] += 1;
          }
          prevM[side] = oneAway;
        });
      }
      mpActive = prevM;
    }

    /* --- 暂停与状态 --- */
    var ap = activePause(state);
    var normalRemainMs = null, normalExpired = false, medicalElapsedMs = null;
    if (ap) {
      if (ap.type === 'normal') {
        normalRemainMs = Math.max(0, (ap.start + NORMAL_PAUSE_SECONDS * 1000) - now);
        normalExpired = normalRemainMs <= 0;
      } else {
        medicalElapsedMs = now - ap.start;
      }
    }

    var playState;
    if (!state.started) playState = 'setup';
    else if (matchOver) playState = 'over';
    else if (ap) playState = ap.type === 'normal' ? 'normalPause' : 'medicalPause';
    else if (currentGame && currentGame.points.length > 0) playState = 'dead';
    else if (inInterval) playState = 'interval';
    else playState = 'playing';

    /* --- 换边提示：仅 BO 赛制决胜局，一方先到 ceil(T/2) --- */
    var th = rules.changeEndThreshold(cfg);
    var changeEnd = { applicable: false, threshold: th, reached: false, side: null, ballNo: null, done: false };
    if (rules.isChangeEndGame(cfg, curGameNo)) {
      changeEnd.applicable = true;
      changeEnd.done = !!state.ui.changeEndDone[curGameNo];
      var acc = { A: 0, B: 0 };
      var cg = currentGame ? currentGame.points : [];
      for (var ci = 0; ci < cg.length; ci++) {
        acc[cg[ci].scorer] += 1;
        if (acc.A >= th || acc.B >= th) {
          changeEnd.reached = true;
          changeEnd.side = acc.A >= th ? 'A' : 'B';
          changeEnd.ballNo = ci + 1;
          break;
        }
      }
    }

    /* --- 局间休息倒计时（1 分钟，仅提示不锁分） ---
       起点 = 上一局结束时间；到 0 后显示“已到 1 分钟”，但仍可直接开始下一局。 */
    var interval = { active: false, seconds: INTERVAL_SECONDS, remainMs: null, expired: false, start: null };
    if (inInterval && !matchOver) {
      var prevEnd = null;
      for (var pi = games.length - 1; pi >= 0; pi--) {
        if (games[pi].winner) { prevEnd = games[pi].end; break; }
      }
      interval.active = true;
      interval.start = prevEnd;
      if (prevEnd != null) {
        interval.remainMs = Math.max(0, (prevEnd + INTERVAL_SECONDS * 1000) - now);
        interval.expired = interval.remainMs <= 0;
      } else {
        interval.remainMs = INTERVAL_SECONDS * 1000;
      }
    }

    /* --- 时间 --- */
    var matchElapsed = 0;
    if (state.matchStart) matchElapsed = Math.max(0, (matchOver && matchEnd ? matchEnd : now) - state.matchStart);

    var pauseTotals = { normal: 0, medical: 0 };
    state.pauses.forEach(function (p) {
      var dur = Math.max(0, (p.end != null ? p.end : now) - p.start);
      if (p.type === 'normal') pauseTotals.normal += dur; else pauseTotals.medical += dur;
    });

    var gamesView = games.map(function (g) {
      /* 已结束局：结束-开始；进行中局：当前时刻-开始（不冻结）；未开局：0 */
      var dur = g.start ? Math.max(0, (g.end != null ? g.end : now) - g.start) : 0;
      return Object.assign({}, g, { duration: dur });
    });

    var curDur = 0;
    if (!inInterval && currentGame && isFinite(state.gameStarts[curGameNo])) {
      var gEnd = currentGame.winner ? currentGame.end : now;
      curDur = Math.max(0, (matchOver && currentGame.winner ? currentGame.end : gEnd) - state.gameStarts[curGameNo]);
    }

    return {
      cfg: cfg,
      fmt: fmt,
      games: gamesView,
      gamesPlayed: gamesPlayed,
      wins: wins,
      outcome: outcome,
      matchOver: matchOver,
      matchEnd: matchEnd,
      curGameNo: curGameNo,
      currentGame: currentGame,
      inInterval: inInterval,
      serve: serve,
      plan: plan,
      gamePoint: { A: { active: gpActive.A, count: gpCount.A }, B: { active: gpActive.B, count: gpCount.B } },
      matchPoint: { A: { active: mpActive.A, count: mpCount.A }, B: { active: mpActive.B, count: mpCount.B } },
      playState: playState,
      activePause: ap,
      normalRemainMs: normalRemainMs,
      normalExpired: normalExpired,
      medicalElapsedMs: medicalElapsedMs,
      changeEnd: changeEnd,
      interval: interval,
      times: {
        matchElapsed: matchElapsed,
        curGameElapsed: curDur,
        pauseNormal: pauseTotals.normal,
        pauseMedical: pauseTotals.medical,
        matchElapsedText: mmss(matchElapsed),
        curGameElapsedText: mmss(curDur),
        pauseNormalText: mmss(pauseTotals.normal),
        pauseMedicalText: mmss(pauseTotals.medical)
      },
      canScore: canScore(state, { matchOver: matchOver, activePause: ap, started: state.started }),
      pauseUsed: state.pauseUsed,
      normalPauseSeconds: NORMAL_PAUSE_SECONDS
    };
  }

  /* ---------------- 状态机操作 ---------------- */

  function canScore(state, d) {
    d = d || derive(state);
    return !!state.started && !d.matchOver && !d.activePause;
  }

  /** 是否可请求普通暂停：仅“死球”状态（本局已有得分、下一球尚未开始）、未用过、比赛未结束。
   *  局间、本局 0:0 未开球、暂停中、比赛结束后均不可请求（与页面上方状态机口径一致）。 */
  function canRequestNormalPause(state, side, d) {
    d = d || derive(state);
    if (!state.started || d.matchOver || d.activePause) return false;
    if (d.playState !== 'dead') return false;
    if ((state.pauseUsed[side] || 0) >= 1) return false;
    return true;
  }
  /** 医疗暂停：不限次数；死球/局间均可（比赛未结束即可） */
  function canRequestMedicalPause(state, d) {
    d = d || derive(state);
    return !!state.started && !d.matchOver && !d.activePause;
  }

  function startMatch(state, now) {
    now = isFinite(now) ? now : Date.now();
    if (state.started) return state;
    state.started = true;
    state.cfgLocked = true;
    state.matchStart = now;
    state.gameStarts = {};
    state.points = [];
    state.pauses = [];
    state.pauseUsed = { A: 0, B: 0 };
    state.ui.statsGame = null;
    state.ui.changeEndDone = {};
    return state;
  }

  /** 点击“开始本局/下一局”：启动单局计时 */
  function startGame(state, now) {
    now = isFinite(now) ? now : Date.now();
    if (!state.started) return state;
    var d = derive(state, now);
    if (d.matchOver) return state;
    if (!isFinite(state.gameStarts[d.curGameNo])) state.gameStarts[d.curGameNo] = now;
    return state;
  }

  /** 加 1 分（唯一写入 points 的入口） */
  function addPoint(state, side, now) {
    now = isFinite(now) ? now : Date.now();
    side = side === 'B' ? 'B' : 'A';
    var d = derive(state, now);
    if (!d.canScore) return { ok: false, reason: d.matchOver ? 'over' : (d.activePause ? 'paused' : 'notStarted') };

    var g = d.curGameNo;
    var pt = pointsOfGame(state, g);
    var plan = rules.gamePlan(state.config, g);
    var sv = rules.serveAt(state.config, plan, pt.length + 1);

    if (!isFinite(state.gameStarts[g])) state.gameStarts[g] = now;

    var entry = {
      game: g,
      ball: pt.length + 1,
      scorer: side,
      serve: sv.serverTeam,
      serverPlayer: sv.serverPlayer,
      receiverPlayer: sv.receiverPlayer,
      t: now,
      deuce: sv.deuce,
      scoreBefore: { A: currentScore(state, g).A, B: currentScore(state, g).B }
    };
    state.points.push(entry);

    var after = derive(state, now);
    return { ok: true, entry: entry, derived: after };
  }

  function currentScore(state, g) {
    var a = 0, b = 0;
    pointsOfGame(state, g).forEach(function (p) {
      if (p.scorer === 'A') a += 1; else b += 1;
    });
    return { A: a, B: b };
  }

  /** 撤销上一球（比分/发球/局点赛点/局分/统计/图表全部随之回退） */
  function undoPoint(state, now) {
    now = isFinite(now) ? now : Date.now();
    if (!state.points.length) return { ok: false, reason: 'empty' };
    if (activePause(state)) return { ok: false, reason: 'paused' };
    var removed = state.points.pop();
    /* 清理因该球而“提前存在”的下一局计时与换边确认 */
    var d = derive(state, now);
    Object.keys(state.gameStarts).forEach(function (k) {
      if (Number(k) > d.curGameNo) delete state.gameStarts[k];
    });
    Object.keys(state.ui.changeEndDone).forEach(function (k) {
      if (Number(k) > d.curGameNo) delete state.ui.changeEndDone[k];
    });
    return { ok: true, removed: removed, derived: d };
  }

  /** 重置本局：清空本局比分与事件；单局计时重置；不返还已用普通暂停次数 */
  function resetGame(state, now) {
    now = isFinite(now) ? now : Date.now();
    if (!state.started) return { ok: false, reason: 'notStarted' };
    var d = derive(state, now);
    if (d.matchOver) return { ok: false, reason: 'over' };
    if (activePause(state)) return { ok: false, reason: 'paused' };
    var g = d.curGameNo;
    state.points = state.points.filter(function (p) { return p.game !== g; });
    state.pauses = state.pauses.filter(function (p) { return p.game !== g; });
    delete state.gameStarts[g];
    delete state.ui.changeEndDone[g];
    return { ok: true, game: g };
  }

  /** 重置比赛：清除全部数据并恢复暂停次数（配置解锁） */
  function resetMatch(state) {
    var cfg = clone(state.config);
    var fresh = newState(cfg);
    Object.keys(state).forEach(function (k) { delete state[k]; });
    Object.assign(state, fresh);
    return state;
  }

  function requestPause(state, type, side, now) {
    now = isFinite(now) ? now : Date.now();
    side = side === 'B' ? 'B' : 'A';
    if (type !== 'normal' && type !== 'medical') return { ok: false, reason: 'badType' };
    type = type === 'normal' ? 'normal' : 'medical';
    var d = derive(state, now);
    if (type === 'normal') {
      if (!canRequestNormalPause(state, side, d)) {
        return { ok: false, reason: (state.pauseUsed[side] >= 1) ? 'used' : (d.activePause ? 'paused' : 'notAllowed') };
      }
      state.pauseUsed[side] = (state.pauseUsed[side] || 0) + 1;
    } else {
      if (!canRequestMedicalPause(state, d)) return { ok: false, reason: d.activePause ? 'paused' : 'notAllowed' };
    }
    var p = {
      id: state.pauseNo++,
      type: type === 'medical' ? 'medical' : 'normal',
      side: side,
      game: d.curGameNo,
      start: now,
      end: null,
      limitSeconds: type === 'normal' ? NORMAL_PAUSE_SECONDS : null
    };
    state.pauses.push(p);
    return { ok: true, pause: p, derived: derive(state, now) };
  }

  function endPause(state, now) {
    now = isFinite(now) ? now : Date.now();
    var p = activePause(state);
    if (!p) return { ok: false, reason: 'none' };
    p.end = now;
    return { ok: true, pause: p };
  }

  function toggleSwap(state) {
    state.ui.swapped = !state.ui.swapped;
    return state.ui.swapped;
  }

  function markChangeEnd(state, gameNo) {
    state.ui.changeEndDone[gameNo] = true;
    return state;
  }

  /* ---------------- 导出 ---------------- */

  function exportPayload(state, statsModule, now) {
    now = isFinite(now) ? now : Date.now();
    var d = derive(state, now);
    var gameWinners = {};
    d.games.forEach(function (g) { if (g.winner) gameWinners[g.no] = g.winner; });
    return {
      exportedAt: iso(now),
      app: 'pingpong-scorer',
      version: 1,
      config: state.config,
      summary: {
        format: d.fmt.label,
        type: state.config.type,
        target: state.config.target,
        deuce: state.config.deuce,
        started: state.started,
        startedAt: iso(state.matchStart),
        endedAt: iso(d.matchEnd),
        totalDurationMs: d.times.matchElapsed,
        totalDuration: d.times.matchElapsedText,
        gamesWon: d.wins,
        outcome: d.outcome
      },
      points: state.points.slice(),
      games: d.games.map(function (g) {
        return {
          game: g.no,
          score: g.score,
          winner: g.winner,
          start: iso(g.start),
          end: iso(g.end),
          durationMs: g.duration,
          duration: mmss(g.duration),
          balls: g.balls,
          pauses: g.pauses.map(function (p) {
            return {
              id: p.id, type: p.type, side: p.side,
              start: iso(p.start),
              end: iso(p.end),
              durationMs: Math.max(0, (p.end != null ? p.end : now) - p.start)
            };
          })
        };
      }),
      pauses: state.pauses.map(function (p) {
        return {
          id: p.id, type: p.type, side: p.side, game: p.game,
          start: iso(p.start),
          end: iso(p.end),
          durationMs: Math.max(0, (p.end != null ? p.end : now) - p.start)
        };
      }),
      /* 统计：全场统计只计算一次，perGame 复用同一份结果 */
      stats: statsModule ? (function () {
        var m = statsModule.compute(state.config, state.points, null, gameWinners);
        return { match: m, perGame: m.perGame };
      })() : null
    };
  }

  function iso(x) {
    if (!isFinite(x)) return null;
    try { return new Date(x).toISOString(); } catch (e) { return null; }
  }
  function csvEscape(v) {
    var s = v == null ? '' : String(v);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  function csvRow(arr) { return arr.map(csvEscape).join(','); }

  function exportCsv(state, statsModule, now) {
    now = isFinite(now) ? now : Date.now();
    var d = derive(state, now);
    var cfg = state.config;
    var lines = [];

    lines.push('SECTION,MATCH');
    lines.push(csvRow(['key', 'value']));
    lines.push(csvRow(['format', d.fmt.label]));
    lines.push(csvRow(['type', cfg.type === 'doubles' ? '双打' : '单打']));
    lines.push(csvRow(['target', cfg.target]));
    lines.push(csvRow(['deuce', cfg.deuce ? 'on' : 'off']));
    lines.push(csvRow(['gamesWonA', d.wins.A]));
    lines.push(csvRow(['gamesWonB', d.wins.B]));
    lines.push(csvRow(['outcome', d.outcome || 'in-progress']));
    lines.push(csvRow(['totalDuration', d.times.matchElapsedText]));
    lines.push(csvRow(['pauseNormalTotal', d.times.pauseNormalText]));
    lines.push(csvRow(['pauseMedicalTotal', d.times.pauseMedicalText]));
    lines.push('');

    /* 逐球表 */
    lines.push('SECTION,POINTS');
    lines.push(csvRow(['game', 'ball', 'scorer', 'serve', 'serverPlayer', 'receiverPlayer', 'scoreBeforeA', 'scoreBeforeB', 'scoreAfterA', 'scoreAfterB', 'deuce', 'timestamp']));
    var a = 0, b = 0, curG = null;
    state.points.slice().sort(function (x, y) {
      if (x.game !== y.game) return x.game - y.game;
      return (x.t || 0) - (y.t || 0) || (x.ball || 0) - (y.ball || 0);
    }).forEach(function (p) {
      if (p.game !== curG) { curG = p.game; a = 0; b = 0; }
      var sb = p.scoreBefore || { A: a, B: b };
      a = sb.A + (p.scorer === 'A' ? 1 : 0);
      b = sb.B + (p.scorer === 'B' ? 1 : 0);
      lines.push(csvRow([
        p.game, p.ball, p.scorer, p.serve,
        p.serverPlayer || '', p.receiverPlayer || '',
        sb.A, sb.B, a, b, p.deuce ? 1 : 0,
        iso(p.t)
      ]));
    });
    lines.push('');

    /* 每局汇总表 */
    lines.push('SECTION,GAMES');
    lines.push(csvRow(['game', 'scoreA', 'scoreB', 'winner', 'duration', 'normalPauses', 'medicalPauses', 'periods']));
    d.games.forEach(function (g) {
      var np = g.pauses.filter(function (p) { return p.type === 'normal'; }).length;
      var mp = g.pauses.filter(function (p) { return p.type === 'medical'; }).length;
      var periods = g.pauses.map(function (p) {
        return p.type + ':' + p.side + '@' + mmss(p.start - (g.start || p.start)) + '-' + (p.end != null ? mmss(p.end - (g.start || p.start)) : '进行中');
      }).join(' ');
      lines.push(csvRow([g.no, g.score.A, g.score.B, g.winner || '', mmss(g.duration), np, mp, periods]));
    });
    lines.push('');

    /* 统计表 */
    if (statsModule) {
      var gameWinners = {};
      d.games.forEach(function (g) { if (g.winner) gameWinners[g.no] = g.winner; });
      var scopes = [{ label: 'MATCH', no: null }];
      d.games.forEach(function (g) { scopes.push({ label: 'GAME' + g.no, no: g.no }); });
      lines.push('SECTION,STATS');
      lines.push(csvRow(['scope', 'metric', 'A', 'B']));
      scopes.forEach(function (s) {
        var st = statsModule.compute(state.config, state.points, s.no, gameWinners);
        statsModule.ROWS.forEach(function (r) {
          lines.push(csvRow([s.label, r.label, st[r.key].A, st[r.key].B]));
        });
      });
    }
    return lines.join('\r\n');
  }

  return {
    NORMAL_PAUSE_SECONDS: NORMAL_PAUSE_SECONDS,
    INTERVAL_SECONDS: INTERVAL_SECONDS,
    newState: newState,
    sanitize: sanitize,
    derive: derive,
    canScore: canScore,
    canRequestNormalPause: canRequestNormalPause,
    canRequestMedicalPause: canRequestMedicalPause,
    startMatch: startMatch,
    startGame: startGame,
    addPoint: addPoint,
    undoPoint: undoPoint,
    resetGame: resetGame,
    resetMatch: resetMatch,
    requestPause: requestPause,
    endPause: endPause,
    toggleSwap: toggleSwap,
    markChangeEnd: markChangeEnd,
    currentScore: currentScore,
    pointsOfGame: pointsOfGame,
    activePause: activePause,
    mmss: mmss,
    exportPayload: exportPayload,
    exportCsv: exportCsv
  };
});