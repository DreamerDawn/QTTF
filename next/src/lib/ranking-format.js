/**
 * Ranking presentation helpers. Kept free of DOM so they are easy to test.
 */

export function categoryForEvent(eventName) {
  const name = String(eventName || '').trim();
  if (/^xtc/i.test(name)) return 'XTC';
  if (/league/i.test(name)) return 'LEAGUE';
  if (/qttc|qtf|championship/i.test(name)) return 'QTTF';
  return 'QTTF';
}

export function categoryClass(eventName) {
  return categoryForEvent(eventName).toLowerCase();
}

export function isDnpPosition(position) {
  return String(position || '').toUpperCase() === 'DNP';
}

export function historyPointsLabel(points) {
  return points === null || points === undefined ? '—' : String(points);
}
