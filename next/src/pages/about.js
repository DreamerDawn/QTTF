import { mountShell, setPageTitle } from '../components/layout.js';
import { el } from '../lib/dom.js';
import { sitePath } from '../lib/router.js';
import { site } from '../lib/data.js';

function factsGrid() {
  const facts = Array.isArray(site.about.facts) ? site.about.facts : [];
  if (!facts.length) return null;
  const grid = el('div', { class: 'about-facts', 'aria-label': '组织关键数据' });
  facts.forEach((fact) => {
    grid.append(
      el('div', { class: 'fact-card' }, [
        el('span', { class: 'fact-card__value', text: fact.value || '—' }),
        el('span', { class: 'fact-card__label', text: fact.label || '—' }),
      ]),
    );
  });
  return grid;
}

function formatHistoryDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{1,2})/);
  return match ? `${match[1]}-${match[2].padStart(2, '0')}` : value;
}

function timelineList(history) {
  const groups = new Map();
  history.forEach((item) => {
    const year = String(item.date || '').slice(0, 4) || '其他';
    if (!groups.has(year)) groups.set(year, []);
    groups.get(year).push(item);
  });

  const timeline = el('div', { class: 'timeline timeline--grouped' });
  groups.forEach((items, year) => {
    const group = el('div', { class: 'timeline-group' }, [
      el('h3', { class: 'timeline-group__year', text: year }),
    ]);
    const entries = el('div', { class: 'timeline-group__entries' });
    items.forEach((item) => {
      entries.append(
        el('div', { class: 'timeline__item' }, [
          el('span', { class: 'timeline__date', text: formatHistoryDate(item.date) }),
          el('span', { class: 'timeline__dot', 'aria-hidden': 'true' }),
          el('span', { class: 'timeline__text', text: item.text }),
        ]),
      );
    });
    group.append(entries);
    timeline.append(group);
  });
  return timeline;
}

function renderAbout(container) {
  const startedYear = String(site.about.history?.[0]?.date || '').slice(0, 4);
  const motto = String(site.about.motto || '');
  const mottoParts = motto.split('，');
  const mottoText = el('h1', { class: 'motto-hero__text', id: 'motto-title' });
  mottoParts.forEach((part, index) => {
    mottoText.append(
      el('span', {
        class: 'motto-hero__line',
        text: `${part}${index < mottoParts.length - 1 ? '，' : ''}`,
      }),
    );
  });

  const hero = el('section', { class: 'motto-hero', 'aria-labelledby': 'motto-title' }, [
    el('div', { class: 'motto-hero__inner' }, [
      el('p', {
        class: 'eyebrow motto-hero__eyebrow',
        text: startedYear ? `About QTTF · Since ${startedYear}` : 'About QTTF',
      }),
      mottoText,
      el('p', {
        class: 'motto-hero__sub',
        text: site.about.tagline || '贵州省丘班学生自主创办的乒乓球协会',
      }),
      el('span', { class: 'motto-hero__rule', 'aria-hidden': 'true' }),
    ]),
  ]);

  const intro = el('section', { class: 'card about-intro__copy' }, [
    el('p', { class: 'eyebrow', text: 'Who we are' }),
    el('h2', { class: 'card__title mt-2', text: '组织简介' }),
    el('p', { class: 'card__body mt-2', text: site.about.intro }),
  ]);

  const facts = factsGrid();
  const introSection = el('div', { class: 'about-intro' }, [intro, facts].filter(Boolean));

  const values = el('section', { class: 'card about-values' }, [
    el('div', { class: 'about-values__head' }, [
      el('div', {}, [
        el('p', { class: 'eyebrow', text: 'What we stand for' }),
        el('h2', { class: 'card__title mt-2', text: '我们的理念' }),
      ]),
      el('p', { class: 'section__hint', text: '公平 · 透明 · 开放' }),
    ]),
    el('div', { class: 'about-values__keywords', 'aria-hidden': 'true' }, [
      el('span', { class: 'value-key' }, [
        el('span', { class: 'value-key__index', text: '01' }),
        el('span', { class: 'value-key__label', text: '公平' }),
      ]),
      el('span', { class: 'value-key' }, [
        el('span', { class: 'value-key__index', text: '02' }),
        el('span', { class: 'value-key__label', text: '透明' }),
      ]),
      el('span', { class: 'value-key' }, [
        el('span', { class: 'value-key__index', text: '03' }),
        el('span', { class: 'value-key__label', text: '开放' }),
      ]),
    ]),
    el('p', { class: 'card__body about-values__body', text: site.about.values }),
  ]);

  const timeline = el('section', { class: 'card about-timeline' }, [
    el('div', { class: 'section__header' }, [
      el('div', {}, [
        el('p', { class: 'eyebrow', text: 'Milestones' }),
        el('h2', { class: 'card__title mt-2', text: '历史与成就' }),
      ]),
      el('p', { class: 'section__hint', text: '从 2024 至今' }),
    ]),
    timelineList(site.about.history || []),
  ]);

  const aside = el('aside', { class: 'about-aside' }, [
    el('section', { class: 'card' }, [
      el('h2', { class: 'card__title', text: '快速联系' }),
      el('p', { class: 'card__body mt-2', text: site.contact.note }),
      el('div', { class: 'contact-lines' }, [
        el('div', {}, [
          el('span', { text: '邮箱：' }),
          el('a', { href: `mailto:${site.contact.email}`, text: site.contact.email }),
        ]),
        el('div', {}, [
          el('span', { text: 'B站：' }),
          el('a', {
            href: site.contact.bilibili,
            target: '_blank',
            rel: 'noopener noreferrer',
            text: site.contact.bilibiliLabel,
          }),
        ]),
      ]),
      el('div', { class: 'card__footer' }, [
        el('a', { class: 'btn btn--secondary btn--small', href: sitePath('contact/'), text: '联系方式' }),
      ]),
    ]),
    el('section', { class: 'card' }, [
      el('h2', { class: 'card__title', text: '快速入口' }),
      el('div', { class: 'aside-links mt-2' }, [
        el('a', { class: 'aside-link', href: sitePath('events/') }, [
          el('span', { text: '赛事与联赛' }),
          el('span', { text: '→' }),
        ]),
        el('a', { class: 'aside-link', href: sitePath('rankings/') }, [
          el('span', { text: '选手排名' }),
          el('span', { text: '→' }),
        ]),
      ]),
    ]),
  ]);

  setPageTitle('关于我们');
  container.replaceChildren(
    hero,
    introSection,
    values,
    el('div', { class: 'about-lower' }, [timeline, aside]),
  );
}

const { container } = mountShell({ activePath: 'about/' });
renderAbout(container);
