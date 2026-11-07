/*!
 * core.js —— 基础工具、可复现随机数、配置校验与推荐
 * 纯函数，无 DOM 依赖。命名空间：TT
 */
(function (root) {
  'use strict';

  var TT = root.TT = root.TT || {};

  /* ============================ 工具 ============================ */

  var util = TT.util = {
    isPow2: function (n) { return n > 0 && (n & (n - 1)) === 0; },

    /** 大于等于 n 的最小 2 的幂（n>=1） */
    nextPow2: function (n) {
      var p = 1;
      while (p < n) p *= 2;
      return p;
    },

    /** 2 的幂的指数；非 2 的幂返回 null */
    log2: function (n) {
      if (!util.isPow2(n)) return null;
      var k = 0, p = 1;
      while (p < n) { p *= 2; k++; }
      return k;
    },

    clamp: function (v, min, max) { return Math.min(max, Math.max(min, v)); },

    clone: function (o) { return JSON.parse(JSON.stringify(o)); },

    /** 参赛单元显示名：单打为姓名，双打为 "姓名A / 姓名B" */
    entryName: function (entry) {
      if (!entry || !entry.players) return '';
      var ps = entry.players.filter(function (p) { return String(p || '').trim(); });
      return ps.join(' / ');
    },

    /** 组名：A、B … Z、AA、AB …（Excel 风格列名） */
    groupLabel: function (i) {
      var n = i + 1, s = '';
      while (n > 0) {
        var r = (n - 1) % 26;
        s = String.fromCharCode(65 + r) + s;
        n = Math.floor((n - 1) / 26);
      }
      return s;
    },

    /** 名次标签：1、2、3… */
    rankLabel: function (r) { return String(r); },

    /** "A1" 这类出线代号 */
    qualLabel: function (groupIndex, rank) {
      return util.groupLabel(groupIndex) + util.rankLabel(rank);
    },

    /** 稳定排序比较器工厂 */
    byNum: function (getter) {
      return function (a, b) {
        var x = getter(a), y = getter(b);
        if (x == null && y == null) return 0;
        if (x == null) return 1;
        if (y == null) return -1;
        return x - y;
      };
    },

    /** 格式化时间戳（本地） */
    fmtTime: function (d) {
      function p(n) { return (n < 10 ? '0' : '') + n; }
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
        ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
    },

    /** 生成文件名用的时间戳 */
    stamp: function () {
      var d = new Date();
      function p(n) { return (n < 10 ? '0' : '') + n; }
      return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' +
        p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
    }
  };

  /* ====================== 可复现随机数 ====================== */
  /* mulberry32：同一 seed 必然产生同一序列，用于“固定随机种子”自测与重抽复现。 */

  function mulberry32(a) {
    a = a >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * 创建带便捷方法的随机源。
   * @param {number|string} seed 数字或字符串；为空则用当前时间（界面上“重抽”即用新种子）
   */
  function makeRng(seed) {
    var s = seed;
    if (s === undefined || s === null || s === '') s = Math.floor(Math.random() * 4294967296);
    if (typeof s === 'string') {
      /* 字符串种子 → 32 位整数（FNV-1a），保证同一文本同一种子 */
      var h = 2166136261 >>> 0;
      for (var i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
      }
      s = h;
    }
    s = Number(s) >>> 0;

    var next = mulberry32(s);
    var rng = {
      seed: s,
      next: next,
      /** [0, n) 的整数 */
      int: function (n) { return Math.floor(next() * n); },
      /** 从数组随机取一个 */
      pick: function (arr) { return arr.length ? arr[Math.floor(next() * arr.length)] : undefined; },
      /** Fisher–Yates 原地洗牌（返回新数组） */
      shuffle: function (arr) {
        var out = arr.slice();
        for (var i = out.length - 1; i > 0; i--) {
          var j = Math.floor(next() * (i + 1));
          var t = out[i]; out[i] = out[j]; out[j] = t;
        }
        return out;
      },
      /** 依据权重挑选（权重需为非负数） */
      weighted: function (items, weightOf) {
        var total = 0, i;
        for (i = 0; i < items.length; i++) total += Math.max(0, weightOf(items[i]));
        if (total <= 0) return rng.pick(items);
        var r = next() * total;
        for (i = 0; i < items.length; i++) {
          r -= Math.max(0, weightOf(items[i]));
          if (r <= 0) return items[i];
        }
        return items[items.length - 1];
      }
    };
    return rng;
  }

  TT.makeRng = makeRng;

  /* ====================== 参赛单元与排序 ====================== */

  /**
   * 归一化 entry（不做校验，只补默认值）
   * @returns {{id, players, seedRank, tier, rank, groupPoints, remark}}
   */
  function normalizeEntry(raw, index) {
    var e = raw || {};
    var players = [];
    if (Array.isArray(e.players)) {
      players = e.players.map(function (p) { return String(p == null ? '' : p).trim(); });
    } else if (typeof e.players === 'string') {
      players = [e.players.trim()];
    } else if (e.name) {
      players = [String(e.name).trim()];
    }
    /* 双打允许 "A/B" 竖线或 "A / B" 斜线写在一个字段里 */
    if (players.length === 1 && /[/／|]/.test(players[0])) {
      players = players[0].split(/[/／|]/).map(function (p) {
        return p.replace(/[A-Za-z][:：]/g, '').trim();
      }).filter(Boolean);
    }
    while (players.length < 2) players.push('');
    var toNum = function (v) {
      if (v === '' || v == null) return null;
      var n = Number(v);
      return isFinite(n) ? n : null;
    };
    return {
      id: String(e.id || ('e' + (index + 1))),
      players: e.players && Array.isArray(e.players) ? players.slice(0, 2) : (players[0] ? (players[1] ? [players[0], players[1]] : [players[0]]) : []),
      seedRank: toNum(e.seedRank),
      tier: toNum(e.tier),
      rank: toNum(e.rank),
      groupPoints: toNum(e.groupPoints),
      remark: String(e.remark == null ? '' : e.remark)
    };
  }
  TT.normalizeEntry = normalizeEntry;

  /**
   * 排名序（定档/抽签顺序的唯一依据）：
   *   1) seedRank（种子序，1 最高）优先
   *   2) rank（用户给定的排名，可空）
   *   3) 录入顺序（保持用户输入次序）
   *   —— 不再按组合积分排序：积分只作为数据字段展示，不参与定档。
   */
  function sortEntries(entries) {
    var pos = new Map();
    entries.forEach(function (e, i) { pos.set(e, i); });
    return entries.slice().sort(function (a, b) {
      var as = a.seedRank == null ? Infinity : a.seedRank;
      var bs = b.seedRank == null ? Infinity : b.seedRank;
      if (as !== bs) return as - bs;
      var ar = a.rank == null ? Infinity : a.rank;
      var br = b.rank == null ? Infinity : b.rank;
      if (ar !== br) return ar - br;
      return (pos.get(a) || 0) - (pos.get(b) || 0);
    });
  }
  TT.sortEntries = sortEntries;

  /* ====================== 配置推荐与校验 ====================== */

  /**
   * 依据参赛单元数推荐小组数与每组人数。
   * 目标：小组数尽量少但每组 3–4 人（8 人以下允许 2 人组）。
   */
  function recommendConfig(n, eventType) {
    var groupCount, groupSize;
    if (n <= 0) { groupCount = 1; groupSize = 1; }
    else if (n <= 7) { groupCount = Math.max(1, Math.floor(n / 2)); groupSize = 2; }
    else if (n <= 10) { groupCount = 2; groupSize = Math.ceil(n / 2); }
    else {
      /* 每组 3–4 人：组数 = round(n / 3.5) 附近，再做微调保证均衡 */
      groupCount = Math.round(n / 3.5);
      groupCount = Math.max(2, Math.min(groupCount, Math.floor(n / 2)));
      groupSize = Math.ceil(n / groupCount);
    }
    groupCount = Math.max(1, groupCount);
    groupSize = Math.max(2, Math.min(groupSize, n));

    var q = groupSize >= 4 ? 2 : 2;
    return {
      eventType: eventType || 'singles',
      groupCount: groupCount,
      groupSize: Math.ceil(n / groupCount),
      qualifiersPerGroup: Math.min(q, groupSize),
      seedCount: Math.min(groupCount, n),
      tierCount: Math.ceil(n / groupCount)
    };
  }
  TT.recommendConfig = recommendConfig;

  /**
   * 把 n 个单元分到 g 组，组间人数差最多 1，多出的人优先放靠后的组。
   * @returns {number[]} 每组人数
   */
  function groupSizes(n, g) {
    var base = Math.floor(n / g);
    var rem = n % g;
    var out = [];
    for (var i = 0; i < g; i++) out.push(base + (i >= g - rem ? 1 : 0));
    return out;
  }
  TT.groupSizes = groupSizes;

  /**
   * 校验配置。
   * @returns {{ok:boolean, errors:string[], warnings:string[]}}
   */
  function validateConfig(cfg, n) {
    var errors = [], warnings = [];
    cfg = cfg || {};
    var ec = cfg.eventType === 'doubles' ? 'doubles' : 'singles';

    if (!(n >= 2)) errors.push('参赛单元至少需要 2 个（当前 ' + (n || 0) + ' 个）。');

    var g = Number(cfg.groupCount), q = Number(cfg.qualifiersPerGroup);
    var s = Number(cfg.groupSize), sc = Number(cfg.seedCount), tc = Number(cfg.tierCount);

    if (!isFinite(g) || g < 1) errors.push('小组数必须 ≥ 1。');
    if (!isFinite(q) || q < 1) errors.push('每组出线人数必须 ≥ 1。');
    if (!isFinite(s) || s < 1) errors.push('每组人数必须 ≥ 1。');
    if (!isFinite(sc) || sc < 0) errors.push('种子数必须 ≥ 0。');
    if (!isFinite(tc) || tc < 1) errors.push('档位数必须 ≥ 1。');

    if (g > 0 && n > 0 && q > 0 && g * q > n) {
      errors.push('出线总人数（' + g + ' 组 × 每组 ' + q + ' 人 = ' + (g * q) + '）超过参赛单元数（' + n + '）。');
    }
    if (g > 0 && n > 0) {
      var sizes = groupSizes(n, g);
      var minSize = Math.min.apply(null, sizes);
      var maxSize = Math.max.apply(null, sizes);
      if (minSize < 2) warnings.push('有小组只有 ' + minSize + ' 人，无法进行小组赛（建议减少小组数）。');
      if (q > minSize) {
        errors.push('每组出线人数（' + q + '）大于最小小组人数（' + minSize + '），该组无法提供足够出线名额。');
      }
      if (isFinite(s) && Math.abs(s - Math.ceil(n / g)) > 0) {
        warnings.push('按当前参赛数，实际每组人数为 ' + sizes.join('/') + '（目标每组 ' + s + ' 人，以实际为准）。');
      }
      if (sc > n) errors.push('种子数（' + sc + '）不能超过参赛单元数（' + n + '）。');
      if (sc > g * 2) warnings.push('种子数（' + sc + '）超过小组数的 2 倍，后段种子会与同档选手同组。');
      if (tc < maxSize) {
        warnings.push('档位数（' + tc + '）小于最大小组人数（' + maxSize + '）：' + maxSize + ' 人组必然有同档选手同组，这是人数不齐导致的必然结果。');
      }
      if (tc > n) errors.push('档位数不能超过参赛单元数。');
    }
    if (ec === 'doubles' && n > 0) {
      /* 双打单元由调用方保证 players 长度；这里只做提示性检查 */
    }

    return { ok: errors.length === 0, errors: errors, warnings: warnings, eventType: ec };
  }
  TT.validateConfig = validateConfig;

  /**
   * 校验参赛单元列表。
   * @returns {{ok:boolean, errors:string[], warnings:string[], entries:Object[], duplicates:Object}}
   */
  function validateEntries(rawEntries, eventType) {
    var errors = [], warnings = [];
    var seen = {};
    var list = (rawEntries || []).map(function (r, i) { return normalizeEntry(r, i); });

    if (eventType === 'doubles') {
      list.forEach(function (e, i) {
        var ps = e.players.filter(function (p) { return p; });
        if (ps.length !== 2) {
          errors.push('第 ' + (i + 1) + ' 条：双打必须填写 2 名球员（当前 ' + ps.length + ' 名）。');
        }
      });
    } else {
      list.forEach(function (e, i) {
        if (!e.players[0]) errors.push('第 ' + (i + 1) + ' 条：单打必须填写姓名。');
        if (e.players[1]) warnings.push('第 ' + (i + 1) + ' 条：单打只取第 1 名球员（已填 2 名）。');
      });
    }

    /* 姓名重复检查（同一单元内 / 跨单元） */
    var nameMap = {};
    list.forEach(function (e, i) {
      var nm = util.entryName(e);
      if (!nm) return;
      if (nameMap[nm] != null) {
        warnings.push('存在重复的参赛名“' + nm + '”（第 ' + (nameMap[nm] + 1) + ' 条与第 ' + (i + 1) + ' 条）。');
      } else nameMap[nm] = i;
    });

    /* 种子序重复 */
    var seedMap = {};
    list.forEach(function (e, i) {
      if (e.seedRank == null) return;
      if (!isFinite(e.seedRank) || e.seedRank < 1) {
        errors.push('第 ' + (i + 1) + ' 条：种子序必须为正整数。');
        return;
      }
      if (seedMap[e.seedRank] != null) {
        errors.push('种子序重复：' + e.seedRank + '（第 ' + (seedMap[e.seedRank] + 1) + ' 条与第 ' + (i + 1) + ' 条）。');
      } else seedMap[e.seedRank] = i;
    });

    return { ok: errors.length === 0, errors: errors, warnings: warnings, entries: list };
  }
  TT.validateEntries = validateEntries;

  /* ====================== 导出用稳定 JSON schema ====================== */

  var SCHEMA_VERSION = '1.0.0';
  TT.SCHEMA_VERSION = SCHEMA_VERSION;

  /**
   * 构造对外数据接口（稳定结构，便于接入比赛信息统计系统）。
   */
  function buildExportPayload(ctx) {
    var ev = {
      schema: 'table-tennis-draw',
      schemaVersion: SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      generator: 'tt-draw-web/1.0',
      event: {
        type: ctx.config.eventType,
        groupCount: ctx.config.groupCount,
        groupSize: ctx.config.groupSize,
        qualifiersPerGroup: ctx.config.qualifiersPerGroup,
        seedCount: ctx.config.seedCount,
        tierCount: ctx.config.tierCount,
        randomSeed: ctx.seed
      },
      entries: (ctx.entries || []).map(function (e, i) {
        return {
          id: e.id,
          name: util.entryName(e),
          players: e.players.filter(Boolean),
          seedRank: e.seedRank == null ? null : e.seedRank,
          tier: e.tier == null ? null : e.tier,
          groupPoints: e.groupPoints == null ? null : e.groupPoints,
          remark: e.remark || '',
          order: i + 1
        };
      }),
      groups: (ctx.groups || []).map(function (g) {
        return {
          index: g.index,
          label: g.label,
          size: g.size,
          members: g.slots.map(function (m) {
            return {
              slot: m.slot,
              entryId: m.entry ? m.entry.id : null,
              name: m.entry ? util.entryName(m.entry) : null,
              seedRank: m.entry && m.entry.seedRank != null ? m.entry.seedRank : null,
              tier: m.entry && m.entry.tier != null ? m.entry.tier : null
            };
          })
        };
      }),
      knockout: ctx.bracket ? {
        size: ctx.bracket.size,
        rounds: ctx.bracket.rounds.map(function (r, ri) {
          return {
            round: ri + 1,
            name: r.name,
            matches: r.matches.map(function (m) {
              return {
                no: m.no,
                round: m.round,
                slotA: m.slotA,
                slotB: m.slotB,
                entryA: m.a ? m.a.entryId : null,
                entryB: m.b ? m.b.entryId : null,
                nameA: m.a ? m.a.name : null,
                nameB: m.b ? m.b.name : null,
                bye: !!m.bye,
                winnerTo: m.winnerTo
              };
            })
          };
        }),
        thirdPlace: ctx.bracket.thirdPlace ? {
          no: ctx.bracket.thirdPlace.no,
          nameA: null, nameB: null
        } : null,
        qualifiers: ctx.bracket.qualifiers.map(function (q) {
          return { entryId: q.entryId, name: q.name, groupIndex: q.groupIndex, groupLabel: q.groupLabel, rank: q.rank, label: q.label, slot: q.slot };
        })
      } : null,
      notices: ctx.notices || []
    };
    return ev;
  }
  TT.buildExportPayload = buildExportPayload;

})(typeof globalThis !== 'undefined' ? globalThis : this);
