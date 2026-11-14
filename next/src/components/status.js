import { el } from '../lib/dom.js';

export function loadingState(label = '正在加载数据…') {
  const state = el('div', { class: 'state', role: 'status', 'aria-live': 'polite' });
  state.append(
    el('span', { class: 'state__icon', 'aria-hidden': 'true', text: '🏓' }),
    el('p', { class: 'state__title', text: label }),
    el('div', { class: 'skeleton-stack full-width' }, [
      el('div', { class: 'skeleton skeleton--line' }),
      el('div', { class: 'skeleton skeleton--line skeleton--line-short' }),
    ]),
  );
  return state;
}

export function skeletonGrid(count = 4) {
  return el(
    'div',
    { class: 'grid grid--two', 'aria-hidden': 'true' },
    Array.from({ length: count }, () => el('div', { class: 'skeleton skeleton--card' })),
  );
}

export function emptyState({ title = '暂无数据', text = '该部分内容尚未录入。', action } = {}) {
  const state = el('div', { class: 'state', role: 'status' });
  state.append(
    el('span', { class: 'state__icon', 'aria-hidden': 'true', text: '📄' }),
    el('p', { class: 'state__title', text: title }),
    el('p', { class: 'state__text', text }),
  );
  if (action) state.append(action);
  return state;
}

export function errorState(error, onRetry) {
  const state = el('div', { class: 'state state--error', role: 'alert' });
  const message = error instanceof Error ? error.message : String(error || '未知错误');
  state.append(
    el('span', { class: 'state__icon', 'aria-hidden': 'true', text: '!' }),
    el('p', { class: 'state__title', text: '页面加载失败' }),
    el('p', { class: 'state__text', text: `错误信息：${message}` }),
  );
  if (onRetry) {
    state.append(
      el('button', {
        class: 'btn btn--secondary btn--small',
        type: 'button',
        text: '重新加载',
        onclick: () => window.location.reload(),
      }),
    );
  }
  return state;
}

export function setLoading(container, label) {
  container.replaceChildren(loadingState(label));
}

export function setError(container, error, onRetry = true) {
  container.replaceChildren(errorState(error, onRetry ? () => window.location.reload() : null));
}
