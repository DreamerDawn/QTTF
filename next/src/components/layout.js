import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/components.css';
import '../styles/pages.css';

import { site } from '../lib/data.js';
import { currentPath, sitePath } from '../lib/router.js';
import { el } from '../lib/dom.js';
import { createNavigation } from './nav.js';
import { createFooter } from './footer.js';

function ensureFavicon() {
  let icon = document.querySelector('link[rel="icon"]');
  if (!icon) {
    icon = document.createElement('link');
    icon.rel = 'icon';
    document.head.append(icon);
  }
  icon.href = sitePath(site.site.logo);
}

/**
 * 所有页面共享的壳：跳转链接 + 导航 + main + 页脚。
 * 页面只负责往 container 内渲染内容。
 * `footerExtras` 可向页脚追加元素（如首页的累计访问量）。
 */
export function mountShell({ activePath = currentPath(), pageClass = '', footerExtras = null } = {}) {
  const root = document.getElementById('app');
  if (!root) throw new Error('Missing #app mount element');

  document.body.classList.add('site-body');
  ensureFavicon();
  const skip = el('a', {
    class: 'skip-link',
    href: '#main-content',
    text: '跳到主要内容',
  });
  const header = createNavigation(site, activePath);
  const main = el('main', {
    id: 'main-content',
    class: `page-shell ${pageClass}`.trim(),
    tabindex: '-1',
  });
  const container = el('div', { class: 'container' });
  const footer = createFooter(site);
  if (footerExtras) {
    // 放进页脚容器，与导航、正文共用同一套左右栅格
    footer.append(el('div', { class: 'container site-footer__extras' }, [footerExtras]));
  }

  main.append(container);
  root.replaceChildren(skip, header, main, footer);
  return { root, main, container, header, footer };
}

export function setPageTitle(title) {
  document.title = title ? `${title} - QTTF` : 'QTTF - 丘班乒乓球联合会';
}
