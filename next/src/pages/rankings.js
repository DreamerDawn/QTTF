import { mountShell, setPageTitle } from '../components/layout.js';
import { createBadge, createMovementBadge } from '../components/badge.js';
import { createTable } from '../components/table.js';
import { emptyState, loadingState, setError } from '../components/status.js';
import { el } from '../lib/dom.js';
import { currentPath, sitePath } from '../lib/router.js';
import {
  findSnapshotByRoute,
  latestSnapshot,
  loadRankings,
  snapshotHref,
} from '../lib/data.js';
import { categoryClass, categoryForEvent, historyPointsLabel, isDnpPosition } from '../lib/ranking-format.js';

const POSITION_TERMS = [
  ['W', '冠军（金牌）'],
  ['F', '亚军（银牌）'],
  ['B', '季军（铜牌）'],
  ['SF', '四强 / 殿军'],
  ['QF', '八强'],
  ['R16', '十六强'],
  ['G3L', '小组第三，未出线'],
  ['DNP', '未参赛'],
];

function historyRow(row) {
  const tr = el('tr', { class: 'history-row' });
  const td = el('td', { colspan: '4' });
  const panel = el('div', { class: 'history-panel', role: 'region', 'aria-label': `${row.player} 的积分构成` });
  const title = el('div', { class: 'history-panel__title' }, [
    el('span', { text: `${row.player} 的积分构成` }),
    el('span', { class: 'history-panel__sum', text: `Σ ${historyPointsLabel(row.points)}` }),
  ]);

  if (!row.history?.length) {
    panel.append(title, el('p', { class: 'section__hint', text: '暂无历史参赛记录。' }));
  } else {
    const table = el('div', { class: 'history-table', role: 'table', 'aria-label': `${row.player} 的历史记录` });
    const head = el('div', { class: 'history-panel__head', role: 'row' });
    ['类别', '赛事', '失效日期', '名次', '积分'].forEach((text) => {
      head.append(el('span', { role: 'columnheader', text }));
    });

    const list = el('div', { class: 'history-list', role: 'rowgroup' });
    row.history.forEach((item) => {
      const isDnp = isDnpPosition(item.position);
      const category = categoryForEvent(item.event);
      const itemRow = el('div', {
        class: `history-item${isDnp ? ' is-dnp' : ''}`,
        role: 'row',
      });
      itemRow.append(
        el('span', { class: 'history-cell history-cell--category', role: 'cell' }, [
          el('span', {
            class: `history-category history-category--${categoryClass(item.event)}`,
            text: category,
          }),
        ]),
        el('span', { class: 'history-cell history-cell--event', role: 'cell', text: item.event || '—' }),
        el('span', { class: 'history-cell history-cell--expiry', role: 'cell', text: item.expiresOn || '—' }),
        el('span', { class: 'history-cell history-cell--position', role: 'cell', text: item.position || '—' }),
        el('span', {
          class: 'history-cell history-cell--points',
          role: 'cell',
          text: historyPointsLabel(item.points),
        }),
      );
      list.append(itemRow);
    });
    table.append(head, list);
    panel.append(title, table);
  }

  td.append(panel);
  tr.append(td);
  return tr;
}

function aside(snapshot, rankings) {
  const latest = latestSnapshot(rankings);
  const links = el('div', { class: 'aside-links' });
  rankings.snapshots.forEach((item) => {
    links.append(
      el('a', {
        class: 'aside-link',
        href: snapshotHref(item),
        'aria-current': item.id === snapshot.id ? 'page' : null,
      }, [
        el('span', { text: item.label }),
        item.status === 'unavailable' ? createBadge('暂无', 'empty') : createBadge('已发布', 'w'),
      ]),
    );
  });

  const terms = el('dl', { class: 'term-list' });
  POSITION_TERMS.forEach(([term, meaning]) => {
    terms.append(el('dt', { text: term }), el('dd', { text: meaning }));
  });

  return el('aside', { class: 'rankings-aside' }, [
    el('div', { class: 'card' }, [
      el('h2', { class: 'card__title', text: '历史排名' }),
      el('p', { class: 'section__hint mt-2', text: latest ? `最新：${latest.label}` : '暂无最新快照' }),
      links,
    ]),
    el('div', { class: 'card' }, [
      el('h2', { class: 'card__title', text: '名次代码' }),
      el('p', { class: 'section__hint mt-2', text: '用于历史记录中的 position 字段。' }),
      terms,
    ]),
  ]);
}

function renderRankings(snapshot, rankings, container) {
  const header = el('section', { class: 'section' }, [
    el('div', { class: 'page-intro' }, [
      el('p', { class: 'eyebrow', text: 'Rankings' }),
      el('h1', { text: snapshot.title }),
      el('p', { text: snapshot.description }),
    ]),
  ]);

  if (snapshot.status === 'unavailable' || snapshot.rows.length === 0) {
    const content = el('div', { class: 'rankings-layout' }, [
      el('div', { class: 'rankings-main' }, [
        emptyState({
          title: `${snapshot.label} 排名尚未归档`,
          text: '旧版此月份页面为“建设中”占位页，未找到可迁移的结构化排名数据。最新排名仍可查看。',
          action: el('a', { class: 'btn', href: sitePath('rankings/'), text: '查看最新排名' }),
        }),
      ]),
      aside(snapshot, rankings),
    ]);
    setPageTitle(snapshot.label);
    container.replaceChildren(header, content);
    return;
  }

  const columns = [
    {
      key: 'position',
      label: '排名',
      className: 'is-number rank-column',
      render: (row) =>
        el('span', {
          class: `rank-chip${Number(row.position) <= 3 ? ' rank-chip--top' : ''}`,
          text: String(row.position ?? '—'),
        }),
    },
    {
      key: 'player',
      label: '选手',
      className: 'player-cell',
      render: (row) =>
        el('div', { class: 'ranking-player' }, [
          el('span', { class: 'ranking-player__name', text: row.player || '—' }),
          el('span', {
            class: 'ranking-player__hint',
            text: row.history?.length ? `${row.history.length} 项积分` : '暂无积分',
          }),
        ]),
    },
    {
      key: 'movement',
      label: '变化',
      className: 'movement-column',
      render: (row) => createMovementBadge(row.movement),
    },
    {
      key: 'points',
      label: '积分',
      className: 'is-number is-points',
      render: (row) => String(row.points ?? '—'),
    },
  ];

  const table = createTable({
    columns,
    rows: snapshot.rows.map((row) => ({ kind: 'row', row, rowClass: 'ranking-row' })),
    className: 'data-table rankings-table',
    label: `${snapshot.label} 选手排名`,
    onRowClick: (row, tr) => {
      const next = tr.nextElementSibling;
      if (next?.classList.contains('history-row')) {
        next.remove();
        tr.setAttribute('aria-expanded', 'false');
        return;
      }
      tr.setAttribute('aria-expanded', 'true');
      tr.parentNode?.insertBefore(historyRow(row), tr.nextSibling);
    },
  });

  table.tbody.querySelectorAll('tr.ranking-row').forEach((tr) => {
    tr.setAttribute('aria-expanded', 'false');
    const player = tr.querySelector('.player-cell')?.textContent || '选手';
    tr.setAttribute('aria-label', `${player}，点击展开积分构成`);
  });

  const tableCard = el('div', { class: 'table-card' }, [table.wrap]);
  const main = el('div', { class: 'rankings-main' }, [
    el('div', { class: 'section__header' }, [
      el('div', { class: 'cluster' }, [
        createBadge(snapshot.label, 'info'),
        createBadge(`${snapshot.rows.length} 名选手`, 'empty'),
      ]),
      el('p', { class: 'section__hint', text: '点击任意一行展开积分构成' }),
    ]),
    tableCard,
  ]);

  setPageTitle(snapshot.label);
  container.replaceChildren(
    header,
    el('div', { class: 'rankings-layout' }, [main, aside(snapshot, rankings)]),
  );
}

async function main() {
  const { container } = mountShell({ activePath: 'rankings/' });
  container.replaceChildren(loadingState('正在加载排名…'));
  try {
    const rankings = await loadRankings();
    const snapshot =
      currentPath() === 'rankings/'
        ? latestSnapshot(rankings)
        : findSnapshotByRoute(rankings, currentPath());
    if (!snapshot) {
      container.replaceChildren(
        emptyState({
          title: '未找到该期排名',
          text: '排名快照可能尚未发布。',
          action: el('a', { class: 'btn', href: sitePath('rankings/'), text: '查看最新排名' }),
        }),
      );
      return;
    }
    renderRankings(snapshot, rankings, container);
  } catch (error) {
    setError(container, error);
  }
}

main();
