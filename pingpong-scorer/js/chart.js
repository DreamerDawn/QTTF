/*!
 * chart.js —— SVG 自绘单局双折线图（无外部库）
 * 渲染每个已完成（或进行中）局的“双方累计比分走势”：X = 球序号，Y = 累计得分。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PPChart = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var COLOR = { A: '#2563eb', B: '#dc2626' };
  var OTHER = { A: 'B', B: 'A' };

  function el(name, attrs) {
    var e = document.createElementNS(NS, name);
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }

  /**
   * 构造 SVG 元素（不插入文档）。
   * @param {Object} analysis stats.analyzeGame 的结果
   * @param {Object} opts {labelA, labelB, target, title}
   */
  function renderGameChart(analysis, opts) {
    opts = opts || {};
    var labelA = opts.labelA || 'A';
    var labelB = opts.labelB || 'B';
    var target = opts.target || 11;

    var W = 560, H = 220;
    var padL = 34, padR = 14, padT = 26, padB = 30;
    var innerW = W - padL - padR;
    var innerH = H - padT - padB;

    var svg = el('svg', {
      viewBox: '0 0 ' + W + ' ' + H,
      width: '100%',
      height: '220',
      class: 'chart',
      role: 'img',
      'aria-label': (opts.title || '单局比分走势')
    });

    var ledger = (analysis && analysis.ledger) || [];
    var maxY = target;
    ledger.forEach(function (p) {
      maxY = Math.max(maxY, p.cumA, p.cumB);
    });
    maxY = Math.min(99, Math.max(1, maxY));
    var n = ledger.length;

    /* X 轴按 n+1 个槽位（0 = 球序号 0 的起点），使第 1 球与起点各占一个位置 */
    var slots = Math.max(1, n);
    function px(i) { return padL + (i / slots) * innerW; }
    function py(v) { return padT + innerH - (v / maxY) * innerH; }

    /* 网格 + Y 轴刻度 */
    var ySteps = Math.min(6, maxY);
    for (var s = 0; s <= ySteps; s++) {
      var v = Math.round((maxY / ySteps) * s);
      var y = py(v);
      svg.appendChild(el('line', { x1: padL, y1: y, x2: W - padR, y2: y, stroke: '#eceff3', 'stroke-width': 1 }));
      var ty = el('text', { x: padL - 6, y: y + 3.5, 'text-anchor': 'end', class: 'chart-tick' });
      ty.textContent = String(v);
      svg.appendChild(ty);
    }
    /* 目标分参考线 */
    if (target <= maxY) {
      svg.appendChild(el('line', {
        x1: padL, y1: py(target), x2: W - padR, y2: py(target),
        stroke: '#94a3b8', 'stroke-width': 1, 'stroke-dasharray': '4 4'
      }));
      var tl = el('text', { x: W - padR, y: py(target) - 4, 'text-anchor': 'end', class: 'chart-tick' });
      tl.textContent = '目标分 ' + target;
      svg.appendChild(tl);
    }
    /* 坐标轴 */
    svg.appendChild(el('line', { x1: padL, y1: padT, x2: padL, y2: padT + innerH, stroke: '#cbd5e1' }));
    svg.appendChild(el('line', { x1: padL, y1: padT + innerH, x2: W - padR, y2: padT + innerH, stroke: '#cbd5e1' }));

    /* X 轴刻度（球序号，最多 6 个；球序号 i 位于 px(i)） */
    var xTicks = Math.min(6, Math.max(1, n + 1));
    for (var xi = 0; xi < xTicks; xi++) {
      var num = xTicks === 1 ? n : Math.round((xi / (xTicks - 1)) * n);
      var x = px(num);
      var xt = el('text', { x: x, y: H - 10, 'text-anchor': 'middle', class: 'chart-tick' });
      xt.textContent = String(num);
      svg.appendChild(xt);
    }
    var xlab = el('text', { x: padL + innerW / 2, y: H - 1, 'text-anchor': 'middle', class: 'chart-axis-label' });
    xlab.textContent = '球序号';
    svg.appendChild(xlab);

    /* 折线（含球序号 0 的 0:0 起点） */
    ['A', 'B'].forEach(function (side) {
      var pts = [[px(0), py(0)]];
      ledger.forEach(function (p, i) {
        pts.push([px(p.n), py(side === 'A' ? p.cumA : p.cumB)]);
      });
      var d = pts.map(function (pt, i) { return (i ? 'L' : 'M') + pt[0].toFixed(1) + ' ' + pt[1].toFixed(1); }).join(' ');
      svg.appendChild(el('path', { d: d, fill: 'none', stroke: COLOR[side], 'stroke-width': 2.2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      ledger.forEach(function (p) {
        svg.appendChild(el('circle', {
          cx: px(p.n), cy: py(side === 'A' ? p.cumA : p.cumB), r: 2.4,
          fill: '#fff', stroke: COLOR[side], 'stroke-width': 1.6
        }));
      });
    });

    /* 图例 */
    var legendY = 14;
    var legendX = padL;
    [['A', labelA], ['B', labelB]].forEach(function (pair) {
      svg.appendChild(el('rect', { x: legendX, y: legendY - 8, width: 10, height: 10, rx: 2, fill: COLOR[pair[0]] }));
      var t = el('text', { x: legendX + 14, y: legendY + 1, class: 'chart-legend' });
      t.textContent = pair[1];
      svg.appendChild(t);
      legendX += 22 + String(pair[1]).length * 8;
    });
    var total = el('text', { x: W - padR, y: legendY + 1, 'text-anchor': 'end', class: 'chart-legend' });
    total.textContent = n ? (n + ' 球') : '暂无逐球记录';
    svg.appendChild(total);

    return svg;
  }

  /** 挂载：清空容器后插入图表；无数据时显示占位文本 */
  function mount(container, analysis, opts) {
    if (!container) return;
    container.innerHTML = '';
    if (!analysis || !analysis.ledger || !analysis.ledger.length) {
      var ph = document.createElement('div');
      ph.className = 'chart-empty';
      ph.textContent = '该局暂无逐球记录';
      container.appendChild(ph);
      return;
    }
    container.appendChild(renderGameChart(analysis, opts));
  }

  return { renderGameChart: renderGameChart, mount: mount, COLOR: COLOR, OTHER: OTHER };
});