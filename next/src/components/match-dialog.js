import { el } from '../lib/dom.js';
import { createMatchAnalytics } from './match-analytics.js';
import {
  boolLabel,
  formatDuration,
  formatMatchPlayers,
  formatScore,
  statusLabel,
} from '../lib/format.js';

function setWinner(set) {
  if (Number(set.pointsWon) > Number(set.pointsLost)) return 'p1';
  if (Number(set.pointsLost) > Number(set.pointsWon)) return 'p2';
  return null;
}

function detailValue(value, fallback = '无数据') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

export function openMatchDialog(match, context = {}) {
  document.querySelector('.match-dialog')?.remove();

  const { p1, p2 } = formatMatchPlayers(match.players);
  const detail = match.detail || {};
  const sets = detail.sets || [];
  const special = ['bye', 'default', 'cancelled'].includes(
    String(match.status || '').toLowerCase(),
  );
  const p1Wins = sets.filter((set) => setWinner(set) === 'p1').length;
  const p2Wins = sets.filter((set) => setWinner(set) === 'p2').length;
  const score = match.score || (sets.length ? { gamesWon: p1Wins, gamesLost: p2Wins } : null);
  const totalPoints = detail.totalPoints || null;
  const fallbackPoints = sets.reduce(
    (acc, set) => {
      acc.p1 += Number(set.pointsWon) || 0;
      acc.p2 += Number(set.pointsLost) || 0;
      return acc;
    },
    { p1: 0, p2: 0 },
  );
  const pointsP1 = totalPoints?.pointsWon ?? (sets.length ? fallbackPoints.p1 : null);
  const pointsP2 = totalPoints?.pointsLost ?? (sets.length ? fallbackPoints.p2 : null);
  const timeouts = detail.timeouts || null;
  const medical = detail.medicalTimeouts || null;
  const round = context.roundName || context.stageName || '比赛';
  const date = [detail.playedAt, detail.time].filter(Boolean).join(' ') || '时间未记录';
  const matchNumber = match.number || match.order;
  const winnerSide = match.winner === p1 ? 'p1' : match.winner === p2 ? 'p2' : null;
  const finalA = score ? score.gamesWon : '—';
  const finalB = score ? score.gamesLost : '—';

  const dialog = el('dialog', {
    class: 'match-dialog',
    'aria-labelledby': 'match-dialog-title',
  });
  const inner = el('div', { class: 'match-dialog__inner' });
  const close = el('button', {
    class: 'btn btn--ghost btn--icon match-dialog__close',
    type: 'button',
    'aria-label': '关闭比赛详情',
    text: '×',
  });
  close.addEventListener('click', () => dialog.close());

  const header = el('div', { class: 'match-dialog__header' });
  header.append(
    el('div', { class: 'match-dialog__topline' }, [
      el('span', {
        text: `${round}${matchNumber ? ` · 第 ${matchNumber} 场` : ''} · ${statusLabel(match.status)}`,
      }),
      el('span', { text: date }),
    ]),
    el('h2', {
      class: 'match-dialog__title',
      id: 'match-dialog-title',
      text: '比赛详情',
    }),
    el('div', { class: 'match-dialog__scoreline' }, [
      el('div', { class: 'match-dialog__team', text: p1 }),
      el('div', { class: 'match-dialog__final-score', 'aria-label': `总比分 ${formatScore(score)}` }, [
        el('span', {
          class: winnerSide === 'p1' ? 'is-winner' : '',
          text: String(finalA),
        }),
        el('span', { class: 'match-dialog__score-dash', text: '–' }),
        el('span', {
          class: winnerSide === 'p2' ? 'is-winner' : '',
          text: String(finalB),
        }),
      ]),
      el('div', { class: 'match-dialog__team', text: p2 }),
    ]),
  );

  const meta = el('dl', { class: 'match-dialog__meta' });
  const metaItems = [
    ['阶段', round],
    ['时长', formatDuration(detail.durationMinutes)],
    ['场地', detailValue(detail.venue, '未记录')],
    ['备注', detailValue(detail.note, '无')],
  ];
  metaItems.forEach(([label, value]) => {
    meta.append(el('div', {}, [el('dt', { text: label }), el('dd', { text: value })]));
  });

  inner.append(close, header, meta);

  if (!special && sets.length) {
    inner.append(el('h3', { class: 'match-dialog__section-title', text: '每局比分' }));
    const setWrap = el('div', { class: 'match-dialog__sets' });
    const table = el('table', { 'aria-label': '每局比分' });
    const head = el('tr');
    head.append(el('th', { scope: 'col', text: '选手' }), el('th', { scope: 'col', text: '局数' }));
    sets.forEach((_, index) => head.append(el('th', { scope: 'col', text: String(index + 1) })));
    table.append(el('thead', {}, [head]));
    const body = el('tbody');
    const row1 = el('tr');
    row1.append(
      el('td', { text: p1 }),
      el('td', { text: String(p1Wins), class: p1Wins > p2Wins ? 'is-point-winner' : '' }),
    );
    sets.forEach((set) => {
      row1.append(
        el('td', {
          class: setWinner(set) === 'p1' ? 'is-point-winner' : '',
          text: String(set.pointsWon),
        }),
      );
    });
    const row2 = el('tr');
    row2.append(
      el('td', { text: p2 }),
      el('td', { text: String(p2Wins), class: p2Wins > p1Wins ? 'is-point-winner' : '' }),
    );
    sets.forEach((set) => {
      row2.append(
        el('td', {
          class: setWinner(set) === 'p2' ? 'is-point-winner' : '',
          text: String(set.pointsLost),
        }),
      );
    });
    body.append(row1, row2);
    table.append(body);
    setWrap.append(table);
    inner.append(setWrap);
  } else if (!special) {
    inner.append(el('p', { class: 'section__hint', text: '暂无每局比分。' }));
  }

  if (!special) {
    const analytics = createMatchAnalytics(match, { showScoreStrip: false });
    if (analytics) {
      inner.append(analytics);
    } else {
      inner.append(el('h3', { class: 'match-dialog__section-title', text: '比赛统计' }));
      const statsTable = el('table', {
        class: 'match-dialog__stats',
        'aria-label': '比赛统计',
      });
    const head = el('tr');
    head.append(
      el('th', { scope: 'col', text: p1 }),
      el('th', { scope: 'col', text: '指标' }),
      el('th', { scope: 'col', text: p2 }),
    );
    statsTable.append(el('thead', {}, [head]));
    const body = el('tbody');
    [
      [pointsP1 ?? '无数据', '总得分', pointsP2 ?? '无数据'],
      [
        timeouts ? boolLabel(timeouts[0]) : '无数据',
        '暂停',
        timeouts ? boolLabel(timeouts[1]) : '无数据',
      ],
      [
        medical ? boolLabel(medical[0]) : '无数据',
        '医疗暂停',
        medical ? boolLabel(medical[1]) : '无数据',
      ],
    ].forEach(([left, label, right]) => {
      body.append(el('tr', {}, [el('td', { text: String(left) }), el('td', { text: label }), el('td', { text: String(right) })]));
    });
      statsTable.append(body);
      inner.append(statsTable);
    }
  }

  if (detail.note) {
    inner.append(el('p', { class: 'match-dialog__note', text: detail.note }));
  }

  dialog.append(inner);
  document.body.append(dialog);
  document.body.classList.add('is-locked');
  dialog.addEventListener('close', () => {
    document.body.classList.remove('is-locked');
    dialog.remove();
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.showModal();
  close.focus();
  return dialog;
}
