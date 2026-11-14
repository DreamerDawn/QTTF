const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(name, attrs = {}) {
  const node = document.createElementNS(SVG_NS, name);
  Object.entries(attrs).forEach(([key, value]) => {
    if (value !== null && value !== undefined) node.setAttribute(key, String(value));
  });
  return node;
}

/**
 * Draw one game's cumulative score progression.
 * @param {object} analysis result from analyzeGame
 * @param {{labelA:string,labelB:string,title:string,target?:number}} options
 */
export function createScoreChart(analysis, options) {
  const labelA = options.labelA || 'A';
  const labelB = options.labelB || 'B';
  const target = options.target || 11;
  const width = 620;
  const height = 250;
  const pad = { left: 38, right: 16, top: 34, bottom: 34 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const ledger = analysis?.ledger || [];
  const maxY = Math.max(target, ...ledger.map((point) => Math.max(point.cumA, point.cumB)), 1);
  const n = ledger.length;
  const slots = Math.max(1, n);

  const svg = svgEl('svg', {
    viewBox: `0 0 ${width} ${height}`,
    class: 'score-chart',
    role: 'img',
    'aria-label': options.title || '比分走势图',
  });

  const px = (index) => pad.left + (index / slots) * innerWidth;
  const py = (value) => pad.top + innerHeight - (value / maxY) * innerHeight;

  for (let step = 0; step <= 5; step += 1) {
    const value = Math.round((maxY / 5) * step);
    const y = py(value);
    svg.append(
      svgEl('line', {
        x1: pad.left,
        y1: y,
        x2: width - pad.right,
        y2: y,
        class: 'score-chart__grid',
      }),
      svgEl('text', {
        x: pad.left - 8,
        y: y + 3.5,
        class: 'score-chart__tick',
        'text-anchor': 'end',
      }),
    );
    svg.lastChild.textContent = String(value);
  }

  if (target <= maxY) {
    svg.append(
      svgEl('line', {
        x1: pad.left,
        y1: py(target),
        x2: width - pad.right,
        y2: py(target),
        class: 'score-chart__target',
      }),
      svgEl('text', {
        x: width - pad.right,
        y: py(target) - 5,
        class: 'score-chart__tick',
        'text-anchor': 'end',
      }),
    );
    svg.lastChild.textContent = `目标分 ${target}`;
  }

  svg.append(
    svgEl('line', {
      x1: pad.left,
      y1: pad.top,
      x2: pad.left,
      y2: pad.top + innerHeight,
      class: 'score-chart__axis',
    }),
    svgEl('line', {
      x1: pad.left,
      y1: pad.top + innerHeight,
      x2: width - pad.right,
      y2: pad.top + innerHeight,
      class: 'score-chart__axis',
    }),
  );

  const xTicks = Math.min(6, Math.max(1, n + 1));
  for (let index = 0; index < xTicks; index += 1) {
    const ball = xTicks === 1 ? n : Math.round((index / (xTicks - 1)) * n);
    const text = svgEl('text', {
      x: px(ball),
      y: height - 12,
      class: 'score-chart__tick',
      'text-anchor': 'middle',
    });
    text.textContent = String(ball);
    svg.append(text);
  }

  const xLabel = svgEl('text', {
    x: pad.left + innerWidth / 2,
    y: height - 1,
    class: 'score-chart__axis-label',
    'text-anchor': 'middle',
  });
  xLabel.textContent = '球序号';
  svg.append(xLabel);

  ['A', 'B'].forEach((side) => {
    const color = side === 'A' ? 'var(--chart-a)' : 'var(--chart-b)';
    const points = [[px(0), py(0)]];
    ledger.forEach((point) => {
      points.push([px(point.n), py(side === 'A' ? point.cumA : point.cumB)]);
    });
    const path = points
      .map((point, index) => `${index === 0 ? 'M' : 'L'}${point[0].toFixed(1)} ${point[1].toFixed(1)}`)
      .join(' ');
    svg.append(
      svgEl('path', {
        d: path,
        class: 'score-chart__line',
        stroke: color,
      }),
    );
    ledger.forEach((point) => {
      svg.append(
        svgEl('circle', {
          cx: px(point.n),
          cy: py(side === 'A' ? point.cumA : point.cumB),
          r: 2.3,
          fill: 'var(--surface)',
          stroke: color,
          'stroke-width': 1.5,
        }),
      );
    });
  });

  const legend = [
    ['A', labelA],
    ['B', labelB],
  ];
  let legendX = pad.left;
  legend.forEach(([side, label]) => {
    svg.append(
      svgEl('rect', {
        x: legendX,
        y: 14,
        width: 10,
        height: 10,
        rx: 2,
        fill: side === 'A' ? 'var(--chart-a)' : 'var(--chart-b)',
      }),
    );
    const text = svgEl('text', { x: legendX + 15, y: 23, class: 'score-chart__legend' });
    text.textContent = label;
    svg.append(text);
    legendX += Math.min(220, 26 + label.length * 11);
  });

  const title = svgEl('text', {
    x: width - pad.right,
    y: 23,
    class: 'score-chart__legend',
    'text-anchor': 'end',
  });
  title.textContent = n ? `${analysis?.balls || n} 球` : '暂无逐球记录';
  svg.append(title);

  if (!n) {
    const empty = svgEl('text', {
      x: width / 2,
      y: height / 2,
      class: 'score-chart__empty',
      'text-anchor': 'middle',
    });
    empty.textContent = '该局暂无逐球记录';
    svg.append(empty);
  }

  return svg;
}
