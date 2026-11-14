import { sitePath } from '../lib/router.js';
import { el } from '../lib/dom.js';

export function createNavigation(site, activePath) {
  const header = el('header', { class: 'site-header' });
  const container = el('div', { class: 'container' });
  const nav = el('nav', {
    class: 'site-nav',
    'aria-label': '主导航',
    dataset: { open: 'false' },
  });

  const brand = el(
    'a',
    {
      class: 'nav__brand',
      href: sitePath(''),
      'aria-label': `${site.site.name} 首页`,
    },
    [
      el('img', {
        class: 'nav__logo',
        src: sitePath(site.site.logo),
        alt: '',
        width: '40',
        height: '40',
      }),
      el('span', { class: 'nav__brand-name', text: site.site.name }),
    ],
  );

  const links = el('div', { class: 'nav__links', id: 'primary-navigation' });
  site.navigation.forEach((item) => {
    const target = String(item.path || '');
    const isHome = target === '';
    const active = isHome
      ? activePath === '' || activePath === 'homepage/'
      : activePath === target || activePath.startsWith(target);
    links.append(
      el('a', {
        class: 'nav__link',
        href: sitePath(target),
        text: item.label,
        'aria-current': active ? 'page' : null,
      }),
    );
  });

  const toggle = el(
    'button',
    {
      class: 'nav__toggle',
      type: 'button',
      'aria-expanded': 'false',
      'aria-controls': 'primary-navigation',
      'aria-label': '打开导航菜单',
    },
    [
      el('span', { class: 'nav__toggle-bar' }),
      el('span', { class: 'nav__toggle-bar' }),
      el('span', { class: 'nav__toggle-bar' }),
    ],
  );

  const setOpen = (open) => {
    nav.dataset.open = String(open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? '关闭导航菜单' : '打开导航菜单');
  };

  toggle.addEventListener('click', () => setOpen(nav.dataset.open !== 'true'));
  links.addEventListener('click', (event) => {
    if (event.target.closest('a')) setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && nav.dataset.open === 'true') {
      setOpen(false);
      toggle.focus();
    }
  });
  document.addEventListener('click', (event) => {
    if (nav.dataset.open === 'true' && !nav.contains(event.target)) setOpen(false);
  });

  nav.append(brand, links, toggle);
  container.append(nav);
  header.append(container);
  return header;
}
