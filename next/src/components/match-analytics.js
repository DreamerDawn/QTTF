import { createTabs } from './tabs.js';
import { el } from '../lib/dom.js';
import { computeStats, STAT_ROWS, statValue } from '../lib/pingpong-stats.js';
import { createScoreChart } from './score-chart.js';

function winnersFromSets(sets) {
  const winners = {};
  (sets || []).forEach((set, index) => {
    if (Number(set.pointsWon) > Number(set.pointsLost)) winners[index + 1] = 'A';
    else if (Number(set.pointsLost) > Number(set.pointsWon)) winners[index + 1] = 'B';
  });
  return winners;
}

function formatValue(stats, key, side) {
  return String(statValue(stats, key, side));
}

/**
 * Detailed, point-derived match statistics and per-game score charts.
 */
export function createMatchAnalytics(match, options = {}) {
  const pointLog = match.detail?.pointLog || [];
  const sets = match.detail?.sets || [];
  if (!pointLog.length || !sets.length) return null;

  const labelA = options.labelA || match.players?.[0] || 'A';
  const labelB = options.labelB || match.players?.[1] || 'B';
  const target = Number(options.target) || 11;
  const winners = winnersFromSets(sets);
  const section = el('section', { class: 'qttc26-analytics', 'aria-labelledby': 'qttc26-analytics-title' });
  const statsMount = el('div', { class: 'qttc26-analytics__stats' });
  const chartMount = el('div', { class: 'qttc26-chart-mount' });

  const head = el('div', { class: 'qttc26-analytics__head' }, [
    el('div', {}, [
      el('p', { class: 'eyebrow', text: 'Match analytics' }),
      el('h2', { class: 'section__title', id: 'qttc26-analytics-title', text: '本场技术统计' }),
    ]),
    el('p', { class: 'section__hint', text: '从 108 个逐球记录实时计算 · 与计分器口径一致' }),
  ]);

  const scoreStrip = el('div', { class: 'qttc26-game-strip', 'aria-label': '每局比分' });
  sets.forEach((set, index) => {
    const winner = winners[index + 1];
    scoreStrip.append(
      el('div', { class: `qttc26-game-chip${winner ? ` is-${winner.toLowerCase()}` : ''}` }, [
        el('span', { class: 'qttc26-game-chip__label', text: `第${index + 1}局` }),
        el('span', { class: 'qttc26-game-chip__score', text: `${set.pointsWon}–${set.pointsLost}` }),
      ]),
    );
  });

  const duration = match.detail?.durationMinutes;
  const normalPauses = (match.detail?.timeouts || []).filter(Boolean).length;
  const medicalPauses = (match.detail?.medicalTimeouts || []).filter(Boolean).length;
  const metaStrip = el('div', { class: 'qttc26-analytics__meta' }, [
    el('span', { text: duration ? `${duration} 分钟` : '时长未记录' }),
    el('span', { text: `普通暂停 ${normalPauses} 次` }),
    el('span', { text: `医疗暂停 ${medicalPauses} 次` }),
  ]);

  function renderStats(scopeId) {
    const gameNo = scopeId === 'match' ? 0 : Number(scopeId.replace('game-', ''));
    const stats = computeStats(pointLog, gameNo, winners, target);
    const table = el('table', { class: 'qttc26-stats-table', 'aria-label': `技术统计：${scopeId === 'match' ? '全场' : `第${gameNo}局`}` });
    const headRow = el('tr');
    headRow.append(
      el('th', { scope: 'col', class: 'qttc26-stats-table__side', text: labelA }),
      el('th', { scope: 'col', class: 'qttc26-stats-table__metric', text: '指标' }),
      el('th', { scope: 'col', class: 'qttc26-stats-table__side', text: labelB }),
    );
    table.append(el('thead', {}, [headRow]));
    const body = el('tbody');
    STAT_ROWS.forEach((row) => {
      body.append(
        el('tr', {}, [
          el('td', { text: formatValue(stats, row.key, 'A') }),
          el('td', { title: row.hint, text: row.label }),
          el('td', { text: formatValue(stats, row.key, 'B') }),
        ]),
      );
    });
    table.append(body);
    statsMount.replaceChildren(table);
  }

  function renderChart(gameNo) {
    const scoreA = sets[gameNo - 1]?.pointsWon ?? 0;
    const scoreB = sets[gameNo - 1]?.pointsLost ?? 0;
    const stats = computeStats(pointLog, gameNo, winners, target);
    const chart = createScoreChart(stats, {
      labelA,
      labelB,
      title: `第 ${gameNo} 局比分走势`,
      target,
    });
    const caption = el('div', { class: 'qttc26-chart-caption' }, [
      el('strong', { text: `第 ${gameNo} 局` }),
      el('span', { text: `${scoreA}–${scoreB} · ${stats.balls} 球` }),
    ]);
    chartMount.replaceChildren(caption, chart);
  }

  const statsTabs = createTabs({
    items: [
      { id: 'match', label: '全场' },
      ...sets.map((_, index) => ({ id: `game-${index + 1}`, label: `第${index + 1}局` })),
    ],
    initial: 'match',
    label: '统计范围',
    onChange: renderStats,
  });

  const chartTabs = createTabs({
    items: sets.map((_, index) => ({ id: `chart-${index + 1}`, label: `第${index + 1}局` })),
    initial: 'chart-1',
    label: '比分走势局数',
    onChange: (id) => renderChart(Number(id.replace('chart-', ''))),
  });

  const chartBlock = el('div', { class: 'qttc26-chart-block' }, [
    el('div', { class: 'qttc26-chart-head' }, [
      el('div', {}, [
        el('h3', { class: 'qttc26-chart-title', text: '比分走势' }),
        el('p', { class: 'section__hint', text: 'X = 球序号 · Y = 双方累计得分' }),
      ]),
      chartTabs.element,
    ]),
    chartMount,
  ]);

  renderStats('match');
  renderChart(1);
  section.append(head);
  if (options.showScoreStrip !== false) section.append(scoreStrip);
  section.append(metaStrip, statsTabs.element, statsMount, chartBlock);
  return section;
}
