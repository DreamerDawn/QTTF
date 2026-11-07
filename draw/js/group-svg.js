/*!
 * group-svg.js —— 小组赛签表 SVG 渲染（A4 横向，纯自绘）
 *
 * 版式：N 个小组栏等宽平铺成网格，所有栏共用同一行高与同一表头高度，
 *      因此「第 1 位 / 第 2 位 / 第 3 位…」在整个版面上严格横向对齐。
 * 内容：组名、人数、位置序号、姓名、档位、种子序，以及**空白的“出线”勾选栏**。
 *       “出线”不预填：由人工判定后勾选，避免导出表提前替用户下结论。
 */
(function (root) {
  'use strict';

  var TT = root.TT;
  var util = TT.util;

  var C = (TT.Bracket && TT.Bracket.colors) || {
    paper: '#fbfaf7', paperEdge: '#efece5', ink: '#1a2433', ink2: '#46536b',
    ink3: '#8c94a5', line: '#b9b3a6', lineSoft: '#d8d3c7', acc: '#c2410c',
    accSoft: '#fdece1', win: '#0f766e', winSoft: '#e3f4f1', title: '#16202f'
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** 名称折行（双打优先在斜杠处断开） */
  function wrap(s, max) {
    if (!s) return [''];
    s = String(s);
    if (s.length <= max) return [s];
    if (/[/／|]/.test(s)) {
      var parts = s.split(/[/／|]/).map(function (p) { return p.trim(); }).filter(Boolean);
      var out = [];
      parts.forEach(function (p) {
        if (p.length <= max) out.push(p);
        else for (var i = 0; i < p.length; i += max) out.push(p.slice(i, i + max));
      });
      if (parts.length === 2) return [parts[0] + ' /', parts[1]];
      return out.slice(0, 2);
    }
    var lines = [];
    for (var j = 0; j < s.length; j += max) lines.push(s.slice(j, j + max));
    return lines.slice(0, 2);
  }

  /**
   * @param {Object} res drawGroups 结果
   * @param {Object} opt {title, subtitle, qualifiersPerGroup, footer, showTier,
   *                      advance: {'组序号:层序号': true} 人工勾选的出线标记}
   * @returns {{svg:string,width:number,height:number}}
   */
  function render(res, opt) {
    opt = opt || {};
    if (!res || !res.groups || !res.groups.length) return { svg: '', width: 0, height: 0 };

    var groups = res.groups;
    var G = groups.length;
    var maxSize = Math.max.apply(null, groups.map(function (g) { return g.size; }));

    var W = 1684, H = 1190;
    var padL = 40, padR = 40, padT = 100, padB = 46, gap = 16;

    /* 列数：≤2 组单列、≤6 组三列、更多四列 —— 与窗口宽度无关，导出尺寸恒定 */
    var cols = G <= 2 ? G : (G <= 6 ? 3 : 4);
    if (cols < 1) cols = 1;
    var rows = Math.ceil(G / cols);

    var gridW = W - padL - padR;
    var gridH = H - padT - padB;
    var cardW = (gridW - gap * (cols - 1)) / cols;
    var cardH = (gridH - gap * (rows - 1)) / rows;

    /* 关键：所有卡片共用同一表头高度 + 同一行高，末行不留弹性空间
       —— 这样即便某组人数较少，其行位置仍与其他组一致（档次横向对齐）。 */
    var headH = 27;
    var bodyTop = headH + 6;
    var rowH = (cardH - bodyTop - 6) / maxSize;
    var fsName = Math.max(10.5, Math.min(14, rowH * 0.42));

    var p = [];
    p.push('<?xml version="1.0" encoding="UTF-8"?>');
    p.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H +
      '" viewBox="0 0 ' + W + ' ' + H + '" font-family="\'Microsoft YaHei\',\'PingFang SC\',\'Noto Sans CJK SC\',sans-serif">');

    p.push('<rect width="' + W + '" height="' + H + '" fill="' + C.paper + '"/>');
    p.push('<rect x="0.5" y="0.5" width="' + (W - 1) + '" height="' + (H - 1) +
      '" fill="none" stroke="' + C.paperEdge + '"/>');

    /* ---- 标题 ---- */
    var title = opt.title || '小组赛分组表';
    var sub = opt.subtitle || '';
    var totalEntry = groups.reduce(function (s, g) { return s + g.size; }, 0);
    p.push('<rect x="' + padL + '" y="26" width="6" height="30" rx="3" fill="' + C.acc + '"/>');
    p.push('<text x="' + (padL + 18) + '" y="50" font-size="27" font-weight="800" fill="' + C.title +
      '" letter-spacing="1">' + esc(title) + '</text>');
    if (sub) p.push('<text x="' + (padL + 18) + '" y="72" font-size="14" fill="' + C.ink3 + '">' + esc(sub) + '</text>');
    p.push('<text x="' + (W - padR) + '" y="44" font-size="13" fill="' + C.ink3 + '" text-anchor="end">' +
      esc(G + ' 组 ｜ ' + totalEntry + ' 人') + '</text>');
    p.push('<text x="' + (W - padR) + '" y="66" font-size="12" fill="' + C.ink3 + '" text-anchor="end">' +
      esc('日期 ________________　场地 ________________') + '</text>');

    /* ---- 小组栏 ---- */
    groups.forEach(function (g, gi) {
      var col = gi % cols;
      var row = Math.floor(gi / cols);
      var x = padL + col * (cardW + gap);
      var y = padT + row * (cardH + gap);

      p.push('<g>');
      p.push('<rect x="' + x + '" y="' + y + '" width="' + cardW + '" height="' + cardH +
        '" rx="8" fill="#fff" stroke="' + C.line + '" stroke-width="1.2"/>');

      /* 组头（固定高度） */
      p.push('<rect x="' + x + '" y="' + y + '" width="' + cardW + '" height="' + headH +
        '" rx="8" fill="' + C.ink + '"/>');
      p.push('<rect x="' + x + '" y="' + (y + headH - 8) + '" width="' + cardW + '" height="8" fill="' + C.ink + '"/>');
      p.push('<text x="' + (x + 11) + '" y="' + (y + headH * 0.7) + '" font-size="' + (headH * 0.46) +
        '" font-weight="800" fill="#fff" letter-spacing="1">' + esc(g.label + ' 组') + '</text>');
      p.push('<text x="' + (x + cardW - 11) + '" y="' + (y + headH * 0.7) + '" font-size="' + (headH * 0.33) +
        '" fill="#cbd5e1" text-anchor="end">' + esc(g.size + ' 人') + '</text>');

      /* 行（固定行高 → 跨栏对齐） */
      for (var L = 0; L < maxSize; L++) {
        var ry = y + bodyTop + L * rowH;
        var slot = g.slots[L];
        var has = !!(slot && slot.entry);
        var ent = has ? slot.entry : null;
        var tier = has ? res.tiers[ent.id] : null;
        var marked = !!(opt.advance && opt.advance[gi + ':' + L]);

        if (L > 0) {
          p.push('<line x1="' + (x + 8) + '" y1="' + ry + '" x2="' + (x + cardW - 8) +
            '" y2="' + ry + '" stroke="' + C.lineSoft + '" stroke-width="0.8"/>');
        }

        /* 位置序号 */
        var bx = x + 9, by = ry + (rowH - 17) / 2;
        p.push('<rect x="' + bx + '" y="' + by + '" width="17" height="17" rx="5" fill="' +
          (L === 0 ? C.acc : '#eef1f5') + '"/>');
        p.push('<text x="' + (bx + 8.5) + '" y="' + (by + 12.5) + '" font-size="10.5" font-weight="800" ' +
          'fill="' + (L === 0 ? '#fff' : C.ink3) + '" text-anchor="middle">' + esc(L + 1) + '</text>');

        var markW = 30;                                        /* 右侧出线勾选栏 */
        var tierW = (opt.showTier !== false && has && tier != null) ? 17 : 0;
        var seedW = (has && ent.seedRank != null) ? 25 : 0;
        var nx = x + 32;
        var avail = cardW - 32 - 10 - markW - tierW - seedW;
        var maxChars = Math.max(4, Math.floor(avail / (fsName * 1.06)));
        var cy = ry + rowH / 2 + fsName * 0.34;

        if (has) {
          var lines = wrap(util.entryName(ent), maxChars);
          if (lines.length === 1) {
            p.push('<text x="' + nx + '" y="' + cy + '" font-size="' + fsName + '" font-weight="700" fill="' +
              C.ink + '">' + esc(lines[0]) + '</text>');
          } else {
            p.push('<text x="' + nx + '" y="' + (cy - fsName * 0.55) + '" font-size="' + (fsName - 1.5) +
              '" font-weight="700" fill="' + C.ink + '">' + esc(lines[0]) + '</text>');
            p.push('<text x="' + nx + '" y="' + (cy + fsName * 0.55) + '" font-size="' + (fsName - 1.5) +
              '" font-weight="700" fill="' + C.ink + '">' + esc(lines[1]) + '</text>');
          }
          if (tierW) {
            p.push('<text x="' + (x + cardW - 10 - markW - 1) + '" y="' + (ry + rowH / 2 + 3.5) +
              '" font-size="' + Math.max(8.5, fsName - 3) + '" fill="' + C.ink3 + '" text-anchor="end">' +
              esc('T' + tier) + '</text>');
          }
          if (seedW) {
            p.push('<text x="' + (x + cardW - 10 - markW - tierW - 3) + '" y="' + (ry + rowH / 2 + 3.5) +
              '" font-size="' + Math.max(8.5, fsName - 2) + '" fill="' + C.acc +
              '" text-anchor="end" font-weight="800">' + esc('[' + ent.seedRank + ']') + '</text>');
          }
        } else {
          p.push('<text x="' + nx + '" y="' + (ry + rowH / 2 + 4) + '" font-size="' + Math.max(8.5, fsName - 1.5) +
            '" fill="' + C.ink3 + '">空位</text>');
        }

        /* 「出线」勾选栏：默认空框，人工判定后再勾 */
        var mbx = x + cardW - 10 - 18;
        var mby = ry + (rowH - 18) / 2;
        if (marked) {
          p.push('<rect x="' + mbx + '" y="' + mby + '" width="18" height="18" rx="3" fill="' + C.winSoft +
            '" stroke="' + C.win + '" stroke-width="1.2"/>');
          p.push('<path d="M' + (mbx + 3.6) + ' ' + (mby + 9.4) + ' l3.6 3.8 l7-8" fill="none" stroke="' +
            C.win + '" stroke-width="2" stroke-linecap="round"/>');
        } else {
          p.push('<rect x="' + mbx + '" y="' + mby + '" width="18" height="18" rx="3" fill="none" stroke="' +
            C.line + '" stroke-width="1.1"/>');
        }
      }
      p.push('</g>');
    });

    /* ---- 图例 ---- */
    p.push('<g>');
    p.push('<rect x="' + padL + '" y="' + (H - 30) + '" width="13" height="13" rx="2" fill="none" stroke="' +
      C.line + '"/>');
    p.push('<text x="' + (padL + 18) + '" y="' + (H - 19) + '" font-size="10.5" fill="' + C.ink3 + '">' +
      esc('出线栏：留空待判定，确认后请勾选 ｜ 左侧序号 = 组内位置（1 号位通常为种子） ｜ [n] = 种子序 ｜ Tn = 档位') +
      '</text>');
    if (opt.footer) {
      p.push('<text x="' + (W - padR) + '" y="' + (H - 19) + '" font-size="10.5" fill="' + C.ink3 +
        '" text-anchor="end">' + esc(opt.footer) + '</text>');
    }
    p.push('</g>');

    p.push('</svg>');
    return { svg: p.join('\n'), width: W, height: H };
  }

  function mount(container, res, opt) {
    if (!container) return;
    var out = render(res, opt);
    container.innerHTML = out.svg;
    var svg = container.querySelector('svg');
    if (svg) {
      svg.style.width = '100%';
      svg.style.height = 'auto';
      svg.style.maxWidth = ((opt && opt.maxWidth) || out.width) + 'px';
    }
  }

  TT.GroupSheet = { render: render, mount: mount };

})(typeof globalThis !== 'undefined' ? globalThis : this);
