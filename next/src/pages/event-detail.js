import { mountShell, setPageTitle } from '../components/layout.js';
import { createBadge } from '../components/badge.js';
import { createBracket } from '../components/bracket.js';
import { createMatchCard } from '../components/match-card.js';
import { openMatchDialog } from '../components/match-dialog.js';
import { createTable } from '../components/table.js';
import { createTabs } from '../components/tabs.js';
import { emptyState, loadingState, setError } from '../components/status.js';
import { el } from '../lib/dom.js';
import { currentPath, sitePath } from '../lib/router.js';
import { formatDateRange } from '../lib/format.js';
import { findEventByRoute, loadEvents } from '../lib/data.js';
import { eventStats, groupRows, isFixedFourSet } from '../lib/stats.js';

function statCard(value, label) {
  return el('div', { class: 'stat-card' }, [
    el('div', { class: 'stat-card__value', text: String(value) }),
    el('div', { class: 'stat-card__label', text: label }),
  ]);
}

function metaPill(text) {
  return el('span', { class: 'meta-pill', text });
}

function participantsSection(event) {
  if (!event.participants?.length) return null;
  const sorted = [...event.participants].sort((a, b) => {
    const rankA =
      a.rank === null || a.rank === undefined ? Number.POSITIVE_INFINITY : Number(a.rank);
    const rankB =
      b.rank === null || b.rank === undefined ? Number.POSITIVE_INFINITY : Number(b.rank);
    if (rankA !== rankB) return rankA - rankB;
    return a.name.localeCompare(b.name, 'zh-Hans-CN');
  });
  const grid = el('div', { class: 'participants-grid' });
  sorted.forEach((participant) => {
    grid.append(
      el('div', { class: `player-chip${participant.seed ? ' is-seed' : ''}` }, [
        el('div', {
          class: 'player-chip__rank',
          text: participant.seed ? `种子 ${participant.seed}` : `排名 ${participant.rank ?? '—'}`,
        }),
        el('div', { class: 'player-chip__name', text: participant.name }),
        el('div', {
          class: 'player-chip__points',
          text: participant.points === null || participant.points === undefined ? '积分 —' : `积分 ${participant.points}`,
        }),
      ]),
    );
  });
  return el('section', { class: 'section' }, [
    el('div', { class: 'section__header' }, [
      el('h2', { class: 'section__title', text: '参赛选手' }),
      el('p', { class: 'section__hint', text: `${event.participants.length} 名选手` }),
    ]),
    grid,
  ]);
}

function podiumSection(event) {
  const podium = event.podium;
  if (!podium) return null;
  const items = [
    ['first', '冠军', 'first'],
    ['second', '亚军', 'second'],
    ['third', '季军', 'third'],
  ].filter(([key]) => podium[key]);
  if (!items.length) return null;
  const grid = el('div', { class: 'podium-grid' });
  items.forEach(([key, label, variant]) => {
    const item = podium[key];
    grid.append(
      el('div', { class: `podium-card podium-card--${variant}` }, [
        el('div', { class: 'podium-card__place', text: label }),
        el('div', { class: 'podium-card__name', text: item.name }),
        el('div', {
          class: 'podium-card__meta',
          text: [item.rank ? `排名 ${item.rank}` : null, item.points ? `积分 ${item.points}` : null]
            .filter(Boolean)
            .join(' · '),
        }),
      ]),
    );
  });
  return el('section', { class: 'section' }, [
    el('div', { class: 'section__header' }, [
      el('h2', { class: 'section__title', text: '最终名次' }),
    ]),
    grid,
  ]);
}

function buildGroupPanel(event, group, index, onOpen) {
  const panel = el('div', {
    class: 'group-panel',
    id: `group-panel-${index}`,
    role: 'tabpanel',
    'aria-labelledby': `tab-group-${index}`,
  });
  if (index !== 0) panel.hidden = true;

  const fixedFour = isFixedFourSet(group.matches || []);
  const rows = groupRows(event, group);

  const columns = [
    { key: 'position', label: '#', className: 'is-number', render: (row) => String(row.position) },
    { key: 'player', label: '选手', className: 'player-cell', render: (row) => el('strong', { text: row.name }) },
  ];
  if (!fixedFour) {
    columns.push(
      { key: 'wins', label: '胜', className: 'is-number', render: (row) => String(row.wins) },
      { key: 'losses', label: '负', className: 'is-number', render: (row) => String(row.losses) },
    );
  }
  columns.push(
    { key: 'setsFor', label: '胜局', className: 'is-number', render: (row) => String(row.setsFor) },
    { key: 'setsAgainst', label: '负局', className: 'is-number', render: (row) => String(row.setsAgainst) },
    { key: 'pointsFor', label: '胜分', className: 'is-number', render: (row) => String(row.pointsFor) },
    {
      key: 'pointsAgainst',
      label: '负分',
      className: 'is-number',
      render: (row) => String(row.pointsAgainst),
    },
    {
      key: 'qualified',
      label: '晋级',
      render: (row) => (row.qualified ? createBadge(String(row.qualified), 'w') : '—'),
    },
  );

  const table = createTable({
    columns,
    rows: rows.map((row) => ({ kind: 'row', row })),
    label: `${group.name} 排名`,
  });
  const tableCard = el('div', { class: 'table-card group-table-card' }, [table.wrap]);

  const mobileList = el('div', {
    class: 'group-rank-list',
    role: 'list',
    'aria-label': `${group.name} 排名`,
  });
  rows.forEach((row) => {
    const metaParts = [];
    if (!fixedFour) metaParts.push(`${row.wins}胜${row.losses}负`);
    metaParts.push(`胜局 ${row.setsFor}–${row.setsAgainst}`);
    metaParts.push(`胜分 ${row.pointsFor}–${row.pointsAgainst}`);
    mobileList.append(
      el('div', { class: 'group-rank-row', role: 'listitem' }, [
        el('span', { class: 'group-rank-row__position', text: String(row.position) }),
        el('div', { class: 'group-rank-row__main' }, [
          el('div', { class: 'group-rank-row__name' }, [
            el('strong', { text: row.name }),
            row.qualified ? createBadge(String(row.qualified), 'w') : null,
          ]),
          el('div', { class: 'group-rank-row__meta', text: metaParts.join(' · ') }),
        ]),
      ]),
    );
  });

  const matchGrid = el('div', { class: 'match-grid' });
  (group.matches || []).forEach((match) => {
    matchGrid.append(
      createMatchCard(match, { stageName: '小组赛', groupName: group.name, roundName: group.name }, onOpen),
    );
  });

  panel.append(
    el('div', { class: 'group-panel__header' }, [
      el('h3', { class: 'group-panel__title', text: group.name }),
      el('p', {
        class: 'section__hint',
        text: fixedFour ? '固定四局制 · 按胜局/胜分排序' : '前 2 名晋级 · 按胜场/净胜局/净胜分排序',
      }),
    ]),
    tableCard,
    mobileList,
    el('div', { class: 'section__header' }, [
      el('h4', { class: 'section__title', text: `${group.name} 比赛` }),
      el('p', { class: 'section__hint', text: `${(group.matches || []).length} 场` }),
    ]),
    matchGrid,
  );
  return panel;
}

function buildGroupStage(event, stage, onOpen) {
  const section = el('section', {
    class: 'stage-section',
    id: 'stage-group-section',
    'aria-labelledby': 'stage-group-heading',
  });
  const groups = stage.groups || [];
  const panels = groups.map((group, index) => buildGroupPanel(event, group, index, onOpen));
  const tabs = createTabs({
    items: groups.map((group, index) => ({
      id: `group-${index}`,
      label: group.name,
      controls: `group-panel-${index}`,
    })),
    initial: groups[0] ? 'group-0' : undefined,
    variant: 'subtab',
    label: '小组切换',
    onChange: (id) => {
      const index = Number(id.replace('group-', ''));
      panels.forEach((panel, panelIndex) => {
        panel.hidden = panelIndex !== index;
      });
    },
  });

  section.append(
    el('div', { class: 'stage-heading' }, [
      el('h2', { class: 'section__title', id: 'stage-group-heading', text: '小组赛' }),
      el('p', { class: 'section__hint', text: `${groups.length} 个小组` }),
    ]),
    tabs.element,
    ...panels,
  );
  return section;
}

function buildKnockoutStage(stage, onOpen) {
  const section = el('section', {
    class: 'stage-section',
    id: 'stage-knockout-section',
    'aria-labelledby': 'stage-knockout-heading',
  });
  section.append(
    el('div', { class: 'stage-heading' }, [
      el('h2', {
        class: 'section__title',
        id: 'stage-knockout-heading',
        text: '淘汰赛',
      }),
      el('p', { class: 'section__hint', text: `${stage.rounds?.length || 0} 个轮次` }),
    ]),
  );

  (stage.rounds || []).forEach((round) => {
    const block = el('div', { class: 'round-block' });
    block.append(
      el('h3', { class: 'round-block__title', text: round.name }),
    );
    const grid = el('div', { class: 'match-grid' });
    (round.matches || []).forEach((match) => {
      grid.append(
        createMatchCard(
          match,
          { stageName: '淘汰赛', roundName: round.name },
          onOpen,
        ),
      );
    });
    block.append(grid);
    section.append(block);
  });
  return section;
}

function renderEventDetail(event, container) {
  const stats = eventStats(event);
  const onOpen = (match, context) => openMatchDialog(match, context);

  const hero = el('section', { class: 'event-hero', 'aria-labelledby': 'event-title' });
  hero.append(
    el('div', { class: 'section__hint' }, [
      el('a', { href: sitePath('events/'), text: '← 返回赛事总览' }),
    ]),
    el('h1', { class: 'event-hero__title', id: 'event-title', text: event.meta.name }),
    el('p', { class: 'event-hero__subtitle', text: event.meta.fullName }),
    el('p', { class: 'event-hero__desc', text: event.meta.description }),
    el('div', { class: 'event-hero__meta' }, [
      metaPill(`日期：${formatDateRange(event.meta.dateRange)}`),
      metaPill(`场馆：${event.meta.venue || '待定'}`),
      metaPill(`赛制：${event.meta.format || '待定'}`),
      event.status === 'coming-soon' ? createBadge('档案整理中', 'empty') : createBadge('已发布', 'w'),
    ]),
    el('div', { class: 'event-stats' }, [
      statCard(stats.dayCount, '比赛日'),
      statCard(stats.participantCount, '参赛选手'),
      statCard(stats.groupMatchCount, '小组赛'),
      statCard(stats.knockoutMatchCount, '淘汰赛'),
    ]),
  );

  const children = [hero];
  const participants = participantsSection(event);
  const podium = podiumSection(event);
  if (podium) children.push(podium);
  if (participants) children.push(participants);

  if (event.status === 'coming-soon' || stats.matchCount === 0) {
    children.push(
      emptyState({
        title: '赛事档案整理中',
        text: event.meta.description || '该赛事的结构化赛果尚未录入。',
        action: el('a', {
          class: 'btn btn--secondary',
          href: sitePath('events/'),
          text: '返回赛事总览',
        }),
      }),
    );
    setPageTitle(event.meta.name);
    container.replaceChildren(...children);
    return;
  }

  const groupStage = event.stages.find((stage) => stage.type === 'group');
  const knockoutStage = event.stages.find((stage) => stage.type === 'knockout');
  const hasMultipleStages = [groupStage, knockoutStage].filter(Boolean).length > 1;

  if (knockoutStage) {
    const bracket = createBracket(knockoutStage, event, onOpen);
    if (bracket) children.push(bracket);
  }

  if (hasMultipleStages) {
    const tabs = createTabs({
      items: [
        { id: 'all', label: '全部', controls: 'stage-group-section stage-knockout-section' },
        { id: 'group', label: '小组赛', controls: 'stage-group-section' },
        { id: 'knockout', label: '淘汰赛', controls: 'stage-knockout-section' },
      ],
      initial: 'all',
      label: '阶段切换',
      onChange: (id) => {
        const groupSection = document.getElementById('stage-group-section');
        const knockoutSection = document.getElementById('stage-knockout-section');
        if (groupSection) groupSection.hidden = id === 'knockout';
        if (knockoutSection) knockoutSection.hidden = id === 'group';
      },
    });
    children.push(
      el('section', { class: 'section' }, [
        el('div', { class: 'stage-toolbar' }, [
          el('h2', { class: 'section__title', text: '赛程与赛果' }),
          tabs.element,
        ]),
      ]),
    );
  } else {
    children.push(
      el('section', { class: 'section' }, [
        el('div', { class: 'section__header' }, [
          el('h2', { class: 'section__title', text: '赛程与赛果' }),
          el('p', {
            class: 'section__hint',
            text: `${stats.matchCount} 场比赛 · ${stats.completedCount} 场已完成`,
          }),
        ]),
      ]),
    );
  }

  if (groupStage) children.push(buildGroupStage(event, groupStage, onOpen));
  if (knockoutStage) children.push(buildKnockoutStage(knockoutStage, onOpen));

  setPageTitle(event.meta.name);
  container.replaceChildren(...children);
}

async function main() {
  const { container } = mountShell({ activePath: 'events/' });
  container.replaceChildren(loadingState('正在加载赛事详情…'));
  try {
    const events = await loadEvents();
    const event = findEventByRoute(events, currentPath());
    if (!event) {
      setPageTitle('赛事未找到');
      container.replaceChildren(
        emptyState({
          title: '未找到该赛事',
          text: '链接可能已更新，或该赛事尚未发布。',
          action: el('a', { class: 'btn', href: sitePath('events/'), text: '返回赛事总览' }),
        }),
      );
      return;
    }
    renderEventDetail(event, container);
  } catch (error) {
    setError(container, error);
  }
}

main();
