/*!
 * selftest.js —— 内置自测（验收用例 1–12）
 *
 * 两种运行方式：
 *   1) 浏览器：打开 index.html?selftest=1，页面底部出现自测面板（含 DOM/交互/刷新/导出测试）
 *   2) Node：  node tests/selftest.js  （纯逻辑部分；DOM 测试标记为 skipped）
 *
 * 自测会用受控状态覆盖当前比赛，结束后把原状态与 localStorage 还原，不影响正在进行的比赛。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('../js/rules.js'),
      require('../js/stats.js'),
      require('../js/engine.js'),
      null
    );
  } else {
    root.PPSelfTest = factory(root.PPRules, root.PPStats, root.PPEngine, root.PPChart);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (R, S, E, C) {
  'use strict';

  var T0 = 1700000000000;      /* 固定基准时间，保证可重复 */
  var STEP = 1000;
  var results = [];
  var domMode = false;

  /* ---------------- 断言 ---------------- */
  function ok(cond, msg) { if (!cond) throw new Error(msg || '断言失败'); }
  function eq(actual, expected, msg) {
    if (actual !== expected) {
      throw new Error((msg || '值不相等') + '：期望 ' + JSON.stringify(expected) + '，实际 ' + JSON.stringify(actual));
    }
  }
  function deepEq(actual, expected, msg) {
    var a = JSON.stringify(actual), b = JSON.stringify(expected);
    if (a !== b) throw new Error((msg || '对象不相等') + '：期望 ' + b + '，实际 ' + a);
  }
  function test(name, fn) {
    try {
      var r = fn();
      if (r && typeof r.then === 'function') {
        return r.then(function () { results.push({ name: name, ok: true }); },
          function (e) { results.push({ name: name, ok: false, err: e && e.message || String(e) }); });
      }
      results.push({ name: name, ok: true });
    } catch (e) {
      results.push({ name: name, ok: false, err: e && e.message || String(e) });
    }
    return Promise.resolve();
  }

  /** 与 test 相同，但每完成一项就回调（用于实时进度/无头抓取） */
  function testP(name, fn, onEach) {
    return test(name, fn).then(function () {
      if (onEach) onEach(snapshot());
      return null;
    });
  }

  function snapshot() {
    var failed = results.filter(function (r) { return !r.ok; }).length;
    return { total: results.length, passed: results.length - failed, failed: failed, results: results.slice() };
  }
  function skip(name, why) { results.push({ name: name, ok: true, skipped: true, err: why }); }

  /* ---------------- 驱动助手 ---------------- */
  function mkState(over) {
    var base = {
      type: 'singles',
      names: { A: '选手A', B: '选手B' },
      format: { kind: 'bo', bestOf: 3 },
      target: 11,
      deuce: true,
      firstServer: { team: 'A' }
    };
    if (over) Object.keys(over).forEach(function (k) { base[k] = over[k]; });
    return E.newState(base);
  }
  function play(state, seq, t0, step) {
    t0 = t0 || T0; step = step || STEP;
    var t = t0;
    for (var i = 0; i < seq.length; i++) {
      var r = E.addPoint(state, seq.charAt(i), t);
      ok(r.ok, '第 ' + (i + 1) + ' 球加分失败：' + (r.reason || ''));
      t += step;
    }
    return t;
  }
  function repeat(ch, n) { return new Array(n + 1).join(ch); }
  function playGameToWin(state, winner, t0) {
    var t = t0 || T0;
    var g0 = E.derive(state, t).curGameNo;
    var guard = 0;
    while (guard++ < 400) {
      var d = E.derive(state, t);
      if (d.matchOver) return t;
      var g = d.games.filter(function (x) { return x.no === g0; })[0];
      if (g && g.winner) return t;
      if (d.curGameNo !== g0) return t;
      var r = E.addPoint(state, winner, t);
      ok(r.ok, '加分失败（' + (r.reason || '') + '）');
      t += STEP;
    }
    throw new Error('未能结束该局');
  }
  function started(over) {
    var s = mkState(over);
    E.startMatch(s, T0);
    return s;
  }
  function winnersOf(state) {
    var d = E.derive(state, T0);
    var m = {};
    d.games.forEach(function (g) { if (g.winner) m[g.no] = g.winner; });
    return m;
  }
  function statsOf(state, gameNo) {
    return S.compute(state.config, state.points, gameNo || null, winnersOf(state));
  }
  function waitFor(fn, timeout) {
    var limit = Date.now() + (timeout || 1500);
    return new Promise(function (resolve, reject) {
      (function poll() {
        var v;
        try { v = fn(); } catch (e) { v = false; }
        if (v) return resolve(v);
        if (Date.now() > limit) return reject(new Error('等待超时'));
        setTimeout(poll, 25);
      })();
    });
  }

  /* =========================================================
     验收 1：单打 BO3、11 分、加球开、A 先发
     ========================================================= */
  function case1() {
    var s = started({ format: { kind: 'bo', bestOf: 3 }, target: 11, deuce: true, firstServer: { team: 'A' } });
    play(s, repeat('A', 10) + repeat('B', 9));          /* 19 球 → 10:9 */
    var d = E.derive(s, T0 + 20 * STEP);
    eq(d.currentGame.score.A, 10, 'A 应得 10 分');
    eq(d.currentGame.score.B, 9, 'B 应得 9 分');
    eq(d.gamePoint.A.active, true, 'A 10:9 时应显示局点');
    /* 局点按“机会”计数：B 每救掉一个，A 的下一个来球又是局点。
       本序列先 A×10 再 B×9，A 在 10:0、10:1 … 10:9 各有一个局点，共 10 个。
       （A 一路领先到 10:9，所以 A 这边机会很多；B 从未到 11 分故为 0。） */
    eq(d.gamePoint.A.count, 10, 'A 10:9 时应为第 10 个局点');
    eq(d.gamePoint.B.active, false, 'B 10:9 时不应有局点');
    eq(d.matchOver, false, '10:9 时比赛未结束');

    var t = T0 + 19 * STEP;
    var r = E.addPoint(s, 'A', t);
    ok(r.ok, '加分应成功');
    var d2 = E.derive(s, t + STEP);
    var g1 = d2.games.filter(function (g) { return g.no === 1; })[0];
    eq(g1.score.A, 11, 'A 应得 11 分');
    eq(g1.winner, 'A', 'A 应赢下第 1 局');
    eq(d2.wins.A, 1, '总比分应为 A 1:0');
    eq(d2.wins.B, 0, 'B 胜局应为 0');
    eq(d2.curGameNo, 2, '应进入第 2 局');
    eq(d2.currentGame.score.A, 0, '第 2 局应从 0:0 开始');
    eq(d2.serve.serverTeam, 'B', '下一局应由 B 先发');
    eq(d2.matchOver, false, 'BO3 赢 1 局比赛未结束');
  }

  /* =========================================================
     验收 2：10:10 进入加球，每 1 分换发；11:10 不结束，需领先 2 分
     ========================================================= */
  function case2() {
    var s = started({ target: 11, deuce: true, firstServer: { team: 'A' } });
    play(s, repeat('A', 10) + repeat('B', 10));         /* 20 球 → 10:10 */
    var d = E.derive(s, T0 + 21 * STEP);
    eq(d.currentGame.score.A, 10); eq(d.currentGame.score.B, 10);
    ok(d.serve.deuce, '10:10 后应进入加球阶段');
    eq(d.serve.roundLen, 1, '加球阶段每 1 分换发');

    /* 加球阶段发球连续：20 球后循环位置不变，不重置 */
    var serveSeq = [];
    for (var n = 21; n <= 26; n++) {
      var sv = R.serveAt(s.config, R.gamePlan(s.config, 1), n);
      serveSeq.push(sv.serverTeam + ':' + sv.servedInRound + ':' + (sv.deuce ? 'D' : 'N'));
    }
    eq(serveSeq[0].split(':')[2], 'D', '第 21 球应处于加球阶段');
    /* 单打：每 1 球换发 */
    eq(serveSeq[0].split(':')[0], 'A', '第 21 球发球方应为 A（循环延续）');
    eq(serveSeq[1].split(':')[0], 'B', '第 22 球发球方应为 B');
    eq(serveSeq[2].split(':')[0], 'A', '第 23 球发球方应为 A');

    /* 11:10 不结束 */
    var t = T0 + 20 * STEP;
    var r1 = E.addPoint(s, 'A', t); t += STEP;
    eq(E.derive(s, t).currentGame.score.A, 11, 'A 应为 11 分');
    eq(E.derive(s, t).currentGame.winner, null, '11:10 不应结束该局');
    eq(E.derive(s, t).matchOver, false, '11:10 比赛不应结束');
    ok(r1.ok);

    /* 12:10 领先 2 分 → A 胜 */
    var r2 = E.addPoint(s, 'A', t); t += STEP;
    ok(r2.ok);
    var d2 = E.derive(s, t);
    var g1 = d2.games.filter(function (g) { return g.no === 1; })[0];
    eq(g1.score.A, 12, 'A 应为 12 分');
    eq(g1.score.B, 10, 'B 应为 10 分');
    eq(g1.winner, 'A', '12:10 应结束该局（领先 2 分）');
  }

  /* =========================================================
     验收 3：双打顺序与接发轮转
     ========================================================= */
  function case3() {
    var s = started({
      type: 'doubles',
      names: { A1: 'A1', A2: 'A2', B1: 'B1', B2: 'B2' },
      firstServer: { player: 'A1', receiver: 'B1' },
      target: 11, deuce: true
    });
    var plan = R.gamePlan(s.config, 1);
    deepEq(plan.order, ['A1', 'B1', 'A2', 'B2'], '第 1 局循环应为 A1→B1→A2→B2');

    /* 普通阶段：每人连发 2 球 */
    var expect = [
      [1, 'A1', 'B1'], [2, 'A1', 'B1'],
      [3, 'B1', 'A2'], [4, 'B1', 'A2'],
      [5, 'A2', 'B2'], [6, 'A2', 'B2'],
      [7, 'B2', 'A1'], [8, 'B2', 'A1'],
      [9, 'A1', 'B1'], [10, 'A1', 'B1']
    ];
    expect.forEach(function (row) {
      var sv = R.serveAt(s.config, plan, row[0]);
      eq(sv.serverPlayer, row[1], '第 ' + row[0] + ' 球发球人');
      eq(sv.receiverPlayer, row[2], '第 ' + row[0] + ' 球接发人');
      eq(sv.roundLen, 2, '普通阶段每轮 2 球');
    });

    /* 加球阶段：每 1 球换发，沿同一循环 A1→B1→A2→B2 继续，不重置 */
    var deuceRows = [];
    for (var n = 21; n <= 28; n++) {
      var sv2 = R.serveAt(s.config, plan, n);
      ok(sv2.deuce, '第 ' + n + ' 球应在加球阶段');
      eq(sv2.roundLen, 1, '加球阶段每轮 1 球');
      deuceRows.push(sv2.serverPlayer);
    }
    deepEq(deuceRows, ['A2', 'B2', 'A1', 'B1', 'A2', 'B2', 'A1', 'B1'],
      '加球阶段应按 A2→B2→A1→B1 继续循环（承接前 20 球，不重置）');

    /* 每隔 4 球覆盖全部 4 名球员且顺序固定 */
    var cycle = ['A1', 'B1', 'A2', 'B2'];
    var idx = cycle.indexOf(deuceRows[0]);
    deuceRows.forEach(function (p, i) { eq(p, cycle[(idx + i) % 4], '加球阶段第 ' + (i + 1) + ' 个发球人循环错误'); });

    /* 第 2 局：由上一局接发球队先发；先发球员 = 上一局该队首先接发球员 */
    var plan2 = R.gamePlan(s.config, 2);
    deepEq(plan2.order, ['B1', 'A1', 'B2', 'A2'], '第 2 局循环应为 B1→A1→B2→A2');
    eq(plan2.firstServerTeam, 'B', '第 2 局应由 B 队先发');
    eq(plan2.firstServerPlayer, 'B1', '第 2 局先发球员应为上一局首先接发球员 B1');
    eq(plan2.firstReceiverPlayer, 'A1', '第 2 局接发球员应为上一局首先发球员 A1');
  }

  /* =========================================================
     验收 4：固定 K 局
     ========================================================= */
  function case4a() {
    var s = started({ format: { kind: 'fixed', games: 4 }, target: 11, deuce: true });
    var t = T0;
    var seq = ['A', 'B', 'A', 'B'];
    for (var g = 0; g < 4; g++) {
      t = playGameToWin(s, seq[g], t);
      var d = E.derive(s, t);
      ok(!d.matchPoint.A.active && !d.matchPoint.B.active, '固定 K 局不应显示赛点');
      if (g < 3) ok(!d.matchOver, '固定 K 局未打满时比赛不应结束（第 ' + (g + 1) + ' 局后）');
    }
    var d2 = E.derive(s, t);
    ok(d2.matchOver, '打满 4 局后比赛应结束');
    eq(d2.outcome, 'draw', '2:2 应判平局');
    eq(d2.wins.A, 2); eq(d2.wins.B, 2);
    eq(d2.gamesPlayed, 4, '应打满 4 局');
    /* 每局都应有局点出现（局点计数 ≥ 1） */
    eq(d2.games.length, 4, '应有 4 局记录');
    d2.games.forEach(function (g) {
      ok(g.winner, '第 ' + g.no + ' 局应有胜方');
      ok(g.score.A >= 11 || g.score.B >= 11, '第 ' + g.no + ' 局应达到目标分');
    });
  }
  function case4b() {
    /* 固定 K 局不提前结束：K=3，A 先赢 2 局后比赛仍继续 */
    var s = started({ format: { kind: 'fixed', games: 3 }, target: 11, deuce: true });
    var t = playGameToWin(s, 'A', T0);
    var d = E.derive(s, t);
    ok(!d.matchOver, '固定 K=3：A 赢 1 局后不应结束');
    t = playGameToWin(s, 'A', t);
    d = E.derive(s, t);
    ok(!d.matchOver, '固定 K=3：A 赢 2 局后仍不应结束（要打满 3 局）');
    ok(!d.matchPoint.A.active, '固定 K 局不显示赛点');
    t = playGameToWin(s, 'B', t);
    d = E.derive(s, t);
    ok(d.matchOver, '打满 3 局后应结束');
    eq(d.outcome, 'A', '2:1 应由 A 获胜');
    eq(d.gamesPlayed, 3);
  }
  function case4c() {
    /* 对比：BO3 中 A 已 1 局在手、又在第 2 局拿到局点时，应显示赛点 */
    var s = started({ format: { kind: 'bo', bestOf: 3 }, target: 11, deuce: true });
    playGameToWin(s, 'A', T0);
    play(s, repeat('A', 10) + repeat('B', 9), T0 + 200 * STEP);
    var d = E.derive(s, T0 + 300 * STEP);
    ok(d.gamePoint.A.active, 'A 应处于局点');
    ok(d.matchPoint.A.active, 'BO3：A 再得 1 分即赢整场，应显示赛点');
    eq(d.matchPoint.A.count, 10, '赛点同样按“机会”计数：10:9 为第 10 个');
  }

  /* =========================================================
     验收 5：普通暂停
     ========================================================= */
  function case5() {
    var s = started({ target: 11, deuce: true });
    var t = T0;
    play(s, 'AB', t); t += 2 * STEP;                     /* 死球状态 */
    var d0 = E.derive(s, t);
    ok(d0.canScore, '死球状态可加分');

    var rp = E.requestPause(s, 'normal', 'A', t);
    ok(rp.ok, 'A 请求普通暂停应成功');
    var d1 = E.derive(s, t + 5000);
    eq(d1.playState, 'normalPause', '状态应为普通暂停');
    ok(!d1.canScore, '暂停期间应锁定计分');
    eq(d1.normalRemainMs, 55000, '剩余应为 55 秒');
    eq(E.addPoint(s, 'B', t + 6000).ok, false, '暂停期间加分应被拒绝');
    eq(E.undoPoint(s, t + 6000).ok, false, '暂停期间撤销应被拒绝');

    /* 暂停期间总计时继续 */
    var before = E.derive(s, t + 6000).times.matchElapsed;
    var later = E.derive(s, t + 30000).times.matchElapsed;
    eq(later - before, 24000, '暂停期间总计时应继续计时');

    /* 倒计时到 0：提示可恢复，但保持锁定 */
    var d2 = E.derive(s, t + 60000);
    ok(d2.normalExpired, '60 秒后应提示可恢复');
    ok(!!d2.activePause, '倒计时结束后仍应保持暂停锁定');
    ok(!d2.canScore, '倒计时结束后仍应锁定计分');

    /* 点击恢复 */
    var re = E.endPause(s, t + 62000);
    ok(re.ok, '恢复比赛应成功');
    var d3 = E.derive(s, t + 62000);
    ok(d3.canScore, '恢复后计分解锁');
    eq(d3.playState, 'dead', '恢复后回到死球状态');

    /* 暂停次数：A 已用完，B 仍可请求一次 */
    ok(!E.canRequestNormalPause(s, 'A'), 'A 再次请求普通暂停应不可用');
    ok(E.canRequestNormalPause(s, 'B'), 'B 应仍可请求一次');
    var rp2 = E.requestPause(s, 'normal', 'B', t + 63000);
    ok(rp2.ok, 'B 请求普通暂停应成功');
    eq(E.requestPause(s, 'normal', 'B', t + 64000).ok, false, 'B 第二次请求应失败');
    E.endPause(s, t + 65000);

    /* 单局时长包含暂停：局开始→局结束的墙钟时长（故不再断言精确值） */
    var startMs = s.gameStarts[1];
    var t4 = play(s, repeat('A', 11), t + 66000);
    var d4 = E.derive(s, t4);
    var g1 = d4.games[0];
    eq(g1.duration, g1.end - g1.start, '单局时长应为开始→结束的墙钟时长');
    eq(g1.duration, g1.end - startMs, '单局时长应从该局开始时间起算');
    eq(g1.pauses.length, 2, '该局应记录 2 次暂停');
    eq(startMs, T0, '局开始时间应为“开始比赛”时刻');
    eq(g1.end - startMs > 60000, true, '单局时长应包含暂停时间（本例 >60 秒）');
  }

  /* =========================================================
     验收 6：医疗暂停
     ========================================================= */
  function case6() {
    var s = started({ target: 11, deuce: true });
    var t = T0;
    play(s, 'AB', t); t += 2 * STEP;
    var r1 = E.requestPause(s, 'medical', 'B', t);
    ok(r1.ok, 'B 请求医疗暂停应成功');
    var d1 = E.derive(s, t + 20000);
    eq(d1.playState, 'medicalPause', '状态应为医疗暂停');
    eq(d1.canScore, false, '医疗暂停期间应锁定计分');
    eq(d1.medicalElapsedMs, 20000, '医疗暂停应为正计时 20 秒');
    eq(d1.normalRemainMs, null, '医疗暂停无倒计时限时');

    var re = E.endPause(s, t + 30000);
    ok(re.ok, '手动结束医疗暂停应成功');
    eq(re.pause.end - re.pause.start, 30000, '应记录开始/结束与时长');
    eq(E.derive(s, t + 30000).canScore, true, '结束后解锁计分');

    /* 可多次请求 */
    var r2 = E.requestPause(s, 'medical', 'B', t + 31000);
    ok(r2.ok, '医疗暂停可重复请求');
    E.endPause(s, t + 40000);
    var r3 = E.requestPause(s, 'medical', 'A', t + 41000);
    ok(r3.ok, 'A 也可请求医疗暂停（不限次数）');
    E.endPause(s, t + 50000);

    eq(s.pauses.length, 3, '应记录 3 次医疗暂停');
    eq(E.derive(s, t + 60000).canScore, true, '结束后可继续计分');
    eq(E.derive(s, t + 60000).times.pauseMedical, 30000 + 9000 + 9000, '医疗暂停累计时长应为 48 秒');
  }

  /* =========================================================
     验收 7：统计口径手工校验
     ========================================================= */
  function case7() {
    var s = started({ target: 11, deuce: true, firstServer: { team: 'A' } });
    /* 手工设计的 24 球序列，最终 11:13，B 从 0:5 落后逆转获胜 */
    var seq = repeat('A', 5) + repeat('B', 5) + repeat('A', 3) + repeat('B', 5) + 'AA' + 'ABBB';
    eq(seq.length, 24, '用例应含 24 球');
    play(s, seq);
    var winners = winnersOf(s);
    eq(winners[1], 'B', '第 1 局应由 B 获胜');

    var st = statsOf(s, 1);
    eq(st.points.A, 11, 'Points won A');
    eq(st.points.B, 13, 'Points won B');
    eq(st.maxLead.A, 5, 'Biggest lead A（曾 5:0 领先）');
    eq(st.maxLead.B, 2, 'Biggest lead B（最终 13:11 领先 2）');
    eq(st.ownWon.A, 5, 'A 己方发球轮得分');
    eq(st.ownLost.A, 7, 'A 己方发球轮失分');
    eq(st.oppWon.A, 6, 'A 对方发球轮得分');
    eq(st.oppLost.A, 6, 'A 对方发球轮失分');
    eq(st.ownWon.B, 6, 'B 己方发球轮得分');
    eq(st.ownLost.B, 6, 'B 己方发球轮失分');
    eq(st.oppWon.B, 7, 'B 对方发球轮得分');
    eq(st.oppLost.B, 5, 'B 对方发球轮失分（= A 己方发球轮得分）');
    eq(st.consWon.A, 5, 'A 连续得分最大（开局 5 连分）');
    eq(st.consWon.B, 5, 'B 连续得分最大（6-10 与 14-18 各 5 连分）');
    eq(st.consLost.A, 5, 'A 连续失分最大');
    eq(st.consLost.B, 5, 'B 连续失分最大');
    eq(st.deficit.B, 5, 'Greatest deficit overcome：B 曾落后 5 分并获胜');
    eq(st.deficit.A, 0, '负方 Greatest deficit overcome 记 0');
    eq(st.leadAgainst.B, 2, 'Greatest lead against：胜方 B 最大领先 2 分');
    eq(st.leadAgainst.A, 0, '负方 Greatest lead against 记 0');

    /* 一致性交叉校验 */
    eq(st.ownWon.A + st.oppWon.A, st.points.A, 'A 得分 = 己方发球轮得分 + 对方发球轮得分');
    eq(st.ownWon.B + st.oppWon.B, st.points.B, 'B 得分 = 己方发球轮得分 + 对方发球轮得分');
    /* 己方发球轮得分 + 失分 = 该方参与的发球轮总球数（= 对方发球轮总球数 ± 1） */
    eq(st.ownWon.A + st.ownLost.A, s.points.filter(function (p) { return p.serve === 'A'; }).length,
      'A 己方发球轮得分 + 失分 = A 发球的球数');
    eq(st.ownWon.B + st.ownLost.B, s.points.filter(function (p) { return p.serve === 'B'; }).length,
      'B 己方发球轮得分 + 失分 = B 发球的球数');
    eq(st.ownLost.A, st.oppWon.B, 'A 己方发球轮失分 = B 对方发球轮得分');
    eq(st.ownLost.B, st.oppWon.A, 'B 己方发球轮失分 = A 对方发球轮得分');
    eq(st.oppLost.A, st.ownWon.B, 'A 对方发球轮失分 = B 己方发球轮得分');

    /* 图表账本 */
    var led = st.ledger;
    eq(led.length, 24, '逐球账本应为 24 条');
    eq(led[4].cumA, 5, '第 5 球后 A 累计应为 5');
    eq(led[9].cumB, 5, '第 10 球后 B 累计应为 5');
    eq(led[23].cumB, 13, '末球 B 累计应为 13');

    /* 全场口径：单局 → 全场一致（本例仅 1 局） */
    var all = statsOf(s, null);
    eq(all.points.A, 11, '全场 Points won A');
    eq(all.points.B, 13, '全场 Points won B');
    eq(all.maxLead.A, 5, '全场 Biggest lead A 取各局最大值');
    eq(all.deficit.B, 5, '全场 Greatest deficit overcome');
    eq(all.leadAgainst.B, 2, '全场 Greatest lead against');

    /* 全场最大值不跨局：第 2 局 A 连得 2 分，全场连续得分仍为 5 */
    play(s, 'AB', T0 + 100 * STEP);
    eq(statsOf(s, null).consWon.A, 5, '全场连续得分不跨局累计');
    eq(statsOf(s, 2).consWon.A, 1, '第 2 局 A 连续得分为 1（A,B → 最后 1 球为 B）');
    eq(statsOf(s, null).points.A, 12, '全场 Points won A 含第 2 局');

    /* 全场 Biggest lead 取各局最大值（第 1 局 A 曾领先 5，第 2 局仅 1） */
    eq(statsOf(s, null).maxLead.A, 5, '全场 Biggest lead 取各局最大值，不按全场净胜分');
  }

  /* =========================================================
     验收 8：撤销
     ========================================================= */
  function case8() {
    /* A) 基础回退：比分、发球方、统计同步 */
    var s = started({ target: 11, deuce: true, firstServer: { team: 'A' } });
    var t = play(s, 'AB', T0);                     /* 1:1，前 2 球 A 发 */
    eq(E.derive(s, t).serve.serverTeam, 'B', '2 球后应由 B 发球');
    var u = E.undoPoint(s, t + STEP);
    ok(u.ok, '撤销应成功');
    var d2 = E.derive(s, t + STEP);
    eq(d2.currentGame.score.A, 1, '撤销后比分回到 1:0');
    eq(d2.currentGame.score.B, 0, '撤销后 B 为 0');
    eq(d2.serve.serverTeam, 'A', '撤销后发球方回到 A');
    eq(d2.serve.servedInRound, 1, '撤销后本发球轮已发球数回到 1');
    eq(statsOf(s, 1).points.A, 1, '撤销后统计同步回退');
    eq(statsOf(s, 1).points.B, 0, '撤销后统计同步回退');
    eq(S.compute(s.config, s.points, 1, winnersOf(s)).ledger.length, 1, '撤销后图表账本同步回退');

    /* B) 撤销导致局结束的一球 → 恢复该局进行中 */
    var s2 = started({ target: 11, deuce: true, firstServer: { team: 'A' } });
    play(s2, repeat('A', 10) + repeat('B', 9), T0);      /* 10:9 */
    var before = E.derive(s2, T0 + 20 * STEP);
    eq(before.gamePoint.A.count, 10, '10:9 时 A 局点计数为 10（10:0 起每个来球都是局点）');
    var t3 = T0 + 30 * STEP;
    var r = E.addPoint(s2, 'A', t3);                     /* A 11:9 赢下第 1 局 */
    ok(r.ok);
    var won = E.derive(s2, t3);
    eq(won.games[0].winner, 'A', 'A 应赢下第 1 局');
    eq(won.wins.A, 1, 'A 总胜局应为 1');
    eq(won.curGameNo, 2, '应进入第 2 局');

    var u2 = E.undoPoint(s2, t3 + STEP);
    ok(u2.ok, '撤销局末球应成功');
    var d3 = E.derive(s2, t3 + STEP);
    eq(d3.currentGame.score.A, 10, '撤销后回到 10:9');
    eq(d3.currentGame.winner, null, '撤销后该局应为进行中');
    eq(d3.wins.A, 0, '撤销后总胜局回退');
    eq(d3.curGameNo, 1, '撤销后仍为第 1 局');
    eq(d3.gamePoint.A.active, true, '撤销后 A 仍处于局点');
    eq(d3.gamePoint.A.count, 10, '撤销后局点计数回到 10（不会多算）');
    eq(d3.matchOver, false, '撤销后比赛未结束');
    eq(d3.currentGame.score.B, 9, '撤销后 B 仍为 9');

    /* C) 撤销导致比赛结束的一球 → 恢复比赛进行中 */
    var s3 = started({ format: { kind: 'bo', bestOf: 3 }, target: 11, deuce: true, firstServer: { team: 'A' } });
    var t4 = playGameToWin(s3, 'A', T0);                 /* 第 1 局 A 胜 */
    t4 = play(s3, repeat('A', 10) + repeat('B', 9), t4 + STEP);  /* 第 2 局 10:9 */
    var t5 = t4 + STEP;
    var r2 = E.addPoint(s3, 'A', t5);                    /* 11:9 → 第 2 局 A 胜 → BO3 结束 */
    ok(r2.ok);
    var dm = E.derive(s3, t5);
    eq(dm.matchOver, true, 'A 赢 2 局后比赛应结束');
    eq(dm.outcome, 'A');
    eq(dm.wins.A, 2, 'A 应赢 2 局');
    eq(E.addPoint(s3, 'B', t5 + STEP).ok, false, '比赛结束后加分应被拒绝');

    var u3 = E.undoPoint(s3, t5 + STEP);
    ok(u3.ok, '撤销赛末球应成功');
    var d4 = E.derive(s3, t5 + STEP);
    eq(d4.matchOver, false, '撤销后比赛应恢复进行中');
    eq(d4.wins.A, 1, '撤销后 A 胜局回到 1');
    eq(d4.curGameNo, 2, '撤销后回到第 2 局');
    eq(d4.currentGame.score.A, 10, '撤销后第 2 局回到 10:9');
    eq(d4.canScore, true, '撤销后可以继续计分');
    eq(E.addPoint(s3, 'B', t5 + 2 * STEP).ok, true, '撤销后可继续加分');
  }

  /* =========================================================
     验收 9：序列化 / 刷新恢复
     ========================================================= */
  function case9() {
    var s = started({ type: 'doubles', names: { A1: '甲', A2: '乙', B1: '丙', B2: '丁' }, firstServer: { player: 'A1', receiver: 'B2' }, target: 11, deuce: true });
    var t = play(s, 'ABAB', T0);
    E.requestPause(s, 'normal', 'A', t);
    E.endPause(s, t + 15000);
    play(s, 'AAB', t + 20000);
    var before = E.derive(s, t + 60000);

    var restored = E.sanitize(JSON.parse(JSON.stringify(s)));
    var after = E.derive(restored, t + 60000);
    eq(after.currentGame.score.A, before.currentGame.score.A, '恢复后比分 A');
    eq(after.currentGame.score.B, before.currentGame.score.B, '恢复后比分 B');
    eq(after.serve.serverTeam, before.serve.serverTeam, '恢复后发球方');
    eq(after.serve.serverPlayer, before.serve.serverPlayer, '恢复后发球人');
    eq(after.serve.receiverPlayer, before.serve.receiverPlayer, '恢复后接发人');
    eq(after.serve.servedInRound, before.serve.servedInRound, '恢复后本发球轮已发球数');
    eq(after.times.matchElapsed, before.times.matchElapsed, '恢复后总计时');
    eq(after.times.curGameElapsed, before.times.curGameElapsed, '恢复后单局计时');
    eq(restored.pauseUsed.A, 1, '恢复后已用普通暂停次数');
    eq(restored.points.length, s.points.length, '恢复后逐球记录条数');
    eq(JSON.stringify(S.compute(restored.config, restored.points, 1, winnersOf(restored))),
      JSON.stringify(S.compute(s.config, s.points, 1, winnersOf(s))), '恢复后统计一致');
    eq(after.curGameNo, before.curGameNo, '恢复后局号一致');
  }

  /* =========================================================
     验收 10：导出 JSON / CSV
     ========================================================= */
  function case10() {
    var s = started({ target: 11, deuce: true });
    var t = play(s, 'ABABAB', T0);
    E.requestPause(s, 'medical', 'B', t);
    E.endPause(s, t + 12000);
    playGameToWin(s, 'A', t + 20000);

    var payload = E.exportPayload(s, S, t + 100000);
    ok(payload.config && payload.config.target === 11, 'JSON 应包含配置');
    ok(Array.isArray(payload.points) && payload.points.length === s.points.length, 'JSON 应包含逐球记录');
    ok(payload.games.length >= 1 && payload.games[0].score, 'JSON 应包含每局比分');
    ok(Array.isArray(payload.pauses) && payload.pauses.length === 1, 'JSON 应包含暂停记录');
    ok(payload.stats && payload.stats.match && payload.stats.match.points, 'JSON 应包含统计结果');
    ok(payload.summary.totalDuration && payload.summary.format, 'JSON 应包含概要');
    eq(payload.points[0].scorer, 'A', '逐球记录字段 scorer');
    ok(isFinite(payload.points[0].t) && payload.points[0].serve, '逐球记录字段 t/serve');

    var csv = E.exportCsv(s, S, t + 100000);
    ok(csv.indexOf('SECTION,POINTS') >= 0, 'CSV 应包含逐球表');
    ok(csv.indexOf('SECTION,GAMES') >= 0, 'CSV 应包含每局汇总表');
    ok(csv.indexOf('SECTION,STATS') >= 0, 'CSV 应包含统计表');
    ok(csv.indexOf('Points won on own serve') >= 0, 'CSV 统计应含发球口径');

    /* CSV 逐球表与页面逐球记录一致 */
    var lines = csv.split('\r\n');
    var pi = lines.indexOf('SECTION,POINTS');
    var header = lines[pi + 1].split(',');
    var gi = { game: header.indexOf('game'), ball: header.indexOf('ball'), scorer: header.indexOf('scorer'), serve: header.indexOf('serve') };
    var rows = [];
    for (var i = pi + 2; i < lines.length && lines[i] && lines[i].indexOf('SECTION,') !== 0; i++) {
      rows.push(lines[i].split(','));
    }
    eq(rows.length, s.points.length, 'CSV 逐球行数应与逐球记录一致');
    s.points.slice().sort(function (a, b) { return a.game - b.game || a.t - b.t; }).forEach(function (p, idx) {
      eq(parseInt(rows[idx][gi.game], 10), p.game, 'CSV 第 ' + (idx + 1) + ' 行局号');
      eq(rows[idx][gi.scorer], p.scorer, 'CSV 第 ' + (idx + 1) + ' 行得分方');
      eq(rows[idx][gi.serve], p.serve, 'CSV 第 ' + (idx + 1) + ' 行发球方');
    });
    ok(typeof Blob === 'function' || typeof module === 'object', '导出使用 Blob（浏览器）');
  }

  /* =========================================================
     验收 11：比赛结束锁定
     ========================================================= */
  function case11() {
    var s = started({ format: { kind: 'bo', bestOf: 3 }, target: 11, deuce: true });
    var t = playGameToWin(s, 'A', T0);
    t = playGameToWin(s, 'A', t);
    var d = E.derive(s, t);
    ok(d.matchOver, 'BO3 先赢 2 局应结束');
    eq(d.outcome, 'A');
    var r = E.addPoint(s, 'B', t + STEP);
    eq(r.ok, false, '比赛结束后加分应被拒绝');
    eq(r.reason, 'over', '拒绝原因应为 over');
    eq(E.canScore(s), false, '比赛结束后不可计分');
    ok(E.exportPayload(s, S, t).summary.outcome === 'A', '结束后仍可导出');
    eq(E.resetMatch(s).started, false, '结束后仍可重置比赛');

    var f = started({ format: { kind: 'fixed', games: 2 }, target: 11, deuce: true });
    var tf = playGameToWin(f, 'A', T0);
    ok(!E.derive(f, tf).matchOver, '固定 K=2 未打满不应结束');
    tf = playGameToWin(f, 'B', tf);
    ok(E.derive(f, tf).matchOver, '固定 K=2 打满应结束');
    eq(E.addPoint(f, 'A', tf + STEP).ok, false, '固定 K 打满后加分应被拒绝');
  }

  /* =========================================================
     验收 12：点击只加 1 分、长按不连加（纯逻辑部分：单次加分）
     ========================================================= */
  function case12logic() {
    var s = started({ target: 11, deuce: true });
    var r = E.addPoint(s, 'A', T0);
    eq(r.derived.currentGame.score.A, 1, '一次加分只加 1 分');
    eq(s.points.length, 1, '一次加分只产生 1 条逐球记录');
    var r2 = E.addPoint(s, 'A', T0 + 1);
    eq(r2.derived.currentGame.score.A, 2, '再次加分累计为 2');
  }

  /* =========================================================
     回归：默认配置、进行中单局时长、普通暂停时机、BO5/BO7、加球关闭
     ========================================================= */
  function caseDefaults() {
    /* 加球开关默认必须为“开启” */
    var s = E.newState({});
    eq(s.config.deuce, true, '加球开关默认应为开启（newState({})）');
    eq(s.config.target, 11, '目标分默认应为 11');
    eq(s.config.format.kind, 'bo', '默认赛制应为 BO');
    eq(s.config.format.bestOf, 3, '默认应为 BO3');
    eq(s.config.names.A, '选手A', '单打 A 默认名');
    eq(s.config.names.B, '选手B', '单打 B 默认名');
    eq(s.config.firstServer.team, 'A', '默认先发方应为 A');
    eq(R.normalizeConfig({}).deuce, true, 'normalizeConfig 缺省 deuce 应为 true');
    eq(R.normalizeConfig({ deuce: false }).deuce, false, '显式 false 应保留为关闭');
    eq(R.normalizeConfig({ target: 0 }).target, 1, '目标分应被夹到 1–99');
    eq(R.normalizeConfig({ target: 500 }).target, 99, '目标分应被夹到 1–99');
    /* 双打默认先发/接发 */
    var dcfg = R.normalizeConfig({ type: 'doubles' });
    eq(dcfg.firstServer.player, 'A1', '双打默认先发球员应为 A1');
    eq(dcfg.firstServer.receiver, 'B1', '双打默认首先接发应为 B1（不同队）');
    eq(R.normalizeConfig({ type: 'doubles', firstServer: { player: 'A1', receiver: 'A2' } }).firstServer.receiver,
      'B1', '同队接发应被纠正为对方球员');
  }

  function caseLiveGameDuration() {
    var s = started({ target: 11, deuce: true });
    play(s, 'ABAB', T0);
    /* 进行中的局：时长应为 start → now 的实时值，而不是 0 */
    var d = E.derive(s, T0 + 30000);
    var g1 = d.games.filter(function (g) { return g.no === 1; })[0];
    eq(g1.end, null, '进行中的局不应有结束时间');
    eq(g1.duration, 30000, '进行中局的时长应为 开始→此刻');
    eq(d.times.curGameElapsed, 30000, '单局计时一致');
    /* 结束后应冻结为 结束-开始 */
    var t = play(s, repeat('A', 7) + repeat('B', 11), T0 + 30000);
    var d2 = E.derive(s, t);
    var g1b = d2.games.filter(function (g) { return g.no === 1; })[0];
    ok(g1b.end !== null, '该局应已结束');
    eq(g1b.duration, g1b.end - g1b.start, '结束后时长应冻结为 结束-开始');
    /* 结束后再往未来 derive，时长不应继续增长 */
    eq(E.derive(s, t + 600000).games.filter(function (g) { return g.no === 1; })[0].duration,
      g1b.duration, '已结束局的时长不应随 now 增长');
  }

  function caseNormalPauseTiming() {
    /* 未开始：不可请求 */
    var s0 = mkState({});
    eq(E.canRequestNormalPause(s0, 'A'), false, '未开始比赛不可请求普通暂停');
    /* 开始后、本局 0:0（未开球）：不可请求 */
    var s = started({ target: 11, deuce: true });
    eq(E.derive(s, T0).playState, 'playing', '开局未计分应为进行中');
    eq(E.canRequestNormalPause(s, 'A'), false, '本局 0:0 未开球不可请求普通暂停');
    eq(E.requestPause(s, 'normal', 'A', T0).ok, false, '0:0 时请求应被拒绝');
    /* 死球：可请求 */
    play(s, 'A', T0);
    var t = T0 + 1000;
    eq(E.derive(s, t).playState, 'dead', '计分后应为死球');
    eq(E.canRequestNormalPause(s, 'A', E.derive(s, t)), true, '死球状态可请求普通暂停');
    ok(E.requestPause(s, 'normal', 'A', t).ok, '死球请求应成功');
    E.endPause(s, t + 5000);
    /* 局间：不可请求 */
    var t2 = playGameToWin(s, 'A', t + 6000);
    var d2 = E.derive(s, t2);
    eq(d2.curGameNo, 2, '应进入第 2 局');
    eq(d2.playState, 'interval', '应为局间');
    eq(E.canRequestNormalPause(s, 'B', d2), false, '局间不可请求普通暂停');
    /* 医疗暂停在局间可请求 */
    eq(E.canRequestMedicalPause(s, d2), true, '局间可请求医疗暂停');
    /* 比赛结束：不可请求 */
    var s2 = started({ format: { kind: 'bo', bestOf: 3 }, target: 11, deuce: true });
    var t3 = playGameToWin(s2, 'A', T0); t3 = playGameToWin(s2, 'A', t3);
    eq(E.derive(s2, t3).matchOver, true, '比赛应已结束');
    eq(E.canRequestNormalPause(s2, 'A', E.derive(s2, t3)), false, '比赛结束后不可请求普通暂停');
  }

  function caseFormatsAndDeuceOff() {
    /* BO5 需 3 局、BO7 需 4 局 */
    [[5, 3], [7, 4]].forEach(function (pair) {
      var s = started({ format: { kind: 'bo', bestOf: pair[0] }, target: 11, deuce: true });
      var t = T0;
      for (var g = 0; g < pair[1]; g++) t = playGameToWin(s, 'A', t);
      var d = E.derive(s, t);
      eq(d.matchOver, true, 'BO' + pair[0] + ' 赢 ' + pair[1] + ' 局应结束');
      eq(d.outcome, 'A', 'BO' + pair[0] + ' 应由 A 获胜');
      eq(d.wins.A, pair[1], 'BO' + pair[0] + ' 胜局数');
    });
    /* 加球关闭：先到 T 即胜，11:10 直接结束 */
    var s2 = started({ target: 11, deuce: false });
    play(s2, repeat('A', 10) + repeat('B', 10), T0);
    var t2 = T0 + 20 * STEP;
    ok(E.addPoint(s2, 'A', t2).ok, '加球关闭时加分');
    var d2 = E.derive(s2, t2 + STEP);
    eq(d2.games[0].winner, 'A', '加球关闭时 11:10 应直接结束该局');
    eq(d2.games[0].score.A, 11, '加球关闭时比分应为 11:10');
    /* 加球关闭时不存在加球阶段，发球恒为每 2 分 */
    var cfg = { type: 'singles', target: 11, deuce: false, firstServer: { team: 'A' } };
    var plan = R.gamePlan(cfg, 1);
    [1, 2, 3, 21, 22, 45].forEach(function (n) {
      var sv = R.serveAt(cfg, plan, n);
      eq(sv.deuce, false, '加球关闭时第 ' + n + ' 球不应标记加球');
      eq(sv.roundLen, 2, '加球关闭时每轮恒为 2 球');
    });
    /* T=1：先到 1 分胜 */
    var s3 = started({ target: 1, deuce: true });
    E.addPoint(s3, 'A', T0);
    eq(E.derive(s3, T0 + STEP).games[0].winner, 'A', 'T=1 时先到 1 分胜');
    /* 换边阈值 */
    [[7, 4], [11, 6], [21, 11], [1, 1]].forEach(function (p) {
      eq(R.changeEndThreshold({ target: p[0] }), p[1], '⌈' + p[0] + '/2⌉ 应为 ' + p[1]);
    });
    /* 双打：先发 A2 / 接发 B2 时的逐局递推 */
    var dcfg = R.normalizeConfig({ type: 'doubles', target: 11, deuce: true, firstServer: { player: 'A2', receiver: 'B2' } });
    eq(R.gamePlan(dcfg, 1).order.join(','), 'A2,B2,A1,B1', '第 1 局顺序');
    eq(R.gamePlan(dcfg, 2).order.join(','), 'B2,A2,B1,A1', '第 2 局顺序');
    eq(R.gamePlan(dcfg, 3).order.join(','), 'A2,B2,A1,B1', '第 3 局顺序回到第 1 局');
  }

  function caseGamePointCounting() {
    /* 用户报告的场景：10:7 是 A 的第 1 个局点，10:8 应是第 2 个（分方统计） */
    var r = repeat;
    function seqState(seq, cfgOver) {
      var s = started(cfgOver || { target: 11, deuce: true, firstServer: { team: 'A' } });
      play(s, seq, T0);
      return E.derive(s, T0 + (seq.length + 1) * STEP);
    }
    /* 10:7 → 10:8 → 10:9：A 的局点依次为 1、2、3 */
    var d1 = seqState(r('B', 7) + r('A', 10));
    eq(d1.currentGame.score.A + ':' + d1.currentGame.score.B, '10:7', '比分 10:7');
    eq(d1.gamePoint.A.count, 1, '10:7 应为 A 的第 1 个局点');
    eq(d1.gamePoint.A.active, true, '10:7 A 处于局点');
    eq(d1.gamePoint.B.count, 0, 'B 无局点');

    var d2 = seqState(r('B', 7) + r('A', 10) + 'B');
    eq(d2.currentGame.score.A + ':' + d2.currentGame.score.B, '10:8', '比分 10:8');
    eq(d2.gamePoint.A.count, 2, '10:8 应为 A 的第 2 个局点（被 B 救掉一个）');
    eq(d2.gamePoint.A.active, true, '10:8 A 仍处于局点');

    var d3 = seqState(r('B', 7) + r('A', 10) + 'BB');
    eq(d3.currentGame.score.A + ':' + d3.currentGame.score.B, '10:9', '比分 10:9');
    eq(d3.gamePoint.A.count, 3, '10:9 应为 A 的第 3 个局点');

    /* 追平后 A 的局点消失，计数保留但不再累加 */
    var d4 = seqState(r('B', 7) + r('A', 10) + 'BBB');
    eq(d4.currentGame.score.A + ':' + d4.currentGame.score.B, '10:10', '比分 10:10');
    eq(d4.gamePoint.A.active, false, '10:10 A 的局点消失');
    eq(d4.gamePoint.A.count, 3, '追平后计数保留，不再增加');
    eq(d4.gamePoint.B.count, 0, '10:10 B 也没有局点（B 未到 11 分）');

    /* 分方统计：对称场景，B 拿局点 */
    var e1 = seqState(r('A', 7) + r('B', 10));
    eq(e1.gamePoint.B.count, 1, '7:10 为 B 的第 1 个局点');
    eq(e1.gamePoint.A.count, 0, 'A 无局点');
    var e2 = seqState(r('A', 7) + r('B', 10) + 'A');
    eq(e2.gamePoint.B.count, 2, '8:10 应为 B 的第 2 个局点');
    var e3 = seqState(r('A', 7) + r('B', 10) + 'AA');
    eq(e3.gamePoint.B.count, 3, '9:10 应为 B 的第 3 个局点');

    /* 加球阶段：11:10 为 A 的第 1 个局点，B 此时无局点 */
    var f1 = seqState(r('B', 10) + r('A', 11));
    eq(f1.gamePoint.A.count, 1, '加球阶段 11:10 为 A 的第 1 个局点');
    eq(f1.gamePoint.B.active, false, '11:10 时 B 无局点（B 未到 11）');

    /* 加球阶段被救后再出现即下一个：12:11 第 2 个、13:12 第 3 个 */
    /* 10:10 → A 11:10（第1个）→ B 11:11（消失）→ A 12:11（第2个） */
    var g1 = seqState(r('B', 10) + r('A', 11) + 'B' + 'A');
    eq(g1.currentGame.score.A + ':' + g1.currentGame.score.B, '12:11', '比分 12:11');
    eq(g1.gamePoint.A.count, 2, '12:11 应为 A 的第 2 个局点');
    /* 继续 → B 12:12（消失）→ A 13:12（第3个）：
       10:10 → A11:10 → B11:11 → A12:11 → B12:12 → A13:12 */
    var g2 = seqState(r('B', 10) + r('A', 11) + 'B' + 'A' + 'B' + 'A');
    eq(g2.currentGame.score.A + ':' + g2.currentGame.score.B, '13:12', '比分 13:12');
    eq(g2.gamePoint.A.count, 3, '13:12 应为 A 的第 3 个局点');

    /* 赛点与局点并存时同样按机会计数 */
    var s = started({ format: { kind: 'bo', bestOf: 3 }, target: 11, deuce: true, firstServer: { team: 'A' } });
    var t = playGameToWin(s, 'A', T0);            /* A 先拿 1 局 */
    play(s, r('A', 10), t + STEP);               /* 第 2 局 10:0 */
    var h1 = E.derive(s, t + 20 * STEP);
    eq(h1.gamePoint.A.count, 1, '第 2 局 10:0 为第 1 个局点');
    eq(h1.matchPoint.A.count, 1, '同时是第 1 个赛点');
    play(s, 'B', t + 30 * STEP);                 /* 10:1 */
    var h2 = E.derive(s, t + 40 * STEP);
    eq(h2.gamePoint.A.count, 2, '10:1 为第 2 个局点');
    eq(h2.matchPoint.A.count, 2, '10:1 为第 2 个赛点');
    play(s, 'BB', t + 50 * STEP);                /* 10:3 */
    var h3 = E.derive(s, t + 60 * STEP);
    eq(h3.gamePoint.A.count, 4, '10:3 为第 4 个局点');

    /* 一路领先、从未出现局点却直接赢局：无局点记录 */
    var k = seqState(r('A', 11) + r('B', 5));
    eq(k.gamePoint.A.count, 0, '11:5 一路领先时全程没有出现局点');
    eq(k.games[0].winner, 'A', '该局仍由 A 胜出');
  }

  function caseIntervalCountdown() {
    var s = started({ format: { kind: 'bo', bestOf: 3 }, target: 11, deuce: true });
    var t = playGameToWin(s, 'A', T0);          /* 第 1 局结束 */
    var d = E.derive(s, t);
    eq(d.curGameNo, 2, '应进入第 2 局');
    eq(d.playState, 'interval', '应为局间');
    eq(d.interval.active, true, '局间倒计时应激活');
    eq(d.interval.seconds, 60, '局间应为 1 分钟');
    eq(d.interval.start, t - STEP, '倒计时起点应为上一局结束时刻');
    /* 剩余时间 = 60 秒 − 自局末起已过去的时间 */
    var elapsed = t - d.interval.start;
    eq(d.interval.remainMs, 60000 - elapsed, '刚进入局间的剩余应为 60 秒减去已过时间');
    ok(d.interval.remainMs > 58000 && d.interval.remainMs <= 60000, '刚进入局间应剩余 58–60 秒，实际 ' + d.interval.remainMs + 'ms');
    eq(d.interval.expired, false, '刚进入局间不应过期');
    /* 局末后 30 秒 → 剩 30 秒 */
    var d30 = E.derive(s, d.interval.start + 30000);
    eq(d30.interval.remainMs, 30000, '局末后 30 秒应剩余 30 秒');
    /* 局末后 60 秒 → 过期，剩余不为负 */
    var d60 = E.derive(s, d.interval.start + 60000);
    eq(d60.interval.expired, true, '局末后 60 秒应过期');
    eq(d60.interval.remainMs, 0, '过期时剩余应为 0（不为负）');
    eq(d60.canScore, true, '局间倒计时结束不应锁定计分');
    ok(E.addPoint(s, 'B', d.interval.start + 61000).ok, '局间也能直接记分（自动开始下一局）');
    eq(E.derive(s, d.interval.start + 61000).playState, 'dead', '记分后进入死球');
    /* 开局计分后局间倒计时消失 */
    var s2 = started({ target: 11, deuce: true });
    playGameToWin(s2, 'A', T0);
    E.startGame(s2, T0 + 70000);
    var d2 = E.derive(s2, T0 + 70000);
    eq(d2.interval.active, false, '开始下一局后局间倒计时应停止');
    eq(d2.playState, 'playing', '应为进行中');
    /* 总时长包含局间 */
    var d3 = E.derive(s2, T0 + 70000);
    eq(d3.times.matchElapsed, 70000, '总时长应包含局间');
    /* 局间不计入任何一局的单局时长 */
    var g1 = d3.games.filter(function (g) { return g.no === 1; })[0];
    eq(g1.duration, g1.end - g1.start, '第 1 局时长应为 结束-开始');
    ok(g1.end <= T0 + 70000, '局间不计入第 1 局时长');
  }

  function caseNameEditing() {
    /* 空串必须被保留，不能被自动填回默认名 */
    var s = E.newState({});
    s.config.names.A = '';
    s.config.names.B = '   ';
    eq(s.config.names.A, '', '空名应保留为空串');
    /* 展示层回退到默认名 */
    eq(R.teamLabel(s.config, 'A'), '选手A', '空名展示应回退为选手A');
    eq(R.teamLabel(s.config, 'B'), '选手B', '空白名展示应回退为选手B');
    /* 显式命名时正常显示 */
    s.config.names.A = '张三';
    eq(R.teamLabel(s.config, 'A'), '张三', '有名字时应显示用户输入');
    /* 双打空名回退 */
    var dcfg = R.normalizeConfig({ type: 'doubles' });
    dcfg.names.A1 = '';
    dcfg.names.A2 = '小李';
    eq(R.teamLabel(dcfg, 'A'), 'A队 · A1/小李', '双打空名应回退到占位键名');
    /* normalizeConfig 仍会在“无值”时补默认名（比赛开始路径） */
    var norm = R.normalizeConfig({ names: { A: '', B: '   ' } });
    eq(norm.names.A, '选手A', 'normalizeConfig 无值时补默认名');
    eq(norm.names.B, '选手B', 'normalizeConfig 空白值时补默认名');
    /* 但显式传入的名字不能被改写 */
    eq(R.normalizeConfig({ names: { A: '王五' } }).names.A, '王五', '显式名字应保留');
    /* displayName 兜底 */
    eq(R.displayName({ names: { A: '' } }, 'A', '选手A'), '选手A', 'displayName 空值回退');
    eq(R.displayName({ names: { A: '赵六' } }, 'A', '选手A'), '赵六', 'displayName 有值直取');
  }

  /* =========================================================
     DOM / 浏览器集成测试
     ========================================================= */
  var P = null;   /* app 暴露的测试钩子 */

  function restoreApp(saved, savedRaw) {
    P.load(E.sanitize(saved));
    try {
      if (savedRaw == null) localStorage.removeItem('pp-scorer-state-v1');
      else localStorage.setItem('pp-scorer-state-v1', savedRaw);
    } catch (e) {}
  }
  function appSnapshot() {
    var saved = JSON.parse(JSON.stringify(P.state));
    var savedRaw = null;
    try { savedRaw = localStorage.getItem('pp-scorer-state-v1'); } catch (e) {}
    return { saved: saved, raw: savedRaw };
  }

  function domCase4() {
    var snap = appSnapshot();
    P.load(E.newState({ format: { kind: 'fixed', games: 4 }, target: 11, deuce: true }));
    P.startMatch();
    var seq = ['A', 'B', 'A', 'B'];
    for (var g = 0; g < 4; g++) P.autoPlayGame(seq[g]);
    P.render();
    var cards = document.querySelectorAll('#gameCards .game-card');
    eq(cards.length, 4, '赛末应显示 4 张每局卡片');
    for (var i = 0; i < cards.length; i++) {
      ok(cards[i].querySelector('svg.chart'), '第 ' + (i + 1) + ' 张卡片应含双折线图');
      ok(cards[i].querySelectorAll('.mini-stats > div').length >= 20, '第 ' + (i + 1) + ' 张卡片应含单局统计摘要');
      ok(/胜方/.test(cards[i].textContent), '卡片应含胜方信息');
      ok(/局时长/.test(cards[i].textContent), '卡片应含局时长');
    }
    var d = E.derive(P.state);
    eq(d.outcome, 'draw', 'K=4 打满 2:2 应平局');
    eq(document.querySelectorAll('#summaryPanel .pill')[0].textContent.indexOf('平局') >= 0, true, '汇总区应显示平局');
    restoreApp(snap.saved, snap.raw);
    P.render();
  }

  /** 通过弹窗请求暂停：打开弹窗 → 点第一个选项 → 等待暂停生效
   *  注意：requestPauseUI 返回的 promise 会在点击选项后才 resolve，因此不能链在它上面等弹窗。 */
  function pauseViaModal(type) {
    var p = P.requestPauseUI(type);
    if (p && p.catch) p.catch(function () {});
    return waitFor(function () { return document.querySelector('#modalBody .choice-row .btn'); })
      .then(function (btn) {
        btn.click();
        return waitFor(function () { return E.derive(P.state).activePause; });
      });
  }

  function domCase5() {
    var snap = appSnapshot();
    P.load(E.newState({ target: 11, deuce: true }));
    P.startMatch();
    P.clickScoreNow('A');
    return pauseViaModal('normal').then(function () {
      var d = E.derive(P.state);
      eq(d.playState, 'normalPause', 'UI：应进入普通暂停');
      eq(document.getElementById('btnPointA').disabled, true, 'UI：暂停期间加分按钮应禁用');
      eq(document.getElementById('pauseBanner').hidden, false, 'UI：应显示暂停横幅');
      eq(/^\d\d:\d\d$/.test(document.getElementById('pauseCountdown').textContent), true,
        'UI：应显示倒计时，实际=' + document.getElementById('pauseCountdown').textContent);
      eq(document.getElementById('pauseCountdown').hidden, false, 'UI：倒计时可见');
      /* 恢复 */
      document.getElementById('btnResume').click();
      return waitFor(function () { return !E.derive(P.state).activePause; });
    }).then(function () {
      eq(document.getElementById('btnPointA').disabled, false, 'UI：恢复后加分按钮应可用');
      eq(document.getElementById('pauseBanner').hidden, true, 'UI：恢复后横幅应隐藏');
      restoreApp(snap.saved, snap.raw);
      P.render();
    });
  }

  function domCase6() {
    var snap = appSnapshot();
    P.load(E.newState({ target: 11, deuce: true }));
    P.startMatch();
    P.clickScoreNow('A');
    return pauseViaModal('medical').then(function () {
      var d = E.derive(P.state);
      eq(d.playState, 'medicalPause', 'UI：应进入医疗暂停');
      eq(/^\d\d:\d\d$/.test(document.getElementById('pauseCountdown').textContent), true, 'UI：医疗暂停应正计时 mm:ss');
      eq(document.getElementById('btnPointB').disabled, true, 'UI：医疗暂停锁定计分');
      document.getElementById('btnResumeInline').click();
      return waitFor(function () { return !E.derive(P.state).activePause; });
    }).then(function () {
      restoreApp(snap.saved, snap.raw);
      P.render();
    });
  }

  function domCase9() {
    var snap = appSnapshot();
    P.load(E.newState({ type: 'doubles', names: { A1: '甲', A2: '乙', B1: '丙', B2: '丁' }, firstServer: { player: 'A1', receiver: 'B2' }, target: 11, deuce: true }));
    P.startMatch();
    P.clickScoreNow('A'); P.clickScoreNow('B'); P.clickScoreNow('A');
    P.saveNow();
    var before = E.derive(P.state);
    var reloaded = P.loadFromStorage();
    ok(!!reloaded, '应从 localStorage 恢复状态');
    var after = E.derive(reloaded);
    eq(after.currentGame.score.A, before.currentGame.score.A, '刷新后比分 A');
    eq(after.currentGame.score.B, before.currentGame.score.B, '刷新后比分 B');
    eq(after.serve.serverPlayer, before.serve.serverPlayer, '刷新后发球人');
    eq(after.serve.receiverPlayer, before.serve.receiverPlayer, '刷新后接发人');
    eq(reloaded.points.length, P.state.points.length, '刷新后逐球记录');
    eq(after.times.matchElapsed >= before.times.matchElapsed, true, '刷新后计时连续');
    restoreApp(snap.saved, snap.raw);
    P.render();
  }

  function domCase12() {
    var snap = appSnapshot();
    P.load(E.newState({ target: 11, deuce: true }));
    P.startMatch();
    P.render();

    /* 每次点击只加 1 分（只绑定 click，长按不产生重复加分） */
    var a0 = E.derive(P.state).currentGame.score.A;
    P.clickScoreNow('A');
    eq(E.derive(P.state).currentGame.score.A, a0 + 1, '一次点击只应加 1 分');
    P.clickScoreNow('A');
    eq(E.derive(P.state).currentGame.score.A, a0 + 2, '再次点击应再加 1 分');
    eq(P.state.points.length >= 2, true, '两次点击应产生 2 条逐球记录');

    return Promise.resolve().then(function () {
      /* 长按（pointerdown 后 400ms 再 pointerup/click）只加 1 分 */
      var btn = document.getElementById('btnPointB');
      var n0 = E.derive(P.state).currentGame.score.B;
      btn.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      return new Promise(function (res) { setTimeout(res, 400); }).then(function () {
        btn.dispatchEvent(new Event('pointerup', { bubbles: true }));
        btn.click();
        eq(E.derive(P.state).currentGame.score.B, n0 + 1, '长按 400ms 后只应加 1 分');
      });
    }).then(function () {
      /* 快捷键 A / → / Ctrl+Z */
      var a1 = E.derive(P.state).currentGame.score.A;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
      eq(E.derive(P.state).currentGame.score.A, a1 + 1, '快捷键 A 应加 1 分');
      var b1 = E.derive(P.state).currentGame.score.B;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      eq(E.derive(P.state).currentGame.score.B, b1 + 1, '方向键 → 应给 B 加 1 分');
      var n1 = P.state.points.length;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
      eq(P.state.points.length, n1 - 1, 'Ctrl+Z 应撤销 1 球');

      /* 输入框聚焦时单键快捷键不生效 */
      var input = document.getElementById('nameA');
      var a2 = E.derive(P.state).currentGame.score.A;
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
      eq(E.derive(P.state).currentGame.score.A, a2, '输入框内按键不应加分');

      /* 手动换边不改变数据 */
      var pts = JSON.stringify(P.state.points);
      var sc = JSON.stringify(E.derive(P.state).currentGame.score);
      document.getElementById('btnSwap').click();
      eq(JSON.stringify(P.state.points), pts, '手动换边不应改变逐球记录');
      eq(JSON.stringify(E.derive(P.state).currentGame.score), sc, '手动换边不应改变比分');
      eq(P.state.ui.swapped, true, '手动换边应切换显示方向');
      eq(document.getElementById('sides').classList.contains('swapped'), true, '应加上 swapped 类');
    }).then(function () {
      /* 重置本局需二次确认（第一次确认后不清数据） */
      P.resetGameUI();
      return waitFor(function () { return document.querySelector('#modalActions .btn-primary'); });
    }).then(function (btn) {
      btn.click();
      eq(P.state.points.length > 0, true, '第一次确认后不应清除数据（需二次确认）');
      return waitFor(function () { return document.querySelector('#modalActions .btn-primary'); });
    }).then(function (btn2) {
      btn2.click();
      return waitFor(function () { return P.state.points.filter(function (p) { return p.game === 1; }).length === 0; });
    }).then(function () {
      eq(P.state.points.filter(function (p) { return p.game === 1; }).length, 0, '二次确认后本局数据应被清除');
      restoreApp(snap.saved, snap.raw);
      P.render();
    });
  }

  function domChangeEnd() {
    var snap = appSnapshot();
    /* BO3，第 3 局为决胜局；先“打完”前两局，再进入第 3 局到 6 分 */
    P.load(E.newState({ format: { kind: 'bo', bestOf: 3 }, target: 11, deuce: true }));
    P.startMatch();
    P.autoPlayGame('A');
    P.autoPlayGame('B');
    P.render();
    var d = E.derive(P.state);
    eq(d.curGameNo, 3, '应进入第 3 局（决胜局）');
    ok(d.changeEnd.applicable, 'BO 决胜局应适用换边提示');
    eq(d.changeEnd.threshold, 6, '目标分 11 时换边阈值为 ⌈11/2⌉ = 6');
    ok(!d.changeEnd.reached, '尚未到 6 分不应提示');
    var guard = 0;
    while (!E.derive(P.state).changeEnd.reached && guard++ < 30) P.autoPoint('A');
    P.render();
    var d2 = E.derive(P.state);
    ok(d2.changeEnd.reached, '一方到 6 分后应提示换边');
    ok(!document.getElementById('changeEndBanner').hidden, 'UI：应显示换边提示横幅');
    eq(d2.currentGame.score.A, 6, 'A 应为 6 分');
    /* 换边不改发球顺序、不改数据 */
    var serveBefore = d2.serve.serverTeam + '/' + d2.serve.serverPlayer;
    document.getElementById('btnAckChangeEnd').click();
    var d3 = E.derive(P.state);
    eq(d3.serve.serverTeam + '/' + d3.serve.serverPlayer, serveBefore, '换边不应改变发球顺序');
    ok(d3.changeEnd.done, '确认后应记为已提示');
    ok(document.getElementById('changeEndBanner').hidden, '确认后横幅应隐藏');
    restoreApp(snap.saved, snap.raw);
    P.render();
  }

  function domNameEditing() {
    var snap = appSnapshot();
    P.load(E.newState({}));
    P.render();
    var el = document.getElementById('nameA');
    /* 模拟真实逐字删除：清空后不应被自动填回 */
    el.value = '张';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.value = '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    eq(el.value, '', 'UI：姓名清空后输入框应保持为空（不被自动填回）');
    eq(E.derive(P.state).cfg.names.A, '', 'UI：清空后配置里应为空串');
    /* 空名在展示层回退为默认名 */
    eq(document.getElementById('nameBoxA').textContent, '选手A', 'UI：空名应回退显示“选手A”');
    eq(document.getElementById('pointLabelA').textContent, '选手A +1', 'UI：加分按钮标签回退');
    /* 继续重新输入 */
    el.value = '张三';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    eq(el.value, '张三', 'UI：可重新输入新名');
    eq(document.getElementById('nameBoxA').textContent, '张三', 'UI：展示新名');
    /* 只输入空格也应可处理 */
    el.value = '   ';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    eq(el.value, '   ', 'UI：仅空格时输入框保留原样');
    el.value = '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    /* 开始比赛时空位补默认名并锁定 */
    document.getElementById('btnStartMatch').click();
    eq(E.derive(P.state).cfg.names.A, '选手A', 'UI：开始比赛时空名应补为默认名');
    eq(document.getElementById('nameA').disabled, true, 'UI：开始后配置锁定');
    restoreApp(snap.saved, snap.raw);
    P.render();
  }

  function domIntervalAndCountdown() {
    var snap = appSnapshot();
    P.load(E.newState({ format: { kind: 'bo', bestOf: 3 }, target: 11, deuce: true }));
    P.startMatch();
    P.autoPlayGame('A');
    P.render();
    var ib = document.getElementById('intervalBanner');
    eq(ib.hidden, false, 'UI：局间应显示局间休息横幅');
    eq(/局间休息/.test(document.getElementById('intervalText').textContent), true, 'UI：应写明局间休息');
    var icd = document.getElementById('intervalCountdown');
    eq(/^\d\d:\d\d$/.test(icd.textContent), true, 'UI：局间应显示 mm:ss 倒计时，实际=' + icd.textContent);
    /* 倒计时字号应明显大于正文（14–16px） */
    var fs = parseFloat(getComputedStyle(icd).fontSize);
    ok(fs >= 30, 'UI：局间倒计时应放大显示（实际 ' + fs + 'px）');
    /* 把上一局结束时间人为提前 70 秒 → 应显示已满并提示，但不锁分 */
    var d = E.derive(P.state);
    var g = P.state.points.filter(function (p) { return p.game === 1; });
    var lastT = g[g.length - 1].t;
    var shift = 70000;
    P.state.points.forEach(function (p) { p.t -= shift; });
    Object.keys(P.state.gameStarts).forEach(function (k) { P.state.gameStarts[k] -= shift; });
    P.state.matchStart -= shift;
    P.render();
    eq(E.derive(P.state).interval.expired, true, 'UI：70 秒后局间倒计时应过期');
    eq(document.getElementById('intervalCountdown').textContent, '00:00', 'UI：过期显示 00:00');
    eq(document.getElementById('intervalBanner').classList.contains('is-over'), true, 'UI：过期应加 is-over 样式');
    eq(E.derive(P.state).canScore, true, 'UI：局间不锁分');
    eq(document.getElementById('btnPointA').disabled, false, 'UI：局间仍可加分');
    eq(document.getElementById('btnStartGameInline').hidden, false, 'UI：局间应提供“开始下一局”按钮');
    /* 开始下一局 → 横幅消失 */
    document.getElementById('btnStartGameInline').click();
    eq(document.getElementById('intervalBanner').hidden, true, 'UI：开始下一局后局间横幅应隐藏');
    eq(E.derive(P.state).playState, 'playing', 'UI：应为进行中');
    /* 暂停倒计时放大显示 */
    P.clickScoreNow('A');
    P.requestPauseUI('normal');
    return waitFor(function () { return document.querySelector('#modalBody .choice-row .btn'); })
      .then(function (btn) {
        btn.click();
        return waitFor(function () { return E.derive(P.state).activePause; });
      })
      .then(function () {
        var pcd = document.getElementById('pauseCountdown');
        eq(pcd.hidden, false, 'UI：暂停时应显示放大倒计时');
        eq(/^\d\d:\d\d$/.test(pcd.textContent), true, 'UI：暂停倒计时应为 mm:ss，实际=' + pcd.textContent);
        var pfs = parseFloat(getComputedStyle(pcd).fontSize);
        ok(pfs >= 30, 'UI：暂停倒计时应放大显示（实际 ' + pfs + 'px）');
        ok(pfs >= parseFloat(getComputedStyle(document.getElementById('pauseBannerText')).fontSize) * 2,
          'UI：暂停倒计时字号应至少为说明文字的 2 倍');
        document.getElementById('btnResume').click();
        return waitFor(function () { return !E.derive(P.state).activePause; });
      })
      .then(function () {
        eq(document.getElementById('pauseCountdown').hidden, true, 'UI：恢复后应隐藏倒计时');
        restoreApp(snap.saved, snap.raw);
        P.render();
      });
  }

  function domHiddenOverlays() {
    var snap = appSnapshot();
    /* 复现“初始加载”状态：全新配置 + 完整渲染 */
    P.load(E.newState({}));
    P.render();
    function disp(id) { return getComputedStyle(document.getElementById(id)).display; }

    /* 关键回归：CSS 给这些元素设了 display，绝不能压过 hidden 属性 */
    eq(disp('modalBackdrop'), 'none', '弹窗遮罩在未打开时必须 display:none（否则会盖住整页）');
    eq(disp('pauseBanner'), 'none', '暂停横幅未暂停时必须隐藏');
    eq(disp('changeEndBanner'), 'none', '换边横幅未触发时必须隐藏');
    eq(disp('summaryPanel'), 'none', '无已完成局时赛末汇总必须隐藏');
    eq(disp('statsGameWrap'), 'none', '全场 tab 时单局选择器必须隐藏');
    /* 单打时双打姓名区隐藏、双打时反之 */
    var t = document.querySelector('input[name=cfgType][value=singles]');
    t.checked = true;
    t.dispatchEvent(new Event('change', { bubbles: true }));
    eq(disp('namesDoubles'), 'none', '单打时应隐藏双打姓名区');
    eq(disp('doublesServeWrap'), 'none', '单打时应隐藏双打发球配置');
    eq(disp('firstTeamWrap') === 'none', false, '单打时应显示先发方选择');
    var td = document.querySelector('input[name=cfgType][value=doubles]');
    td.checked = true;
    td.dispatchEvent(new Event('change', { bubbles: true }));
    eq(disp('namesSingles'), 'none', '双打时应隐藏单打姓名区');
    eq(disp('namesDoubles') === 'none', false, '双打时应显示双打姓名区');
    eq(disp('doublesServeWrap') === 'none', false, '双打时应显示先发/接发选择');
    eq(disp('firstTeamWrap'), 'none', '双打时应隐藏单打先发方选择');
    /* 赛制互斥：BO 选项与固定 K 选项不同时显示 */
    eq(disp('fixedOptions'), 'none', 'BO 赛制时应隐藏固定 K 选项');
    eq(disp('boOptions') === 'none', false, 'BO 赛制时应显示 BO 选项');

    /* 弹窗打开时必须可见，关闭后必须重新隐藏（需先进入死球状态才能请求普通暂停） */
    P.load(E.newState({ target: 11, deuce: true }));
    P.startMatch();
    P.clickScoreNow('A');
    P.render();
    eq(E.derive(P.state).playState, 'dead', '应为死球（弹窗测试前提）');
    P.requestPauseUI('normal');
    return waitFor(function () { return getComputedStyle(document.getElementById('modalBackdrop')).display !== 'none'; })
      .then(function () {
        eq(getComputedStyle(document.getElementById('modalBackdrop')).display !== 'none', true, '弹窗打开时应可见');
        /* 点“取消”关闭 */
        var cancel = document.querySelector('#modalActions .btn');
        ok(cancel, '弹窗应有取消按钮');
        cancel.click();
        return waitFor(function () { return getComputedStyle(document.getElementById('modalBackdrop')).display === 'none'; });
      })
      .then(function () {
        eq(getComputedStyle(document.getElementById('modalBackdrop')).display, 'none', '关闭后弹窗必须重新隐藏');
        /* 属性同步：hidden 属性与计算样式一致 */
        eq(document.getElementById('modalBackdrop').hidden, true, '关闭后 hidden 属性应为 true');
        restoreApp(snap.saved, snap.raw);
        P.render();
      });
  }

  function domDefaults() {
    /* 首屏（未做任何操作）必须显示“加球”已勾选 */
    eq(document.getElementById('deuceToggle').checked, true, 'UI：首屏加球应默认勾选');
    eq(document.getElementById('targetInput').value, '11', 'UI：首屏目标分应为 11');
    var d = E.derive(P.state);
    eq(d.cfg.deuce, true, 'UI：首屏配置加球应为开启');
    /* 切换加球开关后写回配置 */
    var t = document.getElementById('deuceToggle');
    t.checked = false;
    t.dispatchEvent(new Event('change', { bubbles: true }));
    eq(E.derive(P.state).cfg.deuce, false, 'UI：取消勾选应写入配置');
    t.checked = true;
    t.dispatchEvent(new Event('change', { bubbles: true }));
    eq(E.derive(P.state).cfg.deuce, true, 'UI：重新勾选应写入配置');
  }

  function domLiveDuration() {
    /* 进行中局的“单局”tab 时长必须实时，而不是 00:00 */
    var snap = appSnapshot();
    P.load(E.newState({ target: 11, deuce: true }));
    P.startMatch();
    P.clickScoreNow('A');
    P.render();
    /* 把该局开始时间人为提前 90 秒，模拟已进行了 90 秒 */
    P.state.gameStarts[1] = Date.now() - 90000;
    P.render();
    var d = E.derive(P.state);
    eq(d.games[0].duration, 90000, '进行中局时长应为 开始→此刻（90 秒）');
    eq(document.getElementById('tabGame').disabled, false, '单局 tab 可用');
    document.getElementById('tabGame').click();
    var txt = document.getElementById('statsDuration').textContent;
    eq(txt.indexOf('00:00') < 0, true, 'UI：进行中局的单局 tab 不应显示 00:00');
    eq(txt.indexOf('01:30') >= 0, true, 'UI：进行中局的单局 tab 应显示 01:30');
    restoreApp(snap.saved, snap.raw);
    P.render();
  }

  function domPauseTiming() {
    var snap = appSnapshot();
    /* 本局 0:0（未开球）不可请求普通暂停 */
    P.load(E.newState({ target: 11, deuce: true }));
    P.startMatch();
    P.render();
    eq(E.derive(P.state).playState, 'playing', '开局未计分为进行中');
    eq(document.getElementById('btnNormalPause').disabled, true, 'UI：本局 0:0 普通暂停按钮应禁用');
    eq(E.requestPause(P.state, 'normal', 'A', Date.now()).ok, false, 'UI：0:0 请求普通暂停应被拒绝');
    /* 计分后（死球）可用 */
    P.clickScoreNow('A');
    eq(E.derive(P.state).playState, 'dead', '计分后为死球');
    eq(document.getElementById('btnNormalPause').disabled, false, 'UI：死球时普通暂停按钮应可用');
    /* 局间不可用，但医疗暂停可用 */
    P.autoPlayGame('A');
    var d = E.derive(P.state);
    eq(d.playState, 'interval', '应为局间');
    eq(document.getElementById('btnNormalPause').disabled, true, 'UI：局间普通暂停按钮应禁用');
    eq(document.getElementById('btnMedicalPause').disabled, false, 'UI：局间医疗暂停应可用');
    /* 比赛结束后都不可用，但仍可导出/重置 */
    P.autoPlayGame('A');
    P.render();
    eq(E.derive(P.state).matchOver, true, 'BO3 应已结束');
    eq(document.getElementById('btnNormalPause').disabled, true, 'UI：结束后普通暂停应禁用');
    eq(document.getElementById('btnMedicalPause').disabled, true, 'UI：结束后医疗暂停应禁用');
    eq(document.getElementById('btnExportCsv').disabled, false, 'UI：结束后仍可导出');
    restoreApp(snap.saved, snap.raw);
    P.render();
  }

  function domExport() {
    var snap = appSnapshot();
    P.load(E.newState({ target: 11, deuce: true }));
    P.startMatch();
    P.clickScoreNow('A');
    P.saveNow();
    /* 导出函数与按钮使用同一实现：这里校验内容与 Blob 可用性 */
    var payload = E.exportPayload(P.state, S, Date.now());
    ok(payload.points.length === 1, 'UI 导出 JSON 应含 1 条逐球记录');
    var csv = E.exportCsv(P.state, S, Date.now());
    ok(csv.indexOf('SECTION,POINTS') > 0, 'UI 导出 CSV 应含逐球表');
    ok(typeof Blob === 'function' && typeof URL.createObjectURL === 'function', '浏览器应支持 Blob 下载');
    ok(typeof document.getElementById('btnExportJson').onclick !== 'undefined', '导出按钮存在');
    eq(document.getElementById('btnExportJson').disabled, false, '导出按钮可用');
    restoreApp(snap.saved, snap.raw);
    P.render();
  }

  function domCase11() {
    var snap = appSnapshot();
    P.load(E.newState({ format: { kind: 'bo', bestOf: 3 }, target: 11, deuce: true }));
    P.startMatch();
    P.autoPlayGame('A');
    P.autoPlayGame('A');
    P.render();
    var d = E.derive(P.state);
    ok(d.matchOver, 'UI：BO3 先赢 2 局应结束');
    ok(document.getElementById('btnPointA').disabled, 'UI：结束后加分按钮应禁用');
    ok(document.getElementById('btnPointB').disabled, 'UI：结束后加分按钮应禁用');
    eq(document.getElementById('statePill').textContent.indexOf('比赛结束') >= 0, true, 'UI：状态应显示比赛结束');
    eq(document.getElementById('btnExportJson').disabled, false, 'UI：结束后仍可导出');
    eq(document.getElementById('btnResetMatch').disabled, false, 'UI：结束后仍可重置');
    restoreApp(snap.saved, snap.raw);
    P.render();
  }

  /* ---------------- 运行 ---------------- */
  async function run(doc) {
    results.length = 0;
    var isDom = !!(doc && typeof window !== 'undefined' && window.__ppTest);
    domMode = isDom;
    if (isDom) {
      P = window.__ppTest;
      /* 先建立面板，便于实时看到进度（也便于无头抓取） */
      ensurePanel(doc);
      updatePanel(doc, { total: 0, passed: 0, failed: 0, results: [], running: true });
    }

    var queue = [
      ['验收1 单打 BO3 11 分加球开：10:9 局点 / 11:9 赢局 / 下局 B 先发', case1],
      ['验收2 10:10 加球：每 1 分换发 / 11:10 不结束 / 12:10 获胜', case2],
      ['验收3 双打顺序与接发轮转（含加球阶段继续循环）', case3],
      ['验收4a 固定 K=4：打满 4 局 2:2 平局 / 无赛点', case4a],
      ['验收4b 固定 K=3：打满 3 局按胜局多者获胜', case4b],
      ['验收4c 对照 BO3：应显示赛点', case4c],
      ['验收5 普通暂停：60 秒倒计时 / 锁定计分 / 总计时继续 / 次数限制 / 含入单局时长', case5],
      ['验收6 医疗暂停：正计时 / 手动结束 / 可多次 / 总计时继续', case6],
      ['验收7 统计手工校验（24 球 11:13，含四项发球与 Greatest 口径）', case7],
      ['验收8 撤销：比分/发球/局点/统计/局与场结束状态同步回退', case8],
      ['验收9 序列化与刷新恢复一致', case9],
      ['验收10 导出 JSON/CSV 字段完整且逐球表一致', case10],
      ['验收11 比赛结束锁定计分（BO3 与固定 K）', case11],
      ['验收12 单次点击只加 1 分（逻辑层）', case12logic],
      ['回归 默认配置（加球默认开启等）与配置校验边界', caseDefaults],
      ['回归 进行中局的单局时长应为实时值、结束后冻结', caseLiveGameDuration],
      ['回归 普通暂停仅限死球（0:0/局间/结束后均不可），医疗暂停局间可请求', caseNormalPauseTiming],
      ['回归 BO5/BO7 局数、加球关闭先到 T 胜、T=1、换边阈值、双打逐局递推', caseFormatsAndDeuceOff],
      ['回归 局间休息 1 分钟倒计时（不锁分、不计入单局时长）', caseIntervalCountdown],
      ['回归 姓名可清空重输（空串保留，仅展示/开始时回退默认名）', caseNameEditing],
      ['回归 局点/赛点按“机会”分方计数（10:7 第1个 → 10:8 第2个）', caseGamePointCounting]
    ];
    var onEach = doc ? function (s) { updatePanel(doc, s); } : null;
    for (var i = 0; i < queue.length; i++) {
      if (doc) window.__ppCurrent = 'logic:' + queue[i][0];
      await testP(queue[i][0], queue[i][1], onEach);
    }

    if (isDom) {
      var domQueue = [
        ['验收4d UI：赛末每局卡片含双折线图与单局统计摘要', domCase4],
        ['验收5 UI：暂停锁定按钮与横幅 / 恢复解锁', domCase5],
        ['验收6 UI：医疗暂停正计时与手动结束', domCase6],
        ['验收9 UI：localStorage 刷新恢复', domCase9],
        ['验收12 UI：防连点/长按/快捷键/换边/二次确认', domCase12],
        ['验收12b UI：BO 决胜局换边提示阈值 ⌈T/2⌉', domChangeEnd],
        ['验收10 UI：导出内容与 Blob 下载能力', domExport],
        ['验收11 UI：结束后按钮锁定、可查看与导出', domCase11],
        ['回归 UI：弹窗/横幅等 hidden 元素不被 CSS display 点亮', domHiddenOverlays],
        ['回归 UI：首屏默认加球开启与配置写回', domDefaults],
        ['回归 UI：进行中局的单局 tab 时长实时显示', domLiveDuration],
        ['回归 UI：普通暂停仅死球可用（0:0/局间/结束后禁用）', domPauseTiming],
        ['回归 UI：姓名可清空重输、空名回退默认名', domNameEditing],
        ['回归 UI：局间休息 1 分钟倒计时 + 暂停倒计时放大显示', domIntervalAndCountdown]
      ];
      for (var j = 0; j < domQueue.length; j++) {
        if (doc) window.__ppCurrent = 'dom:' + domQueue[j][0];
        await testP(domQueue[j][0], domQueue[j][1], onEach);
      }
    } else {
      skip('DOM 集成测试（验收4d/5/6/9/10/11/12 的 UI 部分）', 'Node 环境无 DOM，请在浏览器打开 index.html?selftest=1');
    }

    var passed = results.filter(function (r) { return r.ok; }).length;
    var failed = results.filter(function (r) { return !r.ok; });
    var summary = { total: results.length, passed: passed, failed: failed.length, results: results.slice() };

    if (doc) renderPanel(doc, summary);
    return summary;
  }

  function ensurePanel(doc) {
    var host = doc.getElementById('selftestPanel');
    if (!host) {
      host = doc.createElement('section');
      host.className = 'card selftest';
      host.id = 'selftestPanel';
      var footer = doc.querySelector('.footer');
      if (footer && footer.parentNode) footer.parentNode.insertBefore(host, footer);
      else doc.body.appendChild(host);
    }
    return host;
  }

  function updatePanel(doc, summary) {
    var host = ensurePanel(doc);
    var html = '<div class="card-head"><h2>内置自测（验收用例 1–12）</h2></div>';
    html += '<p class="selftest-summary ' + (summary.failed ? 'fail' : (summary.running ? '' : 'pass')) + '">' +
      (summary.running
        ? ('运行中… 已完成 ' + summary.total + ' 项' + (summary.failed ? '，失败 ' + summary.failed : ''))
        : ('通过 ' + summary.passed + ' / ' + summary.total + (summary.failed ? '，失败 ' + summary.failed : '，全部通过'))) +
      '</p><ol id="selftestList"></ol>';
    host.innerHTML = html;
    var ol = doc.getElementById('selftestList');
    summary.results.forEach(function (r) {
      var li = doc.createElement('li');
      li.className = r.ok ? 'pass' : 'fail';
      li.textContent = r.name + (r.skipped ? '（跳过：' + r.err + '）' : '');
      if (!r.ok) {
        var pre = doc.createElement('pre');
        pre.textContent = r.err;
        li.appendChild(pre);
      }
      ol.appendChild(li);
    });
    host.setAttribute('data-total', summary.total);
    host.setAttribute('data-passed', summary.passed);
    host.setAttribute('data-failed', summary.failed);
    host.setAttribute('data-running', summary.running ? '1' : '0');
    host.setAttribute('data-current', (typeof window !== 'undefined' && window.__ppCurrent) || '');
    if (doc.title) {
      doc.title = summary.running
        ? '自测运行中 ' + summary.total
        : ('自测 ' + summary.passed + '/' + summary.total + (summary.failed ? ' 有失败' : ' 全部通过'));
    }
  }

  function renderPanel(doc, summary) {
    updatePanel(doc, summary);
    var host = doc.getElementById('selftestPanel');
    if (host && host.scrollIntoView) host.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  return { run: run, getResults: function () { return results.slice(); } };
});

/* Node 直接运行：node tests/selftest.js */
if (typeof module === 'object' && module.exports && typeof require !== 'undefined' && require.main === module) {
  module.exports.run().then(function (s) {
    s.results.forEach(function (r) {
      var tag = r.ok ? (r.skipped ? 'SKIP' : 'PASS') : 'FAIL';
      console.log('[' + tag + '] ' + r.name + (r.ok ? '' : '\n        → ' + r.err));
    });
    console.log('\n通过 ' + s.passed + '/' + s.total + (s.failed ? '，失败 ' + s.failed : '，全部通过'));
    process.exit(s.failed ? 1 : 0);
  });
}