import { mountShell, setPageTitle } from '../components/layout.js';
import { createBadge } from '../components/badge.js';
import { createBracket } from '../components/bracket.js';
import { createMatchCard } from '../components/match-card.js';
import { createTeamMatchCard } from '../components/team-tie.js';
import { openMatchDialog } from '../components/match-dialog.js';
import { createTable } from '../components/table.js';
import { createTabs } from '../components/tabs.js';
import { emptyState, loadingState, setError } from '../components/status.js';
import { el } from '../lib/dom.js';
import { currentPath, sitePath } from '../lib/router.js';
import { findEventByRoute, loadEvents } from '../lib/data.js';
import { eventStats, groupRows, isFixedFourSet } from '../lib/stats.js';

function statCard(value, label) {
  return el('div', { class: 'stat-card' }, [
    el('div', { class: 'stat-card__value', text: String(value) }),
    el('div', { class: 'stat-card__label', text: label }),
  ]);
}

function matchCardFor(match, context, onOpen) {
  const isTeam = (match.detail?.rubbers || []).length > 0 || match.kind === 'team';
  return isTeam
    ? createTeamMatchCard(match, context, onOpen)
    : createMatchCard(match, context, onOpen);
}

/** 小组说明文案：按赛制与 `group.advance` / `group.medals` 显示实际出线或名次。 */
function groupHint(group, format) {
  const fixedFormat = format?.type === 'fixed';
  const advance = group.advance;
  const order = fixedFormat ? '按胜局/负局排序' : '按胜场/净胜局/净胜分排序';
  if (Number.isFinite(Number(group.medals)) && Number(group.medals) > 0) {
    return `决出冠亚季军 · ${order}`;
  }
  if (advance === 0) return `循环赛排名 · ${order}`;
  if (Number.isFinite(Number(advance)) && Number(advance) > 0) {
    return `前 ${Number(advance)} 名晋级 · ${order}`;
  }
  return fixedFormat ? `固定 ${format.games} 局 · ${order}` : `前 2 名晋级 · ${order}`;
}

function participantsSection(participants) {
  if (!participants?.length) return null;
  const rankValue = (value) =>
    value === null || value === undefined || value === '' ? Number.POSITIVE_INFINITY : Number(value);
  const sorted = [...participants].sort((a, b) => {
    const seedA = rankValue(a.seed);
    const seedB = rankValue(b.seed);
    const hasSeedA = Number.isFinite(seedA);
    const hasSeedB = Number.isFinite(seedB);
    // 有种子位的选手优先，按种子号升序。
    if (hasSeedA !== hasSeedB) return hasSeedA ? -1 : 1;
    if (hasSeedA && seedA !== seedB) return seedA - seedB;
    // 其余按排名升序，未排名者最后。
    const rankA = rankValue(a.rank);
    const rankB = rankValue(b.rank);
    if (rankA !== rankB) return rankA - rankB;
    return a.name.localeCompare(b.name, 'zh-Hans-CN');
  });
  const grid = el('div', { class: 'participants-grid' });
  sorted.forEach((participant) => {
    const name = el('div', { class: 'player-chip__name' }, [
      el('span', { text: participant.name }),
      participant.class ? el('span', { class: 'player-chip__class', text: participant.class }) : null,
    ]);
    grid.append(
      el('div', { class: `player-chip${participant.seed ? ' is-seed' : ''}` }, [
        el('div', {
          class: 'player-chip__rank',
          text: participant.seed ? `种子 ${participant.seed}` : `排名 ${participant.rank ?? '—'}`,
        }),
        name,
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
      el('p', { class: 'section__hint', text: `${participants.length} 名选手` }),
    ]),
    grid,
  ]);
}

function podiumSection(podium) {
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

function buildGroupPanel(event, group, index, onOpen, stageId = 'group', format = null) {
  const panel = el('div', {
    class: 'group-panel',
    id: `group-panel-${stageId}-${index}`,
    role: 'tabpanel',
    'aria-labelledby': `tab-${stageId}-group-${index}`,
  });
  if (index !== 0) panel.hidden = true;

  const fixedFormat = format?.type === 'fixed';
  const isPlayoff = group.name.includes('附加');
  const rows = groupRows(event, group, format);

  const columns = [
    { key: 'position', label: '#', className: 'is-number', render: (row) => String(row.position) },
    { key: 'player', label: '选手', className: 'player-cell', render: (row) => el('strong', { text: row.name }) },
  ];
  if (!fixedFormat) {
    columns.push(
      { key: 'wins', label: '胜', className: 'is-number', render: (row) => String(row.wins) },
      { key: 'losses', label: '负', className: 'is-number', render: (row) => String(row.losses) },
    );
  } else {
    columns.push({
      key: 'record',
      label: '胜–平–负',
      className: 'is-number',
      render: (row) => `${row.wins}–${row.draws}–${row.losses}`,
    });
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
      render: (row) =>
        isPlayoff ? '—' : row.qualified ? createBadge(String(row.qualified), 'w') : '—',
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
    if (fixedFormat) metaParts.push(`${row.wins}胜${row.draws}平${row.losses}负`);
    else metaParts.push(`${row.wins}胜${row.losses}负`);
    metaParts.push(`胜局 ${row.setsFor}–${row.setsAgainst}`);
    metaParts.push(`胜分 ${row.pointsFor}–${row.pointsAgainst}`);
    mobileList.append(
      el('div', { class: 'group-rank-row', role: 'listitem' }, [
        el('span', { class: 'group-rank-row__position', text: String(row.position) }),
        el('div', { class: 'group-rank-row__main' }, [
          el('div', { class: 'group-rank-row__name' }, [
            el('strong', { text: row.name }),
            !isPlayoff && row.qualified ? createBadge(String(row.qualified), 'w') : null,
          ]),
          el('div', { class: 'group-rank-row__meta', text: metaParts.join(' · ') }),
        ]),
      ]),
    );
  });

  const matchGrid = el('div', { class: 'match-grid' });
  (group.matches || []).forEach((match) => {
    matchGrid.append(
      matchCardFor(match, { stageName: '小组赛', groupName: group.name, roundName: group.name }, onOpen),
    );
  });
  if (!(group.matches || []).length) {
    matchGrid.append(
      el('p', { class: 'section__hint', text: '暂无已录入比赛。' }),
    );
  }

  panel.append(
    el('div', { class: 'group-panel__header' }, [
      el('h3', { class: 'group-panel__title', text: group.name }),
      el('p', {
        class: 'section__hint',
        text: groupHint(group, format),
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

function buildGroupStage(event, stage, onOpen, isAdditional = false) {
  const section = el('section', {
    class: 'stage-section',
    id: `stage-group-section-${stage.id}`,
    'aria-labelledby': `stage-group-heading-${stage.id}`,
  });
  const groups = stage.groups || [];
  const panels = groups.map((group, index) =>
    buildGroupPanel(event, group, index, onOpen, stage.id, stage.format),
  );
  const tabs = createTabs({
    items: groups.map((group, index) => ({
      id: `${stage.id}-group-${index}`,
      label: group.name,
      controls: `group-panel-${stage.id}-${index}`,
    })),
    initial: groups[0] ? `${stage.id}-group-0` : undefined,
    variant: 'subtab',
    label: `${stage.name}小组切换`,
    onChange: (id) => {
      const index = Number(id.replace(`${stage.id}-group-`, ''));
      panels.forEach((panel, panelIndex) => {
        panel.hidden = panelIndex !== index;
      });
    },
  });

  section.append(
    el('div', { class: 'stage-heading' }, [
      el('h2', {
        class: 'section__title',
        id: `stage-group-heading-${stage.id}`,
        text: isAdditional ? stage.name : '小组赛',
      }),
      el('p', { class: 'section__hint', text: stage.name }),
    ]),
    tabs.element,
    ...panels,
  );
  return section;
}

function buildKnockoutStage(stage, onOpen) {
  const section = el('section', {
    class: 'stage-section',
    id: `stage-knockout-section-${stage.id}`,
    'aria-labelledby': `stage-knockout-heading-${stage.id}`,
  });
  section.append(
    el('div', { class: 'stage-heading' }, [
      el('h2', {
        class: 'section__title',
        id: `stage-knockout-heading-${stage.id}`,
        text: stage.name || '淘汰赛',
      }),
      el('p', { class: 'section__hint', text: `${stage.rounds?.length || 0} 个轮次` }),
    ]),
  );

  // 轮次收纳：每轮一个 tab；决赛与铜牌赛合并为一个 tab。
  const groups = wheelGroups(stage);
  const panels = groups.map((group, index) => {
    const panel = el('div', {
      class: 'round-panel',
      id: `round-panel-${stage.id}-${index}`,
      role: 'tabpanel',
      'aria-labelledby': `tab-${stage.id}-round-${index}`,
    });
    if (index !== 0) panel.hidden = true;
    group.rounds.forEach((round) => {
      const block = el('div', { class: 'round-block' });
      block.append(el('h3', { class: 'round-block__title', text: round.name }));
      const grid = el('div', { class: 'match-grid' });
      (round.matches || []).forEach((match) => {
        grid.append(
          matchCardFor(match, { stageName: '淘汰赛', roundName: round.name }, onOpen),
        );
      });
      block.append(grid);
      panel.append(block);
    });
    return panel;
  });

  const tabs = createTabs({
    items: groups.map((group, index) => ({
      id: `${stage.id}-round-${index}`,
      label: group.label,
      controls: `round-panel-${stage.id}-${index}`,
    })),
    initial: groups[0] ? `${stage.id}-round-0` : undefined,
    variant: 'subtab',
    label: `${stage.name}轮次切换`,
    onChange: (id) => {
      const index = Number(id.replace(`${stage.id}-round-`, ''));
      panels.forEach((panel, panelIndex) => {
        panel.hidden = panelIndex !== index;
      });
    },
  });

  if (panels.length) section.append(tabs.element, ...panels);
  return section;
}

/** 把淘汰赛轮次分组：普通轮次各自一组；决赛与铜牌赛合并。 */
function wheelGroups(stage) {
  const rounds = [...(stage.rounds || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
  const groups = [];
  let medal = null;
  const ensureMedal = () => {
    if (!medal) {
      medal = { hasFinal: false, hasBronze: false, rounds: [] };
      groups.push(medal);
    }
    return medal;
  };
  rounds.forEach((round) => {
    const matches = round.matches || [];
    const roundHasFinal = matches.some((match) => Array.isArray(match.flags) && match.flags.includes('final'));
    const roundHasBronze = matches.some((match) => Array.isArray(match.flags) && match.flags.includes('bronze'));
    const isMedal =
      roundHasFinal ||
      roundHasBronze ||
      round.id === 'final' ||
      round.id === 'bronze' ||
      round.id === '3rd' ||
      /^(决赛|铜牌赛|季军赛)$/.test((round.name || '').trim());
    if (isMedal) {
      const target = ensureMedal();
      target.hasFinal = target.hasFinal || roundHasFinal || round.id === 'final' || /^(决赛|季军赛)$/.test((round.name || '').trim());
      target.hasBronze = target.hasBronze || roundHasBronze || round.id === 'bronze' || /^铜牌赛$/.test((round.name || '').trim());
      target.rounds.push(round);
      return;
    }
    groups.push({ label: round.name, rounds: [round] });
  });
  return groups.map((group) => {
    if (!('hasFinal' in group)) return group;
    const label = group.hasFinal && group.hasBronze
      ? '决赛 / 铜牌赛'
      : group.hasBronze
        ? '铜牌赛'
        : '决赛';
    return { label, rounds: group.rounds };
  });
}

function scopeStats(scope, event) {
  if (scope.id === '__main__') return eventStats(event);
  return eventStats({
    ...event,
    participants: [...(event.participants || []), ...(scope.participants || [])],
    podium: scope.podium || null,
    stages: scope.stages || [],
    categories: [],
  });
}

function renderEventDetail(event, container) {
  const totalStats = eventStats(event);
  const onOpen = (match, context) => openMatchDialog(match, context);
  const poster = event.meta.theme === 'red-gold';

  const categories = event.categories || [];
  const scopes = categories.length
    ? categories.map((category) => ({
        id: category.id,
        name: category.name || category.fullName,
        participants: category.participants || [],
        podium: category.podium || null,
        stages: category.stages || [],
      }))
    : [{
        id: '__main__',
        name: null,
        participants: event.participants || [],
        podium: event.podium || null,
        stages: event.stages || [],
      }];
  const multiScope = scopes.length > 1;

  const hero = el('section', {
    class: `event-hero${poster ? ' event-hero--redgold' : ''}`,
    'aria-labelledby': 'event-title',
  });
  hero.append(
    el('div', { class: 'section__hint' }, [
      el('a', { href: sitePath('events/'), text: '← 返回赛事总览' }),
    ]),
  );
  if (poster) {
    hero.append(
      el('span', { class: 'event-hero__ball', 'aria-hidden': 'true' }),
      el('p', { class: 'event-hero__poster-kicker', text: 'Omni-Ball Games 2026' }),
      el('p', { class: 'event-hero__poster-slogan', 'aria-hidden': 'true' }, [
        el('span', { text: 'WE ARE THE' }),
        el('span', { text: 'ANSWER' }),
      ]),
    );
  }
  const statsMount = el('div', { class: 'event-stats' });
  const renderStats = (scope) => {
    const stats = scopeStats(scope, event);
    statsMount.replaceChildren(
      statCard(stats.dayCount, '比赛日'),
      statCard(stats.participantCount, multiScope ? '参赛名单' : '参赛选手'),
      statCard(stats.groupMatchCount, '小组赛'),
      statCard(stats.knockoutMatchCount, '淘汰赛'),
    );
  };
  hero.append(
    el('h1', { class: 'event-hero__title', id: 'event-title', text: event.meta.name }),
    el('p', { class: 'event-hero__subtitle', text: event.meta.fullName }),
    el('p', { class: 'event-hero__desc', text: event.meta.description }),
    el('div', { class: 'event-hero__meta' }, [
      event.status === 'coming-soon' ? createBadge('档案整理中', 'empty') : createBadge('已发布', 'w'),
    ]),
    statsMount,
  );

  const dotDate = (value) => String(value || '').replaceAll('-', '.');
  const facts = el('section', { class: 'event-facts', 'aria-label': '赛事信息' }, [
    ['比赛日期', event.meta.dateRange?.start && event.meta.dateRange?.end
      ? `${dotDate(event.meta.dateRange.start)} — ${dotDate(event.meta.dateRange.end)}`
      : '待定'],
    ['比赛场馆', event.meta.venue || '待定'],
    ['赛制', event.meta.format || '待定'],
    ['主办', event.meta.organizer || '待定'],
  ].map(([label, value]) =>
    el('div', { class: 'event-fact' }, [
      el('span', { class: 'event-fact__label', text: label }),
      el('strong', { class: 'event-fact__value', text: value }),
    ]),
  ));

  const children = [hero, facts];
  renderStats(scopes[0]);

  if (event.status === 'coming-soon' || totalStats.matchCount === 0) {
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

  const panels = scopes.map((scope, scopeIndex) => {
    const panel = el('div', {
      class: 'scope-panel',
      id: `scope-panel-${scope.id}`,
      role: 'tabpanel',
      'aria-labelledby': `tab-scope-${scope.id}`,
    });
    if (scopeIndex !== 0) panel.hidden = true;

    const podium = podiumSection(scope.podium || (multiScope ? null : event.podium));
    if (podium) panel.append(podium);
    const participants = participantsSection([
      ...(event.participants || []),
      ...(scope.participants || []),
    ]);
    if (participants) panel.append(participants);

    const stages = scope.stages || [];
    const groupStages = stages.filter((stage) => stage.type === 'group');
    const knockoutStages = stages.filter((stage) => stage.type === 'knockout');
    const groupStage = groupStages[0];
    const hasMultipleStages = stages.length > 1;

    knockoutStages.forEach((stage) => {
      const bracket = createBracket(stage, event, onOpen);
      if (bracket) panel.append(bracket);
    });

    const stats = scopeStats(scope, event);
    if (hasMultipleStages) {
      const stageTabs = createTabs({
        items: [
          { id: 'all', label: '全部', controls: '' },
          ...groupStages.map((stage) => ({
            id: stage.id,
            label: stage.name,
            controls: `stage-group-section-${stage.id}`,
          })),
          ...knockoutStages.map((stage) => ({
            id: stage.id,
            label: stage.name,
            controls: `stage-knockout-section-${stage.id}`,
          })),
        ],
        initial: 'all',
        label: `${scope.name || '赛事'}阶段切换`,
        onChange: (id) => {
          stages.forEach((stage) => {
            const node = document.getElementById(
              stage.type === 'group'
                ? `stage-group-section-${stage.id}`
                : `stage-knockout-section-${stage.id}`,
            );
            if (node) node.hidden = id !== 'all' && id !== stage.id;
          });
        },
      });
      panel.append(
        el('section', { class: 'section' }, [
          el('div', { class: 'stage-toolbar' }, [
            el('h2', { class: 'section__title', text: '赛程与赛果' }),
            stageTabs.element,
          ]),
        ]),
      );
    } else {
      panel.append(
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

    if (groupStage) panel.append(buildGroupStage(event, groupStage, onOpen));
    groupStages.slice(1).forEach((stage) => panel.append(buildGroupStage(event, stage, onOpen, true)));
    knockoutStages.forEach((stage) => panel.append(buildKnockoutStage(stage, onOpen)));
    return panel;
  });

  if (multiScope) {
    const scopeTabs = createTabs({
      items: scopes.map((scope) => ({
        id: `scope-${scope.id}`,
        label: scope.name,
        controls: `scope-panel-${scope.id}`,
      })),
      initial: `scope-${scopes[0].id}`,
      label: '组别切换',
      onChange: (id) => {
        const scopeId = id.replace('scope-', '');
        const scope = scopes.find((item) => item.id === scopeId);
        panels.forEach((panel, index) => {
          panel.hidden = scopes[index].id !== scopeId;
        });
        if (scope) renderStats(scope);
      },
    });
    children.push(el('div', { class: 'scope-tabs' }, [scopeTabs.element]), ...panels);
  } else {
    children.push(...panels);
  }

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
