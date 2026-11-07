/*!
 * draw-knockout.js —— 淘汰赛抽签（真正的抽签，而非直接生成）
 *
 * 抽签顺序（决定“谁先落位”）
 *   出线名次（小组第 1 出线 → 第 2 出线 …）
 *   → 同一名次内按赛前种子排名（seedRank 升序，无种子序者靠后）
 *   → 再按录入排名 rank → 再按小组序
 *
 * 落位规则（延续 ITTF 惯例，既有随机性又保证强弱均匀）
 *   第 1 位            固定“上半区顶部”（1 号位）
 *   第 2 位            固定“下半区底部”（N 号位）
 *   第 3–4 位          在“两个 1/4 区锚点”之间随机
 *   第 5–8 位          在“四个 1/8 区锚点”之间随机
 *   第 9–16 位         在剩余 1/16 区锚点之间随机
 *   档带由 seedBand(位次) 给出，锚点由 anchorList(N) 给出。
 *
 * 硬约束
 *   同一小组的两名出线者不得落在同一半区；同组尽量分散到不同 1/4 区（软约束）。
 *
 * 轮空
 *   轮空给“抽签顺序最靠前的 byeCount 位”（即头号种子）的对手位，
 *   因为头号种子的锚点天然分布在不同 1/4 区，轮空随之均匀铺开。
 *   任一时刻都不会出现“轮空 vs 轮空”。
 *
 * 出线人来源
 *   opt.picks = { 组序号: [entryId, ...] } —— 界面手动勾选的出线者，**以此为准**；
 *   未提供时才退回“小组名次前 q 名”。
 *
 * 约束冲突一律返回具体原因，绝不静默放宽。
 */
(function (root) {
  'use strict';

  var TT = root.TT;
  var util = TT.util;

  /* ==================== 锚点阶梯 ==================== */

  /**
   * 递归生成“序号 → 签位”映射表（0 起下标 = 序号 - 1）。
   * @param {number} N 2 的幂
   * @returns {number[]} 例如 N=16 → [1,16,9,8,5,12,13,4,3,14,11,6,7,10,15,2]
   */
  function anchorList(N) {
    var list = [1];
    var size = 1;
    while (size < N) {
      size *= 2;
      var nx = [];
      for (var i = 0; i < list.length; i++) {
        var v = list[i];
        if (i % 2 === 0) {           /* 奇位：先自身，再镜像 */
          nx.push(v);
          nx.push(size + 1 - v);
        } else {                     /* 偶位：先镜像，再自身 */
          nx.push(size + 1 - v);
          nx.push(v);
        }
      }
      list = nx;
    }
    return list;
  }
  TT.anchorList = anchorList;

  /** 序号 k 在 N 签中的锚点（1 起）；k 超出 N 时返回 null */
  function anchorSlot(k, N) {
    var list = anchorList(N);
    return (k >= 1 && k <= N) ? list[k - 1] : null;
  }
  TT.anchorSlot = anchorSlot;

  /**
   * 档带：1 → [1]；2 → [2]；3–4 → [3,4]；5–8 → [5..8]；9–16 → [9..16]……
   * 同档带内的锚点随机抽取，档带间严格按优先级。
   */
  function seedBand(k) {
    if (k <= 1) return { band: 1, from: 1, to: 1 };
    if (k === 2) return { band: 2, from: 2, to: 2 };
    var lo = 3, hi = 4, band = 3;
    while (k > hi) {
      lo = hi + 1;
      hi = hi * 2;
      band++;
    }
    return { band: band, from: lo, to: hi };
  }
  TT.seedBand = seedBand;

  /* ==================== 辅助 ==================== */

  function halfOf(slot, N) { return slot <= N / 2 ? 'upper' : 'lower'; }
  function quarterOf(slot, N) {
    var q = N / 4;
    if (q < 1) return 1;
    return Math.min(4, Math.floor((slot - 1) / q) + 1);
  }
  function eighthOf(slot, N) {
    var e = N / 8;
    if (e < 1) return 1;
    return Math.min(8, Math.floor((slot - 1) / e) + 1);
  }
  TT.halfOf = halfOf; TT.quarterOf = quarterOf;

  function partnerOf(slot) { return slot % 2 === 1 ? slot + 1 : slot - 1; }

  function roundName(count) {
    if (count === 1) return '决赛';
    if (count === 2) return '半决赛';
    return '1/' + count + ' 决赛';
  }

  function seedVal(x) { return x == null ? Infinity : x; }

  /* ==================== 主流程 ==================== */

  /**
   * 生成淘汰赛签表。
   *
   * @param {Object} opt
   * @param {Object[]} opt.groups                drawGroups 的 groups
   * @param {number}   opt.qualifiersPerGroup    每组出线人数
   * @param {string}   [opt.seed]                随机签名（同签名同结果）
   * @param {Object}   [opt.picks]               { 组序号: [entryId, ...] } 手动勾选出线者
   * @returns {Object} { ok, errors, notices, size, rounds, thirdPlace, slots, byeSlots,
   *                     qualifiers, order, events, seed, anchors }
   */
  function drawKnockout(opt) {
    var groups = opt.groups || [];
    var q = Math.max(1, Math.floor(opt.qualifiersPerGroup || 1));
    var rng = TT.makeRng(opt.seed);
    var notices = [];
    var errors = [];
    var picks = opt.picks || null;

    /* ---------- 0) 出线名单：以手动勾选为准 ---------- */
    var qualifiers = [];
    groups.forEach(function (g) {
      var picked = picks && picks[g.index] ? picks[g.index] : null;
      var chosen = null;

      if (picked && picked.length) {
        if (picked.length !== q) {
          errors.push('小组 ' + g.label + ' 勾选了 ' + picked.length + ' 人，每组出线名额是 ' + q +
            ' 人，请调整后再生成签表。');
          return;
        }
        var list = [];
        var missing = 0;
        picked.forEach(function (id) {
          var m = g.members.filter(function (x) { return x.id === id; })[0];
          if (m) list.push(m); else missing++;
        });
        if (missing) {
          errors.push('小组 ' + g.label + ' 的勾选名单中有 ' + missing + ' 个不在该组的成员，请重新勾选。');
          return;
        }
        /* 按组内位次升序 → 依次记为“第 1/2/… 出线” */
        list.sort(function (a, b) { return g.members.indexOf(a) - g.members.indexOf(b); });
        chosen = list;
      } else {
        if (g.size < q) {
          errors.push('小组 ' + g.label + ' 只有 ' + g.size + ' 人，无法提供 ' + q + ' 个出线名额。');
          return;
        }
        chosen = g.members.slice(0, q);
      }

      chosen.forEach(function (m, idx) {
        var r = idx + 1;
        qualifiers.push({
          groupIndex: g.index,
          groupLabel: g.label,
          rank: r,
          label: util.qualLabel(g.index, r),
          entry: m,
          entryId: m.id,
          players: m.players.filter(Boolean),
          name: util.entryName(m),
          seedRank: m.seedRank != null ? m.seedRank : null,
          rankField: m.rank != null ? m.rank : null,
          tier: m.tier != null ? m.tier : null,
          slot: null,
          seat: null,
          band: null,
          viaBand: true
        });
      });
    });

    if (errors.length) return { ok: false, errors: errors, notices: notices, seed: rng.seed };

    var P = qualifiers.length;
    if (P < 2) {
      return { ok: false, errors: ['出线总人数不足 2 人，无法生成淘汰赛签表。'], notices: notices, seed: rng.seed };
    }

    var N = util.nextPow2(P);
    var byeCount = N - P;

    if (byeCount > N / 2) {
      return {
        ok: false,
        errors: ['轮空数（' + byeCount + '）超过首轮场次的一半（' + (N / 2) + '），签表不成立。'],
        notices: notices, seed: rng.seed
      };
    }
    if (byeCount > 0) {
      notices.push('出线 ' + P + ' 人进入 ' + N + ' 签：' + byeCount + ' 个轮空位，其余 ' +
        (P - byeCount) + ' 人进行首轮。');
    }

    /* ---------- 抽签顺序：出线名次 → 赛前种子排名 → 录入排名 → 小组序 ---------- */
    var order = qualifiers.slice().sort(function (a, b) {
      if (a.rank !== b.rank) return a.rank - b.rank;
      var as = seedVal(a.seedRank), bs = seedVal(b.seedRank);
      if (as !== bs) return as - bs;
      var ar = seedVal(a.rankField), br = seedVal(b.rankField);
      if (ar !== br) return ar - br;
      return a.groupIndex - b.groupIndex;
    });

    /* ---------- 位置容器 ---------- */
    var slots = [];
    for (var i = 1; i <= N; i++) slots[i] = null;
    var placements = [];
    var byeSlots = {};
    var reserved = {};

    function put(slot, content) {
      slots[slot] = content;
      placements.push({ slot: slot, content: content });
    }

    /** 抽签位次 seat 对应的 ITTF 档带锚点集合 */
    function bandAnchors(seat) {
      var b = seedBand(seat);
      var out = [];
      for (var k = b.from; k <= b.to; k++) {
        var s = anchorSlot(k, N);
        if (s != null) out.push(s);
      }
      return out;
    }

    /** 某小组“第 1 出线”已落位的半区（用于同组半区回避） */
    function sameGroupWinnerHalf(gIdx) {
      for (var t = 0; t < placements.length; t++) {
        var p = placements[t];
        if (p.content.kind === 'qual' &&
            p.content.qual.groupIndex === gIdx &&
            p.content.qual.rank === 1) {
          return halfOf(p.slot, N);
        }
      }
      return null;
    }

    /** 某小组已占用的 1/4 区（软约束：尽量分散） */
    function groupQuarters(gIdx) {
      var used = {};
      placements.forEach(function (p) {
        if (p.content.kind !== 'qual') return;
        if (p.content.qual.groupIndex !== gIdx) return;
        used[quarterOf(p.slot, N)] = true;
      });
      return used;
    }

    function isFree(slot) { return !slots[slot] && !reserved[slot]; }

    function legal(slot, who) {
      if (slot < 1 || slot > N) return false;
      if (!isFree(slot)) return false;
      if (who.rank >= 2) {
        var wh = sameGroupWinnerHalf(who.groupIndex);
        if (wh && halfOf(slot, N) === wh) return false;
      }
      return true;
    }

    var events = [];      /* 供界面回放：{seq, slot, kind, who} */

    var winners = order.filter(function (x) { return x.rank === 1; });
    var others = order.filter(function (x) { return x.rank >= 2; });

    function freeIn(half) {
      var n = 0;
      for (var s = 1; s <= N; s++) {
        if (slots[s] || reserved[s]) continue;
        if (halfOf(s, N) === half) n++;
      }
      return n;
    }

    /* ---------- 1) 小组第一（出线名次 1）按档带落位 ---------- */
    winners.forEach(function (who, idx) {
      var seat = idx + 1;
      var band = seedBand(seat);

      var cands = bandAnchors(seat).filter(function (s) { return legal(s, who); });
      var viaBand = true;
      if (!cands.length) {
        viaBand = false;
        for (var s2 = 1; s2 <= N; s2++) if (legal(s2, who)) cands.push(s2);
      }
      if (!cands.length) {
        for (var s3 = 1; s3 <= N; s3++) if (isFree(s3)) cands.push(s3);
        if (cands.length) {
          notices.push(who.label + '（' + who.name + '）因锚点已占用，已放入其余空位。');
        }
      }
      if (!cands.length) {
        errors.push('位置不足：安置 ' + who.label + '（' + who.name + '）时已无可用签位。');
        return;
      }

      var gq = groupQuarters(who.groupIndex);
      var scored = cands.map(function (s) {
        return { s: s, dup: gq[quarterOf(s, N)] ? 1 : 0, r: rng.next() };
      });
      scored.sort(function (a, b) {
        if (a.dup !== b.dup) return a.dup - b.dup;
        return a.r - b.r;
      });

      var candSnapshot = cands.slice();       /* 落位前的合法候选（供动画逐个遍历） */
      var slot = scored[0].s;
      put(slot, { kind: 'qual', qual: who });
      who.slot = slot; who.seat = seat; who.band = band.band; who.viaBand = viaBand;
      events.push({
        seq: events.length + 1, kind: 'qual', slot: slot, who: who, seat: seat,
        cands: candSnapshot
      });
    });
    if (errors.length) return { ok: false, errors: errors, notices: notices, seed: rng.seed };

    /* ---------- 2) 轮空位：由 ITTF 锚点的“对手位”一次性确定 ----------
       取前 byeCount 个锚点的对手位，天然落在不同 1/4 区；
       并排除：①后续种子要用的锚点  ②与已定轮空成对的位（防“轮空 vs 轮空”）。 */
    var anchorsNeeded = {};
    for (var ak = 1; ak <= Math.min(winners.length, N); ak++) {
      var asA = anchorSlot(ak, N);
      if (asA != null) anchorsNeeded[asA] = true;
    }
    function partnerIsBye(s) { return !!reserved[partnerOf(s)]; }

    var byeList = [];
    for (var bk = 1; bk <= Math.min(byeCount, N); bk++) {
      var aB = anchorSlot(bk, N);
      if (aB == null) continue;
      var cB = partnerOf(aB);
      if (anchorsNeeded[cB] || reserved[cB] || partnerIsBye(cB)) continue;
      reserved[cB] = true;
      byeList.push(cB);
    }
    if (byeList.length < byeCount) {           /* 兜底：按 1/4 区均匀补齐 */
      var byQ0 = { 1: 0, 2: 0, 3: 0, 4: 0 };
      byeList.forEach(function (s) { byQ0[quarterOf(s, N)]++; });
      var extra = [];
      for (var es = 1; es <= N; es++) {
        if (reserved[es] || anchorsNeeded[es]) continue;
        if (partnerIsBye(es)) continue;
        extra.push(es);
      }
      extra.sort(function (x, y) {
        var qx = byQ0[quarterOf(x, N)], qy = byQ0[quarterOf(y, N)];
        if (qx !== qy) return qx - qy;
        return x - y;
      });
      for (var ei = 0; ei < extra.length && byeList.length < byeCount; ei++) {
        var sE = extra[ei];
        if (reserved[sE] || partnerIsBye(sE)) continue;
        reserved[sE] = true;
        byeList.push(sE);
        byQ0[quarterOf(sE, N)]++;
      }
    }
    if (byeList.length < byeCount) {
      return {
        ok: false,
        errors: ['无法安排 ' + byeCount + ' 个轮空位（会与种子锚点或彼此冲突）。请调整小组数或出线人数。'],
        notices: notices, seed: rng.seed
      };
    }
    byeList.sort(function (a, b) { return a - b; }).forEach(function (s) {
      byeSlots[s] = true;
      put(s, { kind: 'bye' });
      events.push({ seq: events.length + 1, kind: 'bye', slot: s, who: null });
    });

    /* ---------- 3) 其余出线者：先算半区需求，再逐人落位并守住容量 ---------- */
    function requiredHalf(who) {
      var wh = sameGroupWinnerHalf(who.groupIndex);
      if (!wh) return null;
      return wh === 'upper' ? 'lower' : 'upper';
    }

    var demand = { upper: 0, lower: 0 };
    others.forEach(function (o) {
      var h = requiredHalf(o);
      if (h) demand[h]++;
    });

    var capFree = { upper: freeIn('upper'), lower: freeIn('lower') };
    if (demand.upper > capFree.upper || demand.lower > capFree.lower) {
      return {
        ok: false,
        errors: ['同组半区回避无法满足：需要上半区 ' + demand.upper + ' 个位置（可用 ' + capFree.upper +
          '）、下半区 ' + demand.lower + ' 个（可用 ' + capFree.lower + '）。请减少每组出线人数或调整小组数。'],
        notices: notices, seed: rng.seed
      };
    }

    others.forEach(function (who, idx) {
      var seat = winners.length + idx + 1;
      var band = seedBand(Math.min(seat, N));
      var want = requiredHalf(who);

      var pool = [];
      for (var s = 1; s <= N; s++) {
        if (!isFree(s)) continue;
        if (want && halfOf(s, N) !== want) continue;
        pool.push(s);
      }
      if (!pool.length) {
        return errors.push('位置不足：小组 ' + who.groupLabel + ' 的第 ' + who.rank +
          ' 出线（' + who.name + '）找不到符合半区回避的空位。');
      }

      var bandSet = {};
      bandAnchors(seat).forEach(function (s9) { bandSet[s9] = true; });
      var gq = groupQuarters(who.groupIndex);

      var needU = demand.upper - (want === 'upper' ? 1 : 0);
      var needL = demand.lower - (want === 'lower' ? 1 : 0);

      var cands = pool.map(function (s10) {
        return {
          s: s10,
          inBand: bandSet[s10] ? 0 : 1,
          dup: gq[quarterOf(s10, N)] ? 1 : 0,
          r: rng.next()
        };
      });

      function feasible(c) {
        var fu = capFree.upper - (halfOf(c.s, N) === 'upper' ? 1 : 0);
        var fl = capFree.lower - (halfOf(c.s, N) === 'lower' ? 1 : 0);
        return fu >= needU && fl >= needL;
      }

      var okC = cands.filter(feasible);
      if (!okC.length) okC = cands;
      okC.sort(function (a, b) {
        if (a.inBand !== b.inBand) return a.inBand - b.inBand;
        if (a.dup !== b.dup) return a.dup - b.dup;
        return a.r - b.r;
      });

      var pick = okC[0].s;
      var candSnapshot = okC.map(function (x) { return x.s; });
      put(pick, { kind: 'qual', qual: who });
      who.slot = pick; who.seat = seat; who.band = band.band;
      who.viaBand = !okC[0].inBand;
      events.push({
        seq: events.length + 1, kind: 'qual', slot: pick, who: who, seat: seat,
        cands: candSnapshot
      });

      capFree[halfOf(pick, N)]--;
      if (want === 'upper') demand.upper--; else if (want === 'lower') demand.lower--;
    });

    if (errors.length) return { ok: false, errors: errors, notices: notices, seed: rng.seed };

    /* ---------- 2) 若仍有空位，补为轮空（绝不成对） ---------- */
    var left = [];
    for (var s4 = 1; s4 <= N; s4++) if (!slots[s4]) left.push(s4);

    if (left.length) {
      /* 先修“整对空”：把同半区某个出线者搬一个过来，避免生成“轮空 vs 轮空” */
      var guard = 0;
      while (guard++ < N * N) {
        var emptyPair = null;
        for (var ps = 1; ps <= N; ps += 2) {
          if (!slots[ps] && !slots[ps + 1]) { emptyPair = ps; break; }
        }
        if (!emptyPair) break;
        var moved = false;
        for (var tgt = emptyPair; tgt <= emptyPair + 1 && !moved; tgt++) {
          if (slots[tgt]) continue;
          var th = halfOf(tgt, N);
          for (var src = 1; src <= N && !moved; src++) {
            if (!slots[src]) continue;
            var c = slots[src];
            if (c.kind !== 'qual') continue;
            if (halfOf(src, N) !== th) continue;
            /* 搬过去仍须满足同组半区回避 */
            var wh = sameGroupWinnerHalf(c.qual.groupIndex);
            if (c.qual.rank >= 2 && wh && halfOf(tgt, N) === wh) continue;
            slots[src] = null;
            slots[tgt] = c;
            placements.forEach(function (p) { if (p.slot === src) p.slot = tgt; });
            c.qual.slot = tgt;
            moved = true;
          }
        }
        if (!moved) {
          return {
            ok: false,
            errors: ['轮空分配失败：出现“整对空位”且无法在保持同组半区回避的前提下修复。请调整小组数或出线人数。'],
            notices: notices, seed: rng.seed
          };
        }
      }

      /* 余下空位逐个标为轮空（跳过同对已空的位） */
      var rest = [];
      for (var s5 = 1; s5 <= N; s5++) if (!slots[s5]) rest.push(s5);
      var byQ = { 1: 0, 2: 0, 3: 0, 4: 0 };
      Object.keys(byeSlots).forEach(function (k) { byQ[quarterOf(Number(k), N)]++; });
      rest.sort(function (a, b) {
        var qa = byQ[quarterOf(a, N)], qb = byQ[quarterOf(b, N)];
        if (qa !== qb) return qa - qb;
        return a - b;
      });
      rest.forEach(function (s6) {
        if (slots[s6]) return;
        if (!slots[partnerOf(s6)]) return;
        put(s6, { kind: 'bye' });
        byeSlots[s6] = true;
        byQ[quarterOf(s6, N)]++;
        events.push({ seq: events.length + 1, kind: 'bye', slot: s6, who: null, mateOf: partnerOf(s6) });
      });
    }

    /* ---------- 3) 完整性复核 ---------- */
    for (var v1 = 1; v1 <= N; v1++) {
      if (!slots[v1]) {
        return {
          ok: false,
          errors: ['内部错误：第 ' + v1 + ' 号位既无出线者也不是轮空。'],
          notices: notices, seed: rng.seed
        };
      }
    }
    var halfCheck = {};
    for (var v2 = 1; v2 <= N; v2++) {
      var cc = slots[v2];
      if (cc.kind !== 'qual') continue;
      var key = cc.qual.groupIndex + ':' + halfOf(v2, N);
      if (halfCheck[key]) {
        return {
          ok: false,
          errors: ['同组半区回避失败：小组 ' + cc.qual.groupLabel + ' 的两人同在上/下半区（第 ' + v2 + ' 号位）。'],
          notices: notices, seed: rng.seed
        };
      }
      halfCheck[key] = true;
    }

    /* 轮空分布提示 */
    if (byeCount > 0) {
      var dist = { 1: 0, 2: 0, 3: 0, 4: 0 };
      Object.keys(byeSlots).forEach(function (k) { dist[quarterOf(Number(k), N)]++; });
      notices.push('轮空位已分配给抽签顺序最靠前的 ' + Object.keys(byeSlots).length +
        ' 位（头号种子）的对手位，各 1/4 区：' + [1, 2, 3, 4].map(function (k) { return dist[k]; }).join('/') + ' 个。');
    }

    /* ---------- 4) 构造树状轮次 ---------- */
    var rounds = [];
    var totalMatches = 0;
    var matchCount = N / 2;
    var prevWinners = [];
    var roundIdx = 0;
    while (matchCount >= 1) {
      var matches = [];
      for (var mi = 0; mi < matchCount; mi++) {
        totalMatches++;
        var slotA, slotB, a, b;
        if (roundIdx === 0) {
          slotA = mi * 2 + 1;
          slotB = mi * 2 + 2;
          a = slots[slotA]; b = slots[slotB];
        } else {
          slotA = null; slotB = null;
          a = prevWinners[mi * 2] || null;
          b = prevWinners[mi * 2 + 1] || null;
        }
        var isBye = (roundIdx === 0) && a && b && (a.kind === 'bye' || b.kind === 'bye');
        var winner = null;
        if (isBye) winner = a.kind === 'bye' ? b : a;
        matches.push({
          no: totalMatches,
          round: roundIdx + 1,
          matchIndex: mi,
          name: roundName(matchCount),
          slotA: slotA, slotB: slotB,
          a: a, b: b,
          bye: !!isBye,
          winnerTo: null
        });
        prevWinners.push(isBye ? winner : null);
      }
      rounds.push({ round: roundIdx + 1, name: roundName(matchCount), matches: matches, count: matchCount });
      matchCount /= 2;
      roundIdx++;
      if (matchCount < 1) break;
    }

    rounds.forEach(function (rd, ri) {
      if (ri + 1 >= rounds.length) return;
      rd.matches.forEach(function (m, mi) {
        var nextIdx = Math.floor(mi / 2);
        m.winnerTo = { round: ri + 2, matchIndex: nextIdx, side: mi % 2 === 0 ? 'A' : 'B' };
      });
    });

    /* 三四名决赛：两场半决赛的负者 */
    var semi = rounds.filter(function (r) { return r.count === 2; })[0];
    var thirdPlace = null;
    if (semi) {
      totalMatches++;
      thirdPlace = {
        no: totalMatches,
        round: rounds.length,
        matchIndex: -1,
        name: '三四名决赛',
        slotA: null, slotB: null,
        a: null, b: null,
        bye: false,
        winnerTo: null,
        fromSemiLosers: [semi.matches[0].no, semi.matches[1].no]
      };
    }

    return {
      ok: true,
      errors: [],
      notices: notices,
      seed: rng.seed,
      size: N,
      slots: slots,
      byeSlots: Object.keys(byeSlots).map(Number).sort(function (a, b) { return a - b; }),
      placements: placements,
      qualifiers: qualifiers,
      order: order,
      events: events,
      rounds: rounds,
      thirdPlace: thirdPlace,
      totalMatches: totalMatches,
      anchors: anchorList(N)
    };
  }

  TT.drawKnockout = drawKnockout;

})(typeof globalThis !== 'undefined' ? globalThis : this);
