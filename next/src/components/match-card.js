import { el } from '../lib/dom.js';
import { formatMatchPlayers, formatScore, statusLabel } from '../lib/format.js';
import { createStatusBadge } from './badge.js';

function isDraw(match) {
  return (
    match.status === 'completed' &&
    !match.winner &&
    match.score &&
    Number(match.score.gamesWon) === Number(match.score.gamesLost)
  );
}

function playerTotal(match, index) {
  if (!match.score) return '—';
  return String(index === 0 ? match.score.gamesWon : match.score.gamesLost);
}

export function createMatchCard(match, context, onOpen) {
  const { p1, p2 } = formatMatchPlayers(match.players);
  const draw = isDraw(match);
  const isSpecial = ['bye', 'default', 'cancelled'].includes(
    String(match.status || '').toLowerCase(),
  );
  const sets = match.detail?.sets || [];
  const round = context.roundName || context.stageName || '比赛';
  const winner = draw ? null : match.winner;
  const matchNumber = match.number || match.order || null;
  const playedAt = match.detail?.playedAt || context.date || '';
  const playedTime = match.detail?.time || '';
  const venue = match.detail?.venue || '';
  const when = [playedAt, playedTime].filter(Boolean).join(' ');
  const card = el('article', {
    class: `match-card${isSpecial ? ' match-card--special' : ''}${draw ? ' match-card--draw' : ''}`,
    dataset: { matchId: match.id },
  });

  const topRight = el('div', { class: 'match-card__top-right' }, [
    el('span', {
      class: 'match-card__number',
      text: matchNumber ? `第 ${matchNumber} 场` : '场次待定',
    }),
  ]);
  if (draw) {
    topRight.append(el('span', { class: 'match-card__draw-mark', text: '平局' }));
  }
  const top = el('div', { class: 'match-card__topline' }, [
    el('span', { text: round }),
    topRight,
  ]);

  const meta = el('div', { class: 'match-card__meta' }, [
    el('span', { class: 'match-card__datetime', text: when || '比赛时间待定' }),
    venue ? el('span', { class: 'match-card__venue', text: venue }) : null,
  ]);

  const boardWrap = el('div', { class: 'match-card__board-wrap' });
  const board = el('div', { class: 'match-card__board' });
  board.style.setProperty('--period-count', String(Math.max(sets.length, 1)));

  const head = el('div', { class: 'match-card__board-head' });
  head.append(
    el('span', { text: '选手' }),
    el('span', { class: 'match-card__total-label', text: '总比分' }),
  );
  sets.forEach((_, index) => head.append(el('span', { text: `局${index + 1}` })));
  board.append(head);

  const names = [p1, p2];
  names.forEach((name, index) => {
    const rowWinner = winner === name;
    const row = el('div', {
      class: `match-card__player-row${rowWinner ? ' is-winner' : ''}${draw ? ' is-draw' : ''}`,
    });
    const meta = el('div', { class: 'match-card__player-meta' }, [
      el('span', { class: 'match-card__player-name', text: name }),
    ]);
    if (rowWinner) {
      meta.append(el('span', { class: 'match-card__winner-mark', text: '胜' }));
    }
    row.append(meta, el('span', { class: 'match-card__total', text: playerTotal(match, index) }));

    sets.forEach((set) => {
      const value = Number(index === 0 ? set.pointsWon : set.pointsLost);
      const other = Number(index === 0 ? set.pointsLost : set.pointsWon);
      const setWinner = Number.isFinite(value) && value > other;
      row.append(
        el('span', {
          class: `match-card__period${setWinner ? ' is-period-winner' : ''}`,
          text: String(Number.isFinite(value) ? value : '—'),
        }),
      );
    });
    board.append(row);
  });

  boardWrap.append(board);

  const note = el('div', { class: 'match-card__note' });
  if (sets.length === 0) {
    note.textContent = match.status === 'bye' ? '轮空晋级' : '暂无小分';
  }

  const detailButton = el('button', {
    type: 'button',
    class: 'btn btn--secondary btn--small',
    text: '比赛详情',
  });
  const open = (event) => {
    event?.stopPropagation();
    onOpen?.(match, context);
  };
  detailButton.addEventListener('click', open);
  card.addEventListener('click', (event) => {
    if (event.target.closest('button')) return;
    onOpen?.(match, context);
  });

  const footer = el('div', { class: 'match-card__footer' }, [
    el('div', { class: 'badge-row' }, [createStatusBadge(match.status)]),
    detailButton,
  ]);

  card.append(top, meta, boardWrap, note, footer);
  card.setAttribute(
    'aria-label',
    `${p1} 对 ${p2}，${draw ? '平局' : `胜者 ${winner || '未记录'}，比分 ${formatScore(match.score)}`}，${statusLabel(match.status)}`,
  );
  return card;
}
