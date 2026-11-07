/*!
 * app.js —— 界面装配：状态管理、渲染、抽签动画回放、导入导出联动
 *
 * 两阶段模型：
 *   generate() —— 一次性合规生成完整结果（drawGroups + drawKnockout），失败则返回明确原因
 *   replay()   —— 仅按预生成结果逐档/逐签位播放动画，动画中绝不重新随机
 * 重抽 = 新 seed 重新 generate + 重新 replay。
 */
(function () {
  'use strict';

  var TT = window.TT;
  var util = TT.util;

  /* ==================== 状态 ==================== */

  var S = {
    eventType: 'singles',
    entries: [],           /* entry[] */
    config: {
      groupCount: 6, groupSize: 4, qualifiersPerGroup: 2, seedCount: 6, tierCount: 4
    },
    seedText: '',          /* 开发者可复现签名 */
    groupResult: null,     /* drawGroups 结果 */
    bracket: null,         /* drawKnockout 结果 */
    bracketTitle: '淘汰赛签表',
    bracketSub: '',
    step: 1,
    anim: { queue: [], cursor: 0, done: 0, busy: false, landedMap: {}, keepQualified: {} },
    ko: { events: [], cursor: 0, done: 0, busy: false, landed: {} },
    koSeed: null,
    autoPlay: false
  };

  var STORE_KEY = 'tt-draw-state-v1';

  function $(id) { return document.getElementById(id); }
  function qsa(sel, r) { return Array.prototype.slice.call((r || document).querySelectorAll(sel)); }
  function on(el, ev, fn) { if (el) el.addEventListener(ev, fn); }

  /* ==================== 小工具 ==================== */

  function toast(msg, ms) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(t.__timer);
    t.__timer = setTimeout(function () { t.hidden = true; }, ms || 2600);
  }

  function openModal(opt) {
    var back = $('modalBackdrop');
    $('modalTitle').textContent = opt.title || '提示';
    var body = $('modalBody');
    body.innerHTML = '';
    if (opt.html) body.innerHTML = opt.html;
    else if (opt.message) {
      var p = document.createElement('p');
      p.textContent = opt.message;
      body.appendChild(p);
    }
    var actions = $('modalActions');
    actions.innerHTML = '';
    (opt.actions || [{ label: '知道了', value: true, primary: true }]).forEach(function (a) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn' + (a.primary ? ' btn-primary' : '');
      b.textContent = a.label;
      b.addEventListener('click', function () {
        closeModal();
        if (a.onClick) a.onClick();
      });
      actions.appendChild(b);
    });
    back.hidden = false;
    return back;
  }
  function closeModal() { $('modalBackdrop').hidden = true; }

  function noticeList(host, items, kindDefault) {
    host.innerHTML = '';
    (items || []).forEach(function (it) {
      var d = document.createElement('div');
      var kind = it.kind || kindDefault || 'info';
      d.className = 'notice' + (kind === 'warn' ? ' warn' : (kind === 'error' ? ' error' : ''));
      var ico = document.createElement('span');
      ico.className = 'ico';
      ico.textContent = kind === 'error' ? '✕' : (kind === 'warn' ? '!' : 'i');
      var body = document.createElement('div');
      body.className = 'body';
      body.textContent = it.text || it;
      d.appendChild(ico); d.appendChild(body);
      host.appendChild(d);
    });
  }

  /* ==================== 步骤导航 ==================== */

  function goStep(n) {
    S.step = n;
    qsa('.panel').forEach(function (p) { p.classList.remove('is-active'); });
    var panel = $('panel' + n);
    if (panel) panel.classList.add('is-active');
    qsa('.step-chip').forEach(function (c) {
      var k = Number(c.dataset.step);
      c.classList.toggle('is-active', k === n);
      c.classList.toggle('is-done', k < n);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (n === 2) refreshConfigView();
    if (n === 3) {
      if (S.groupResult) {
        /* 每次进入第 3 步都按当前结果重建队列与小组盘（保留已落位状态） */
        if (!S.anim.queue.length) {
          initDrawUI();
        } else {
          renderCourt();
          renderQueue();
        }
      }
    }
    if (n === 4) {
      if (S.bracket) {
        if (!S.ko.events.length) initKoUI();
        else { renderKoBoard(); renderKoQueue(); renderBracketView(); }
      }
    }
    if (n === 5) refreshExportView();
  }

  /* ==================== ① 名单 ==================== */

  function renderEntries() {
    var body = $('entryBody');
    body.innerHTML = '';
    S.entries.forEach(function (e, i) {
      var tr = document.createElement('tr');
      tr.dataset.idx = i;

      var tdN = document.createElement('td');
      tdN.textContent = i + 1;

      var tdName = document.createElement('td');
      var inp = document.createElement('input');
      inp.type = 'text';
      inp.value = util.entryName(e);
      inp.placeholder = S.eventType === 'doubles' ? '姓名A / 姓名B' : '选手姓名';
      inp.addEventListener('input', function () {
        var txt = inp.value;
        if (S.eventType === 'doubles') {
          var parts = txt.split(/[/／|]/).map(function (s) { return s.trim(); });
          e.players = [parts[0] || '', parts[1] || ''];
        } else {
          e.players = [txt.trim()];
        }
        e.__nameRaw = txt;
        refreshEntrySummary();
        saveState();
      });
      tdName.appendChild(inp);

      function numCell(key, placeholder) {
        var td = document.createElement('td');
        var ip = document.createElement('input');
        ip.type = 'number';
        ip.min = key === 'seedRank' ? '1' : '1';
        ip.placeholder = placeholder || '';
        ip.value = e[key] == null ? '' : e[key];
        ip.addEventListener('input', function () {
          var v = ip.value.trim();
          e[key] = v === '' ? null : Number(v);
          refreshEntrySummary();
          saveState();
        });
        td.appendChild(ip);
        return td;
      }

      var tdP1 = document.createElement('td');
      var ip1 = document.createElement('input');
      ip1.type = 'text'; ip1.value = e.players[0] || ''; ip1.placeholder = '留空用参赛名';
      ip1.addEventListener('input', function () {
        e.players[0] = ip1.value.trim();
        inp.value = util.entryName(e);
        saveState();
      });
      tdP1.appendChild(ip1);
      tdP1.className = 'col-p1';

      var tdP2 = document.createElement('td');
      var ip2 = document.createElement('input');
      ip2.type = 'text'; ip2.value = e.players[1] || ''; ip2.placeholder = S.eventType === 'doubles' ? '第 2 人' : '—';
      ip2.disabled = S.eventType !== 'doubles';
      ip2.addEventListener('input', function () {
        e.players[1] = ip2.value.trim();
        inp.value = util.entryName(e);
        saveState();
      });
      tdP2.appendChild(ip2);
      tdP2.className = 'col-p2';

      var tdR = document.createElement('td');
      var ipR = document.createElement('input');
      ipR.type = 'text'; ipR.placeholder = '—';
      ipR.value = e.remark || '';
      ipR.addEventListener('input', function () { e.remark = ipR.value; saveState(); });
      tdR.appendChild(ipR);

      var tdDel = document.createElement('td');
      var del = document.createElement('button');
      del.type = 'button'; del.className = 'row-del'; del.textContent = '✕';
      del.title = '删除该行';
      del.addEventListener('click', function () {
        S.entries.splice(i, 1);
        renderEntries();
        saveState();
      });
      tdDel.appendChild(del);

      tr.appendChild(tdN); tr.appendChild(tdName);
      tr.appendChild(tdP1); tr.appendChild(tdP2);
      tr.appendChild(numCell('rank', '按你给的'));
      tr.appendChild(numCell('seedRank', '1=最高'));
      tr.appendChild(numCell('tier', '1=最高档'));
      tr.appendChild(numCell('groupPoints', '双打用'));
      tr.appendChild(tdR); tr.appendChild(tdDel);
      body.appendChild(tr);
    });
    refreshEntrySummary();
    saveState();
  }

  function refreshEntrySummary() {
    var n = S.entries.length;
    var withSeed = S.entries.filter(function (e) { return e.seedRank != null; }).length;
    var withRank = S.entries.filter(function (e) { return e.rank != null; }).length;
    var dupSeed = detectDupSeeds();
    var txt = n + ' 个参赛单元';
    if (S.eventType === 'doubles') txt += '（双打 ' + n + ' 对）';
    if (withRank) txt += ' · 已填排名 ' + withRank + ' 个';
    if (withSeed) txt += ' · 种子 ' + withSeed + ' 个';
    if (dupSeed.length) txt += ' · ⚠ 种子序重复：' + dupSeed.join('、');
    $('entrySummary').textContent = txt;

    /* 校验提示 */
    var v = TT.validateEntries(S.entries, S.eventType);
    var items = [];
    v.errors.forEach(function (t) { items.push({ kind: 'error', text: t }); });
    v.warnings.forEach(function (t) { items.push({ kind: 'warn', text: t }); });
    noticeList($('entryNotices'), items);
  }

  function detectDupSeeds() {
    var seen = {}, dup = [];
    S.entries.forEach(function (e) {
      if (e.seedRank == null) return;
      if (seen[e.seedRank]) { if (dup.indexOf(e.seedRank) < 0) dup.push(e.seedRank); }
      else seen[e.seedRank] = true;
    });
    return dup;
  }

  function genDemo() {
    var n = TT.util.clamp(Number($('bulkCount').value) || 20, 2, 64);
    var doubles = S.eventType === 'doubles';
    var surnames = '赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜'.split('');
    var given = ['伟', '强', '磊', '洋', '勇', '军', '杰', '涛', '明', '超', '鹏', '浩', '宇', '峰', '亮', '刚'];
    var seeds = Math.min(8, n);
    var list = [];
    for (var i = 0; i < n; i++) {
      var name1 = surnames[i % surnames.length] + given[(i * 3) % given.length];
      var players = [name1];
      if (doubles) players.push(surnames[(i + 5) % surnames.length] + given[(i * 7 + 2) % given.length]);
      list.push(TT.normalizeEntry({
        players: players,
        seedRank: i < seeds ? i + 1 : null,
        /* 档位留空：由算法按实力顺序自动分档，避免“第 1 档超额”的容量冲突 */
        tier: null,
        groupPoints: doubles ? (2000 - i * 30) : null,
        remark: ''
      }, i));
    }
    S.entries = list;
    /* 同步一份合理配置，保证“生成 → 抽签”能直接跑通 */
    var rec = TT.recommendConfig(n, S.eventType);
    S.config = {
      groupCount: rec.groupCount,
      groupSize: rec.groupSize,
      qualifiersPerGroup: rec.qualifiersPerGroup,
      seedCount: Math.min(seeds, rec.groupCount * 2),
      tierCount: rec.tierCount
    };
    renderEntries();
    refreshConfigView();
    toast('已生成 ' + n + ' 个' + (doubles ? '双打组合' : '单打选手') + '（前 ' + seeds + ' 个种子，档位自动分配）');
  }

  /* ==================== ② 配置 ==================== */

  function readConfigInputs() {
    var c = S.config;
    c.groupCount = TT.util.clamp(Number($('cfgGroups').value) || 1, 1, 32);
    c.groupSize = TT.util.clamp(Number($('cfgSize').value) || 2, 2, 16);
    c.qualifiersPerGroup = TT.util.clamp(Number($('cfgQual').value) || 1, 1, 8);
    c.seedCount = TT.util.clamp(Number($('cfgSeeds').value) || 0, 0, 64);
    c.tierCount = TT.util.clamp(Number($('cfgTiers').value) || 1, 1, 16);
    S.seedText = ($('cfgSeedText').value || '').trim();
    S.config = c;
    refreshConfigView();
    saveState();
  }

  function refreshConfigView() {
    var n = S.entries.length;
    $('recoN').textContent = n;
    var rec = TT.recommendConfig(n, S.eventType);
    var sizes = TT.groupSizes(n, rec.groupCount);
    $('recoText').textContent = rec.groupCount + ' 组（' + sizes.join('/') + '）× 每组出线 ' +
      rec.qualifiersPerGroup + ' → 出线 ' + (rec.groupCount * rec.qualifiersPerGroup) + ' 人';

    $('cfgGroups').value = S.config.groupCount;
    $('cfgSize').value = S.config.groupSize;
    $('cfgQual').value = S.config.qualifiersPerGroup;
    $('cfgSeeds').value = S.config.seedCount;
    $('cfgTiers').value = S.config.tierCount;
    $('cfgSeedText').value = S.seedText;

    var cfgForValidate = {
      eventType: S.eventType,
      groupCount: S.config.groupCount,
      groupSize: S.config.groupSize,
      qualifiersPerGroup: S.config.qualifiersPerGroup,
      seedCount: S.config.seedCount,
      tierCount: S.config.tierCount
    };
    var v = TT.validateConfig(cfgForValidate, n);
    var items = [];
    v.errors.forEach(function (t) { items.push({ kind: 'error', text: t }); });
    v.warnings.forEach(function (t) { items.push({ kind: 'warn', text: t }); });
    noticeList($('cfgNotices'), items);

    /* 预览：空槽位结构 */
    var sizesNow = TT.groupSizes(n, S.config.groupCount);
    var host = $('cfgPreview');
    host.innerHTML = '';
    sizesNow.forEach(function (sz, gi) {
      var card = document.createElement('div');
      card.className = 'gcard';
      var head = document.createElement('div');
      head.className = 'gcard-head';
      head.innerHTML = '<span>' + util.groupLabel(gi) + ' 组</span><span class="sz">' +
        (sz === S.config.groupSize ? sz + ' 人' : sz + ' 人（目标 ' + S.config.groupSize + '）') + '</span>';
      var slots = document.createElement('div');
      slots.className = 'gcard-slots';
      for (var k = 0; k < sz; k++) {
        var row = document.createElement('div');
        row.className = 'gslot';
        row.innerHTML = '<span class="pos">' + (k + 1) + '</span>' +
          '<span class="nm muted">' + (k === 0 ? '种子位' : '待抽') + '</span>';
        slots.appendChild(row);
      }
      card.appendChild(head); card.appendChild(slots);
      host.appendChild(card);
    });
    $('cfgPreviewText').textContent = '共 ' + n + ' 个单元 · ' + S.config.groupCount + ' 组 · 出线 ' +
      (S.config.groupCount * S.config.qualifiersPerGroup) + ' 人';
    $('btnDoDraw').disabled = !v.ok || n < 2;
  }

  /* ==================== ③ 抽签与动画 ==================== */

  function currentSeed() {
    /* URL 参数 ?seed=xxx 也可指定（开发者/复盘用，不在主界面强调） */
    if (S.seedText !== '') return S.seedText;
    try {
      var m = /[?&]seed=([^&#]+)/.exec(location.search);
      if (m) return decodeURIComponent(m[1]);
    } catch (e) {}
    return undefined;
  }

  function doDraw(isRedraw) {
    var cfg = {
      eventType: S.eventType,
      groupCount: S.config.groupCount,
      groupSize: S.config.groupSize,
      qualifiersPerGroup: S.config.qualifiersPerGroup,
      seedCount: S.config.seedCount,
      tierCount: S.config.tierCount
    };
    var v = TT.validateConfig(cfg, S.entries.length);
    if (!v.ok) {
      noticeList($('cfgNotices'), v.errors.map(function (t) { return { kind: 'error', text: t }; }));
      toast('配置有误，无法抽签');
      return;
    }
    var seed = isRedraw ? (S.seedText === '' ? undefined : S.seedText + '-r' + Date.now() % 100000) : currentSeed();
    /* 重抽：若用户没填签名，则用新随机种子；填了签名则在其上派生，保证“重抽=重新生成” */
    if (isRedraw && S.seedText !== '') seed = S.seedText + '#' + (S.redrawCount = (S.redrawCount || 0) + 1);

    var res = TT.drawGroups({
      entries: S.entries,
      config: cfg,
      seed: seed,
      constraints: []
    });

    var items = [];
    if (!res.ok) {
      res.errors.forEach(function (t) { items.push({ kind: 'error', text: t }); });
      noticeList($('drawNotices'), items);
      openModal({
        title: '抽签未能生成',
        html: '<div class="notice error"><span class="ico">✕</span><div class="body"><b>约束冲突，未放宽规则</b>' +
          res.errors.map(function (t) { return '<div>' + t + '</div>'; }).join('') + '</div></div>' +
          '<p class="muted" style="margin-top:10px">请调整小组数 / 出线人数 / 档位后重试。</p>'
      });
      return;
    }

    S.groupResult = res;
    S.bracket = null;
    res.notices.forEach(function (t) { items.push({ kind: 'warn', text: t }); });

    $('drawNotices').innerHTML = '';
    noticeList($('drawNotices'), items);

    /* 新结果 → 必须重建队列，不能沿用上一轮残留的队列 */
    initDrawUI();
    goStep(3);
    saveState();

    toast('分组已完成，请按顺序逐人抽取');
  }

  /* ==================== 抽签：按排名序逐人点击抽取 ==================== */

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /** 构建待抽队列：**严格按你在名单里给出的顺序**（第 1 行先抽、第 2 行其次…）。
   *  不按种子序、不按排名、更不按积分重排；分档/落位仍由算法按排名序决定，
   *  但那与"谁先被抽到"是两件事。 */
  function buildQueue() {
    var res = S.groupResult;
    if (!res) return [];
    var plMap = {};
    (res.placements || []).forEach(function (p) { plMap[p.entryId] = p; });
    var queue = [];
    S.entries.forEach(function (e, i) {
      var p = plMap[e.id];
      if (!p) return;
      queue.push({
        entry: e,
        order: i,
        seedRank: e.seedRank,
        tier: res.tiers[e.id],
        groupIndex: p.groupIndex,
        groupLabel: res.groups[p.groupIndex].label,
        slot: p.slot,
        kind: p.kind,
        landed: false
      });
    });
    return queue;
  }

  /** 左侧：待抽队列卡片（点击当前应抽的那张） */
  function renderQueue() {
    var list = $('queueList');
    if (!list) return;
    var q = S.anim.queue || [];
    list.innerHTML = '';
    $('queueCount').textContent = S.anim.done + ' / ' + q.length;

    q.forEach(function (item, i) {
      var isDone = !!item.landed;
      var isCur = i === S.anim.cursor && !isDone;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'pcard' + (item.seedRank != null ? ' is-seed' : '') +
        (isDone ? ' is-done' : '') + (isCur ? ' is-current' : '');
      b.disabled = isDone || S.anim.busy;
      b.innerHTML =
        '<span class="rank">' + (item.seedRank != null ? item.seedRank : (i + 1)) + '</span>' +
        '<span class="nm">' + escapeHtml(util.entryName(item.entry)) + '</span>' +
        '<span class="meta">' + (item.tier != null ? 'T' + item.tier : '') +
        (isDone ? ' ' + item.groupLabel + item.slot : '') + '</span>';

      /* 轮到本人时展开：积分排名 / 种子序 / 档位 / 组合积分 */
      if (isCur) {
        var e = item.entry;
        var extra = document.createElement('div');
        extra.className = 'pcard-extra';
        var bits = [];
        bits.push('<span>' + (e.rank != null ? '排名第 ' + e.rank : '排名 —') + '</span>');
        bits.push('<span>' + (e.seedRank != null ? '种子第 ' + e.seedRank : '非种子') + '</span>');
        if (e.groupPoints != null) bits.push('<span>积分 ' + e.groupPoints + '</span>');
        if (item.tier != null) bits.push('<span>第 ' + item.tier + ' 档</span>');
        extra.innerHTML = bits.join('');
        b.appendChild(extra);
        b.style.flexWrap = 'wrap';
      }
      b.addEventListener('click', function () {
        if (isDone || S.anim.busy) return;
        if (i !== S.anim.cursor) {
          toast('请按名单顺序抽取：当前轮到第 ' + (S.anim.cursor + 1) + ' 位');
          return;
        }
        doPick();
      });
      list.appendChild(b);
    });

    var cur = q[S.anim.cursor];
    $('queueHint').textContent = cur
      ? '轮到：' + util.entryName(cur.entry) + (cur.seedRank != null ? '（种子 ' + cur.seedRank + '）' : '')
      : '全部抽取完成';
    var startBtn = $('btnStartDraw');
    if (startBtn) {
      startBtn.disabled = S.anim.busy || !cur;
      startBtn.textContent = (q.length && S.anim.done >= q.length) ? '已全部抽取'
        : (S.anim.done ? '继续抽签' : '开始抽签');
    }
  }

  /** 为某一格创建“出线名次”选择器（第 1 出线 / 第 2 出线 …）。
   *  每个格子的闭包都必须绑定自己的 landed 实例，因此独立成函数
   *  （参数作用域天然隔离），避免循环内 var 共享导致勾选错位。 */
  function makeCheckbox(landed, gi) {
    var q = Math.max(1, S.config.qualifiersPerGroup);
    var wrap = document.createElement('span');
    wrap.className = 'grank-wrap';

    var sel = document.createElement('select');
    sel.className = 'grank' + (landed.qualRank ? ' is-on' : '');
    sel.title = '选择出线名次（第 1 出线 … 第 ' + q + ' 出线）';

    var o0 = document.createElement('option');
    o0.value = '';
    o0.textContent = '—';
    sel.appendChild(o0);
    for (var r = 1; r <= q; r++) {
      var o = document.createElement('option');
      o.value = String(r);
      o.textContent = '第' + r;
      sel.appendChild(o);
    }
    sel.value = landed.qualRank ? String(landed.qualRank) : '';

    sel.addEventListener('click', function (e) { e.stopPropagation(); });
    sel.addEventListener('change', function (e) {
      e.stopPropagation();
      assignQualRank(gi, landed, sel.value ? Number(sel.value) : null);
      markEntryQualified();
      renderCourt();          /* 重绘以体现同组内的名次交换 */
      saveState();
    });

    wrap.appendChild(sel);
    return wrap;
  }

  /** 设置某格的出线名次；同组内同名次自动交换，保证 1..q 各一份 */
  function assignQualRank(gi, target, rank) {
    if (rank == null) { target.qualRank = null; return; }
    Object.keys(S.anim.landedMap || {}).forEach(function (k) {
      if (Number(String(k).split(':')[0]) !== gi) return;
      var o = S.anim.landedMap[k];
      if (!o || o === target) return;
      if (o.qualRank === rank) o.qualRank = target.qualRank || null;   /* 交换 */
    });
    target.qualRank = rank;
  }

  /** 把出线名次同步到 entries（导出/JSON 用同一份判定） */
  function markEntryQualified() {
    Object.keys(S.anim.landedMap || {}).forEach(function (k) {
      var v = S.anim.landedMap[k];
      if (!v || !v.entry) return;
      v.entry.qualified = v.qualRank != null;
      v.entry.qualRank = v.qualRank != null ? v.qualRank : null;
    });
  }

  /** 右侧：N 个小组栏平铺（固定列数 → 各档次横向对齐，窄屏也不跳位） */
  function renderCourt() {
    var res = S.groupResult;
    var court = $('drawCourt');
    if (!res || !court) return;

    /* 列数与导出版式一致：≤2 单列、≤6 三列、更多四列；窄屏等比降级 */
    var G = res.groups.length;
    var cols = G <= 2 ? Math.max(1, G) : (G <= 6 ? 3 : 4);
    court.style.setProperty('--court-cols', String(cols));
    court.style.setProperty('--court-cols-sm', String(cols >= 3 ? 2 : cols));

    court.innerHTML = '';

    res.groups.forEach(function (g, gi) {
      var col = document.createElement('div');
      col.className = 'gcol';
      var head = document.createElement('div');
      head.className = 'gcol-head';
      head.innerHTML = '<span>' + g.label + ' 组</span><span class="sz">' + g.size + ' 人</span>';
      col.appendChild(head);

      var body = document.createElement('div');
      body.className = 'gcol-body';
      for (var s = 0; s < g.size; s++) {
        var cell = document.createElement('div');
        cell.className = 'gcell is-empty';
        cell.dataset.gi = String(gi);
        cell.dataset.si = String(s);

        var pos = document.createElement('span');
        pos.className = 'pos';
        pos.textContent = String(s + 1);
        var nm = document.createElement('span');
        nm.className = 'nm';
        var mk = document.createElement('span');
        mk.className = 'mk';

        var landed = S.anim.landedMap[gi + ':' + s];
        if (landed) {
          /* 重播前保留的人工勾选标记，回填到新落位对象 */
          if (S.anim.keepQualified && S.anim.keepQualified[gi + ':' + s] != null) {
            landed.qualRank = S.anim.keepQualified[gi + ':' + s];
          }
          cell.classList.remove('is-empty');
          cell.classList.add(landed.kind === 'seed' ? 'is-seed' : 'is-shot');
          nm.textContent = util.entryName(landed.entry);
          mk.textContent = landed.tier != null ? 'T' + landed.tier : '';
          if (landed.justLanded) {
            cell.classList.add('just-landed');
            landed.justLanded = false;
          }
          /* 出线勾选：人工判定，不预填（最后追加到最右侧）。
             注意：必须用「工厂函数」把 landed/chk 作为参数传进独立作用域，
             否则 for 循环里的 var 是函数作用域，同组所有格子的回调会共享
             同一个变量，导致点一格却切换了另一格（勾选偏移）。 */
          cell.appendChild(pos);
          cell.appendChild(nm);
          cell.appendChild(mk);
          cell.appendChild(makeCheckbox(landed, gi));
        } else {
          nm.textContent = '待抽';
          cell.appendChild(pos);
          cell.appendChild(nm);
          cell.appendChild(mk);
        }
        body.appendChild(cell);
      }
      col.appendChild(body);
      court.appendChild(col);
    });
  }

  function cellOf(gi, si) {
    var court = $('drawCourt');
    return court ? court.querySelector('.gcell[data-gi="' + gi + '"][data-si="' + si + '"]') : null;
  }

  /** 计算某位待抽者的“可选位置”集合（同档空位；目标格一定包含在内） */
  function tierCandidates(targetGi, targetSi, tier) {
    var res = S.groupResult;
    var tierCands = [], allCands = [];
    if (res) {
      res.groups.forEach(function (g, gi) {
        g.slots.forEach(function (sl, si) {
          if (S.anim.landedMap[gi + ':' + si]) return;      /* 已落位的不参与 */
          var c = { gi: gi, si: si, tier: si + 1 };
          allCands.push(c);
          if (c.tier === tier) tierCands.push(c);
        });
      });
    }
    var target = { gi: targetGi, si: targetSi, tier: tier + 1 };
    var base = tierCands.length ? tierCands.slice() : allCands.slice();
    var hasTarget = base.some(function (c) { return c.gi === targetGi && c.si === targetSi; });
    if (!hasTarget) base.push(target);
    return base;
  }

  /** 随机框选：把"每一个可选位置"都遍历一遍（每格恰好一次、匀速不停顿），最后落在目标格。
   *  可选位置 = 与待抽者同档（同一层级）且仍空着的位置；目标格一定在集合内，
   *  这样动画展示的就是"真正参与竞争的全部位置"，不会让人以为漏掉了某些组。
   *  只有唯一可选位置时**不做动画**，直接落位（由调用方判断后走 placeNow）。 */
  function scanAnimation(targetGi, targetSi, tier, cb) {
    if (!S.groupResult) { cb(); return; }

    var base = tierCandidates(targetGi, targetSi, tier);
    var target = { gi: targetGi, si: targetSi, tier: tier + 1 };
    /* 打乱顺序，再把目标挪到最后：遍历完所有位置后自然落在目标上 */
    var others = base.filter(function (c) { return !(c.gi === targetGi && c.si === targetSi); });
    for (var k = others.length - 1; k > 0; k--) {
      var j = Math.floor(Math.random() * (k + 1));
      var tmp = others[k]; others[k] = others[j]; others[j] = tmp;
    }
    others.push(target);

    /* 匀速：每格停留相同时间，不做收尾减速、不额外停顿 */
    var STEP_MS = 130;
    var i = 0, lastCell = null;

    function clearLast() {
      if (lastCell) {
        lastCell.classList.remove('is-scanning');
        lastCell.classList.remove('is-final');
        lastCell = null;
      }
    }

    function step() {
      clearLast();
      if (i >= others.length) { cb(); return; }
      var c = others[i];
      var cell = cellOf(c.gi, c.si);
      if (cell) {
        var isTarget = (c.gi === targetGi && c.si === targetSi);
        cell.classList.add(isTarget ? 'is-final' : 'is-scanning');
        lastCell = cell;
      }
      i++;
      setTimeout(step, STEP_MS);
    }

    if (!others.length) { cb(); return; }
    step();
  }

  /** 抽取当前一人：落点来自预生成结果，动画只做表现，不重新随机落位。
   *  若该位只有唯一可选位置（没有第二选择），直接放入，不放动画。 */
  function doPick() {
    if (S.anim.busy) return;
    var item = (S.anim.queue || [])[S.anim.cursor];
    if (!item) return;
    S.anim.busy = true;
    renderQueue();

    var cands = tierCandidates(item.groupIndex, item.slot - 1, item.tier);

    function placeNow() {
      S.anim.landedMap[item.groupIndex + ':' + (item.slot - 1)] = {
        entry: item.entry,
        tier: item.tier,
        kind: item.kind,
        justLanded: true
      };
      item.landed = true;
      S.anim.cursor++;
      S.anim.done++;
      renderCourt();
      $('drawWho').textContent = util.entryName(item.entry);
      $('drawWhere').textContent = '→ ' + item.groupLabel + ' 组 · 第 ' + item.slot + ' 位';
      S.anim.busy = false;
      renderQueue();
      if (S.anim.cursor >= S.anim.queue.length) {
        $('drawWho').textContent = '抽签完成';
        $('drawWhere').textContent = '共 ' + S.anim.queue.length + ' 人已全部落位';
        saveState();
      }
      /* 每次点击只抽一个人；下一步由用户再点“继续抽签”。 */
    }

    /* 唯一可选位置 → 直接放入 */
    if (cands.length <= 1) {
      $('drawWho').textContent = util.entryName(item.entry);
      $('drawWhere').textContent = '唯一可选位置，直接放入 ' + item.groupLabel + ' 组';
      if (window.__ttPickLog) window.__ttPickLog.push({ name: util.entryName(item.entry), cands: cands.length, instant: true });
      placeNow();
      return;
    }

    $('drawWho').textContent = util.entryName(item.entry);
    $('drawWhere').textContent = '正在随机框选小组…';
    if (window.__ttPickLog) window.__ttPickLog.push({ name: util.entryName(item.entry), cands: cands.length, instant: false });
    scanAnimation(item.groupIndex, item.slot - 1, item.tier, placeNow);
  }

  function resetAnimState() {
    S.anim = { queue: [], cursor: 0, done: 0, busy: false, landedMap: {}, keepQualified: {} };
    S.autoPlay = false;
  }

  /** 全部放入（跳过动画；保留已有的人工出线勾选） */
  function skipAnim() {
    S.autoPlay = false;
    var keep = S.anim.keepQualified || {};
    Object.keys(S.anim.landedMap || {}).forEach(function (k) {
      if (S.anim.landedMap[k] && S.anim.landedMap[k].qualRank != null) keep[k] = S.anim.landedMap[k].qualRank;
    });
    S.anim.keepQualified = keep;
    var q = S.anim.queue || [];
    q.forEach(function (item) {
      if (item.landed) return;
      var key = item.groupIndex + ':' + (item.slot - 1);
      S.anim.landedMap[key] = {
        entry: item.entry, tier: item.tier, kind: item.kind,
        justLanded: false, qualRank: keep[key] != null ? keep[key] : null
      };
      item.landed = true;
    });
    S.anim.cursor = q.length;
    S.anim.done = q.length;
    S.anim.busy = false;
    renderCourt();
    renderQueue();
    $('drawWho').textContent = q.length ? '抽签完成' : '准备抽签';
    $('drawWhere').textContent = '共 ' + q.length + ' 人已全部落位';
    saveState();
  }

  /** 从头重播：清空落位，按同一预生成结果重新逐人抽取（出线勾选） */
  function replayAnim() {
    S.autoPlay = false;
    /* 保留人工出线标记：重播只影响"是否已落位"，不抹掉用户的判定 */
    var keepQualified = {};
    Object.keys(S.anim.landedMap || {}).forEach(function (k) {
      if (S.anim.landedMap[k] && S.anim.landedMap[k].qualRank != null) keepQualified[k] = S.anim.landedMap[k].qualRank;
    });
    (S.anim.queue || []).forEach(function (item) { item.landed = false; });
    S.anim.cursor = 0;
    S.anim.done = 0;
    S.anim.busy = false;
    S.anim.landedMap = {};
    S.anim.keepQualified = keepQualified;
    renderCourt();
    renderQueue();
    $('drawWho').textContent = '准备抽签';
    $('drawWhere').textContent = '点击“开始抽签”或左侧卡片逐人抽取';
  }

  /** 新的合规结果生成后：重置并初始化抽签界面 */
  function initDrawUI() {
    resetAnimState();
    S.anim.queue = buildQueue();
    renderCourt();
    renderQueue();
    $('drawWho').textContent = '准备抽签';
    $('drawWhere').textContent = '按排名序逐人抽取：点左侧卡片或“开始抽签”';
  }

  /* ==================== 小组赛签表导出 ==================== */

  /** 收集人工判定的出线标记（'组序号:层序号' → 出线名次）；未判定的一律留空 */
  function collectAdvanceMarks() {
    var marks = {};
    Object.keys(S.anim.landedMap || {}).forEach(function (k) {
      var v = S.anim.landedMap[k];
      if (v && v.qualRank != null) marks[k] = v.qualRank;
    });
    return marks;
  }

  function groupSheetOpt() {
    return {
      title: groupSheetTitle(),
      subtitle: groupSheetSubtitle(),
      qualifiersPerGroup: S.config.qualifiersPerGroup,
      footer: S.groupResult ? ('签名 ' + S.groupResult.seed) : '',
      /* 出线栏只体现人工勾选，绝不预填 */
      advance: collectAdvanceMarks()
    };
  }

  function groupSheetTitle() {
    var ev = S.eventType === 'doubles' ? '双打' : '单打';
    return ev + ' · 小组赛分组表';
  }
  function groupSheetSubtitle() {
    var res = S.groupResult;
    var n = S.entries.length;
    var ev = S.eventType === 'doubles' ? '双打' : '单打';
    return ev + ' · ' + n + (S.eventType === 'doubles' ? ' 对组合' : ' 名选手') +
      ' · ' + (res ? res.groups.length : 0) + ' 组';
  }

  /** 导出小组赛签表 PNG / PDF */
  function exportGroupSheet(mode) {
    if (!S.groupResult) { toast('请先完成抽签'); return; }
    var out = TT.GroupSheet.render(S.groupResult, groupSheetOpt());
    if (!out.svg) { toast('小组结果为空'); return; }

    if (mode === 'pdf') {
      TT.Export.exportSvgTextAsPdf(out.svg, {
        title: groupSheetTitle(), filename: '小组赛分组表-' + util.stamp()
      }).catch(function (e) { openModal({ title: '导出 PDF 失败', message: e.message }); });
      return;
    }
    var scale = 3;
    TT.Export.svgToPng(out.svg, { scale: scale }).then(function (r) {
      TT.Export.download(r.blob, '小组赛分组表-' + util.stamp() + '.png');
      toast('已导出 PNG（' + r.width + ' × ' + r.height + '）');
    }).catch(function (e) {
      openModal({ title: '导出 PNG 失败', message: e.message });
    });
  }


  /* ==================== ④ 淘汰赛签表 ==================== */

  /** 收集手动判定的出线者 → { 组序号: [entryId…] }
   *  数组顺序即“第 1 出线、第 2 出线…”，由用户指定的出线名次决定。 */
  function collectPicks() {
    var picks = {};
    Object.keys(S.anim.landedMap || {}).forEach(function (k) {
      var v = S.anim.landedMap[k];
      if (!v || v.qualRank == null || !v.entry) return;
      var gi = Number(String(k).split(':')[0]);
      (picks[gi] = picks[gi] || []).push({ id: v.entry.id, rank: v.qualRank });
    });
    Object.keys(picks).forEach(function (gi) {
      picks[gi].sort(function (a, b) { return a.rank - b.rank; });
      picks[gi] = picks[gi].map(function (x) { return x.id; });
    });
    return picks;
  }

  /** 按组内位次自动补齐每组 q 人，并依次指定为第 1..q 出线 */
  function autoFillPicks() {
    var res = S.groupResult;
    if (!res) return 0;
    var q = S.config.qualifiersPerGroup;
    var filled = 0;
    res.groups.forEach(function (g, gi) {
      var assigned = [];
      for (var s = 0; s < g.size; s++) {
        var v = S.anim.landedMap[gi + ':' + s];
        if (v && v.qualRank != null) assigned.push(v.qualRank);
      }
      var complete = assigned.length === q;
      if (complete) {
        var okSet = assigned.slice().sort(function (a, b) { return a - b; })
          .every(function (r, i) { return r === i + 1; });
        if (okSet) return;
      }
      /* 重排：按组内位次把前 q 名依次标为 1..q */
      for (var s0 = 0; s0 < g.size; s0++) {
        var v0 = S.anim.landedMap[gi + ':' + s0];
        if (v0) v0.qualRank = null;
      }
      var rank = 0;
      for (var s2 = 0; s2 < g.size && rank < q; s2++) {
        var v2 = S.anim.landedMap[gi + ':' + s2];
        if (!v2) continue;
        rank++;
        v2.qualRank = rank;
        filled++;
      }
    });
    if (filled) markEntryQualified();
    saveState();
    return filled;
  }

  /** 校验出线名次是否齐备（每组第 1..q 各 1 人），返回缺失描述 */
  function pickShortfall() {
    var res = S.groupResult;
    if (!res) return null;
    var q = S.config.qualifiersPerGroup;
    var short = [];
    res.groups.forEach(function (g, gi) {
      var ranks = [];
      for (var s = 0; s < g.size; s++) {
        var v = S.anim.landedMap[gi + ':' + s];
        if (v && v.qualRank != null) ranks.push(v.qualRank);
      }
      ranks.sort(function (a, b) { return a - b; });
      var okRanks = ranks.length === q && ranks.every(function (r, i) { return r === i + 1; });
      if (!okRanks) {
        short.push(g.label + ' 组 ' +
          (ranks.length ? '已标 ' + ranks.map(function (r) { return '第' + r; }).join('/') : '未标') +
          '（需第 1–' + q + ' 各 1 人）');
      }
    });
    return short.length ? short : null;
  }

  function buildBracket() {
    if (!S.groupResult) { toast('请先完成小组抽签'); goStep(3); return; }

    /* 出线名额必须勾齐：以勾选为准，程序不替你决定谁晋级 */
    var short = pickShortfall();
    if (short) {
      openModal({
        title: '出线名额还没勾齐',
        html: '<p>淘汰赛只使用你勾选的“出线”者。当前：</p>' +
          '<div class="notice warn"><span class="ico">!</span><div class="body">' +
          escapeHtml(short.join('　')) + '</div></div>' +
          '<p class="muted" style="margin-top:10px">可以点“按名次自动补齐”先填好，再逐组调整。</p>',
        actions: [
          { label: '取消' },
          { label: '按名次自动补齐', primary: true, onClick: function () {
            autoFillPicks();
            renderCourt();
            buildBracket();
          } }
        ]
      });
      return;
    }

    var q = S.config.qualifiersPerGroup;
    var res = TT.drawKnockout({
      groups: S.groupResult.groups,
      qualifiersPerGroup: q,
      seed: S.koSeed || S.groupResult.seed,
      picks: collectPicks()
    });
    if (!res.ok) {
      noticeList($('bracketNotices'), res.errors.map(function (t) { return { kind: 'error', text: t }; }));
      openModal({
        title: '淘汰赛抽签无法生成',
        html: '<div class="notice error"><span class="ico">✕</span><div class="body"><b>约束冲突</b>' +
          res.errors.map(function (t) { return '<div>' + escapeHtml(t) + '</div>'; }).join('') + '</div></div>'
      });
      return;
    }
    S.bracket = res;
    noticeList($('bracketNotices'), res.notices.map(function (t) { return { kind: 'warn', text: t }; }));
    goStep(4);
    initKoUI();
    saveState();
  }

  /* ---------- 淘汰赛抽签界面 ---------- */

  function resetKo() {
    S.ko = { events: [], cursor: 0, done: 0, busy: false, landed: {}, auto: false };
  }

  function initKoUI() {
    if (!S.bracket) return;
    resetKo();

    /* 轮空位：位置是确定的，**不进入抽签队列**，一开始就直接落在签表里 */
    (S.bracket.byeSlots || []).forEach(function (slot) {
      S.ko.landed[slot] = { kind: 'bye' };
    });
    S.ko.byeTotal = (S.bracket.byeSlots || []).length;

    /* 队列只保留需要抽的选手 */
    S.ko.events = (S.bracket.events || []).filter(function (ev) { return ev.kind !== 'bye'; });

    renderKoBoard();
    renderKoQueue();
    $('koWho').textContent = '准备抽签';
    $('koWhere').textContent = S.ko.byeTotal
      ? ('轮空 ' + S.ko.byeTotal + ' 个已直接定位，其余 ' + S.ko.events.length + ' 位逐人抽取')
      : ('共 ' + S.ko.events.length + ' 位逐人抽取');
    renderBracketView();
  }

  function koSlotEl(slot) {
    var board = $('koBoard');
    return board ? board.querySelector('.ko-slot[data-slot="' + slot + '"]') : null;
  }

  function renderKoBoard() {
    var res = S.bracket;
    var board = $('koBoard');
    if (!res || !board) return;
    board.innerHTML = '';

    var N = res.size;
    var halves = [
      { key: 'upper', label: '上半区', from: 1, to: N / 2 },
      { key: 'lower', label: '下半区', from: N / 2 + 1, to: N }
    ];

    halves.forEach(function (h) {
      var box = document.createElement('div');
      box.className = 'ko-half';
      var head = document.createElement('div');
      head.className = 'ko-half-head';
      head.innerHTML = '<span>' + h.label + '（' + h.from + '–' + h.to + ' 号位）</span>' +
        '<span class="sz">' + (h.to - h.from + 1) + ' 个签位</span>';
      box.appendChild(head);

      for (var s = h.from; s <= h.to; s++) {
        var row = document.createElement('div');
        row.className = 'ko-slot is-empty';
        row.dataset.slot = String(s);
        if ((s - 1) % (N / 4) === 0) row.classList.add('q-start');

        var no = document.createElement('span');
        no.className = 'no';
        no.textContent = String(s);
        var nm = document.createElement('span');
        nm.className = 'nm';
        var mk = document.createElement('span');
        mk.className = 'mk';

        var landed = S.ko.landed[s];
        if (landed) {
          if (landed.kind === 'bye') {
            row.classList.add('is-bye');
            nm.textContent = '轮空';
          } else {
            row.classList.remove('is-empty');
            if (landed.seedRank != null) row.classList.add('is-seed');
            nm.textContent = landed.name;
            mk.textContent = landed.label + (landed.tier != null ? ' · T' + landed.tier : '');
            if (landed.justLanded) {
              row.classList.add('just-landed');
              landed.justLanded = false;
            }
          }
        } else {
          nm.textContent = '待抽';
        }
        row.appendChild(no); row.appendChild(nm); row.appendChild(mk);
        box.appendChild(row);
      }
      board.appendChild(box);
    });
  }

  function renderKoQueue() {
    var list = $('koQueue');
    if (!list) return;
    var evs = S.ko.events || [];
    list.innerHTML = '';
    $('koCount').textContent = S.ko.done + ' / ' + evs.length;

    evs.forEach(function (ev, i) {
      var isDone = ev.__done;
      var isCur = i === S.ko.cursor && !isDone;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'pcard' + (ev.kind === 'bye' ? '' : (ev.who && ev.who.seedRank != null ? ' is-seed' : '')) +
        (isDone ? ' is-done' : '') + (isCur ? ' is-current' : '');
      b.disabled = isDone || S.ko.busy;

      var rankTxt, nameTxt, metaTxt;
      if (ev.kind === 'bye') {
        rankTxt = '—';
        nameTxt = '轮空';
        metaTxt = '第 ' + ev.slot + ' 位';
      } else {
        var w = ev.who;
        rankTxt = String(ev.seat);
        nameTxt = w.name;
        metaTxt = w.label;
      }
      b.innerHTML =
        '<span class="rank">' + escapeHtml(rankTxt) + '</span>' +
        '<span class="nm">' + escapeHtml(nameTxt) + '</span>' +
        '<span class="meta">' + escapeHtml(metaTxt) + '</span>';

      /* 轮到本人时展开：小组第几出线 + 赛前种子排名 */
      if (isCur && ev.kind !== 'bye' && ev.who) {
        var extra = document.createElement('div');
        extra.className = 'pcard-extra';
        extra.innerHTML =
          '<span>' + escapeHtml(ev.who.groupLabel) + ' 组第 ' + ev.who.rank + ' 出线</span>' +
          '<span>' + (ev.who.seedRank != null ? '赛前种子第 ' + ev.who.seedRank : '无种子排名') + '</span>' +
          '<span>第 ' + ev.seat + ' 位落位</span>';
        b.appendChild(extra);
        b.style.flexWrap = 'wrap';
      }

      b.addEventListener('click', function () {
        if (isDone || S.ko.busy) return;
        if (i !== S.ko.cursor) { toast('请按抽签顺序：当前轮到第 ' + (S.ko.cursor + 1) + ' 步'); return; }
        koPick();
      });
      list.appendChild(b);
    });

    var cur = evs[S.ko.cursor];
    var byeNote = S.ko.byeTotal ? '（轮空 ' + S.ko.byeTotal + ' 个已直接入表）' : '';
    $('koHint').textContent = !cur
      ? ('全部落位完成' + byeNote)
      : ('轮到：' + cur.who.name + '（' + cur.who.groupLabel + ' 组第 ' + cur.who.rank + ' 出线）' + byeNote);
    var btn = $('btnKoStart');
    if (btn) {
      btn.disabled = S.ko.busy || !cur;
      btn.textContent = (evs.length && S.ko.done >= evs.length) ? '已全部落位'
        : (S.ko.done ? '继续抽签' : '开始抽签');
    }
  }

  /** 在候选签位间匀速遍历，最后停在目标位 */
  function koScan(cands, target, cb) {
    var list = (cands && cands.length ? cands.slice() : [target]);
    /* 目标放最后，其余打乱：保证每个可选位置都被访问一次 */
    var others = list.filter(function (s) { return s !== target; });
    for (var k = others.length - 1; k > 0; k--) {
      var j = Math.floor(Math.random() * (k + 1));
      var t = others[k]; others[k] = others[j]; others[j] = t;
    }
    others.push(target);

    var i = 0, last = null;
    function clear() {
      if (last) { last.classList.remove('is-scanning'); last.classList.remove('is-final'); last = null; }
    }
    function step() {
      clear();
      if (i >= others.length) { cb(); return; }
      var el = koSlotEl(others[i]);
      if (el) {
        el.classList.add(others[i] === target ? 'is-final' : 'is-scanning');
        last = el;
      }
      i++;
      setTimeout(step, 120);
    }
    if (!others.length) { cb(); return; }
    step();
  }

  function koPick() {
    if (S.ko.busy) return;
    var ev = (S.ko.events || [])[S.ko.cursor];
    if (!ev) return;
    S.ko.busy = true;
    renderKoQueue();

    function placeNow() {
      var el = koSlotEl(ev.slot);
      if (el) { el.classList.remove('is-final'); el.classList.remove('is-scanning'); }
      if (ev.kind === 'bye') {
        S.ko.landed[ev.slot] = { kind: 'bye', justLanded: true };
      } else {
        S.ko.landed[ev.slot] = {
          kind: 'qual', name: ev.who.name, label: ev.who.label,
          seedRank: ev.who.seedRank, tier: ev.who.tier, justLanded: true
        };
      }
      ev.__done = true;
      S.ko.cursor++;
      S.ko.done++;
      renderKoBoard();
      $('koWhere').textContent = ev.kind === 'bye'
        ? '→ 第 ' + ev.slot + ' 号位（轮空）'
        : '→ 第 ' + ev.slot + ' 号位';
      S.ko.busy = false;
      renderKoQueue();
      if (S.ko.cursor >= S.ko.events.length) {
        $('koWho').textContent = '抽签完成';
        $('koWhere').textContent = '共 ' + S.ko.events.length + ' 步全部落位';
        saveState();
      }
    }

    /* 轮空：位置是固定的，直接放入，不放动画 */
    if (ev.kind === 'bye') {
      $('koWho').textContent = '轮空';
      $('koWhere').textContent = '直接放入第 ' + ev.slot + ' 号位';
      placeNow();
      return;
    }

    /* 唯一可选位置（没有第二选择）→ 直接放入 */
    var nCands = (ev.cands && ev.cands.length) ? ev.cands.length : 1;
    if (nCands <= 1) {
      $('koWho').textContent = ev.who.name;
      $('koWhere').textContent = '唯一可选签位，直接放入第 ' + ev.slot + ' 号位';
      placeNow();
      return;
    }

    $('koWho').textContent = ev.who.name;
    $('koWhere').textContent = '正在随机框选签位…';
    koScan(ev.cands, ev.slot, placeNow);
  }

  function koSkip() {
    (S.ko.events || []).forEach(function (ev) {
      if (ev.__done) return;
      if (ev.kind === 'bye') S.ko.landed[ev.slot] = { kind: 'bye' };
      else S.ko.landed[ev.slot] = {
        kind: 'qual', name: ev.who.name, label: ev.who.label,
        seedRank: ev.who.seedRank, tier: ev.who.tier
      };
      ev.__done = true;
    });
    S.ko.cursor = S.ko.events.length;
    S.ko.done = S.ko.events.length;
    S.ko.busy = false;
    renderKoBoard();
    renderKoQueue();
    $('koWho').textContent = '抽签完成';
    $('koWhere').textContent = '共 ' + S.ko.events.length + ' 步全部落位';
    saveState();
  }

  function koReplay() {
    (S.ko.events || []).forEach(function (ev) { ev.__done = false; });
    S.ko.cursor = 0;
    S.ko.done = 0;
    S.ko.busy = false;
    /* 重播时轮空仍直接留在签表里，不回到队列 */
    S.ko.landed = {};
    (S.bracket && S.bracket.byeSlots || []).forEach(function (slot) {
      S.ko.landed[slot] = { kind: 'bye' };
    });
    renderKoBoard();
    renderKoQueue();
    $('koWho').textContent = '准备抽签';
    $('koWhere').textContent = '点左侧卡片或“开始抽签”';
  }

  function renderBracketView() {
    if (!S.bracket) return;
    var host = $('bracketHost');
    TT.Bracket.mount(host, S.bracket, {
      title: S.bracketTitle || '淘汰赛签表',
      subtitle: S.bracketSub || defaultSubtitle(),
      footer: '签名 ' + (S.bracket.seed != null ? S.bracket.seed : '—')
    });
  }

  function defaultSubtitle() {
    var n = S.entries.length;
    var ev = S.eventType === 'doubles' ? '双打' : '单打';
    var q = S.bracket ? S.bracket.qualifiers.length : 0;
    return ev + ' · ' + n + ' 个参赛单元 · ' + q + ' 人出线 / ' + (S.bracket ? S.bracket.size : 0) + ' 签';
  }

  /* ==================== ⑤ 导出 ==================== */

  function refreshExportView() {
    var ready = !!S.bracket;
    $('btnPdf').disabled = !ready;
    $('btnPng').disabled = !ready;
    $('btnXlsx').disabled = !ready;
    $('btnJson').disabled = !ready;
    $('btnCsv').disabled = !ready;
    if (ready) {
      var payload = TT.buildExportPayload({
        config: S.config,
        entries: S.entries,
        groups: S.groupResult ? S.groupResult.groups : [],
        bracket: S.bracket,
        seed: S.bracket.seed,
        notices: []
      });
      $('jsonPreview').textContent = JSON.stringify(payload, null, 2).slice(0, 4000) +
        (JSON.stringify(payload).length > 4000 ? '\n…（已截断，导出可得完整数据）' : '');
    }
  }

  function payloadNow() {
    return TT.buildExportPayload({
      config: S.config,
      entries: S.entries,
      groups: S.groupResult ? S.groupResult.groups : [],
      bracket: S.bracket,
      seed: S.bracket ? S.bracket.seed : S.groupResult ? S.groupResult.seed : null,
      notices: []
    });
  }

  /* ==================== 持久化（当前会话） ==================== */

  function saveState() {
    try {
      var snap = {
        eventType: S.eventType,
        entries: S.entries,
        config: S.config,
        seedText: S.seedText,
        groupSeed: S.groupResult ? S.groupResult.seed : null,
        bracketTitle: S.bracketTitle,
        bracketSub: S.bracketSub,
        step: S.step
      };
      localStorage.setItem(STORE_KEY, JSON.stringify(snap));
    } catch (e) { /* 忽略配额错误 */ }
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return false;
      var snap = JSON.parse(raw);
      if (!snap || !Array.isArray(snap.entries)) return false;
      S.eventType = snap.eventType === 'doubles' ? 'doubles' : 'singles';
      S.entries = snap.entries.map(function (e, i) { return TT.normalizeEntry(e, i); });
      if (snap.config) S.config = snap.config;
      S.seedText = snap.seedText || '';
      S.bracketTitle = snap.bracketTitle || '淘汰赛签表';
      S.bracketSub = snap.bracketSub || '';
      /* 兼容旧存档：若档位在数学上不可能（超出第 1 层容量），就退回“自动分档”，
         避免用户一进来就被必然的容量冲突卡住。 */
      var n = S.entries.length;
      var sizes = TT.groupSizes(n, TT.util.clamp(S.config.groupCount || 1, 1, 32));
      var cap1 = sizes.length;
      var tier1Count = S.entries.filter(function (e) { return e.tier === 1; }).length;
      if (tier1Count > cap1) {
        S.entries.forEach(function (e) { if (e.tier === 1) e.tier = null; });
      }
      return true;
    } catch (e) { return false; }
  }

  /* ==================== 事件绑定 ==================== */

  function bindAll() {
    /* 步骤导航 */
    qsa('.step-chip').forEach(function (c) {
      on(c, 'click', function () {
        var k = Number(c.dataset.step);
        if (k === 3 && !S.groupResult) { toast('请先在「比赛设置」里开始抽签'); return; }
        if (k === 4 && !S.bracket) {
          if (!S.groupResult) { toast('请先完成小组抽签'); return; }
          buildBracket(); return;
        }
        goStep(k);
      });
    });

    /* ① 名单 */
    qsa('#segEventType button').forEach(function (b) {
      on(b, 'click', function () {
        S.eventType = b.dataset.v;
        qsa('#segEventType button').forEach(function (x) { x.classList.remove('is-on'); });
        b.classList.add('is-on');
        $('cfgTiers').value = S.config.tierCount;
        renderEntries();
        toast('已切换为' + (S.eventType === 'doubles' ? '双打' : '单打'));
      });
    });
    on($('btnGenDemo'), 'click', genDemo);
    on($('btnAddRow'), 'click', function () {
      S.entries.push(TT.normalizeEntry({ players: [''] }, S.entries.length));
      renderEntries();
    });
    on($('btnClearAll'), 'click', function () {
      openModal({
        title: '清空名单', message: '将删除全部 ' + S.entries.length + ' 个参赛单元，此操作不可撤销。',
        actions: [
          { label: '取消' },
          { label: '确认清空', primary: true, onClick: function () {
            S.entries = []; S.groupResult = null; S.bracket = null;
            renderEntries(); saveState(); toast('名单已清空');
          } }
        ]
      });
    });
    on($('btnRevalidate'), 'click', function () {
      refreshEntrySummary();
      var v = TT.validateEntries(S.entries, S.eventType);
      toast(v.ok ? '校验通过' + (v.warnings.length ? '（有 ' + v.warnings.length + ' 条提示）' : '') : '校验未通过：' + v.errors.length + ' 项');
    });
    on($('btnToStep2'), 'click', function () {
      var v = TT.validateEntries(S.entries, S.eventType);
      if (S.entries.length < 2) { toast('至少需要 2 个参赛单元'); return; }
      if (!v.ok) {
        noticeList($('entryNotices'), v.errors.map(function (t) { return { kind: 'error', text: t }; }));
        toast('名单有 ' + v.errors.length + ' 处问题需先修正');
        return;
      }
      goStep(2);
    });

    /* ① 导出参赛名单（与导入完全兼容，可编辑后再导入） */
    on($('btnExportEntries'), 'click', function () {
      var v = TT.validateEntries(S.entries, S.eventType);
      if (!S.entries.length) { toast('名单为空'); return; }
      var n = TT.Export.exportEntriesCsv(S.entries, S.eventType,
        '参赛名单-' + util.stamp());
      toast('已导出 ' + n + ' 行' + (v.ok ? '' : '（注意：当前名单有 ' + v.errors.length + ' 处校验问题）'));
    });

    /* 导入 */
    on($('dropZone'), 'click', function () { $('fileInput').click(); });
    on($('fileInput'), 'change', function (evt) {
      var f = evt.target.files && evt.target.files[0];
      if (f) importFile(f);
      evt.target.value = '';
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
      on($('dropZone'), ev, function (e) { e.preventDefault(); $('dropZone').classList.add('is-over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      on($('dropZone'), ev, function (e) { e.preventDefault(); $('dropZone').classList.remove('is-over'); });
    });
    on($('dropZone'), 'drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) importFile(f);
    });
    on($('btnTpl'), 'click', function () {
      TT.Export.exportEntryTemplateCsv('抽签导入模板');
      toast('已下载 CSV 模板');
    });

    /* ② 配置 */
    ['cfgGroups', 'cfgSize', 'cfgQual', 'cfgSeeds', 'cfgTiers', 'cfgSeedText'].forEach(function (id) {
      on($(id), 'input', readConfigInputs);
    });
    on($('btnReco'), 'click', function () {
      var rec = TT.recommendConfig(S.entries.length, S.eventType);
      S.config = rec;
      refreshConfigView();
      toast('已按人数推荐配置');
    });
    on($('btnApplyReco'), 'click', function () {
      S.config = TT.recommendConfig(S.entries.length, S.eventType);
      refreshConfigView();
    });
    on($('btnBack1'), 'click', function () { goStep(1); });
    on($('btnDoDraw'), 'click', function () { doDraw(false); });

    /* ③ 抽签 */
    on($('btnSkipAnim'), 'click', skipAnim);
    on($('btnReplay'), 'click', function () { if (S.groupResult) replayAnim(); });
    on($('btnStartDraw'), 'click', function () { doPick(); });
    on($('btnExportGroups'), 'click', function () {
      if (!S.groupResult) { toast('请先完成小组抽签'); return; }
      var marked = Object.keys(collectAdvanceMarks()).length;
      openModal({
        title: '导出小组赛签表',
        html: '<p>A4 横向 · 各小组等宽平铺 · 各档次横向对齐。</p>' +
          '<p class="muted" style="margin-top:8px">「出线」栏留空，由你判定后勾选（当前已勾选 <b>' + marked +
          '</b> 人）；导出只带上你勾过的标记，不会替你预设晋级。</p>',
        actions: [
          { label: '取消' },
          { label: 'PNG 图片（3× 高清）', onClick: function () { exportGroupSheet('png'); } },
          { label: 'PDF（矢量）', primary: true, onClick: function () { exportGroupSheet('pdf'); } }
        ]
      });
    });
    /* ③ 导出数据（小组赛 → 淘汰赛直接对接）+ 直接跳步 */
    on($('btnExportGroupData'), 'click', function () {
      if (!S.groupResult) { toast('请先完成小组抽签'); return; }
      var picks = collectPicks();
      var payload = {
        schema: 'table-tennis-draw/groups',
        schemaVersion: '1.1.0',
        generatedAt: new Date().toISOString(),
        generator: 'tt-draw',
        eventType: S.eventType,
        config: {
          groupCount: S.config.groupCount,
          groupSize: S.config.groupSize,
          qualifiersPerGroup: S.config.qualifiersPerGroup,
          seedCount: S.config.seedCount,
          tierCount: S.config.tierCount
        },
        randomSeed: S.groupResult.seed,
        entries: S.entries.map(function (e) {
          return {
            id: e.id, name: util.entryName(e), players: e.players,
            rank: e.rank == null ? null : e.rank,
            seedRank: e.seedRank == null ? null : e.seedRank,
            tier: S.groupResult.tiers[e.id] == null ? null : S.groupResult.tiers[e.id],
            groupPoints: e.groupPoints == null ? null : e.groupPoints,
            remark: e.remark || ''
          };
        }),
        groups: S.groupResult.groups.map(function (g) {
          var gi = g.index;
          var rankOf = {};
          for (var s = 0; s < g.size; s++) {
            var v = S.anim.landedMap[gi + ':' + s];
            if (v && v.qualRank != null && v.entry) rankOf[v.entry.id] = v.qualRank;
          }
          return {
            index: gi,
            label: g.label,
            size: g.size,
            members: g.members.map(function (m, i) {
              return {
                slot: i + 1,
                entryId: m.id,
                name: util.entryName(m),
                seedRank: m.seedRank == null ? null : m.seedRank,
                tier: S.groupResult.tiers[m.id] == null ? null : S.groupResult.tiers[m.id],
                qualRank: rankOf[m.id] == null ? null : rankOf[m.id]
              };
            }),
            /* 直接喂给 TT.drawKnockout 的 picks：{组序号:[entryId…]}，数组顺序=第1出线… */
            picks: picks[gi] || []
          };
        })
      };
      TT.Export.exportJson(payload, '小组赛数据-' + util.stamp());
      toast('已导出小组赛数据（含出线名次，可直接对接淘汰赛）');
    });

    on($('btnJumpKnockout'), 'click', function () {
      if (!S.groupResult) { toast('请先完成小组抽签'); return; }
      var short = pickShortfall();
      if (short) {
        openModal({
          title: '还差出线名次，无法直接进入淘汰赛',
          html: '<p>每组需要标好「第 1 出线 … 第 ' + S.config.qualifiersPerGroup + ' 出线」各 1 人。当前：</p>' +
            '<div class="notice warn"><span class="ico">!</span><div class="body">' +
            escapeHtml(short.join('　')) + '</div></div>',
          actions: [
            { label: '取消' },
            { label: '按名次自动补齐并进入', primary: true, onClick: function () {
              autoFillPicks();
              renderCourt();
              buildBracket();
            } }
          ]
        });
        return;
      }
      buildBracket();
    });

    on($('btnRedraw'), 'click', function () {
      openModal({
        title: '整体重抽',
        message: '将按当前配置重新生成完整合规分组（不是局部替换），然后重新逐人抽取。',
        actions: [
          { label: '取消' },
          { label: '重新抽签', primary: true, onClick: function () { doDraw(true); } }
        ]
      });
    });
    on($('btnToBracket'), 'click', buildBracket);

    /* ④ 淘汰赛抽签 */
    on($('btnKoStart'), 'click', function () { koPick(); });
    on($('btnKoSkip'), 'click', koSkip);
    on($('btnKoReplay'), 'click', koReplay);
    on($('btnRebuildBracket'), 'click', function () {
      if (!S.groupResult) { toast('请先完成小组抽签'); return; }
      openModal({
        title: '淘汰赛整体重抽',
        message: '将按当前出线勾选重新抽一次签位（换一个随机签名），然后逐位重新落位。',
        actions: [
          { label: '取消' },
          { label: '重新抽签', primary: true, onClick: function () {
            S.koSeed = (S.groupResult.seed || 0) + '#' + (Date.now() % 99991);
            buildBracket();
            toast('已重新抽签');
          } }
        ]
      });
    });
    on($('btnBack3'), 'click', function () { goStep(3); });
    on($('btnToExport'), 'click', function () { goStep(5); });
    on($('btnApplyTitle'), 'click', function () {
      S.bracketTitle = $('bracketTitle').value.trim() || '淘汰赛签表';
      S.bracketSub = $('bracketSub').value.trim();
      renderBracketView();
      saveState();
      toast('标题已应用');
    });

    /* ⑤ 导出 */
    qsa('#exportTabs button').forEach(function (b) {
      on(b, 'click', function () {
        qsa('#exportTabs button').forEach(function (x) { x.classList.remove('is-on'); });
        b.classList.add('is-on');
        var isBracket = b.dataset.t === 'bracket';
        $('exportBracketBox').hidden = !isBracket;
        $('exportDataBox').hidden = isBracket;
      });
    });
    on($('btnBack4'), 'click', function () { goStep(4); });
    on($('btnPrint'), 'click', function () { TT.Export.printCurrent(); });
    on($('btnPdf'), 'click', function () {
      if (!S.bracket) return;
      TT.Export.exportBracketPdf(S.bracket, {
        title: S.bracketTitle, subtitle: S.bracketSub || defaultSubtitle(), footer: '签名 ' + S.bracket.seed
      }).catch(function (e) { openModal({ title: '导出 PDF 失败', message: e.message }); });
    });
    on($('btnPng'), 'click', function () {
      if (!S.bracket) return;
      var scale = Number($('pngScale').value) || 3;
      toast('正在生成 PNG（' + scale + '×）…');
      TT.Export.exportBracketPng(S.bracket, {
        title: S.bracketTitle, subtitle: S.bracketSub || defaultSubtitle(),
        footer: '签名 ' + S.bracket.seed, scale: scale
      }).then(function (r) {
        toast('PNG 已导出（' + r.width + ' × ' + r.height + '）');
      }).catch(function (e) { openModal({ title: '导出 PNG 失败', message: e.message }); });
    });
    on($('btnJson'), 'click', function () {
      TT.Export.exportJson(payloadNow(), '抽签数据-' + util.stamp());
      toast('JSON 已导出');
    });
    on($('btnXlsx'), 'click', function () {
      TT.Export.exportXlsx({
        config: S.config, entries: S.entries,
        groups: S.groupResult ? S.groupResult.groups : [],
        bracket: S.bracket, tierMap: S.groupResult ? S.groupResult.tiers : {},
        title: S.bracketTitle
      }, '抽签结果-' + util.stamp());
      toast('Excel 已导出（4 张工作表）');
    });
    on($('btnCsv'), 'click', function () {
      var rows = [['签名', '小组数', '每组人数', '出线/组', '种子数']];
      rows.push([payloadNow().event.randomSeed, S.config.groupCount, S.config.groupSize,
        S.config.qualifiersPerGroup, S.config.seedCount]);
      rows.push([]);
      rows.push(['小组', '位置', '参赛名', '种子序', '档位']);
      if (S.groupResult) {
        S.groupResult.groups.forEach(function (g, gi) {
          g.slots.forEach(function (sl) {
            rows.push([g.label, sl.slot, sl.entry ? util.entryName(sl.entry) : '',
              sl.entry && sl.entry.seedRank != null ? sl.entry.seedRank : '',
              sl.entry ? S.groupResult.tiers[sl.entry.id] : '']);
          });
        });
      }
      rows.push([]);
      rows.push(['签位', '参赛名', '出线代号', '场次']);
      if (S.bracket) {
        for (var s = 1; s <= S.bracket.size; s++) {
          var c = S.bracket.slots[s];
          rows.push([s, c ? (c.kind === 'bye' ? '轮空' : c.qual.name) : '',
            c && c.kind === 'qual' ? c.qual.label : '', Math.floor((s - 1) / 2) + 1]);
        }
      }
      TT.Export.downloadText('\ufeff' + TT.Export.toCsv(rows), '抽签结果-' + util.stamp() + '.csv', 'text/csv');
      toast('CSV 已导出');
    });

    /* 规则链接 */
    on($('linkRules'), 'click', function (e) {
      e.preventDefault();
      goStep(5);
      $('exportTabs').scrollIntoView({ behavior: 'smooth' });
    });

    /* 自测入口 */
    on($('btnSelfTest'), 'click', function () {
      if (window.TT_TESTS) {
        var res = window.TT_TESTS.run();
        var fails = res.filter(function (r) { return !r.ok; });
        openModal({
          title: '开发者自测：' + (res.length - fails.length) + ' / ' + res.length + ' 通过',
          html: fails.length
            ? ('<div class="notice error"><span class="ico">✕</span><div class="body">' +
               fails.map(function (f) { return '<div><b>' + escapeHtml(f.name) + '</b><br>' + escapeHtml(f.err) + '</div>'; }).join('') +
               '</div></div>')
            : '<div class="notice" style="background:var(--green-soft);border-color:rgba(16,185,129,.35);color:#6ee7b7">' +
              '<span class="ico">✓</span><div class="body">全部用例通过（含 20 人 6 组、双打 16 对、固定签名复现、8–64 人规模）</div></div>',
          actions: [{ label: '关闭', primary: true }]
        });
      } else {
        toast('未加载测试模块');
      }
    });

    /* 弹窗遮罩点击关闭 */
    on($('modalBackdrop'), 'click', function (e) {
      if (e.target === $('modalBackdrop')) closeModal();
    });
  }

  /* ==================== 导入实现 ==================== */

  function importFile(file) {
    TT.Import.readFile(file, S.eventType).then(function (r) {
      if (!r.entries.length) { toast('文件中没有可用的数据行'); return; }
      var v = TT.validateEntries(r.entries, S.eventType);
      var items = [];
      r.notes.forEach(function (t) { items.push({ kind: 'warn', text: t }); });
      v.errors.forEach(function (t) { items.push({ kind: 'error', text: t }); });
      v.warnings.forEach(function (t) { items.push({ kind: 'warn', text: t }); });

      if (v.errors.length) {
        noticeList($('entryNotices'), items);
        openModal({
          title: '导入校验未通过（' + v.errors.length + ' 项）',
          html: '<div class="notice error"><span class="ico">✕</span><div class="body">' +
            v.errors.map(function (t) { return '<div>' + escapeHtml(t) + '</div>'; }).join('') + '</div></div>' +
            '<p class="muted" style="margin-top:10px">已解析 ' + r.entries.length + ' 行，但未写入。请修正文件后重试。</p>',
          actions: [
            { label: '取消' },
            { label: '仍然导入', primary: false, onClick: function () { applyImport(r.entries, items); } }
          ]
        });
        return;
      }
      applyImport(r.entries, items);
    }).catch(function (e) {
      openModal({
        title: '导入失败',
        message: e.message + '\n\n可尝试：在 Excel 中「另存为 CSV（逗号分隔）」后导入。'
      });
    });
  }

  function applyImport(entries, items) {
    S.entries = entries.map(function (e, i) { return TT.normalizeEntry(e, i); });
    S.groupResult = null; S.bracket = null;
    renderEntries();
    noticeList($('entryNotices'), items && items.length ? items : [{ text: '已导入 ' + S.entries.length + ' 个参赛单元' }]);
    toast('已导入 ' + S.entries.length + ' 个参赛单元');
    saveState();
  }

  /* ==================== 启动 ==================== */

  function init() {
    /* 开发/演示用：?reset=1 清空本地存档（不在主界面暴露为按钮） */
    try {
      if (/[?&]reset=1/.test(location.search)) localStorage.removeItem(STORE_KEY);
    } catch (e) {}
    var restored = loadState();
    /* 默认示例数据：首次进入时给一份 20 人的可玩样本 */
    if (!restored || !S.entries.length) {
      genDemo();
    }
    qsa('#segEventType button').forEach(function (x) {
      x.classList.toggle('is-on', x.dataset.v === S.eventType);
    });
    $('bracketTitle').value = S.bracketTitle;
    $('bracketSub').value = S.bracketSub;
    renderEntries();
    bindAll();
    refreshConfigView();
    goStep(1);

    /* JSON 预览按需刷新 */
    setInterval(function () {
      if (S.step === 5 && !$('exportDataBox').hidden) refreshExportView();
    }, 1200);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !$('modalBackdrop').hidden) closeModal();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  /* 供自测与调试使用（不参与正常 UI 流程） */
  window.__ttPickLog = [];
  window.__ttApp = {
    get state() { return S; },
    doDraw: doDraw,
    buildBracket: buildBracket,
    goStep: goStep,
    renderEntries: renderEntries,
    payload: payloadNow
  };

})();
