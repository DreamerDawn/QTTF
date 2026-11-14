import { mountShell, setPageTitle } from '../components/layout.js';
import { createBadge } from '../components/badge.js';
import { createTabs } from '../components/tabs.js';
import { emptyState, loadingState, setError } from '../components/status.js';
import { el } from '../lib/dom.js';
import { currentPath, sitePath } from '../lib/router.js';
import { findEventByRoute, loadEvents } from '../lib/data.js';

function dotDate(value) {
  return String(value || '').replaceAll('-', '.');
}

function trophyArt() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'qttc26-art__trophy');
  svg.setAttribute('viewBox', '0 0 220 360');
  svg.setAttribute('aria-hidden', 'true');

  const add = (tag, attrs) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    svg.append(node);
    return node;
  };

  add('path', {
    d: 'M48 28h124c0 68-22 105-59 118v94h43v14H66v-14h41v-94C70 133 48 96 48 28Z',
    fill: 'currentColor',
  });
  add('path', {
    d: 'M108 153v116',
    stroke: 'var(--qttc26-paper)',
    'stroke-width': '2',
    'stroke-linecap': 'round',
  });
  add('path', {
    d: 'M48 42c-31 5-43 32-27 56 11 17 28 24 49 27M172 42c31 5 43 32 27 56-11 17-28 24-49 27',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
    opacity: '.55',
  });
  add('circle', { cx: '174', cy: '86', r: '5', fill: 'var(--qttc26-mint)' });
  add('path', {
    d: 'M19 286c61-24 85-58 101-112M191 246c-29-10-47-33-58-72',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1',
    opacity: '.38',
  });
  add('circle', { cx: '139', cy: '322', r: '4', fill: 'var(--qttc26-mint)' });
  add('circle', { cx: '163', cy: '322', r: '3', fill: 'var(--qttc26-navy)' });
  return svg;
}

function hero(event) {
  const phase = event.meta.phase || 'ongoing';
  const phaseLabel = phase === 'completed' ? '已结束' : phase === 'upcoming' ? '即将开始' : '进行中';
  const meta = event.meta;
  const title = String(meta.fullName || meta.name);
  const titleParts = title.split('暨');

  const heading = el('h1', { class: 'qttc26-hero__title', id: 'event-title' });
  titleParts.forEach((part, index) => {
    heading.append(el('span', { text: index === 0 ? part : `暨${part}` }));
  });

  return el('section', { class: 'event-hero qttc26-hero', 'aria-labelledby': 'event-title' }, [
    el('div', { class: 'qttc26-hero__band', 'aria-hidden': 'true' }),
    el('div', { class: 'qttc26-hero__grid' }, [
      el('div', { class: 'qttc26-hero__copy' }, [
        el('a', { class: 'section__hint', href: sitePath('events/'), text: '← 返回赛事总览' }),
        el('p', { class: 'eyebrow qttc26-hero__eyebrow', text: `${meta.name} · 09 NOV — 04 DEC` }),
        el('p', { class: 'qttc26-hero__english' }, [
          el('span', { text: 'TWICE THE' }),
          el('br'),
          el('span', { text: 'TRIUMPH' }),
        ]),
        heading,
        el('p', { class: 'qttc26-hero__desc', text: meta.description }),
        el('div', { class: 'badge-row qttc26-hero__badges' }, [
          createBadge(phaseLabel, phase === 'completed' ? 'empty' : 'w'),
          createBadge(meta.format || '小组赛 + 淘汰赛', 'info'),
          createBadge('签表待录入', 'empty'),
        ]),
      ]),
      el('div', { class: 'qttc26-hero__art', 'aria-hidden': 'true' }, [
        el('span', { class: 'qttc26-art__label', text: 'QTTF / 26' }),
        trophyArt(),
        el('span', { class: 'qttc26-art__caption', text: 'QTTF Breeze Arena' }),
      ]),
    ]),
  ]);
}

function facts(event) {
  const meta = event.meta;
  const values = [
    ['比赛日期', meta.dateRange?.start && meta.dateRange?.end
      ? `${dotDate(meta.dateRange.start)} — ${dotDate(meta.dateRange.end)}`
      : '待定'],
    ['比赛场馆', meta.venue || '待定'],
    ['竞赛组别', '单打 / 双打'],
    ['报名截止', meta.deadline ? dotDate(meta.deadline) : '待定'],
  ];
  return el('section', { class: 'qttc26-facts', 'aria-label': '赛事信息' }, values.map(([label, value]) =>
    el('div', { class: 'qttc26-fact' }, [
      el('span', { class: 'qttc26-fact__label', text: label }),
      el('strong', { class: 'qttc26-fact__value', text: value }),
    ]),
  ));
}

function emptyDraw(kind) {
  const isGroup = kind === 'group';
  return el('div', { class: 'qttc26-empty' }, [
    el('div', { class: 'qttc26-empty__mark', 'aria-hidden': 'true', text: isGroup ? '小组' : '淘汰' }),
    el('div', {}, [
      el('h3', { class: 'qttc26-empty__title', text: isGroup ? '小组赛签表待录入' : '淘汰赛签表待录入' }),
      el('p', {
        class: 'qttc26-empty__text',
        text: isGroup
          ? '签表发布后将在此显示小组积分、比赛卡与晋级情况。'
          : '淘汰赛签表发布后将在此显示对阵、比分与晋级路径。',
      }),
    ]),
  ]);
}

function categoryPanel(category, index, event) {
  const panel = el('div', {
    class: 'qttc26-category',
    id: `qttc26-category-${category.id}`,
    role: 'tabpanel',
    'aria-labelledby': `tab-qttc26-${category.id}`,
  });
  if (index !== 0) panel.hidden = true;

  const stagePrefix = `qttc26-${category.id}-stage`;
  const groupPanel = el('div', {
    class: 'qttc26-stage-panel',
    id: `${stagePrefix}-group`,
    role: 'tabpanel',
    'aria-labelledby': `tab-${category.id}-group`,
  }, [emptyDraw('group')]);
  const knockoutPanel = el('div', {
    class: 'qttc26-stage-panel',
    id: `${stagePrefix}-knockout`,
    role: 'tabpanel',
    'aria-labelledby': `tab-${category.id}-knockout`,
  }, [emptyDraw('knockout')]);
  knockoutPanel.hidden = true;

  const stageTabs = createTabs({
    items: [
      { id: `${category.id}-group`, label: '小组赛', controls: `${stagePrefix}-group` },
      { id: `${category.id}-knockout`, label: '淘汰赛', controls: `${stagePrefix}-knockout` },
    ],
    initial: `${category.id}-group`,
    label: `${category.name}阶段切换`,
    onChange: (id) => {
      const isGroup = id.endsWith('-group');
      groupPanel.hidden = !isGroup;
      knockoutPanel.hidden = isGroup;
    },
  });

  panel.append(
    el('div', { class: 'qttc26-category__head' }, [
      el('div', {}, [
        el('p', { class: 'eyebrow', text: category.fullName || category.name }),
        el('h3', { class: 'qttc26-category__title', text: category.name }),
        el('p', { class: 'section__hint', text: `${category.format || '小组赛 + 淘汰赛'} · ${event.meta.venue || '场馆待定'}` }),
      ]),
      createBadge('签表待录入', 'empty'),
    ]),
    stageTabs.element,
    groupPanel,
    knockoutPanel,
  );
  return panel;
}

function drawSection(event) {
  const categories = event.categories || [];
  const section = el('section', { class: 'section qttc26-draw', 'aria-labelledby': 'qttc26-draw-title' });
  section.append(
    el('div', { class: 'section__header' }, [
      el('div', {}, [
        el('p', { class: 'eyebrow', text: 'Draws & Results' }),
        el('h2', { class: 'section__title', id: 'qttc26-draw-title', text: '赛事签表' }),
      ]),
      el('p', { class: 'section__hint', text: `${categories.length} 个竞赛组别 · 数据待录入` }),
    ]),
  );

  if (!categories.length) {
    section.append(emptyState({ title: '赛事签表待录入', text: '分类、小组与淘汰赛数据尚未录入。' }));
    return section;
  }

  const panels = categories.map((category, index) => categoryPanel(category, index, event));
  const tabs = createTabs({
    items: categories.map((category, index) => ({
      id: `qttc26-${category.id}`,
      label: category.name,
      controls: `qttc26-category-${category.id}`,
    })),
    initial: `qttc26-${categories[0].id}`,
    label: '赛事分类切换',
    onChange: (id) => {
      const target = id.replace('qttc26-', '');
      panels.forEach((panel, index) => {
        panel.hidden = categories[index].id !== target;
      });
    },
  });
  section.append(el('div', { class: 'qttc26-category-tabs' }, [tabs.element]), ...panels);
  return section;
}

function infoSection(event) {
  return el('section', { class: 'section qttc26-info' }, [
    el('div', { class: 'qttc26-info__copy' }, [
      el('p', { class: 'eyebrow', text: 'Event notes' }),
      el('h2', { class: 'section__title', text: '赛事说明' }),
      el('p', { class: 'qttc26-info__text', text: event.meta.description }),
      el('p', {
        class: 'qttc26-info__text',
        text: '竞赛组别：全性别单打、全性别双打。阶段：小组赛、淘汰赛。当前页面为赛事结构与签表入口，具体名单、分组与比分将在数据录入后更新。',
      }),
    ]),
    el('div', { class: 'qttc26-info__side' }, [
      el('div', { class: 'qttc26-info__line' }, [
        el('span', { text: '主办' }),
        el('strong', { text: event.meta.organizer || '丘班乒乓球联合会' }),
      ]),
      el('div', { class: 'qttc26-info__line' }, [
        el('span', { text: '报名截止' }),
        el('strong', { text: event.meta.deadline ? dotDate(event.meta.deadline) : '待定' }),
      ]),
      el('div', { class: 'qttc26-info__line' }, [
        el('span', { text: '数据状态' }),
        el('strong', { text: '签表待录入' }),
      ]),
    ]),
  ]);
}

function renderEvent(event, container) {
  setPageTitle(event.meta.name);
  container.replaceChildren(
    hero(event),
    facts(event),
    drawSection(event),
    infoSection(event),
    el('p', { class: 'qttc26-back' }, [
      el('a', { class: 'btn btn--secondary', href: sitePath('events/'), text: '返回赛事总览' }),
    ]),
  );
}

async function main() {
  const { container } = mountShell({ activePath: 'events/' });
  container.replaceChildren(loadingState('正在加载 QTTC 2026…'));
  try {
    const events = await loadEvents();
    const event = findEventByRoute(events, currentPath());
    if (!event) {
      container.replaceChildren(
        emptyState({
          title: '未找到 QTTC 2026',
          text: '赛事页面可能尚未发布。',
          action: el('a', { class: 'btn', href: sitePath('events/'), text: '返回赛事总览' }),
        }),
      );
      return;
    }
    renderEvent(event, container);
  } catch (error) {
    setError(container, error);
  }
}

main();
