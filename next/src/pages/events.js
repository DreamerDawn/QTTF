import { mountShell, setPageTitle } from '../components/layout.js';
import { createBadge } from '../components/badge.js';
import { emptyState, loadingState, setError } from '../components/status.js';
import { el } from '../lib/dom.js';
import { formatDateRange } from '../lib/format.js';
import { groupSummaries, loadEvents, loadLeagues } from '../lib/data.js';

function itemStatus(item) {
  if (item.kind === 'league') return createBadge('积分榜', 'info');
  if (item.phase === 'ongoing') return createBadge('进行中', 'w');
  if (item.status === 'published') return createBadge('可查看', 'w');
  return createBadge('整理中', 'empty');
}

function itemMeta(item) {
  if (item.kind === 'league') return item.subtitle;
  const range = formatDateRange(item.dateRange);
  return range === '日期待定' ? item.subtitle : `${item.subtitle} · ${range}`;
}

function renderEvents(data, container) {
  const groups = groupSummaries(data.events, data.leagues);

  const header = el('section', { class: 'section' }, [
    el('div', { class: 'page-intro' }, [
      el('p', { class: 'eyebrow', text: 'Competitions' }),
      el('h1', { text: '赛事与联赛' }),
      el('p', {
        text: 'QTTC、追光杯、校级选拔赛与班级联赛。每个赛事使用同一套数据契约，赛果、阶段、排名与区域标注集中维护。',
      }),
    ]),
  ]);

  const search = el('input', {
    type: 'search',
    id: 'event-search',
    placeholder: '搜索赛事、联赛或关键词…',
    'aria-label': '搜索赛事',
    autocomplete: 'off',
  });
  const toolbar = el('div', { class: 'events-toolbar' }, [
    el('div', { class: 'search-field' }, [
      el('span', { class: 'search-field__icon', 'aria-hidden': 'true', text: '⌕' }),
      search,
    ]),
    el('p', { class: 'section__hint', id: 'event-count', text: '' }),
  ]);

  const grid = el('div', { class: 'event-groups' });
  const cards = new Map();

  groups.forEach((group) => {
    const card = el('article', {
      class: `card event-group-card event-group-card--${group.accent}${group.id === 'qttc' ? ' event-group-card--qttc' : ''}`,
      'aria-labelledby': `group-${group.id}`,
      dataset: { groupId: group.id },
    });
    const list = el('div', { class: 'event-group-card__list' });

    if (group.items.length === 0) {
      list.append(
        el('p', { class: 'event-group-card__empty', text: '该系列暂无已发布赛事。' }),
      );
    }

    group.items.forEach((item) => {
      const isQttc2026 = item.id === 'qttc-2026';
      const row = el('a', {
        class: `event-group-card__item${isQttc2026 ? ' event-group-card__item--qttc' : ''}`,
        href: item.href,
        dataset: { searchText: item.searchText.toLowerCase() },
      });
      row.append(
        el('div', { class: 'event-group-card__item-main' }, [
          el('span', { class: 'event-group-card__item-title', text: item.title }),
          el('span', { class: 'event-group-card__item-meta', text: itemMeta(item) }),
        ]),
        itemStatus(item),
      );
      list.append(row);
    });

    card.append(
      el('div', { class: 'card__header' }, [
        el('div', {}, [
          el('h2', { class: 'card__title', id: `group-${group.id}`, text: group.name }),
          el('p', { class: 'card__subtitle mt-2', text: group.description }),
        ]),
        createBadge(`${group.items.length} 项`, 'empty'),
      ]),
      list,
    );
    cards.set(group.id, card);
    grid.append(card);
  });

  const noResults = emptyState({
    title: '没有匹配的赛事',
    text: '试试更短的关键词，或清空搜索查看全部赛事。',
  });
  noResults.hidden = true;
  const count = toolbar.querySelector('#event-count');

  function applyFilter() {
    const query = search.value.trim().toLowerCase();
    let visible = 0;
    groups.forEach((group) => {
      const card = cards.get(group.id);
      let groupMatches = 0;
      const groupText = `${group.name} ${group.description}`.toLowerCase();
      card.querySelectorAll('[data-search-text]').forEach((row) => {
        const match = !query || row.dataset.searchText.includes(query) || groupText.includes(query);
        row.hidden = !match;
        if (match) groupMatches += 1;
      });
      card.hidden = groupMatches === 0;
      if (groupMatches > 0) visible += groupMatches;
    });
    noResults.hidden = visible !== 0;
    count.textContent = query ? `显示 ${visible} 项结果` : `共 ${groups.reduce((sum, group) => sum + group.items.length, 0)} 项`;
  }

  search.addEventListener('input', applyFilter);
  applyFilter();

  setPageTitle('赛事');
  container.replaceChildren(header, toolbar, grid, noResults);
}

async function main() {
  const { container } = mountShell({ activePath: 'events/' });
  container.replaceChildren(loadingState('正在加载赛事…'));
  try {
    const [events, leagues] = await Promise.all([loadEvents(), loadLeagues()]);
    renderEvents({ events, leagues }, container);
  } catch (error) {
    setError(container, error);
  }
}

main();
