/*!
 * draw-groups.js —— 小组赛抽签（种子锚点 + 逐档抽签 + 同档回避）
 *
 * 设计要点
 * 1) 档位（tier）与“位置层级（level）”对齐：第 j 层只存在于人数 ≥ j 的小组，
 *    因此第 j 层共有 cap[j] = #{人数 ≥ j 的小组} 个位置。不整除时（如 3/3/3/3/4/4），
 *    第 4 层只有 2 个位置，这是“人数不齐”的必然结果，不视为违规。
 * 2) 抽签顺序：先把种子落到各组的第 1 层（跨档时用蛇形铺到第 2 层），
 *    再对非种子“按档位从高到低”逐档抽入。
 * 3) 同档回避：同一档的两个单元不进同一小组。种子已由设计分散到不同小组，
 *    因此对非种子逐档抽签时，只允许落到“尚无该档成员”的小组。
 * 4) 约束冲突一律返回具体原因（errors），绝不静默放宽。
 * 5) constraints 接口：数组，元素为 {id, label, test(entryA, entryB, ctx) → boolean}，
 *    返回 false 表示该单元不能与该组现有成员同组。默认无约束（需求已明确无同单位问题）。
 */
(function (root) {
  'use strict';

  var TT = root.TT;
  var util = TT.util;

  /* ======================= 档位推导 ======================= */

  /**
   * 计算每层位置容量。
   * @param {number[]} sizes 各组人数
   * @returns {number[]} cap[level] = 可容纳该层的小组数（index 从 1 开始，cap[0] 不用）
   */
  function levelCapacity(sizes) {
    var maxSize = Math.max.apply(null, sizes);
    var cap = [0];
    for (var lv = 1; lv <= maxSize; lv++) {
      var c = 0;
      for (var i = 0; i < sizes.length; i++) if (sizes[i] >= lv) c++;
      cap[lv] = c;
    }
    return cap;
  }
  TT.levelCapacity = levelCapacity;

  /**
   * 为参赛单元分配档位。
   * - 有显式 tier 且合法 → 采用；
   * - 无 tier → 按“实力序”依次填满各层剩余容量（层 1 填满后填层 2 …）。
   * @returns {{ok, errors, tiers: Object<string, number>, cap, assignedAuto}}
   */
  function assignTiers(entries, cfg, sizes) {
    var cap = levelCapacity(sizes);
    var maxLevel = cap.length - 1;
    var errors = [];
    var tiers = {};
    var used = [];  /* used[level] = 已占用数 */
    for (var l = 0; l <= maxLevel; l++) used[l] = 0;

    /* 1) 显式档位 */
    entries.forEach(function (e) {
      if (e.tier == null) return;
      var t = Math.floor(e.tier);
      if (!isFinite(t) || t < 1) {
        errors.push('“' + util.entryName(e) + '”的档位（' + e.tier + '）必须为正整数。');
        return;
      }
      if (t > maxLevel) {
        errors.push('“' + util.entryName(e) + '”的档位（' + t + '）超出范围：最多 ' + maxLevel +
          ' 档（受最大小组人数 ' + Math.max.apply(null, sizes) + ' 限制）。');
        return;
      }
      if (used[t] + 1 > cap[t]) {
        errors.push('档位 ' + t + ' 的单元过多：第 ' + t + ' 层只有 ' + cap[t] +
          ' 个位置（人数 ≥ ' + t + ' 的小组数），但已声明 ' + (used[t] + 1) + ' 个。请调整档位或小组数。');
        return;
      }
      used[t]++;
      tiers[e.id] = t;
    });
    if (errors.length) return { ok: false, errors: errors, tiers: tiers, cap: cap };

    /* 2) 未声明档位者：按**名单顺序**（你在“参赛名单”里给出的先后）依次填入各层剩余容量。
       不按积分、也不按种子序重排——顺序以你的名单为准。 */
    var rest = entries.filter(function (e) { return tiers[e.id] == null; });
    var lv = 1, autoCount = 0;
    for (var i = 0; i < rest.length; i++) {
      while (lv <= maxLevel && used[lv] >= cap[lv]) lv++;
      if (lv > maxLevel) {
        errors.push('档位容量不足：仍有 ' + (rest.length - i) + ' 个单元没有档位位置可放。');
        break;
      }
      used[lv]++;
      tiers[rest[i].id] = lv;
      autoCount++;
    }
    if (errors.length) return { ok: false, errors: errors, tiers: tiers, cap: cap };

    return { ok: true, errors: [], tiers: tiers, cap: cap, maxLevel: maxLevel, autoCount: autoCount };
  }
  TT.assignTiers = assignTiers;

  /* ======================= 约束检查 ======================= */

  /**
   * 判断某单元能否放进某组（不考虑空位，只看回避类约束）。
   */
  function canJoinGroup(entry, members, constraints, ctx) {
    for (var i = 0; i < members.length; i++) {
      for (var c = 0; c < constraints.length; c++) {
        if (!constraints[c].test(entry, members[i], ctx)) return false;
      }
    }
    return true;
  }

  /* ======================= 主流程 ======================= */

  /**
   * 生成小组赛分组（完整合规，一次性生成，不做局部替换）。
   *
   * @param {Object} opt
   * @param {Object[]} opt.entries 已归一化的参赛单元
   * @param {Object} opt.config  {eventType, groupCount, groupSize, qualifiersPerGroup, seedCount, tierCount}
   * @param {number|string} [opt.seed] 随机种子
   * @param {Object[]} [opt.constraints] 预留约束接口
   * @returns {Object} 结果
   */
  function drawGroups(opt) {
    var entries = opt.entries || [];
    var cfg = opt.config || {};
    var constraints = opt.constraints || [];
    var rng = TT.makeRng(opt.seed);

    var n = entries.length;
    var g = Math.max(1, Math.floor(cfg.groupCount || 1));
    var q = Math.max(1, Math.floor(cfg.qualifiersPerGroup || 1));
    var seedCount = Math.max(0, Math.floor(cfg.seedCount == null ? g : cfg.seedCount));

    var notices = [];

    if (n < 2) {
      return { ok: false, errors: ['参赛单元至少需要 2 个（当前 ' + n + ' 个）。'], groups: [], events: [], notices: notices, seed: rng.seed };
    }

    /* ---------- 各组人数：组间差 ≤ 1，多出的人优先放靠后的组 ---------- */
    var sizes = TT.groupSizes(n, g);
    var maxSize = Math.max.apply(null, sizes);
    var minSize = Math.min.apply(null, sizes);
    if (sizes.some(function (s) { return s < 2; })) {
      notices.push('有小组只有 ' + minSize + ' 人（' + sizes.join('/') + '），该组无法进行小组赛。');
    }
    if (maxSize !== minSize) {
      notices.push('参赛单元数不能整除：各组人数为 ' + sizes.join('/') +
        '（差 ' + (maxSize - minSize) + ' 人，多出的 ' + (n - minSize * g) + ' 人已放入靠后的小组）。');
    }
    if (q > minSize) {
      return { ok: false, errors: ['每组出线人数（' + q + '）大于最小小组人数（' + minSize + '），无法满足。'], groups: [], events: [], notices: notices, seed: rng.seed };
    }

    /* ---------- 档位 ---------- */
    var tierRes = assignTiers(entries, cfg, sizes);
    if (!tierRes.ok) {
      return { ok: false, errors: tierRes.errors, groups: [], events: [], notices: notices, seed: rng.seed };
    }
    var tiers = tierRes.tiers;
    var cap = tierRes.cap;
    var maxLevel = tierRes.maxLevel;
    if (tierRes.autoCount > 0) {
      notices.push('有 ' + tierRes.autoCount + ' 个单元未填档位，已按**名单顺序**自动分档（每组每档仅 1 人）。');
    }

    /* ---------- 初始化小组 ---------- */
    var groups = [];
    for (var gi = 0; gi < g; gi++) {
      var slots = [];
      for (var si = 0; si < sizes[gi]; si++) slots.push({ level: si + 1, slot: si + 1, entry: null, kind: 'empty' });
      groups.push({
        index: gi,
        label: util.groupLabel(gi),
        size: sizes[gi],
        slots: slots,
        members: []
      });
    }

    var events = [];
    var placements = [];

    function place(entry, groupIndex, levelIdx, kind, tier) {
      var grp = groups[groupIndex];
      var slot = grp.slots[levelIdx];
      slot.entry = entry;
      slot.kind = kind;
      grp.members.push(entry);
      var ev = {
        kind: kind,              /* 'seed' | 'tier' */
        tier: tier,
        entryId: entry.id,
        entryName: util.entryName(entry),
        seedRank: entry.seedRank == null ? null : entry.seedRank,
        groupIndex: groupIndex,
        groupLabel: grp.label,
        slot: levelIdx + 1,
        order: events.length
      };
      events.push(ev);
      placements.push({ entryId: entry.id, groupIndex: groupIndex, slot: levelIdx + 1, kind: kind, tier: tier });
    }

    function groupHasTier(groupIndex, tier) {
      var ms = groups[groupIndex].members;
      for (var i = 0; i < ms.length; i++) if (tiers[ms[i].id] === tier) return true;
      return false;
    }

    /* ---------- 1) 种子落位（蛇形，确定性：按**名单顺序**依次落位） ----------
       种子 = 填了种子序的单元；先后顺序以名单为准，不再按种子序/积分重排。 */
    var seeds = entries.filter(function (e) {
      return tiers[e.id] != null && e.seedRank != null && e.seedRank > 0;
    }).slice(0, Math.min(seedCount, n));

    if (seedCount > g) {
      notices.push('种子数（' + seeds.length + '）多于小组数（' + g + '）：第 ' + (g + 1) +
        ' 个及以后的种子按蛇形进入第 2 层（跨 1–2 档）。');
    }
    if (seeds.length < seedCount) {
      notices.push('只剩 ' + seeds.length + ' 个种子可落位（仅 ' +
        seeds.filter(function (e) { return e.seedRank != null; }).length + ' 个单元填写了种子序）。');
    }

    /** 蛇形分组序：第 1 层 0..g-1；第 2 层 g-1..0；第 3 层 0..g-1 …（高低种子优先靠前小组） */
    function snakeGroup(order) {
      var layer = Math.floor(order / g);
      var pos = order % g;
      return (layer % 2 === 0) ? pos : (g - 1 - pos);
    }

    for (var k = 0; k < seeds.length; k++) {
      var sd = seeds[k];
      var t = tiers[sd.id];
      /* 先按“蛇形锚点”确定目标小组；若该组不可用（同档冲突/无该层空位），
         再按组序就近寻找可用小组（顺序按名单，不按积分） */
      var wantGroup = snakeGroup(k);
      var tryOrder = [];
      tryOrder.push(wantGroup);
      for (var off = 1; off < g; off++) {
        var a1 = (wantGroup + off) % g, b1 = (wantGroup - off + g) % g;
        if (tryOrder.indexOf(a1) < 0) tryOrder.push(a1);
        if (tryOrder.indexOf(b1) < 0) tryOrder.push(b1);
      }

      var done = false;
      for (var ti = 0; ti < tryOrder.length && !done; ti++) {
        var cg = tryOrder[ti];
        if (groups[cg].size < t) continue;
        if (groupHasTier(cg, t)) continue;             /* 同档回避 */
        var sl = groups[cg].slots[t - 1];
        if (!sl || sl.entry) continue;
        if (!canJoinGroup(sd, groups[cg].members, constraints, { group: groups[cg], entry: sd, tiers: tiers })) continue;
        place(sd, cg, t - 1, 'seed', t);
        done = true;
      }
      if (done) continue;

      /* 退让 1：该组任一同档-free 的空位 */
      for (var ti2 = 0; ti2 < tryOrder.length && !done; ti2++) {
        var cg2 = tryOrder[ti2];
        if (groupHasTier(cg2, t)) continue;
        var freeSlot = groups[cg2].slots.filter(function (s2) { return !s2.entry; })[0];
        if (!freeSlot) continue;
        if (!canJoinGroup(sd, groups[cg2].members, constraints, { group: groups[cg2], entry: sd, tiers: tiers })) continue;
        place(sd, cg2, freeSlot.slot - 1, 'seed', t);
        done = true;
      }
      if (done) continue;

      /* 退让 2：任一空位且该组无同档（跨档落位，仅在同档位置不足时发生） */
      for (var cg3 = 0; cg3 < g && !done; cg3++) {
        if (groupHasTier(cg3, t)) continue;
        var fs2 = groups[cg3].slots.filter(function (s3) { return !s3.entry; })[0];
        if (!fs2) continue;
        if (!canJoinGroup(sd, groups[cg3].members, constraints, { group: groups[cg3], entry: sd, tiers: tiers })) continue;
        notices.push('种子“' + util.entryName(sd) + '”（种子序 ' + sd.seedRank + '，第 ' + t +
          ' 档）未能落到第 ' + t + ' 层，已跨层放入 ' + groups[cg3].label + ' 组第 ' + fs2.slot + ' 位。');
        place(sd, cg3, fs2.slot - 1, 'seed', t);
        done = true;
      }
      if (!done) {
        return {
          ok: false,
          errors: ['种子“' + util.entryName(sd) + '”（种子序 ' + sd.seedRank + '，第 ' + t + ' 档）无法落位：' +
            '没有可容纳第 ' + t + ' 档且未占用的小组位置。'],
          groups: [], events: [], notices: notices, seed: rng.seed
        };
      }
    }

    /* ---------- 2) 非种子逐档抽签 ---------- */
    var placedIds = {};
    placements.forEach(function (p) { placedIds[p.entryId] = true; });

    var remaining = entries.filter(function (e) { return !placedIds[e.id]; });

    for (var tier = 1; tier <= maxLevel; tier++) {
      var pool = remaining.filter(function (e) { return tiers[e.id] === tier; });
      if (!pool.length) continue;
      pool = rng.shuffle(pool);

      var failed = [];
      for (var pi = 0; pi < pool.length; pi++) {
        var e2 = pool[pi];
        /* 候选：有第 tier 层空位（或任意空位）且无同档成员、且通过约束 */
        var cgs = [];
        for (var gx = 0; gx < g; gx++) {
          var grp2 = groups[gx];
          if (grp2.members.length >= grp2.size) continue;
          if (groupHasTier(gx, tier)) continue;
          if (!canJoinGroup(e2, grp2.members, constraints, { group: grp2, entry: e2, tiers: tiers })) continue;
          cgs.push(gx);
        }
        if (!cgs.length) { failed.push({ entry: e2, tier: tier }); continue; }

        /* 优先：第 tier 层的空位（保持层级整齐）；否则取最低空位 */
        var chooseBest = function (list) {
          var best = null, bestScore = Infinity;
          list.forEach(function (gIdx) {
            var gr = groups[gIdx];
            var lvlOk = (gr.size >= tier && !gr.slots[tier - 1].entry) ? 0 : 1;
            var freeCount = gr.slots.filter(function (s4) { return !s4.entry; }).length;
            var score = lvlOk * 100 + (gr.members.length) * 10 + freeCount;
            if (score < bestScore) { bestScore = score; best = gIdx; }
          });
          return best;
        };
        var chosen = chooseBest(cgs);
        var gO = groups[chosen];
        var lvl = (gO.size >= tier && !gO.slots[tier - 1].entry) ? tier - 1
          : (gO.slots.filter(function (s5) { return !s5.entry; })[0].slot - 1);
        place(e2, chosen, lvl, 'tier', tier);
      }

      if (failed.length) {
        var names = failed.map(function (f) { return util.entryName(f.entry); }).slice(0, 6).join('、');
        return {
          ok: false,
          errors: ['第 ' + tier + ' 档有 ' + failed.length + ' 个单元无法合规落位（' + names +
            (failed.length > 6 ? '…' : '') + '）：这些小组都已含同档成员或无空位。' +
            '请检查档位设置与小组人数（第 ' + tier + ' 层只有 ' + cap[tier] + ' 个位置）。'],
          groups: [], events: [], notices: notices, seed: rng.seed
        };
      }
    }

    /* ---------- 3) 完整性校验（不允许留空） ---------- */
    var emptySlots = 0;
    groups.forEach(function (gr) { gr.slots.forEach(function (s6) { if (!s6.entry) emptySlots++; }); });
    if (emptySlots > 0) {
      return {
        ok: false,
        errors: ['抽签后仍有 ' + emptySlots + ' 个位置为空，签表不完整。'],
        groups: [], events: [], notices: notices, seed: rng.seed
      };
    }

    /* ---------- 4) 复核同档回避 ---------- */
    for (var chk = 0; chk < g; chk++) {
      var seenTier = {};
      for (var mi = 0; mi < groups[chk].members.length; mi++) {
        var tt2 = tiers[groups[chk].members[mi].id];
        if (seenTier[tt2]) {
          return {
            ok: false,
            errors: ['内部复核失败：' + groups[chk].label + ' 组出现两个第 ' + tt2 + ' 档单元（同档回避被破坏）。'],
            groups: [], events: [], notices: notices, seed: rng.seed
          };
        }
        seenTier[tt2] = true;
      }
    }

    return {
      ok: true,
      errors: [],
      notices: notices,
      seed: rng.seed,
      groups: groups,
      sizes: sizes,
      tiers: tiers,
      cap: cap,
      maxLevel: maxLevel,
      events: events,
      placements: placements,
      seeds: seeds.map(function (e) { return e.id; })
    };
  }

  TT.drawGroups = drawGroups;

})(typeof globalThis !== 'undefined' ? globalThis : this);
