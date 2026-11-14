import { el } from '../lib/dom.js';

/**
 * 可访问的 tab 组件。page 负责根据 onChange 切换面板。
 * @param {object} options
 * @param {Array<{id:string,label:string,controls?:string}>} options.items
 * @param {string} options.initial
 * @param {(id:string)=>void} [options.onChange]
 * @param {'tab'|'subtab'} [options.variant]
 * @param {string} [options.label]
 */
export function createTabs({
  items,
  initial,
  onChange,
  variant = 'tab',
  label = '内容切换',
}) {
  const wrapper = el('div', {
    class: variant === 'subtab' ? 'subtabbar' : 'tabbar',
    role: 'tablist',
    'aria-label': label,
  });
  const buttons = new Map();
  let current = initial || items[0]?.id;

  function activate(id, { focus = false, notify = true } = {}) {
    if (!buttons.has(id)) return;
    current = id;
    buttons.forEach((button, key) => {
      const selected = key === id;
      button.setAttribute('aria-selected', selected ? 'true' : 'false');
      button.tabIndex = selected ? 0 : -1;
      if (selected && focus) button.focus();
    });
    if (notify) onChange?.(id);
  }

  items.forEach((item, index) => {
    const button = el('button', {
      type: 'button',
      class: variant === 'subtab' ? 'subtab' : 'tab',
      role: 'tab',
      id: `tab-${item.id}`,
      'aria-selected': item.id === current ? 'true' : 'false',
      'aria-controls': item.controls || '',
      tabIndex: item.id === current ? 0 : -1,
      text: item.label,
    });
    button.addEventListener('click', () => activate(item.id));
    button.addEventListener('keydown', (event) => {
      const last = items.length - 1;
      let next = null;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        next = items[(index + 1) % items.length];
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        next = items[(index - 1 + items.length) % items.length];
      } else if (event.key === 'Home') {
        next = items[0];
      } else if (event.key === 'End') {
        next = items[last];
      }
      if (next) {
        event.preventDefault();
        activate(next.id, { focus: true });
      }
    });
    buttons.set(item.id, button);
    wrapper.append(button);
  });

  return {
    element: wrapper,
    activate,
    get current() {
      return current;
    },
    buttons,
  };
}
