/*!
 * app.js —— UI 装配：渲染、交互、快捷键、localStorage、导出
 * 依赖：PPRules / PPStats / PPEngine / PPChart（经典 script，无模块系统）
 */
(function () {
  'use strict';

  var R = window.PPRules, S = window.PPStats, E = window.PPEngine, C = window.PPChart;
  var STORAGE_KEY = 'pp-scorer-state-v1';
  var SAVE_DEBOUNCE = 120;

  var state = E.newState({});
  var saveTimer = null;
  var toastTimer = null;
  var modalResolve = null;

  var $ = function (id) { return document.getElementById(id); };
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /* 兜底保证 `hidden` 始终生效。
     本文件配套的 css/style.css 里已有一条 [hidden]{display:none!important}，
     但如果浏览器缓存了旧版/缺失的样式表（本地预览常见），带 display 的类
     （如 .modal-backdrop{display:flex}）会压过浏览器默认的 [hidden]，
     结果“隐藏”的弹窗遮罩仍铺满全屏并挡掉所有点击。
     这里用 JS 再注入一次同样的规则：优先级更高且不依赖外部样式表，
     使页面在任何样式表状态下都保持可操作。 */
  function ensureHiddenRule() {
    if (document.getElementById('hiddenRuleFix')) return;
    var st = document.createElement('style');
    st.id = 'hiddenRuleFix';
    st.textContent = '[hidden]{display:none !important}';
    (document.head || document.documentElement).appendChild(st);
  }

  /* ================= 存储 ================= */

  function save() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (err) { /* 隐私模式 / 配额：忽略 */ }
    }, SAVE_DEBOUNCE);
  }
  function saveNow() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (err) {}
  }
  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return E.sanitize(JSON.parse(raw));
    } catch (err) { return null; }
  }

  /* ================= 小工具 ================= */

  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2200);
  }

  function openModal(opts) {
    var back = $('modalBackdrop');
    $('modalTitle').textContent = opts.title || '请选择';
    var body = $('modalBody');
    body.innerHTML = '';
    if (opts.message) {
      var p = document.createElement('p');
      p.textContent = opts.message;
      body.appendChild(p);
    }
    (opts.choices || []).forEach(function (c) {
      var row = body.querySelector('.choice-row') || (function () {
        var r = document.createElement('div'); r.className = 'choice-row'; body.appendChild(r); return r;
      })();
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn' + (c.primary ? ' btn-primary' : '');
      btn.textContent = c.label;
      btn.addEventListener('click', function () { closeModal(c.value); });
      row.appendChild(btn);
    });
    var actions = $('modalActions');
    actions.innerHTML = '';
    (opts.actions || []).forEach(function (a) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn' + (a.primary ? ' btn-primary' : '');
      btn.textContent = a.label;
      btn.addEventListener('click', function () { closeModal(a.value); });
      actions.appendChild(btn);
    });
    back.hidden = false;
    return new Promise(function (resolve) { modalResolve = resolve; });
  }
  function closeModal(value) {
    $('modalBackdrop').hidden = true;
    var r = modalResolve; modalResolve = null;
    if (r) r(value);
  }
  function confirmTwice(title, message) {
    return openModal({
      title: title + '（1/2 确认）', message: message,
      actions: [{ label: '取消', value: false }, { label: '继续', value: true, primary: true }]
    }).then(function (ok) {
      if (!ok) return false;
      return openModal({
        title: title + '（2/2 再次确认）', message: '此操作不可撤销，确认继续？',
        actions: [{ label: '取消', value: false }, { label: '确认' + title, value: true, primary: true }]
      });
    });
  }
  function askSide(title, message) {
    return openModal({
      title: title, message: message,
      actions: [{ label: '取消', value: null }],
      choices: [
        { label: R.teamLabel(state.config, 'A'), value: 'A', primary: true },
        { label: R.teamLabel(state.config, 'B'), value: 'B' }
      ]
    });
  }

  /* ================= 配置区 ⇄ state ================= */

  function syncConfigUI() {
    var cfg = state.config;
    qsa('input[name=cfgType]').forEach(function (r) { r.checked = (r.value === cfg.type); });
    $('namesSingles').hidden = cfg.type !== 'singles';
    $('namesDoubles').hidden = cfg.type !== 'doubles';
    $('doublesServeWrap').hidden = cfg.type !== 'doubles';
    $('firstTeamWrap').hidden = cfg.type === 'doubles';

    $('nameA').value = cfg.names.A;
    $('nameB').value = cfg.names.B;
    $('nameA1').value = cfg.names.A1;
    $('nameA2').value = cfg.names.A2;
    $('nameB1').value = cfg.names.B1;
    $('nameB2').value = cfg.names.B2;

    qsa('input[name=fmtKind]').forEach(function (r) { r.checked = (r.value === cfg.format.kind); });
    $('boOptions').hidden = cfg.format.kind !== 'bo';
    $('fixedOptions').hidden = cfg.format.kind !== 'fixed';
    if (cfg.format.kind === 'bo') {
      qsa('input[name=bestOf]').forEach(function (r) { r.checked = (parseInt(r.value, 10) === cfg.format.bestOf); });
    } else {
      $('fixedK').value = cfg.format.games;
    }

    $('targetInput').value = cfg.target;
    qsa('.chip[data-target]').forEach(function (b) {
      b.classList.toggle('is-on', parseInt(b.dataset.target, 10) === cfg.target);
    });
    $('deuceToggle').checked = !!cfg.deuce;

    qsa('input[name=firstTeam]').forEach(function (r) { r.checked = (r.value === cfg.firstServer.team); });
    /* 双打：先发/接发下拉（带姓名） */
    var fsSel = $('doublesFirstServer');
    var keys = ['A1', 'A2', 'B1', 'B2'];
    fsSel.innerHTML = '';
    keys.forEach(function (k) {
      var o = document.createElement('option');
      o.value = k; o.textContent = cfg.names[k] + '（' + k + '）';
      fsSel.appendChild(o);
    });
    fsSel.value = cfg.firstServer.player;
    rebuildReceiverOptions();

    var locked = !!state.cfgLocked;
    qsa('#configPanel input, #configPanel select, #configPanel button.chip').forEach(function (el) {
      if (el.id === 'btnStartMatch' || el.id === 'btnStartGame') return;
      el.disabled = locked;
    });
    $('lockBadge').hidden = !locked;
    $('btnStartMatch').hidden = state.started;
    $('btnStartMatch').disabled = state.started;
  }

  function rebuildReceiverOptions() {
    var cfg = state.config;
    var serverTeam = R.teamOfPlayer($('doublesFirstServer').value || cfg.firstServer.player);
    var oppKeys = serverTeam === 'A' ? ['B1', 'B2'] : ['A1', 'A2'];
    var sel = $('doublesFirstReceiver');
    sel.innerHTML = '';
    oppKeys.forEach(function (k) {
      var o = document.createElement('option');
      o.value = k; o.textContent = cfg.names[k] + '（' + k + '）';
      sel.appendChild(o);
    });
    var wanted = cfg.firstServer.receiver;
    sel.value = oppKeys.indexOf(wanted) >= 0 ? wanted : oppKeys[0];
  }

  function readConfigFromUI() {
    var cfg = JSON.parse(JSON.stringify(state.config));
    var typeEl = qsa('input[name=cfgType]').find(function (r) { return r.checked; });
    cfg.type = typeEl ? typeEl.value : 'singles';
    /* 姓名：原样保留用户输入（含空串与前后空格），不做 trim/回填。
       原因：一按删除键就被自动填回默认名会让人无法清空重输；
       空格也在编辑期原样保留，避免边输入边被“吃掉”。
       真正需要规范化的时机是“开始比赛”，由 R.normalizeConfig 统一 trim 并补默认名；
       展示时由 R.displayName 回退，不写回配置。 */
    function nameVal(id) { return $(id).value; }
    cfg.names.A = nameVal('nameA');
    cfg.names.B = nameVal('nameB');
    cfg.names.A1 = nameVal('nameA1');
    cfg.names.A2 = nameVal('nameA2');
    cfg.names.B1 = nameVal('nameB1');
    cfg.names.B2 = nameVal('nameB2');

    var kindEl = qsa('input[name=fmtKind]').find(function (r) { return r.checked; });
    if (kindEl && kindEl.value === 'fixed') {
      cfg.format = { kind: 'fixed', games: R.clampInt($('fixedK').value, 1, 9, 4) };
    } else {
      var boEl = qsa('input[name=bestOf]').find(function (r) { return r.checked; });
      cfg.format = { kind: 'bo', bestOf: boEl ? R.clampInt(boEl.value, 3, 7, 3) : 3 };
    }

    var tRaw = $('targetInput').value;
    var t = R.clampInt(tRaw, 1, 99, 11);
    cfg.target = t;
    cfg.deuce = $('deuceToggle').checked;

    if (cfg.type === 'doubles') {
      var sp = $('doublesFirstServer').value;
      var rp = $('doublesFirstReceiver').value;
      cfg.firstServer = { team: R.teamOfPlayer(sp), player: sp, receiver: rp };
    } else {
      var teamEl = qsa('input[name=firstTeam]').find(function (r) { return r.checked; });
      var team = teamEl ? teamEl.value : 'A';
      cfg.firstServer = { team: team, player: team, receiver: R.other(team) };
    }
    return cfg;
  }

  function validateConfigFromUI() {
    var errs = [];
    var t = parseInt($('targetInput').value, 10);
    if (!isFinite(t) || t < 1 || t > 99) errs.push('目标分需为 1–99 的整数。');
    if (state.config.format.kind === 'fixed' || (qsa('input[name=fmtKind]').find(function (r) { return r.checked; }) || {}).value === 'fixed') {
      var k = parseInt($('fixedK').value, 10);
      if (!isFinite(k) || k < 1 || k > 9) errs.push('固定 K 需为 1–9 的整数。');
    }
    var typeEl = qsa('input[name=cfgType]').find(function (r) { return r.checked; });
    if (typeEl && typeEl.value === 'doubles') {
      var sp = $('doublesFirstServer').value;
      var rp = $('doublesFirstReceiver').value;
      if (!R.isPlayerKey(sp) || !R.isPlayerKey(rp)) errs.push('双打需选择先发球员与首先接发球员。');
      else if (R.teamOfPlayer(sp) === R.teamOfPlayer(rp)) errs.push('先发球员与接发球员必须来自不同队伍。');
    }
    var err = $('cfgError');
    err.hidden = !errs.length;
    err.textContent = errs.join(' ');
    return errs.length === 0;
  }

  /* ================= 渲染 ================= */

  function renderConfigClock() {
    /* 目标分快捷按钮高亮随输入同步 */
    var t = R.clampInt($('targetInput').value, 1, 99, 11);
    qsa('.chip[data-target]').forEach(function (b) {
      b.classList.toggle('is-on', parseInt(b.dataset.target, 10) === t);
    });
  }

  function gameWinnersOf(d) {
    var m = {};
    d.games.forEach(function (g) { if (g.winner) m[g.no] = g.winner; });
    return m;
  }

  function renderBoard(d) {
    var cfg = state.config;
    var swapped = !!state.ui.swapped;
    $('sides').classList.toggle('swapped', swapped);

    $('formatPill').textContent = d.fmt.label + ' · ' + cfg.target + ' 分 · ' + (cfg.deuce ? '加球开' : '加球关');
    $('curGamePill').textContent = '第 ' + d.curGameNo + ' 局';

    var stateText = {
      setup: '未开始（配置中）',
      playing: '进行中',
      dead: '死球（等待下一球）',
      normalPause: '普通暂停（计分锁定）',
      medicalPause: '医疗暂停（计分锁定）',
      interval: '局间休息',
      over: d.outcome === 'draw' ? '比赛结束 · 平局' : '比赛结束'
    }[d.playState] || d.playState;
    var sp = $('statePill');
    sp.textContent = stateText;
    sp.className = 'pill' + (d.matchOver ? ' ok' : (d.activePause ? ' warn' : ''));

    var names = {
      A: R.teamLabel(cfg, 'A'),
      B: R.teamLabel(cfg, 'B')
    };
    $('nameBoxA').textContent = names.A;
    $('nameBoxB').textContent = names.B;
    $('scoreA').textContent = d.currentGame ? d.currentGame.score.A : 0;
    $('scoreB').textContent = d.currentGame ? d.currentGame.score.B : 0;
    $('winsA').textContent = d.wins.A;
    $('winsB').textContent = d.wins.B;
    $('statsHeadA').textContent = names.A;
    $('statsHeadB').textContent = names.B;
    $('pointLabelA').textContent = names.A + ' +1';
    $('pointLabelB').textContent = names.B + ' +1';

    /* 发球指示与徽章 */
    ['A', 'B'].forEach(function (side) {
      var box = $('sideBox' + side);
      var serving = !!d.serve && d.serve.serverTeam === side;
      box.classList.toggle('is-serving', serving);
      $('serveDot' + side).hidden = !serving;
      var badges = $('badges' + side);
      badges.innerHTML = '';
      function addBadge(text, cls) {
        var b = document.createElement('span');
        b.className = 'badge ' + cls;
        b.textContent = text;
        badges.appendChild(b);
      }
      if (d.gamePoint[side].active) addBadge('局点（本局第 ' + d.gamePoint[side].count + ' 个）', 'gp');
      if (d.matchPoint[side].active) addBadge('赛点（本场第 ' + d.matchPoint[side].count + ' 个）', 'mp');
      if (d.currentGame && d.currentGame.winner === side) addBadge('本局胜', 'win');
    });

    /* 发球信息 */
    var si = $('serveInfo'), ri = $('roundInfo');
    if (!state.started) {
      si.textContent = '等待开始比赛 · 配置完成后点击“开始比赛”';
      ri.hidden = true;
    } else if (d.matchOver) {
      si.textContent = d.outcome === 'draw'
        ? '比赛结束：平局（' + d.wins.A + ':' + d.wins.B + '）'
        : '比赛结束：' + names[d.outcome] + ' 获胜（' + d.wins.A + ':' + d.wins.B + '）';
      ri.hidden = true;
    } else if (d.inInterval && d.currentGame && d.currentGame.points.length === 0) {
      si.textContent = '第 ' + d.curGameNo + ' 局 · 发球方 ' + names[d.serve.serverTeam];
      ri.textContent = cfg.type === 'doubles'
        ? ('先发球员 ' + R.playerName(cfg, d.serve.serverPlayer) + ' · 首先接发 ' + R.playerName(cfg, d.serve.receiverPlayer))
        : '点击“开始本局”启动单局计时（或直接记分自动开始）';
      ri.hidden = false;
    } else if (d.serve) {
      if (cfg.type === 'doubles') {
        si.textContent = '发球方：' + names[d.serve.serverTeam] + ' ｜ 发球人：' + R.playerName(cfg, d.serve.serverPlayer) +
          ' ｜ 接发人：' + R.playerName(cfg, d.serve.receiverPlayer);
      } else {
        si.textContent = '发球方：' + names[d.serve.serverTeam];
      }
      ri.textContent = '本发球轮已发 ' + d.serve.servedInRound + '/' + d.serve.roundLen + ' 球' + (d.serve.deuce ? '（加球阶段每 1 分换发）' : '');
      ri.hidden = false;
    }

    /* 时间 */
    $('timerMatch').textContent = d.times.matchElapsedText;
    $('timerGame').textContent = d.times.curGameElapsedText;
    $('pauseNormalTotal').textContent = d.times.pauseNormalText;
    $('pauseMedicalTotal').textContent = d.times.pauseMedicalText;

    /* 各局条 */
    var strip = $('gamesStrip');
    strip.innerHTML = '';
    d.games.forEach(function (g) {
      strip.appendChild(gameChip(g, g.no === d.curGameNo && !d.matchOver));
    });
    if (!d.matchOver) {
      var curExists = d.games.some(function (g) { return g.no === d.curGameNo; });
      if (!curExists) {
        strip.appendChild(gameChip({
          no: d.curGameNo, score: { A: 0, B: 0 }, winner: null, balls: 0, duration: 0, pauses: []
        }, true));
      }
    }
    if (!d.games.length && d.matchOver) strip.innerHTML = '';

    /* 暂停横幅（倒计时放大显示在 pauseCountdown） */
    var pb = $('pauseBanner');
    var pcd = $('pauseCountdown');
    if (d.activePause) {
      pb.hidden = false;
      if (d.activePause.type === 'normal') {
        if (d.normalExpired) {
          pb.classList.add('is-over');
          $('pauseBannerText').textContent = names[d.activePause.side] + ' 普通暂停已到 60 秒 —— 可恢复比赛（保持锁定，点击右侧解锁）';
          pcd.hidden = false;
          pcd.textContent = '00:00';
          pcd.classList.add('is-over');
        } else {
          pb.classList.remove('is-over');
          $('pauseBannerText').textContent = names[d.activePause.side] + ' 普通暂停中（计分锁定）';
          pcd.hidden = false;
          pcd.textContent = E.mmss(d.normalRemainMs);
          pcd.classList.remove('is-over');
        }
      } else {
        pb.classList.remove('is-over');
        $('pauseBannerText').textContent = names[d.activePause.side] + ' 医疗暂停中（计分锁定）';
        pcd.hidden = false;
        pcd.textContent = E.mmss(d.medicalElapsedMs);
        pcd.classList.remove('is-over');
      }
    } else {
      pb.hidden = true;
      pb.classList.remove('is-over');
      pcd.hidden = true;
    }

    /* 局间休息倒计时（1 分钟；不锁定计分，到 0 也可直接开始下一局） */
    var ib = $('intervalBanner');
    if (d.interval.active && !d.matchOver) {
      ib.hidden = false;
      var icd = $('intervalCountdown');
      if (d.interval.expired) {
        ib.classList.add('is-over');
        $('intervalText').textContent = '第 ' + (d.curGameNo - 1) + ' 局结束 · 局间休息已满 1 分钟，可开始第 ' + d.curGameNo + ' 局';
        icd.textContent = '00:00';
        icd.classList.add('is-over');
      } else {
        ib.classList.remove('is-over');
        $('intervalText').textContent = '第 ' + (d.curGameNo - 1) + ' 局结束 · 局间休息（1 分钟），倒计时结束可直接开始第 ' + d.curGameNo + ' 局';
        icd.textContent = E.mmss(d.interval.remainMs);
        icd.classList.remove('is-over');
      }
    } else {
      ib.hidden = true;
      ib.classList.remove('is-over');
    }

    /* 换边提示 */
    var cb = $('changeEndBanner');
    if (d.changeEnd.applicable && d.changeEnd.reached && !d.changeEnd.done && !d.matchOver) {
      cb.hidden = false;
      $('changeEndText').textContent = '决胜局换边提示：一方已到 ' + d.changeEnd.threshold + ' 分（第 ' + d.changeEnd.ballNo + ' 球），请交换场地。换边不改变发球顺序。';
    } else {
      cb.hidden = true;
    }
  }

  function gameChip(g, current) {
    var el = document.createElement('div');
    el.className = 'game-chip' + (current ? ' is-current' : '') + (g.winner ? ' ' + g.winner : '');
    var no = document.createElement('div');
    no.className = 'gc-no';
    no.textContent = '第 ' + g.no + ' 局';
    var sc = document.createElement('div');
    sc.className = 'gc-score';
    sc.textContent = g.score.A + ' : ' + g.score.B;
    var w = document.createElement('div');
    w.className = 'gc-w';
    w.textContent = g.winner ? ('胜方 ' + g.winner) : (g.balls ? '进行中' : '未开始');
    el.appendChild(no); el.appendChild(sc); el.appendChild(w);
    return el;
  }

  function renderControls(d) {
    var canScore = d.canScore && !d.activePause;
    $('btnPointA').disabled = !canScore;
    $('btnPointB').disabled = !canScore;
    $('btnUndo').disabled = !state.points.length || !!d.activePause;
    $('btnResetGame').disabled = !state.started || d.matchOver || !!d.activePause;
    $('btnResetMatch').disabled = false;
    var canNormal = R.SIDES.some(function (s) { return E.canRequestNormalPause(state, s, d); });
    $('btnNormalPause').disabled = !canNormal;
    $('btnMedicalPause').disabled = !E.canRequestMedicalPause(state, d);
    $('btnResume').disabled = !d.activePause;
    $('btnResumeInline').disabled = !d.activePause;
    $('btnResumeInline').hidden = !d.activePause;
    $('btnSwap').disabled = false;
    $('btnExportJson').disabled = false;
    $('btnExportCsv').disabled = false;

    /* 开始本局按钮：该局计时尚未启动时显示 */
    var needStart = state.started && !d.matchOver && !d.activePause && !isFinite(state.gameStarts[d.curGameNo]);
    var sg = $('btnStartGame');
    sg.hidden = !needStart;
    sg.textContent = d.curGameNo > 1 ? '开始下一局（第 ' + d.curGameNo + ' 局）' : '开始本局（第 1 局）';

    $('pauseUsageHint').textContent = '普通暂停（每方每场 1 次，60 秒）：' +
      R.teamLabel(state.config, 'A') + ' 剩余 ' + Math.max(0, 1 - (state.pauseUsed.A || 0)) + ' 次 ｜ ' +
      R.teamLabel(state.config, 'B') + ' 剩余 ' + Math.max(0, 1 - (state.pauseUsed.B || 0)) + ' 次。医疗暂停不限次数；局间休息 1 分钟（不锁分）。';
  }

  function renderStats(d) {
    var gameWinners = gameWinnersOf(d);
    var scopeGame = state.ui.statsScope === 'game' ? state.ui.statsGame : null;

    /* 单局下拉 */
    var sel = $('statsGameSelect');
    var options = d.games.map(function (g) { return g.no; });
    if (!options.length || (d.currentGame && !d.currentGame.winner && options.indexOf(d.curGameNo) < 0)) {
      options = options.concat([d.curGameNo]);
    }
    options = options.filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return a - b; });
    var prev = sel.value;
    sel.innerHTML = '';
    options.forEach(function (no) {
      var o = document.createElement('option');
      o.value = no;
      o.textContent = '第 ' + no + ' 局';
      sel.appendChild(o);
    });
    if (scopeGame && options.indexOf(scopeGame) >= 0) sel.value = scopeGame;
    else if (prev && options.indexOf(parseInt(prev, 10)) >= 0) sel.value = prev;
    if (scopeGame == null) state.ui.statsGame = parseInt(sel.value, 10) || options[0] || 1;

    $('tabMatch').classList.toggle('is-on', state.ui.statsScope !== 'game');
    $('tabGame').classList.toggle('is-on', state.ui.statsScope === 'game');
    $('tabMatch').setAttribute('aria-selected', state.ui.statsScope !== 'game' ? 'true' : 'false');
    $('tabGame').setAttribute('aria-selected', state.ui.statsScope === 'game' ? 'true' : 'false');
    $('statsGameWrap').hidden = state.ui.statsScope !== 'game';

    var useGame = state.ui.statsScope === 'game' ? (parseInt(sel.value, 10) || 1) : null;
    var st = S.compute(state.config, state.points, useGame, gameWinners);

    if (useGame) {
      var g = d.games.filter(function (x) { return x.no === useGame; })[0];
      var dur = g ? g.duration : 0;
      $('statsDuration').textContent = '单局 · 第 ' + useGame + ' 局 ｜ 局分 ' +
        (g ? (g.score.A + ':' + g.score.B) : '0:0') + ' ｜ 胜方 ' + (g && g.winner ? R.teamLabel(state.config, g.winner) : '未结束') +
        ' ｜ 单局时长 ' + E.mmss(dur);
    } else {
      $('statsDuration').textContent = '全场 ｜ 总比赛时长 ' + d.times.matchElapsedText +
        '（含局间、普通暂停 ' + d.times.pauseNormalText + '、医疗暂停 ' + d.times.pauseMedicalText + '）' +
        ' ｜ 局分 ' + d.wins.A + ':' + d.wins.B;
    }

    var tbody = $('statsTableBody');
    tbody.innerHTML = '';
    S.ROWS.forEach(function (row) {
      var tr = document.createElement('tr');
      var td0 = document.createElement('td');
      td0.className = 'metric-label';
      td0.textContent = row.label;
      var sub = document.createElement('span');
      sub.className = 'metric-sub';
      sub.textContent = row.hint;
      td0.appendChild(sub);
      var td1 = document.createElement('td'); td1.textContent = st[row.key].A;
      var td2 = document.createElement('td'); td2.textContent = st[row.key].B;
      tr.appendChild(td0); tr.appendChild(td1); tr.appendChild(td2);
      tbody.appendChild(tr);
    });

    $('statsHint').textContent = useGame
      ? 'Greatest deficit overcome / Greatest lead against 仅统计该局胜方；负方记 0。'
      : '全场：Biggest lead 与连续得分/失分取各局单局最大值（不跨局、不按全场净胜分计算）；Greatest 类取各局胜方值最大值。';

    /* 图表（仅单局） */
    var holder = $('statsChart');
    var block = holder.parentNode;
    if (useGame) {
      block.hidden = false;
      $('statsChartTitle').textContent = '第 ' + useGame + ' 局比分走势';
      C.mount(holder, st, {
        labelA: R.teamLabel(state.config, 'A'),
        labelB: R.teamLabel(state.config, 'B'),
        target: state.config.target,
        title: '第 ' + useGame + ' 局比分走势'
      });
    } else {
      block.hidden = true;
      holder.innerHTML = '';
    }
  }

  function renderLog(d) {
    var tbody = $('logBody');
    tbody.innerHTML = '';
    var list = state.points.slice().sort(function (a, b) {
      if (a.game !== b.game) return a.game - b.game;
      return (a.t || 0) - (b.t || 0) || (a.ball || 0) - (b.ball || 0);
    });
    $('logCount').textContent = list.length ? ('共 ' + list.length + ' 球') : '';
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="log-empty">暂无逐球记录</td></tr>';
      return;
    }
    var names = { A: R.teamLabel(state.config, 'A'), B: R.teamLabel(state.config, 'B') };
    list.forEach(function (p) {
      var sb = p.scoreBefore || { A: 0, B: 0 };
      var after = { A: sb.A + (p.scorer === 'A' ? 1 : 0), B: sb.B + (p.scorer === 'B' ? 1 : 0) };
      var tr = document.createElement('tr');
      tr.className = p.scorer === 'A' ? 'scoreA' : 'scoreB';
      var cells = [
        p.game, p.ball,
        names[p.serve],
        p.serverPlayer ? R.playerName(state.config, p.serverPlayer) : '—',
        p.receiverPlayer ? R.playerName(state.config, p.receiverPlayer) : '—',
        names[p.scorer],
        sb.A + ':' + sb.B + ' → ' + after.A + ':' + after.B,
        p.deuce ? '是' : '',
        new Date(p.t).toLocaleTimeString('zh-CN', { hour12: false })
      ];
      cells.forEach(function (v) {
        var td = document.createElement('td');
        td.textContent = v;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  }

  function renderSummary(d) {
    var panel = $('summaryPanel');
    var cards = $('gameCards');
    var hasGames = d.games.some(function (g) { return !!g.winner; });
    panel.hidden = !hasGames && !d.matchOver;
    if (panel.hidden) { cards.innerHTML = ''; return; }

    $('summaryOutcome').textContent = d.matchOver
      ? (d.outcome === 'draw' ? '平局（' + d.wins.A + ':' + d.wins.B + '）' : '胜者：' + R.teamLabel(state.config, d.outcome) + '（' + d.wins.A + ':' + d.wins.B + '）')
      : '比赛进行中 · 已完成 ' + d.gamesPlayed + ' 局';

    cards.innerHTML = '';
    var gameWinners = gameWinnersOf(d);
    d.games.forEach(function (g) {
      if (!g.winner) return;
      var st = S.compute(state.config, state.points, g.no, gameWinners);
      var card = document.createElement('div');
      card.className = 'game-card';

      var head = document.createElement('div');
      head.className = 'game-card-head';
      var h3 = document.createElement('h3');
      h3.textContent = '第 ' + g.no + ' 局';
      var score = document.createElement('div');
      score.className = 'game-card-score';
      score.innerHTML = '<span class="sA">' + g.score.A + '</span> : <span class="sB">' + g.score.B + '</span>';
      head.appendChild(h3); head.appendChild(score);
      card.appendChild(head);

      var meta = document.createElement('div');
      meta.className = 'game-card-meta';
      meta.textContent = '胜方：' + R.teamLabel(state.config, g.winner) + ' ｜ 局时长：' + E.mmss(g.duration) +
        ' ｜ 共 ' + g.balls + ' 球' +
        (state.gameStarts[g.no] ? ' ｜ 开始 ' + new Date(state.gameStarts[g.no]).toLocaleTimeString('zh-CN', { hour12: false }) : '');
      card.appendChild(meta);

      var pauses = document.createElement('div');
      pauses.className = 'game-card-pauses';
      if (g.pauses.length) {
        var label = document.createElement('div');
        label.textContent = '本局暂停记录：';
        pauses.appendChild(label);
        var ul = document.createElement('ul');
        g.pauses.forEach(function (p) {
          var li = document.createElement('li');
          var durMs = Math.max(0, (p.end != null ? p.end : Date.now()) - p.start);
          li.textContent = (p.type === 'normal' ? '普通暂停' : '医疗暂停') + ' · ' + R.teamLabel(state.config, p.side) +
            ' · ' + E.mmss(durMs) + (p.end == null ? '（进行中）' : '');
          ul.appendChild(li);
        });
        pauses.appendChild(ul);
      } else {
        pauses.textContent = '本局无暂停记录。';
      }
      card.appendChild(pauses);

      /* 单局统计摘要 */
      var mini = document.createElement('div');
      mini.className = 'mini-stats';
      var hd = document.createElement('div');
      hd.className = 'ms-head'; hd.textContent = '指标';
      var hA = document.createElement('div'); hA.className = 'ms-head'; hA.textContent = 'A';
      var hB = document.createElement('div'); hB.className = 'ms-head'; hB.textContent = 'B';
      mini.appendChild(hd); mini.appendChild(hA); mini.appendChild(hB);
      ['points', 'maxLead', 'ownWon', 'oppWon', 'consWon', 'deficit', 'leadAgainst'].forEach(function (key) {
        var row = S.ROWS.filter(function (r) { return r.key === key; })[0];
        var l = document.createElement('div'); l.textContent = row.label;
        var a = document.createElement('div'); a.className = 'ms-a'; a.textContent = st[key].A;
        var b = document.createElement('div'); b.className = 'ms-b'; b.textContent = st[key].B;
        mini.appendChild(l); mini.appendChild(a); mini.appendChild(b);
      });
      card.appendChild(mini);

      /* 双折线图 */
      var holder = document.createElement('div');
      holder.className = 'chart-holder';
      card.appendChild(holder);
      cards.appendChild(card);
      C.mount(holder, st, {
        labelA: R.teamLabel(state.config, 'A'),
        labelB: R.teamLabel(state.config, 'B'),
        target: state.config.target,
        title: '第 ' + g.no + ' 局比分走势'
      });
    });
  }

  function renderAll() {
    var d = E.derive(state);
    syncConfigUI();
    renderBoard(d);
    renderControls(d);
    renderStats(d);
    renderLog(d);
    renderSummary(d);
    save();
    return d;
  }
  function renderLive() {
    /* 计时/倒计时专用轻量刷新 */
    var d = E.derive(state);
    $('timerMatch').textContent = d.times.matchElapsedText;
    $('timerGame').textContent = d.times.curGameElapsedText;
    $('pauseNormalTotal').textContent = d.times.pauseNormalText;
    $('pauseMedicalTotal').textContent = d.times.pauseMedicalText;
    /* 统计区的时长行也实时更新（避免与顶部计时不一致） */
    if (state.ui.statsScope === 'game') {
      var gno = state.ui.statsGame || d.curGameNo;
      var g = d.games.filter(function (x) { return x.no === gno; })[0];
      $('statsDuration').textContent = '单局 · 第 ' + gno + ' 局 ｜ 局分 ' +
        (g ? (g.score.A + ':' + g.score.B) : '0:0') + ' ｜ 胜方 ' +
        (g && g.winner ? R.teamLabel(state.config, g.winner) : '未结束') +
        ' ｜ 单局时长 ' + E.mmss(g ? g.duration : 0);
    } else {
      $('statsDuration').textContent = '全场 ｜ 总比赛时长 ' + d.times.matchElapsedText +
        '（含局间、普通暂停 ' + d.times.pauseNormalText + '、医疗暂停 ' + d.times.pauseMedicalText + '）' +
        ' ｜ 局分 ' + d.wins.A + ':' + d.wins.B;
    }
    if (d.activePause) {
      var names = { A: R.teamLabel(state.config, 'A'), B: R.teamLabel(state.config, 'B') };
      var pb = $('pauseBanner');
      var pcd = $('pauseCountdown');
      if (d.activePause.type === 'normal') {
        if (d.normalExpired) {
          if (!pb.classList.contains('is-over')) {
            pb.classList.add('is-over');
            $('pauseBannerText').textContent = names[d.activePause.side] + ' 普通暂停已到 60 秒 —— 可恢复比赛（保持锁定，点击右侧解锁）';
          }
          pcd.hidden = false;
          pcd.textContent = '00:00';
          pcd.classList.add('is-over');
        } else {
          pb.classList.remove('is-over');
          $('pauseBannerText').textContent = names[d.activePause.side] + ' 普通暂停中（计分锁定）';
          pcd.hidden = false;
          pcd.textContent = E.mmss(d.normalRemainMs);
          pcd.classList.remove('is-over');
        }
      } else {
        pb.classList.remove('is-over');
        $('pauseBannerText').textContent = names[d.activePause.side] + ' 医疗暂停中（计分锁定）';
        pcd.hidden = false;
        pcd.textContent = E.mmss(d.medicalElapsedMs);
        pcd.classList.remove('is-over');
      }
    }

    /* 局间倒计时实时刷新 */
    if (d.interval.active && !d.matchOver) {
      var ib = $('intervalBanner');
      var icd = $('intervalCountdown');
      if (d.interval.expired) {
        if (!ib.classList.contains('is-over')) {
          ib.classList.add('is-over');
          $('intervalText').textContent = '第 ' + (d.curGameNo - 1) + ' 局结束 · 局间休息已满 1 分钟，可开始第 ' + d.curGameNo + ' 局';
        }
        icd.textContent = '00:00';
        icd.classList.add('is-over');
      } else {
        icd.textContent = E.mmss(d.interval.remainMs);
        icd.classList.remove('is-over');
      }
    }
  }

  /* ================= 操作 ================= */

  /* 计分入口：只绑定 click（长按不会产生重复 click，故天然“一次点击只加 1 分”） */
  function score(side) {
    var before = E.derive(state);
    var res = E.addPoint(state, side, Date.now());
    if (!res.ok) {
      toast(res.reason === 'over' ? '比赛已结束，计分已锁定' :
        (res.reason === 'paused' ? '暂停中，计分已锁定' : '请先点击“开始比赛”'));
      return;
    }
    var d = res.derived;
    renderAll();
    if (d.matchOver) {
      toast(d.outcome === 'draw' ? '比赛结束：平局' : '比赛结束：' + R.teamLabel(state.config, d.outcome) + ' 获胜');
    } else {
      var endedGame = d.games.filter(function (g) { return g.no === before.curGameNo && g.winner; })[0];
      if (endedGame) {
        toast('第 ' + endedGame.no + ' 局结束：' + endedGame.score.A + ':' + endedGame.score.B + ' · ' + R.teamLabel(state.config, endedGame.winner) + ' 胜');
      }
      if (d.changeEnd.applicable && d.changeEnd.reached && !d.changeEnd.done) {
        toast('提示：决胜局已达 ' + d.changeEnd.threshold + ' 分，请换边');
      }
    }
  }

  function doUndo() {
    var res = E.undoPoint(state, Date.now());
    if (!res.ok) { toast(res.reason === 'paused' ? '暂停中不能撤销' : '没有可撤销的记录'); return; }
    renderAll();
    toast('已撤销上一球');
  }

  function doResetGame() {
    return confirmTwice('重置本局', '将清除第 ' + E.derive(state).curGameNo + ' 局的比分与本局事件，单局计时重置、发球方恢复该局开始发球方；已使用的普通暂停次数不返还。')
      .then(function (ok) {
        if (!ok) return false;
        var res = E.resetGame(state, Date.now());
        if (!res.ok) { toast('当前状态不可重置本局'); return false; }
        renderAll();
        toast('已重置第 ' + res.game + ' 局');
        return true;
      });
  }

  function doResetMatch() {
    return confirmTwice('重置比赛', '将清除全部比分、逐球记录、暂停记录与计时，并恢复暂停次数、解锁配置。')
      .then(function (ok) {
        if (!ok) return false;
        E.resetMatch(state);
        saveNow();
        renderAll();
        toast('已重置比赛，配置已解锁');
        return true;
      });
  }

  function requestPause(type) {
    var d = E.derive(state);
    if (type === 'normal' && !R.SIDES.some(function (s) { return E.canRequestNormalPause(state, s, d); })) {
      toast('普通暂停只能在死球状态（本局已有得分、下一球开始前）请求' +
        (d.playState === 'interval' ? '，局间不可请求' : '') + '；且本方本场未用过');
      return;
    }
    if (type === 'medical' && !E.canRequestMedicalPause(state, d)) {
      toast(d.activePause ? '已有暂停进行中' : '当前不可请求医疗暂停');
      return;
    }
    var promise = askSide(type === 'normal' ? '普通暂停 · 选择请求方' : '医疗暂停 · 选择请求方',
      type === 'normal' ? '限时 60 秒，每方每场 1 次；请求后计分锁定，倒计时结束需手动恢复。' : '不限次数、不限时；手动结束并记录时长。');
    promise
      .then(function (side) {
        if (!side) return;
        var res = E.requestPause(state, type, side, Date.now());
        if (!res.ok) {
          toast(res.reason === 'used' ? R.teamLabel(state.config, side) + ' 本场普通暂停已用完' : '当前不可请求该暂停');
          return;
        }
        renderAll();
        toast(R.teamLabel(state.config, side) + (type === 'normal' ? ' 普通暂停开始（60 秒）' : ' 医疗暂停开始'));
      });
    return promise;
  }

  function doResume() {
    var res = E.endPause(state, Date.now());
    if (!res.ok) { toast('当前没有进行中的暂停'); return; }
    renderAll();
    toast('已恢复比赛，计分解锁');
  }

  function doSwap() {
    E.toggleSwap(state);
    renderAll();
    toast('已切换左右显示（不影响任何数据）');
  }

  /* ================= 导出 ================= */

  function stamp() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }
  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function exportJson() {
    var payload = E.exportPayload(state, S, Date.now());
    download('pingpong-' + stamp() + '.json', JSON.stringify(payload, null, 2), 'application/json');
    toast('JSON 已导出');
  }
  function exportCsv() {
    var csv = E.exportCsv(state, S, Date.now());
    download('pingpong-' + stamp() + '.csv', '\ufeff' + csv, 'text/csv');
    toast('CSV 已导出（含逐球表 / 每局汇总 / 统计）');
  }

  /* ================= 事件绑定 ================= */

  function bindConfig() {
    qsa('input[name=cfgType]').forEach(function (r) {
      r.addEventListener('change', function () {
        state.config.type = r.value;
        if (r.value === 'doubles' && !R.isPlayerKey(state.config.firstServer.player)) {
          state.config = R.normalizeConfig(state.config);
        }
        if (r.value === 'singles') {
          state.config = R.normalizeConfig(state.config);
        }
        renderAll();
      });
    });
    ['nameA', 'nameB', 'nameA1', 'nameA2', 'nameB1', 'nameB2'].forEach(function (id) {
      $(id).addEventListener('input', function () { state.config = readConfigFromUI(); renderAll(); });
    });
    qsa('input[name=fmtKind]').forEach(function (r) {
      r.addEventListener('change', function () {
        state.config.format = r.value === 'fixed'
          ? { kind: 'fixed', games: R.clampInt($('fixedK').value, 1, 9, 4) }
          : { kind: 'bo', bestOf: R.clampInt((qsa('input[name=bestOf]').find(function (x) { return x.checked; }) || {}).value, 3, 7, 3) };
        renderAll();
      });
    });
    qsa('input[name=bestOf]').forEach(function (r) {
      r.addEventListener('change', function () {
        state.config.format = { kind: 'bo', bestOf: R.clampInt(r.value, 3, 7, 3) };
        renderAll();
      });
    });
    $('fixedK').addEventListener('input', function () {
      if (state.config.format.kind !== 'fixed') return;
      state.config.format.games = R.clampInt($('fixedK').value, 1, 9, 4);
      renderAll();
    });
    $('fixedK').addEventListener('blur', function () {
      if (!validateConfigFromUI()) { $('fixedK').value = state.config.format.games || 4; validateConfigFromUI(); }
    });
    qsa('.chip[data-target]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (state.cfgLocked) return;
        $('targetInput').value = b.dataset.target;
        state.config.target = R.clampInt(b.dataset.target, 1, 99, 11);
        renderAll();
      });
    });
    $('targetInput').addEventListener('input', function () {
      renderConfigClock();
      var t = parseInt($('targetInput').value, 10);
      if (isFinite(t) && t >= 1 && t <= 99) {
        state.config.target = t;
        $('cfgError').hidden = true;
        renderBoard(E.derive(state));
        renderControls(E.derive(state));
        save();
      }
    });
    $('targetInput').addEventListener('blur', function () {
      if (!validateConfigFromUI()) {
        $('targetInput').value = state.config.target;
        validateConfigFromUI();
      }
      renderAll();
    });
    $('deuceToggle').addEventListener('change', function () {
      state.config.deuce = $('deuceToggle').checked;
      renderAll();
    });
    qsa('input[name=firstTeam]').forEach(function (r) {
      r.addEventListener('change', function () {
        state.config.firstServer = { team: r.value, player: r.value, receiver: R.other(r.value) };
        renderAll();
      });
    });
    $('doublesFirstServer').addEventListener('change', function () {
      var sp = $('doublesFirstServer').value;
      state.config.firstServer.player = sp;
      state.config.firstServer.team = R.teamOfPlayer(sp);
      var serverTeam = state.config.firstServer.team;
      var oppKeys = serverTeam === 'A' ? ['B1', 'B2'] : ['A1', 'A2'];
      if (oppKeys.indexOf(state.config.firstServer.receiver) < 0) state.config.firstServer.receiver = oppKeys[0];
      rebuildReceiverOptions();
      state.config = readConfigFromUI();
      renderAll();
    });
    $('doublesFirstReceiver').addEventListener('change', function () {
      state.config = readConfigFromUI();
      renderAll();
    });
    $('btnStartMatch').addEventListener('click', function () {
      state.config = readConfigFromUI();
      if (!validateConfigFromUI()) return;
      state.config = R.normalizeConfig(state.config);
      E.startMatch(state, Date.now());
      saveNow();
      renderAll();
      toast('比赛开始，总计时已启动');
    });
    $('btnStartGame').addEventListener('click', function () {
      var res = E.startGame(state, Date.now());
      saveNow();
      renderAll();
      toast('第 ' + E.derive(state).curGameNo + ' 局计时开始');
    });
  }

  function bindControls() {
    $('btnPointA').addEventListener('click', function () { score('A'); });
    $('btnPointB').addEventListener('click', function () { score('B'); });
    $('btnUndo').addEventListener('click', doUndo);
    $('btnResetGame').addEventListener('click', doResetGame);
    $('btnResetMatch').addEventListener('click', doResetMatch);
    $('btnNormalPause').addEventListener('click', function () { requestPause('normal'); });
    $('btnMedicalPause').addEventListener('click', function () { requestPause('medical'); });
    $('btnResume').addEventListener('click', doResume);
    $('btnResumeInline').addEventListener('click', doResume);
    $('btnStartGameInline').addEventListener('click', function () {
      E.startGame(state, Date.now());
      saveNow();
      renderAll();
      toast('第 ' + E.derive(state).curGameNo + ' 局计时开始');
    });
    $('btnSwap').addEventListener('click', doSwap);
    $('btnSwapInline').addEventListener('click', doSwap);
    $('btnAckChangeEnd').addEventListener('click', function () {
      E.markChangeEnd(state, E.derive(state).curGameNo);
      renderAll();
      toast('已确认换边');
    });
    $('btnExportJson').addEventListener('click', exportJson);
    $('btnExportCsv').addEventListener('click', exportCsv);

    /* 防止长按/连点连加：阻断 contextmenu / 重复 pointer（click 已足够） */
    ['btnPointA', 'btnPointB'].forEach(function (id) {
      var el = $(id);
      el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      el.addEventListener('dblclick', function (e) { e.preventDefault(); });
    });
  }

  function bindTabs() {
    $('tabMatch').addEventListener('click', function () {
      state.ui.statsScope = 'match';
      renderStats(E.derive(state));
      save();
    });
    $('tabGame').addEventListener('click', function () {
      state.ui.statsScope = 'game';
      renderStats(E.derive(state));
      save();
    });
    $('statsGameSelect').addEventListener('change', function () {
      state.ui.statsGame = R.clampInt(this.value, 1, 99, 1);
      renderStats(E.derive(state));
      save();
    });
  }

  function bindKeyboard() {
    document.addEventListener('keydown', function (e) {
      var t = e.target;
      var typing = t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (e.key === 'Escape') {
        if (!$('modalBackdrop').hidden) { closeModal(null); }
        return;
      }
      if (typing) return;
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        doUndo();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      switch (e.key) {
        case 'a': case 'A': case 'ArrowLeft': e.preventDefault(); score('A'); break;
        case 'b': case 'B': case 'ArrowRight': e.preventDefault(); score('B'); break;
        case 'p': case 'P': e.preventDefault(); requestPause('normal'); break;
        case 'm': case 'M': e.preventDefault(); requestPause('medical'); break;
        default: break;
      }
    });
    document.addEventListener('visibilitychange', function () { if (document.hidden) saveNow(); });
    window.addEventListener('pagehide', saveNow);
    window.addEventListener('beforeunload', saveNow);
  }

  function bindModal() {
    $('modalBackdrop').addEventListener('click', function (e) {
      if (e.target === $('modalBackdrop')) closeModal(null);
    });
  }

  /* ================= 启动 ================= */

  function init() {
    ensureHiddenRule();
    var restored = load();
    if (restored) {
      state = restored;
      state.config = R.normalizeConfig(state.config);
      var d = E.derive(state);
      document.title = '乒乓球计分器 · 已恢复上一场比赛';
      renderAll();
      if (d.activePause) toast('已恢复：暂停进行中');
      else if (d.matchOver) toast('已恢复：上一场比赛（已结束）');
      else if (state.started) toast('已恢复上一场比赛进度');
    } else {
      state = E.newState({});
      renderAll();
    }

    bindConfig();
    bindControls();
    bindTabs();
    bindKeyboard();
    bindModal();
    renderAll();

    setInterval(function () {
      if (state.started) renderLive();
    }, 250);

    /* 内置自测：?selftest=1 */
    var params = new URLSearchParams(location.search);
    if (params.get('selftest') === '1' && window.PPSelfTest) {
      window.PPSelfTest.run(document);
    }
  }

  /* ================= 测试钩子（仅供 tests/selftest.js 使用） =================
     不参与正常使用流程；正常浏览时不会被调用，也不改变任何行为。 */
  window.__ppTest = {
    get state() { return state; },
    load: function (s) { state = s; renderAll(); return state; },
    startMatch: function () { E.startMatch(state, Date.now()); saveNow(); renderAll(); return state; },
    startGame: function () { E.startGame(state, Date.now()); saveNow(); renderAll(); },
    render: function () { return renderAll(); },
    saveNow: saveNow,
    loadFromStorage: load,
    clickScoreNow: function (side) { score(side); },
    autoPoint: function (side) {
      var r = E.addPoint(state, side, Date.now());
      renderAll();
      return r.ok;
    },
    autoPlayGame: function (winner) {
      var g0 = E.derive(state).curGameNo;
      var guard = 0;
      while (guard++ < 400) {
        var d = E.derive(state);
        var g = d.games.filter(function (x) { return x.no === g0; })[0];
        if (d.matchOver || (g && g.winner) || d.curGameNo !== g0) break;
        if (!E.addPoint(state, winner, Date.now()).ok) break;
      }
      renderAll();
    },
    requestPauseUI: function (type) { return requestPause(type); },
    resetGameUI: function () { return doResetGame(); },
    confirmModalChoice: function (index) {
      var rows = document.querySelectorAll('#modalBody .choice-row .btn');
      if (rows[index]) rows[index].click();
    },
    undoUI: doUndo,
    exportJsonUI: exportJson,
    exportCsvUI: exportCsv
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();