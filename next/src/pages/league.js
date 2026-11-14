import { mountShell, setPageTitle } from '../components/layout.js';
import { createBadge, createFormBadges } from '../components/badge.js';
import { createMatchCard } from '../components/match-card.js';
import { openMatchDialog } from '../components/match-dialog.js';
import { createTable } from '../components/table.js';
import { createTabs } from '../components/tabs.js';
import { emptyState, loadingState, setError } from '../components/status.js';
import { el } from '../lib/dom.js';
import { currentPath, sitePath } from '../lib/router.js';
import { findLeagueByRoute, loadLeagues } from '../lib/data.js';
import { buildZoneAwareRows, zoneLegend } from '../lib/zones.js';

const SORTABLE = new Set(['rank', 'points', 'gamesWon', 'gameDifference']);

function renderLeague(league, container) {
  const formLength = Math.max(
    Number(league.formLength) || 3,
    ...league.standings.map((row) => (Array.isArray(row.lastN) ? row.lastN.length : 0)),
  );
  const originalOrder = [...league.standings].sort((a, b) => (a.rank || 0) - (b.rank || 0));
  const state = {
    data: originalOrder.slice(),
    sort: { key: null, dir: 1 },
    query: '',
  };

  const header = el('section', { class: 'league-hero' }, [
    el('div', {}, [
      el('a', { class: 'section__hint', href: sitePath('events/'), text: '← 返回赛事总览' }),
      el('p', { class: 'eyebrow mt-4', text: `${league.shortName} · ${league.tier}` }),
      el('h1', { class: 'league-hero__title mt-2', text: league.name }),
      el('div', { class: 'league-hero__meta' }, [
        createBadge(league.round || '轮次待定', 'info'),
        createBadge(`更新：${league.lastUpdated || '—'}`, 'empty'),
        createBadge(league.format || '赛制待定', 'empty'),
      ]),
    ]),
    el('div', { class: 'stack stack--tight' }, [
      el('p', { class: 'section__hint', text: '区域图例' }),
      el(
        'div',
        { class: 'zone-legend' },
        zoneLegend(league.zones).map((zone) =>
          el('span', { class: 'zone-legend__item' }, [
            el('span', { class: `zone-legend__swatch zone-legend__swatch--${zone.tone}` }),
            el('span', { text: zone.name }),
          ]),
        ),
      ),
    ]),
  ]);

  const search = el('input', {
    type: 'search',
    id: 'league-search',
    placeholder: '搜索队伍…',
    'aria-label': '搜索队伍',
    autocomplete: 'off',
  });
  const count = el('p', { class: 'section__hint', id: 'league-count' });
  const toolbar = el('div', { class: 'league-toolbar' }, [
    el('div', { class: 'search-field' }, [
      el('span', { class: 'search-field__icon', 'aria-hidden': 'true', text: '⌕' }),
      search,
    ]),
    count,
  ]);

  const tableMount = el('div', { class: 'table-card league-table-mount' });
  const empty = emptyState({ title: '没有匹配的队伍', text: '试试更短的关键词。' });
  empty.hidden = true;

  const columns = [
    {
      key: 'rank',
      label: '排名',
      className: 'is-number',
      sortable: true,
      render: (row) =>
        el('span', {
          class: `rank-chip${row.rank <= 3 ? ' rank-chip--top' : ''}`,
          text: String(row.rank ?? '—'),
        }),
    },
    {
      key: 'team',
      label: '队伍',
      className: 'team-cell',
      render: (row) => row.team || '—',
    },
    { key: 'matches', label: '场次', className: 'is-number', render: (row) => String(row.matches ?? '—') },
    { key: 'wins', label: '胜', className: 'is-number', render: (row) => String(row.wins ?? '—') },
    { key: 'draws', label: '平', className: 'is-number', render: (row) => String(row.draws ?? '—') },
    { key: 'losses', label: '负', className: 'is-number', render: (row) => String(row.losses ?? '—') },
    {
      key: 'gamesWon',
      label: '胜局',
      className: 'is-number',
      sortable: true,
      render: (row) => String(row.gamesWon ?? '—'),
    },
    {
      key: 'gamesLost',
      label: '负局',
      className: 'is-number',
      render: (row) => String(row.gamesLost ?? '—'),
    },
    {
      key: 'gameDifference',
      label: '净胜局',
      className: 'is-number',
      sortable: true,
      render: (row) => String(row.gameDifference ?? '—'),
    },
    {
      key: 'points',
      label: '积分',
      className: 'is-number is-points',
      sortable: true,
      render: (row) => String(row.points ?? '—'),
    },
    {
      key: 'lastN',
      label: `最近 ${formLength} 场`,
      className: 'form-column is-right',
      render: (row) => createFormBadges(row.lastN, formLength),
    },
  ];

  function draw() {
    const query = state.query.trim().toLowerCase();
    const filtered = query
      ? state.data.filter((row) => String(row.team || '').toLowerCase().includes(query))
      : state.data.slice();
    count.textContent = query
      ? `显示 ${filtered.length} / ${state.data.length} 支队伍`
      : `共 ${state.data.length} 支队伍`;

    if (filtered.length === 0) {
      tableMount.replaceChildren(empty);
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    const entries = buildZoneAwareRows(filtered, league.zones).map((entry) => {
      if (entry.kind === 'zone') return entry;
      return {
        kind: 'row',
        row: entry.row,
        rowClass: entry.rowClass,
      };
    });

    const table = createTable({
      columns,
      rows: entries,
      className: 'data-table league-table',
      label: `${league.name} 积分榜`,
      sort: state.sort,
      onSort: (key) => {
        if (!SORTABLE.has(key)) return;
        if (key === 'rank') {
          state.data = originalOrder.slice();
          state.sort = { key: null, dir: 1 };
          draw();
          return;
        }
        if (state.sort.key !== key) state.sort = { key, dir: -1 };
        else state.sort.dir *= -1;
        const { key: sortKey, dir } = state.sort;
        state.data.sort((a, b) => {
          const delta = (Number(a[sortKey]) || 0) - (Number(b[sortKey]) || 0);
          return dir === -1 ? -delta : delta;
        });
        draw();
      },
    });
    tableMount.replaceChildren(table.wrap);
  }

  search.addEventListener('input', () => {
    state.query = search.value;
    draw();
  });
  draw();

  const matchweeks = (league.matchweeks || []).filter(
    (week) => Array.isArray(week.matches) && week.matches.length > 0,
  );
  const matchweekSection = el('section', {
    class: 'section league-matchweeks',
    'aria-labelledby': 'league-matchweeks-title',
  });
  matchweekSection.append(
    el('div', { class: 'section__header' }, [
      el('h2', {
        class: 'section__title',
        id: 'league-matchweeks-title',
        text: '每周赛况',
      }),
      el('p', {
        class: 'section__hint',
        text: matchweeks.length
          ? `${matchweeks.length} 个比赛周 · ${matchweeks.reduce((sum, week) => sum + week.matches.length, 0)} 场比赛`
          : '逐场比分待录入',
      }),
    ]),
  );

  if (matchweeks.length === 0) {
    matchweekSection.append(
      emptyState({
        title: '赛况数据待录入',
        text: '联赛逐场比分将通过后台“联赛积分榜 → 每周赛况”录入，录入后会自动出现在这里。',
      }),
    );
  } else {
    const grid = el('div', { class: 'match-grid' });
    const renderWeek = (weekId) => {
      const selected = weekId === 'all' ? matchweeks : matchweeks.filter((week, index) => `week-${index}` === weekId);
      const cards = selected.flatMap((week) =>
        week.matches.map((match) =>
          createMatchCard(
            match,
            { stageName: league.shortName, roundName: week.label, date: week.date },
            (item, context) => openMatchDialog(item, context),
          ),
        ),
      );
      grid.replaceChildren(...cards);
    };
    const tabs = createTabs({
      items: [
        { id: 'all', label: '全部' },
        ...matchweeks.map((week, index) => ({ id: `week-${index}`, label: week.label })),
      ],
      initial: 'all',
      label: '联赛周次切换',
      onChange: renderWeek,
    });
    matchweekSection.append(tabs.element, grid);
    renderWeek('all');
  }

  const notes = el('section', { class: 'section' }, [
    el('div', { class: 'section__header' }, [
      el('h2', { class: 'section__title', text: '补充说明' }),
      el('p', { class: 'section__hint', text: '积分、排名与升降级规则' }),
    ]),
    el('div', { class: 'league-note', text: league.notes || '暂无补充说明。' }),
  ]);

  setPageTitle(league.shortName);
  container.replaceChildren(header, toolbar, tableMount, matchweekSection, notes);
}

async function main() {
  const { container } = mountShell({ activePath: 'events/' });
  container.replaceChildren(loadingState('正在加载联赛积分榜…'));
  try {
    const leagues = await loadLeagues();
    const league = findLeagueByRoute(leagues, currentPath());
    if (!league) {
      container.replaceChildren(
        emptyState({
          title: '未找到该联赛',
          text: '链接可能已更新，请返回赛事总览。',
          action: el('a', { class: 'btn', href: sitePath('events/'), text: '返回赛事总览' }),
        }),
      );
      return;
    }
    renderLeague(league, container);
  } catch (error) {
    setError(container, error);
  }
}

main();
