import { mountShell, setPageTitle } from '../components/layout.js';
import { el } from '../lib/dom.js';
import { sitePath } from '../lib/router.js';
import { site } from '../lib/data.js';

function contactMethod(icon, label, value, href, external = false) {
  const content = el('div', {}, [
    el('div', { class: 'contact-method__label', text: label }),
    href
      ? el('a', {
          class: 'contact-method__value',
          href,
          target: external ? '_blank' : null,
          rel: external ? 'noopener noreferrer' : null,
          text: value,
        })
      : el('div', { class: 'contact-method__value', text: value }),
  ]);
  return el('div', { class: 'contact-method' }, [
    el('span', { class: 'contact-method__icon', 'aria-hidden': 'true', text: icon }),
    content,
  ]);
}

function renderContact(container) {
  setPageTitle('联系我们');
  const intro = el('section', { class: 'page-intro' }, [
    el('p', { class: 'eyebrow', text: 'Contact' }),
    el('h1', { text: '联系我们' }),
    el('p', { text: site.contact.note }),
  ]);

  const methods = el('section', { class: 'card contact-card' }, [
    el('h2', { class: 'card__title', text: '联系方式' }),
    contactMethod('✉', '邮箱', site.contact.email, `mailto:${site.contact.email}`),
    contactMethod('▶', 'B 站', site.contact.bilibiliLabel, site.contact.bilibili, true),
    el('p', { class: 'section__hint', text: '赞助、加入、合作或内容纠错，都欢迎通过以上方式联系。' }),
  ]);

  const about = el('aside', { class: 'card' }, [
    el('h2', { class: 'card__title', text: '关于协会' }),
    el('p', { class: 'card__body mt-2', text: site.about.intro }),
    el('div', { class: 'card__footer' }, [
      el('a', { class: 'btn btn--secondary btn--small', href: sitePath('about/'), text: '了解 QTTF' }),
    ]),
  ]);

  const social = el('section', { class: 'card' }, [
    el('h2', { class: 'card__title', text: '关注赛事' }),
    el('p', { class: 'card__body mt-2', text: '最新赛程、积分榜与排名都会在站内更新。' }),
    el('div', { class: 'cluster mt-4' }, [
      el('a', { class: 'btn btn--small', href: sitePath('events/'), text: '赛事与联赛' }),
      el('a', { class: 'btn btn--secondary btn--small', href: sitePath('rankings/'), text: '选手排名' }),
    ]),
  ]);

  container.replaceChildren(
    intro,
    el('div', { class: 'contact-grid' }, [
      el('div', { class: 'stack' }, [methods, social]),
      about,
    ]),
  );
}

const { container } = mountShell({ activePath: 'contact/' });
renderContact(container);
