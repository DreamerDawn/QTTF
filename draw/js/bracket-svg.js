/*!
 * bracket-svg.js —— 淘汰赛签表 SVG 树状渲染（纯自绘，无依赖）
 *
 * 设计目标
 *  - A4 横向比例（297×210mm 的宽高比 ≈ 1.414），签表占满纸面；
 *  - 真正的“树状”左→右推进，每场比赛有场次号、时间、球台留空占位；
 *  - 双打显示“姓名A / 姓名B”；
 *  - 轮空位显式标注“轮空”；
 *  - 生成的是可直接导出（PDF/PNG）的矢量图。
 */
(function (root) {
  'use strict';

  var TT = root.TT;
  var util = TT.util;

  var C = {
    paper: '#fbfaf7',
    paperEdge: '#efece5',
    ink: '#1a2433',
    ink2: '#46536b',
    ink3: '#8c94a5',
    line: '#b9b3a6',
    lineSoft: '#d8d3c7',
    acc: '#c2410c',
    accSoft: '#fdece1',
    win: '#0f766e',
    winSoft: '#e3f4f1',
    bye: '#6b7280',
    byeSoft: '#efeee9',
    title: '#16202f'
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** 名称过长时按字符折行（中文按字、英文按词粗分） */
  function wrapName(name, maxChars) {
    var s = String(name || '');
    if (s.length <= maxChars) return [s];
    var lines = [];
    /* 双打 "A / B" 优先在斜杠处断行 */
    if (s.indexOf(' / ') >= 0) {
      var parts = s.split(' / ');
      parts.forEach(function (p) {
        if (p.length <= maxChars) lines.push(p);
        else {
          for (var i = 0; i < p.length; i += maxChars) lines.push(p.slice(i, i + maxChars));
        }
      });
      /* 若两行可用，合并为 "A /" + "B" */
      if (lines.length === 2) return [parts[0] + ' /', parts[1]];
      return lines;
    }
    for (var j = 0; j < s.length; j += maxChars) lines.push(s.slice(j, j + maxChars));
    return lines;
  }

  /** 按**像素宽度**折行：中文≈1em、ASCII≈0.55em。
   *  比按字符数更准，保证姓名不会溢出签位框而与右侧比赛框重叠。 */
  function wrapByWidth(name, availPx, fontSize) {
    var s = String(name || '');
    var size = Math.max(6, fontSize || 12);
    function chW(ch) {
      return /[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/.test(ch) ? size : size * 0.55;
    }
    /* 双打优先在斜杠处断 */
    var slash = s.indexOf(' / ');
    if (slash > 0 && s.length > 6) {
      var a = s.slice(0, slash + 2).trim();     /* "A /" */
      var b = s.slice(slash + 3).trim();        /* "B"  */
      if (measure(a, chW) <= availPx || measure(b, chW) <= availPx) {
        return [a, b];
      }
    }
    function measure(t, f) {
      var w = 0;
      for (var i = 0; i < t.length; i++) w += f(t[i]);
      return w;
    }
    var lines = [], cur = '';
    for (var k = 0; k < s.length; k++) {
      var nxt = cur + s[k];
      if (cur && measure(nxt, chW) > availPx) {
        lines.push(cur);
        cur = s[k];
      } else {
        cur = nxt;
      }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [''];
  }

  /**
   * 渲染签表 SVG 字符串。
   * @param {Object} bracket drawKnockout 结果
   * @param {Object} opt {title, subtitle, showHeaders, scale}
   * @returns {{svg:string, width:number, height:number}}
   */
  function renderBracket(bracket, opt) {
    opt = opt || {};
    if (!bracket || !bracket.size) return { svg: '', width: 0, height: 0 };

    var N = bracket.size;
    var rounds = bracket.rounds;
    var R = rounds.length;
    var hasThird = !!bracket.thirdPlace;

    /* ---------- 版面参数（A4 横向 1.414；坐标系用 1684×1190 ≈ 297×210mm @ 144dpi 比例） ---------- */
    var W = 1684, H = 1190;
    var padL = 34, padR = 34, padT = 92, padB = 46;
    var titleH = 0;

    var firstRoundMatches = N / 2;

    /* 行高：首轮每场占一格；列宽按轮次数分配 */
    var usableH = H - padT - padB - (hasThird ? 54 : 0);
    var rowH = usableH / firstRoundMatches;
    /* 关键：一场比赛有 2 名选手，必须各占半格，否则两人会被画到同一 y 上互相覆盖
       （表现为“只能看到几个人”）。因此：
         rowH  = 每场比赛占的高度
         subH  = 每名选手占的高度 = rowH / 2
         boxH  = 签位框高度，必须 < subH 才不会上下压盖 */
    var subH = rowH / 2;
    var boxH = Math.min(46, Math.max(11, subH * 0.82));
    var infoBoxH = Math.min(34, Math.max(14, rowH * 0.52));
    var gapH = rowH - boxH;

    var labelW = 186;               /* 左侧选手名区（加宽以容纳“A1 + 姓名 + [种子]”） */
    var centerW = 196;              /* 每轮“比赛信息”块宽（场次/时间/球台） */
    var usableW = W - padL - padR - labelW;
    var colW = usableW / R;
    var matchBoxW = Math.min(centerW, colW * 0.94);

    /* ---------- 几何：每个首轮位（slot）的纵坐标 ---------- */
    function slotY(slot) {
      /* 第 m 场（0 起）占 [padT+m*rowH, padT+(m+1)*rowH]；
         场内的两名选手分占上/下半格，各自居中。 */
      var m = Math.floor((slot - 1) / 2);
      var half = (slot - 1) % 2;              /* 0 = 上半格，1 = 下半格 */
      return padT + m * rowH + (half === 0 ? subH / 2 : subH + subH / 2);
    }

    /* 第 r 轮（0 起）第 k 场的中线 y：取该场覆盖的首轮中线的中点 */
    function matchY(r, k) {
      var span = Math.pow(2, r);           /* 覆盖的首轮场次数 */
      var firstM = k * span;
      var top = padT + firstM * rowH;
      var bottom = padT + (firstM + span) * rowH;
      return (top + bottom) / 2;
    }

    var parts = [];
    parts.push('<?xml version="1.0" encoding="UTF-8"?>');
    parts.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H +
      '" viewBox="0 0 ' + W + ' ' + H + '" font-family="\'Microsoft YaHei\',\'PingFang SC\',\'Noto Sans CJK SC\',sans-serif">');

    /* 纸张背景 + 细边框 */
    parts.push('<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="' + C.paper + '"/>');
    parts.push('<rect x="0.5" y="0.5" width="' + (W - 1) + '" height="' + (H - 1) +
      '" fill="none" stroke="' + C.paperEdge + '" stroke-width="1"/>');

    /* ---------- 标题区 ----------
       注意纵向节奏：标题 44 / 副标题 64 / 轮次表头 padT-12(=80)。
       副标题（14px）下沿约 67，表头（12px）上沿约 71，留 4px 不重叠。 */
    var title = opt.title || '淘汰赛签表';
    var sub = opt.subtitle || '';
    parts.push('<g>');
    parts.push('<rect x="' + padL + '" y="20" width="6" height="30" rx="3" fill="' + C.acc + '"/>');
    parts.push('<text x="' + (padL + 18) + '" y="44" font-size="26" font-weight="800" fill="' + C.title +
      '" letter-spacing="1">' + esc(title) + '</text>');
    if (sub) {
      parts.push('<text x="' + (padL + 18) + '" y="62" font-size="13.5" fill="' + C.ink3 + '">' +
        esc(sub) + '</text>');
    }
    /* 右上信息 */
    parts.push('<text x="' + (W - padR) + '" y="40" font-size="13" fill="' + C.ink3 + '" text-anchor="end">' +
      esc('签位 ' + N + ' ｜ 出线 ' + bracket.qualifiers.length + ' 人 ｜ 轮空 ' + bracket.byeSlots.length + ' 个') + '</text>');
    parts.push('<text x="' + (W - padR) + '" y="61" font-size="12" fill="' + C.ink3 + '" text-anchor="end">' +
      esc('日期 ________________   场地 ________________') + '</text>');
    parts.push('</g>');

    /* ---------- 轮次表头 ---------- */
    parts.push('<g>');
    for (var r = 0; r < R; r++) {
      var cx = padL + labelW + r * colW + colW / 2;
      parts.push('<text x="' + cx + '" y="' + (padT - 10) + '" font-size="14" font-weight="700" fill="' + C.ink2 +
        '" text-anchor="middle" letter-spacing=".6">' + esc(rounds[r].name) + '</text>');
    }
    /* 左侧“选手 / 组合”表头：与轮次表头同一基线，且避让上方副标题 */
    parts.push('<text x="' + padL + '" y="' + (padT - 10) + '" font-size="12" fill="' + C.ink3 +
      '" letter-spacing=".4">选手 / 组合</text>');
    parts.push('</g>');

    /* ---------- 连接线（树状） ---------- */
    /* 每条线从第 r 轮某场的左侧中点，连到第 r+1 轮对应场的左侧中点 */
    parts.push('<g stroke="' + C.line + '" stroke-width="1.6" fill="none">');
    for (var r2 = 0; r2 < R; r2++) {
      var mcount = rounds[r2].count;
      for (var k2 = 0; k2 < mcount; k2++) {
        /* 每场右侧 → 下一轮某场左侧 */
        if (r2 + 1 >= R) continue;
        var y1 = matchY(r2, k2);
        var nextK = Math.floor(k2 / 2);
        var y2 = matchY(r2 + 1, nextK);
        var x1 = padL + labelW + r2 * colW + matchBoxW;   /* 本场右边缘 */
        var x2 = padL + labelW + (r2 + 1) * colW;         /* 下一场左边缘 */
        var xm = x1 + (x2 - x1) / 2;
        parts.push('<path d="M' + x1 + ' ' + y1 + ' H' + xm + ' V' + y2 + ' H' + x2 + '"/>');
      }
    }
    /* 三四名决赛的虚线引导 */
    if (hasThird) {
      var semiY1 = matchY(R - 1, 0);
      var semiY2 = matchY(R - 1, 1);
      var tblY = H - padB - 18;
      var tblX = padL + labelW + (R - 1) * colW;
      parts.push('<path d="M' + (tblX - 8) + ' ' + semiY1 + ' H' + (tblX - 26) + ' V' + tblY +
        ' H' + tblX + '" stroke-dasharray="5 4" stroke="' + C.lineSoft + '"/>');
      parts.push('<path d="M' + (tblX - 8) + ' ' + semiY2 + ' H' + (tblX - 26) + ' V' + tblY +
        ' H' + tblX + '" stroke-dasharray="5 4" stroke="' + C.lineSoft + '"/>');
    }
    parts.push('</g>');

    /* ---------- 首轮签位（选手框） ---------- */
    parts.push('<g>');
    for (var s = 1; s <= N; s++) {
      var y = slotY(s);
      var c = bracket.slots[s];
      var isBye = c && c.kind === 'bye';
      var isQual = c && c.kind === 'qual';
      var label = '';
      var seedTxt = '';
      var tag = '';
      if (isQual) {
        label = c.qual.name;
        tag = c.qual.label;                       /* A1、B2 … */
        if (c.qual.seedRank != null) seedTxt = '[' + c.qual.seedRank + ']';
      } else if (isBye) {
        label = '轮空';
      } else {
        label = '待定';
      }

      var x = padL + 8;
      var boxW = labelW - 16;
      var top = y - boxH / 2;

      /* 框体 */
      parts.push('<rect x="' + x + '" y="' + top + '" width="' + boxW + '" height="' + boxH +
        '" rx="5" fill="' + (isBye ? C.byeSoft : (isQual ? '#fff' : C.paper2 || C.paperEdge)) +
        '" stroke="' + (isBye ? C.lineSoft : C.line) + '" stroke-width="1.1"/>');

      /* 左侧色条：种子橙色、普通蓝色、轮空灰 */
      parts.push('<rect x="' + x + '" y="' + top + '" width="4" height="' + boxH + '" rx="2" fill="' +
        (isBye ? C.bye : (isQual && c.qual.seedRank != null ? C.acc : '#9aa7bd')) + '"/>');

      /* 出线代号（A1 / B2 …） */
      if (tag) {
        parts.push('<text x="' + (x + 10) + '" y="' + (y + 4.2) + '" font-size="11" font-weight="800" fill="' +
          (c.qual.seedRank != null ? C.acc : C.ink3) + '">' + esc(tag) + '</text>');
      }

      /* 姓名：实际可用宽度 = 框宽 - 左内边距 - 代号宽 - 右侧种子徽标宽 - 余量。
         字号随框高缩放，换行按像素宽度估算（中文≈1em，ASCII≈0.55em），
         确保姓名绝不越出框外与比赛信息框重叠。 */
      var seedW = seedTxt ? 30 : 0;
      var tagW = tag ? (tag.length * 6.2 + 4) : 0;
      var namePadL = 10 + tagW;
      var nameAvail = Math.max(28, boxW - namePadL - seedW - 6);
      var fs = Math.max(8.5, Math.min(13, boxH * 0.5));

      var nameLines = wrapByWidth(label, nameAvail, fs);
      if (nameLines.length > 1 && boxH >= 34) fs = Math.max(8, fs - 1.5);

      var nameX = x + namePadL;

      if (isBye) {
        parts.push('<text x="' + nameX + '" y="' + (y + fs * 0.36) + '" font-size="' + fs +
          '" font-weight="700" fill="' + C.bye + '" letter-spacing="1">轮空</text>');
      } else {
        var maxLines = boxH >= 34 ? 2 : 1;
        nameLines.slice(0, maxLines).forEach(function (ln, li) {
          var dy = nameLines.length > 1
            ? (li === 0 ? -fs * 0.52 : fs * 0.62)
            : 0;
          parts.push('<text x="' + nameX + '" y="' + (y + fs * 0.36 + dy) + '" font-size="' + fs +
            '" font-weight="600" fill="' + (isQual ? C.ink : C.ink3) + '">' + esc(ln) + '</text>');
        });
      }
      /* 种子序徽标（右下角，右对齐到框内边距） */
      if (seedTxt) {
        parts.push('<text x="' + (x + boxW - 7) + '" y="' + (y + 4) + '" font-size="10" fill="' +
          C.acc + '" text-anchor="end" font-weight="700">' + esc(seedTxt) + '</text>');
      }
    }
    parts.push('</g>');

    /* ---------- 每轮比赛信息块（场次号 / 时间 / 球台） ---------- */
    function matchLabel(m) {
      /* 场次号必须始终保留（含轮空场），轮空另加说明 */
      return '第 ' + m.no + ' 场';
    }

    for (var r3 = 0; r3 < R; r3++) {
      var mcount2 = rounds[r3].count;
      var mw = Math.min(matchBoxW, colW - 14);
      for (var k3 = 0; k3 < mcount2; k3++) {
        var m2 = rounds[r3].matches[k3];
        var yb = matchY(r3, k3);
        var xb = padL + labelW + r3 * colW + (colW - mw) / 2;
        var bh = infoBoxH;    /* 受行距约束，绝不超过 rowH，避免与相邻场次压盖 */
        var byTop = yb - bh / 2;

        parts.push('<g>');
        parts.push('<rect x="' + xb + '" y="' + byTop + '" width="' + mw + '" height="' + bh +
          '" rx="5" fill="#fff" stroke="' + (m2.bye ? C.lineSoft : C.line) + '" stroke-width="1.1" ' +
          (m2.bye ? 'stroke-dasharray="4 3"' : '') + '/>');

        /* 字号随框高缩放，确保文字始终落在框内（大签表框变矮时不会溢出压盖） */
        var fs1 = Math.max(7.2, Math.min(10.5, bh * 0.42));
        var fs2 = Math.max(6.2, Math.min(9.5, bh * 0.34));
        var twoLine = bh >= 26;                 /* 只有够高时才画第二行 */

        /* 场次号（左上，垂直居中；两行时偏上） */
        var ty1 = twoLine ? byTop + fs1 * 1.35 : byTop + bh / 2 + fs1 * 0.36;
        parts.push('<text x="' + (xb + 7) + '" y="' + ty1 + '" font-size="' + fs1 + '" font-weight="800" fill="' +
          (m2.bye ? C.bye : C.ink2) + '">' + esc(matchLabel(m2)) + '</text>');

        if (twoLine) {
          parts.push('<text x="' + (xb + 7) + '" y="' + (byTop + bh - fs2 * 0.9) + '" font-size="' + fs2 +
            '" fill="' + C.ink3 + '">时间 ______　球台 ___</text>');
        }

        if (m2.bye) {
          if (bh >= 26) {
            parts.push('<text x="' + (xb + mw - 7) + '" y="' + ty1 + '" font-size="' + (fs1 - 1) + '" fill="' +
              C.bye + '" text-anchor="end">轮空·免赛晋级</text>');
          }
        } else {
          parts.push('<text x="' + (xb + mw - 6) + '" y="' + ty1 + '" font-size="' + (fs1 - 0.5) + '" fill="' +
            C.ink3 + '" text-anchor="end">▶</text>');
        }
        parts.push('</g>');

        /* 首轮轮空场：在框内不便再叠字，改为记入图例（避免文字压盖） */
      }
    }

    /* ---------- 决赛冠军栏 ---------- */
    var champX = padL + labelW + (R - 1) * colW + colW / 2;
    var champY = padT - 40;
    parts.push('<g>');
    parts.push('<rect x="' + (W - padR - 210) + '" y="' + (H - padB - 4) + '" width="210" height="34" rx="6" ' +
      'fill="' + C.accSoft + '" stroke="' + C.acc + '" stroke-width="1" opacity=".95"/>');
    parts.push('<text x="' + (W - padR - 198) + '" y="' + (H - padB + 19) + '" font-size="12.5" font-weight="800" fill="' +
      C.acc + '">冠军：____________________</text>');
    parts.push('</g>');

    /* ---------- 三四名决赛 ---------- */
    if (hasThird) {
      var tp = bracket.thirdPlace;
      var ty = H - padB - 16;
      var tx = padL + labelW + (R - 1) * colW + colW / 2 - 90;
      parts.push('<g>');
      parts.push('<rect x="' + tx + '" y="' + (ty - 17) + '" width="250" height="34" rx="5" fill="#fff" ' +
        'stroke="' + C.line + '" stroke-width="1.1" stroke-dasharray="4 3"/>');
      parts.push('<text x="' + (tx + 9) + '" y="' + (ty + 3) + '" font-size="11.5" font-weight="800" fill="' +
        C.ink2 + '">三四名决赛 · 第 ' + tp.no + ' 场</text>');
      parts.push('<text x="' + (tx + 9) + '" y="' + (ty + 13) + '" font-size="9.5" fill="' + C.ink3 +
        '">时间 ________　球台 ____</text>');
      parts.push('<text x="' + (tx + 232) + '" y="' + (ty + 3) + '" font-size="10" fill="' + C.ink3 +
        '" text-anchor="end">两场半决赛负者</text>');
      parts.push('</g>');
    }

    /* ---------- 页脚说明 ---------- */
    parts.push('<g>');
    parts.push('<text x="' + padL + '" y="' + (H - 14) + '" font-size="10.5" fill="' + C.ink3 + '">' +
      esc('图例：橙色左条 = 种子 ｜ 虚线框 = 轮空（免赛晋级） ｜ 时间与球台留空待填') + '</text>');
    parts.push('<text x="' + (W - padR) + '" y="' + (H - 14) + '" font-size="10.5" fill="' + C.ink3 +
      '" text-anchor="end">' + esc(opt.footer || '') + '</text>');
    parts.push('</g>');

    parts.push('</svg>');

    return { svg: parts.join('\n'), width: W, height: H };
  }

  /**
   * 挂载到 DOM 容器（可指定缩放以适应宽度）
   */
  function mount(container, bracket, opt) {
    opt = opt || {};
    if (!container) return;
    var out = renderBracket(bracket, opt);
    container.innerHTML = out.svg;
    var svg = container.querySelector('svg');
    if (svg) {
      svg.style.width = '100%';
      svg.style.height = 'auto';
      svg.style.maxWidth = (opt.maxWidth || out.width) + 'px';
    }
  }

  TT.Bracket = { renderBracket: renderBracket, mount: mount, wrapName: wrapName, colors: C };

})(typeof globalThis !== 'undefined' ? globalThis : this);
