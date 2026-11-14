import { mountShell, setPageTitle } from '../components/layout.js';
import { createBadge } from '../components/badge.js';
import { createMatchAnalytics } from '../components/match-analytics.js';
import { createMatchCard } from '../components/match-card.js';
import { openMatchDialog } from '../components/match-dialog.js';
import { createTabs } from '../components/tabs.js';
import { emptyState, loadingState, setError } from '../components/status.js';
import { el } from '../lib/dom.js';
import { currentPath, sitePath } from '../lib/router.js';
import { findEventByRoute, loadEvents } from '../lib/data.js';

function dotDate(value) {
  return String(value || '').replaceAll('-', '.');
}

function eventGroupMatches(event) {
  return (event.categories || [])
    .flatMap((category) => category.stages || [])
    .filter((stage) => stage.type === 'group')
    .flatMap((stage) => stage.groups || [])
    .flatMap((group) => group.matches || []);
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
  const recordedMatches = eventGroupMatches(event).length;
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
          createBadge(recordedMatches ? `${recordedMatches} 场已录入` : '签表待录入', recordedMatches ? 'w' : 'empty'),
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

function standingsRows(category, group) {
  const rows = new Map();
  const ensure = (name) => {
    if (!rows.has(name)) {
      const participant = (category.participants || []).find((item) => item.name === name);
      rows.set(name, {
        name,
        tier: participant?.tier || '—',
        played: 0,
        wins: 0,
        losses: 0,
        gamesFor: 0,
        gamesAgainst: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        tablePoints: 0,
      });
    }
    return rows.get(name);
  };

  (category.participants || []).forEach((participant) => ensure(participant.name));

  (group.matches || []).forEach((match) => {
    if (match.status !== 'completed' || match.players?.length !== 2) return;
    const [p1, p2] = match.players;
    const row1 = ensure(p1);
    const row2 = ensure(p2);
    const games1 = Number(match.score?.gamesWon) || 0;
    const games2 = Number(match.score?.gamesLost) || 0;
    const points1 = (match.detail?.sets || []).reduce((sum, set) => sum + (Number(set.pointsWon) || 0), 0);
    const points2 = (match.detail?.sets || []).reduce((sum, set) => sum + (Number(set.pointsLost) || 0), 0);

    row1.played += 1;
    row2.played += 1;
    row1.gamesFor += games1;
    row1.gamesAgainst += games2;
    row2.gamesFor += games2;
    row2.gamesAgainst += games1;
    row1.pointsFor += points1;
    row1.pointsAgainst += points2;
    row2.pointsFor += points2;
    row2.pointsAgainst += points1;

    if (match.winner === p1) {
      row1.wins += 1;
      row2.losses += 1;
      row1.tablePoints += 3;
    } else if (match.winner === p2) {
      row2.wins += 1;
      row1.losses += 1;
      row2.tablePoints += 3;
    }
  });

  return [...rows.values()]
    .map((row) => ({
      ...row,
      gameDiff: row.gamesFor - row.gamesAgainst,
      pointDiff: row.pointsFor - row.pointsAgainst,
    }))
    .sort((a, b) => {
      if (b.tablePoints !== a.tablePoints) return b.tablePoints - a.tablePoints;
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.played !== a.played) return b.played - a.played;
      if (b.gameDiff !== a.gameDiff) return b.gameDiff - a.gameDiff;
      if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;
      return a.name.localeCompare(b.name, 'zh-Hans-CN');
    })
    .map((row, index) => ({ ...row, position: index + 1 }));
}

function groupStandingsTable(category, group) {
  const rows = standingsRows(category, group);
  const wrap = el('div', { class: 'qttc26-standings-wrap' });
  const table = el('table', {
    class: 'qttc26-standings-table',
    'aria-label': `${group.name} 小组积分榜`,
  });
  const head = el('tr');
  ['排名', '组合', '档位', '场次', '胜–负', '胜局–负局', '得分–失分', '净胜（局/分）', '积分'].forEach((label) => {
    head.append(el('th', { scope: 'col', text: label }));
  });
  table.append(el('thead', {}, [head]));
  const body = el('tbody');
  rows.forEach((row) => {
    body.append(
      el('tr', {}, [
        el('td', { class: 'is-number', text: String(row.position) }),
        el('td', { class: 'qttc26-standings-team', text: row.name }),
        el('td', { class: 'qttc26-standings-tier', text: row.tier }),
        el('td', { class: 'is-number', text: String(row.played) }),
        el('td', { class: 'is-number', text: `${row.wins}–${row.losses}` }),
        el('td', { class: 'is-number', text: `${row.gamesFor}–${row.gamesAgainst}` }),
        el('td', { class: 'is-number', text: `${row.pointsFor}–${row.pointsAgainst}` }),
        el('td', { class: 'is-number', text: `${row.gameDiff >= 0 ? '+' : ''}${row.gameDiff} / ${row.pointDiff >= 0 ? '+' : ''}${row.pointDiff}` }),
        el('td', { class: 'is-number qttc26-standings-points', text: String(row.tablePoints) }),
      ]),
    );
  });
  table.append(body);
  wrap.append(table);

  const cards = el('div', { class: 'qttc26-standings-cards' });
  rows.forEach((row) => {
    cards.append(
      el('div', { class: 'qttc26-standings-card' }, [
        el('span', { class: 'qttc26-standings-card__rank', text: String(row.position) }),
        el('div', { class: 'qttc26-standings-card__main' }, [
          el('div', { class: 'qttc26-standings-card__name' }, [
            el('strong', { text: row.name }),
            el('span', { class: 'qttc26-standings-card__tier', text: `${row.tier}档` }),
          ]),
          el('p', {
            class: 'qttc26-standings-card__meta',
            text: `${row.played}场 · ${row.wins}–${row.losses} · 局${row.gamesFor}–${row.gamesAgainst} · 分${row.pointsFor}–${row.pointsAgainst}`,
          }),
        ]),
        el('span', { class: 'qttc26-standings-card__points', text: `${row.tablePoints} 分` }),
      ]),
    );
  });
  wrap.append(cards);
  return wrap;
}

function groupStageContent(category, event, onOpen) {
  const groupStage = (category.stages || []).find((stage) => stage.type === 'group');
  const groups = groupStage?.groups || [];
  const matches = groups.flatMap((group) => group.matches || []);
  if (!groups.length || (!matches.length && !(category.participants || []).length)) {
    return emptyDraw('group');
  }

  const group = groups.find((item) => (item.matches || []).length) || groups[0];
  const block = el('div', { class: 'qttc26-group-block' });
  block.append(
    el('div', { class: 'qttc26-group-head' }, [
      el('div', {}, [
        el('h3', { class: 'qttc26-group-title', text: group.name }),
        el('p', {
          class: 'section__hint',
          text: `${(category.participants || []).length} 对组合 · ${matches.length} 场已录入`,
        }),
      ]),
      createBadge(`${matches.length} 场`, 'w'),
    ]),
    groupStandingsTable(category, group),
    el('div', { class: 'section__header qttc26-match-head' }, [
      el('h4', { class: 'section__title', text: '本场比赛' }),
      el('p', { class: 'section__hint', text: 'A组小组赛' }),
    ]),
  );

  const matchGrid = el('div', { class: 'match-grid qttc26-match-grid' });
  matches.forEach((match) => {
    matchGrid.append(
      createMatchCard(
        match,
        { stageName: '双打', roundName: group.name, date: match.detail?.playedAt },
        (item, context) => onOpen?.(item, context),
      ),
    );
  });
  block.append(matchGrid);

  matches.forEach((match) => {
    const analytics = createMatchAnalytics(match);
    if (analytics) block.append(analytics);
  });

  return block;
}

function categoryPanel(category, index, event, onOpen) {
  const panel = el('div', {
    class: 'qttc26-category',
    id: `qttc26-category-${category.id}`,
    role: 'tabpanel',
    'aria-labelledby': `tab-qttc26-${category.id}`,
  });
  if (index !== 0) panel.hidden = true;

  const matches = (category.stages || [])
    .filter((stage) => stage.type === 'group')
    .flatMap((stage) => stage.groups || [])
    .flatMap((group) => group.matches || []);
  const stagePrefix = `qttc26-${category.id}-stage`;
  const groupPanel = el('div', {
    class: 'qttc26-stage-panel',
    id: `${stagePrefix}-group`,
    role: 'tabpanel',
    'aria-labelledby': `tab-${category.id}-group`,
  }, [groupStageContent(category, event, onOpen)]);
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
      createBadge(matches.length ? `${matches.length} 场已录入` : '签表待录入', matches.length ? 'w' : 'empty'),
    ]),
    stageTabs.element,
    groupPanel,
    knockoutPanel,
  );
  return panel;
}

function drawSection(event, onOpen) {
  const categories = event.categories || [];
  const totalMatches = eventGroupMatches(event).length;
  const section = el('section', { class: 'section qttc26-draw', 'aria-labelledby': 'qttc26-draw-title' });
  section.append(
    el('div', { class: 'section__header' }, [
      el('div', {}, [
        el('p', { class: 'eyebrow', text: 'Draws & Results' }),
        el('h2', { class: 'section__title', id: 'qttc26-draw-title', text: '赛事签表' }),
      ]),
      el('p', { class: 'section__hint', text: `${categories.length} 个竞赛组别 · ${totalMatches ? `${totalMatches} 场已录入` : '数据待录入'}` }),
    ]),
  );

  if (!categories.length) {
    section.append(emptyState({ title: '赛事签表待录入', text: '分类、小组与淘汰赛数据尚未录入。' }));
    return section;
  }

  const panels = categories.map((category, index) => categoryPanel(category, index, event, onOpen));
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
  const recordedMatches = eventGroupMatches(event).length;
  return el('section', { class: 'section qttc26-info' }, [
    el('div', { class: 'qttc26-info__copy' }, [
      el('p', { class: 'eyebrow', text: 'Event notes' }),
      el('h2', { class: 'section__title', text: '赛事说明' }),
      el('p', { class: 'qttc26-info__text', text: event.meta.description }),
      el('p', {
        class: 'qttc26-info__text',
        text: '竞赛组别：全性别单打、全性别双打。阶段：小组赛、淘汰赛。双打 A 组已录入 II 档陈子扬/唐近尧与 III 档刘函宇/梁博涛的小组赛；其余场次与淘汰赛持续更新。',
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
        el('strong', { text: recordedMatches ? `${recordedMatches} 场已录入` : '签表待录入' }),
      ]),
    ]),
  ]);
}

function renderEvent(event, container) {
  setPageTitle(event.meta.name);
  const onOpen = (match, context) => openMatchDialog(match, context);
  container.replaceChildren(
    hero(event),
    facts(event),
    drawSection(event, onOpen),
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
