import { mountShell, setPageTitle } from '../components/layout.js';
import { createBadge } from '../components/badge.js';
import { createGuTrophy } from '../components/gu-trophy.js';
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
        createGuTrophy({ className: 'qttc26-art__trophy' }),
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

  (category.participants || [])
    .filter((participant) => !participant.group || participant.group === group.name)
    .forEach((participant) => ensure(participant.name));

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

function groupBlock(category, group, onOpen) {
  const groupParticipants = (category.participants || []).filter(
    (participant) => participant.group === group.name,
  );
  const matches = group.matches || [];
  const block = el('div', { class: 'qttc26-group-block' });
  block.append(
    el('div', { class: 'qttc26-group-head' }, [
      el('div', {}, [
        el('h3', { class: 'qttc26-group-title', text: group.name }),
        el('p', {
          class: 'section__hint',
          text: `${groupParticipants.length} 对组合 · ${matches.length} 场已录入`,
        }),
      ]),
      createBadge(`${matches.length} 场`, matches.length ? 'w' : 'empty'),
    ]),
    groupStandingsTable(category, group),
  );

  if (matches.length) {
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
    const summary = el('summary', { class: 'qttc26-matches-summary' }, [
      el('span', { class: 'qttc26-matches-summary__title', text: '比赛场次' }),
      el('span', { class: 'qttc26-matches-summary__count', text: `${matches.length} 场` }),
      el('span', { class: 'qttc26-matches-summary__chevron', 'aria-hidden': 'true' }),
    ]);
    block.append(
      el('details', { class: 'qttc26-matches-collapse' }, [summary, matchGrid]),
    );
  }

  return block;
}

function groupStageContent(category, event, onOpen) {
  const groupStage = (category.stages || []).find((stage) => stage.type === 'group');
  const groups = groupStage?.groups || [];
  const matches = groups.flatMap((group) => group.matches || []);
  if (!groups.length || (!matches.length && !(category.participants || []).length)) {
    return emptyDraw('group');
  }

  const stack = el('div', { class: 'qttc26-group-stack' });
  groups.forEach((group) => stack.append(groupBlock(category, group, onOpen)));
  return stack;
}

function categoryPanel(category, index, event, onOpen, initialId) {
  const panel = el('div', {
    class: 'qttc26-category',
    id: `qttc26-category-${category.id}`,
    role: 'tabpanel',
    'aria-labelledby': `tab-qttc26-${category.id}`,
  });
  if (category.id !== initialId) panel.hidden = true;

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

  const initialCategory = categories.find((category) =>
    (category.stages || [])
      .filter((stage) => stage.type === 'group')
      .flatMap((stage) => stage.groups || [])
      .some((group) => (group.matches || []).length > 0),
  ) || categories[0];
  const panels = categories.map((category, index) =>
    categoryPanel(category, index, event, onOpen, initialCategory.id),
  );
  const tabs = createTabs({
    items: categories.map((category, index) => ({
      id: `qttc26-${category.id}`,
      label: category.name,
      controls: `qttc26-category-${category.id}`,
    })),
    initial: `qttc26-${initialCategory.id}`,
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
