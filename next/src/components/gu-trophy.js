const SVG_NS = 'http://www.w3.org/2000/svg';
const NS = 'http://www.w3.org/2000/svg';

/**
 * 33-point profile from the supplied Gu (觚) reference.
 * t = 0 at the mouth, 1 at the foot; r = half-width / mouth radius.
 */
const PROFILE = [
  [0.0, 1.0],
  [0.016, 0.974],
  [0.04, 0.916],
  [0.072, 0.842],
  [0.11, 0.758],
  [0.158, 0.668],
  [0.212, 0.58],
  [0.266, 0.502],
  [0.32, 0.438],
  [0.372, 0.386],
  [0.42, 0.348],
  [0.462, 0.324],
  [0.496, 0.312],
  [0.516, 0.331],
  [0.534, 0.366],
  [0.556, 0.384],
  [0.584, 0.394],
  [0.614, 0.396],
  [0.65, 0.387],
  [0.682, 0.369],
  [0.704, 0.349],
  [0.72, 0.323],
  [0.736, 0.3],
  [0.754, 0.29],
  [0.774, 0.304],
  [0.8, 0.342],
  [0.832, 0.396],
  [0.866, 0.448],
  [0.9, 0.494],
  [0.934, 0.536],
  [0.964, 0.564],
  [0.984, 0.576],
  [1.0, 0.582],
];

let guCounter = 0;

function svgEl(name, attrs = {}) {
  const node = document.createElementNS(NS, name);
  Object.entries(attrs).forEach(([key, value]) => {
    if (value !== null && value !== undefined) node.setAttribute(key, String(value));
  });
  return node;
}

function pointAt(t, r, cx, top, vh, radius) {
  return { x: cx + r * radius, y: top + t * vh };
}

function cubicContour(points) {
  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C ${c1.x.toFixed(2)} ${c1.y.toFixed(2)}, ${c2.x.toFixed(2)} ${c2.y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

function rimArc(cx, top, rx, ry, start, end) {
  const a1 = (start * Math.PI) / 180;
  const a2 = (end * Math.PI) / 180;
  const x1 = cx + Math.cos(a1) * rx;
  const y1 = top + Math.sin(a1) * ry;
  const x2 = cx + Math.cos(a2) * rx;
  const y2 = top + Math.sin(a2) * ry;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${rx.toFixed(2)} ${ry.toFixed(2)} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

/**
 * Build the Gu silhouette as a single SVG. The slot is a mask (not a white line)
 * so the background/lighting remains visible through the cut.
 *
 * @param {{cx?:number, top?:number, vh?:number, r?:number, className?:string}} options
 */
export function createGuTrophy(options = {}) {
  const r = options.r ?? 205;
  const vh = options.vh ?? r * 3.94;
  const cx = options.cx ?? 300;
  const top = options.top ?? 58;
  const id = `gu-trophy-${++guCounter}`;
  const viewBoxWidth = 600;
  const viewBoxHeight = Math.ceil(top + vh + 90);
  const svg = svgEl('svg', {
    viewBox: `0 0 ${viewBoxWidth} ${viewBoxHeight}`,
    class: options.className || 'gu-trophy',
    role: 'img',
    'aria-label': '觚形奖杯',
  });

  const right = PROFILE.map(([t, rv]) => pointAt(t, rv, cx, top, vh, r));
  const left = PROFILE.map(([t, rv]) => pointAt(t, -rv, cx, top, vh, r));
  const leftReverse = [...left].reverse();
  const mainPath = `${cubicContour(right)} L ${leftReverse[0].x.toFixed(2)} ${leftReverse[0].y.toFixed(2)} ${cubicContour(leftReverse).replace(/^M [^ ]+ [^ ]+/, '')} Z`;

  const defs = svgEl('defs');
  const mask = svgEl('mask', {
    id: `${id}-slot`,
    maskUnits: 'userSpaceOnUse',
    x: '0',
    y: '0',
    width: String(viewBoxWidth),
    height: String(viewBoxHeight),
  });
  mask.append(svgEl('rect', { x: '0', y: '0', width: String(viewBoxWidth), height: String(viewBoxHeight), fill: 'white' }));
  mask.append(
    svgEl('rect', {
      x: cx - r * 0.01,
      y: top + vh * 0.03,
      width: r * 0.02,
      height: vh * 0.95,
      fill: 'black',
    }),
  );
  defs.append(mask);

  const clip = svgEl('clipPath', { id: `${id}-clip` });
  clip.append(svgEl('path', { d: mainPath }));
  defs.append(clip);

  const blur = svgEl('filter', { id: `${id}-blur`, x: '-30%', y: '-30%', width: '160%', height: '160%' });
  blur.append(svgEl('feGaussianBlur', { stdDeviation: String(r * 0.25) }));
  defs.append(blur);
  svg.append(defs);

  const silhouette = svgEl('g', { mask: `url(#${id}-slot)` });
  silhouette.append(svgEl('path', { d: mainPath, class: 'gu-trophy__body' }));
  silhouette.append(
    svgEl('ellipse', {
      cx: String(cx),
      cy: String(top),
      rx: String(r),
      ry: String(r * 0.066),
      class: 'gu-trophy__body',
    }),
  );
  svg.append(silhouette);

  const volume = svgEl('ellipse', {
    cx: String(cx - r * 0.45),
    cy: String(top + vh * 0.23),
    rx: String(r * 0.55),
    ry: String(vh * 0.23),
    class: 'gu-trophy__volume',
    filter: `url(#${id}-blur)`,
    'clip-path': `url(#${id}-clip)`,
  });
  svg.append(volume);

  svg.append(
    svgEl('path', {
      d: rimArc(cx, top, r, r * 0.066, 196, 344),
      class: 'gu-trophy__rim',
    }),
    svgEl('path', {
      d: rimArc(cx, top + vh, r * 0.582, r * 0.042, -30, 8),
      class: 'gu-trophy__foot-line',
    }),
  );

  const lightPoints = PROFILE.filter(([t]) => t >= 0.05 && t <= 0.42).map(([t, rv]) =>
    pointAt(t, -rv + 0.014, cx, top, vh, r),
  );
  svg.append(svgEl('path', { d: cubicContour(lightPoints), class: 'gu-trophy__light' }));

  return svg;
}
