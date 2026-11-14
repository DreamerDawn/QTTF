import { el } from '../lib/dom.js';
import { formatForm, formatMovement, formatScore, statusLabel, statusVariant } from '../lib/format.js';

export function createBadge(text, variant = 'empty', extraClass = '') {
  return el('span', {
    class: `badge badge--${variant}${extraClass ? ` ${extraClass}` : ''}`,
    text,
  });
}

export function createScoreBadge(score) {
  return createBadge(formatScore(score), score ? 'info' : 'empty');
}

export function createStatusBadge(status) {
  const key = String(status || 'unknown').toLowerCase();
  const variant = statusVariant(key);
  const extra = key === 'completed' || key === 'scheduled' ? '' : 'badge--status';
  return createBadge(statusLabel(key), variant, extra);
}

export function createMovementBadge(movement) {
  const result = formatMovement(movement);
  return el('span', {
    class: `movement movement--${result.tone}`,
    text: result.text,
    title: result.tone === 'none' ? '排名无变化' : '相较上期排名变化',
  });
}

export function createFormBadges(lastN, formLength = 3) {
  const results = Array.isArray(lastN) ? lastN : [];
  const length = Math.max(formLength || 0, results.length, 3);
  const wrapper = el('div', {
    class: 'form-badges',
    role: 'img',
    'aria-label': `最近 ${length} 场战绩`,
  });
  for (let index = 0; index < length; index += 1) {
    const result = formatForm(results[index]);
    wrapper.append(
      el('span', {
        class: `badge badge--${result.tone}`,
        text: result.text,
        title: result.label,
      }),
    );
  }
  return wrapper;
}
