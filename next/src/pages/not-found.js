import { mountShell, setPageTitle } from '../components/layout.js';
import { el } from '../lib/dom.js';
import { sitePath } from '../lib/router.js';

function renderNotFound(container) {
  setPageTitle('页面未找到');
  container.replaceChildren(
    el('section', { class: 'notfound' }, [
      el('p', { class: 'eyebrow', text: '404' }),
      el('div', { class: 'notfound__code', text: '404' }),
      el('h1', { text: '这一球出界了' }),
      el('p', { class: 'lead', text: '你访问的页面不存在，可能已经移动或尚未发布。' }),
      el('div', { class: 'cluster mt-4' }, [
        el('a', { class: 'btn', href: sitePath(''), text: '返回首页' }),
        el('a', { class: 'btn btn--secondary', href: sitePath('events/'), text: '浏览赛事' }),
      ]),
    ]),
  );
}

const { container } = mountShell({ activePath: '' });
renderNotFound(container);
