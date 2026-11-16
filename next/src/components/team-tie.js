import { el } from '../lib/dom.js';
import { statusLabel } from '../lib/format.js';
import { createStatusBadge } from './badge.js';

const KIND_LABELS = {
  singles: '单打',
  doubles: '双打',
  mixed: '混双',
};

export function rubberKindLabel(kind) {
  return KIND_LABELS[String(kind || '').toLowerCase()] || '对决';
}

export function rubberPlayers(rubber) {
  const [sideA, sideB] = rubber.players || [[], []];
  const join = (side) => (Array.isArray(side) ? side.filter(Boolean).join(' / ') : String(side || ''));
  return { a: join(sideA), b: join(sideB) };
}

/** 团体赛一盘（rubber）的紧凑行，用于比赛卡片与详情弹窗。 */
export function createRubberRow(rubber, index, options = {}) {
  const { a, b } = rubberPlayers(rubber);
  const scoreA = rubber.score?.gamesWon;
  const scoreB = rubber.score?.gamesLost;
  const done = Number.isFinite(scoreA) && Number.isFinite(scoreB);
  const winnerA = done && Number(scoreA) > Number(scoreB);
  const winnerB = done && Number(scoreB) > Number(scoreA);
  const row = el('div', {
    class: `rubber-row${options.compact ? ' rubber-row--compact' : ''}`,
  });
  const rubberScore = el('span', { class: 'rubber-row__score' });
  if (done) {
    rubberScore.append(
      el('span', { class: winnerA ? 'is-winner' : '', text: String(scoreA) }),
      el('span', { class: 'rubber-row__dash', text: '–' }),
      el('span', { class: winnerB ? 'is-winner' : '', text: String(scoreB) }),
    );
  } else {
    rubberScore.textContent = '—';
  }
  row.append(
    el('span', {
      class: 'rubber-row__order',
      text: rubber.order ? String(rubber.order) : String(index + 1),
    }),
    el('span', { class: 'rubber-row__kind', text: rubberKindLabel(rubber.kind) }),
    el('span', { class: 'rubber-row__side' }, [
      el('span', { class: `rubber-row__name${winnerA ? ' is-winner' : ''}`, text: a || '待定' }),
      rubberScore,
      el('span', { class: `rubber-row__name is-right${winnerB ? ' is-winner' : ''}`, text: b || '待定' }),
    ]),
  );
  return row;
}

/**
 * 团体赛卡片：队名对队名、盘分总比分，内部按盘展开。
 * 盘数不固定，按 detail.rubbers 顺序渲染。
 */
export function createTeamMatchCard(match, context, onOpen) {
  const [teamA, teamB] = match.players || ['待定队伍', '待定队伍'];
  const rubbers = match.detail?.rubbers || [];
  const draw = String(match.status || '').toLowerCase() === 'draw';
  const isSpecial = ['bye', 'default', 'cancelled'].includes(
    String(match.status || '').toLowerCase(),
  );
  const winner = match.winner;
  const round = context.roundName || context.stageName || '比赛';
  const matchNumber = match.number || match.order || null;
  const playedAt = match.detail?.playedAt || context.date || '';
  const playedTime = match.detail?.time || '';
  const venue = match.detail?.venue || '';
  const when = [playedAt, playedTime].filter(Boolean).join(' ');

  const card = el('article', {
    class: `match-card match-card--team${isSpecial ? ' match-card--special' : ''}${draw ? ' match-card--draw' : ''}`,
    dataset: { matchId: match.id },
  });

  const topRight = el('div', { class: 'match-card__top-right' }, [
    el('span', {
      class: 'match-card__number',
      text: matchNumber ? `第 ${matchNumber} 场` : '场次待定',
    }),
  ]);
  if (draw) topRight.append(el('span', { class: 'match-card__draw-mark', text: '平局' }));

  card.append(
    el('div', { class: 'match-card__topline' }, [
      el('span', { text: round }),
      topRight,
    ]),
    el('div', { class: 'match-card__meta' }, [
      el('span', { class: 'match-card__datetime', text: when || '比赛时间待定' }),
      venue ? el('span', { class: 'match-card__venue', text: venue }) : null,
    ]),
  );

  const scoreA = match.score?.gamesWon;
  const scoreB = match.score?.gamesLost;
  const scoreline = el('div', { class: 'team-scoreline' }, [
    el('span', {
      class: `team-scoreline__name${winner === teamA ? ' is-winner' : ''}`,
      text: teamA,
    }),
    el('span', { class: 'team-scoreline__score' }, [
      el('span', {
        class: `team-scoreline__num${winner === teamA ? ' is-winner' : ''}`,
        text: Number.isFinite(scoreA) ? String(scoreA) : '—',
      }),
      el('span', { class: 'team-scoreline__dash', text: '–' }),
      el('span', {
        class: `team-scoreline__num${winner === teamB ? ' is-winner' : ''}`,
        text: Number.isFinite(scoreB) ? String(scoreB) : '—',
      }),
    ]),
    el('span', {
      class: `team-scoreline__name is-right${winner === teamB ? ' is-winner' : ''}`,
      text: teamB,
    }),
  ]);
  card.append(scoreline);

  if (rubbers.length) {
    const list = el('div', { class: 'rubber-list' });
    rubbers.forEach((rubber, index) => list.append(createRubberRow(rubber, index, { compact: true })));
    card.append(list);
  } else if (!isSpecial) {
    card.append(el('p', { class: 'match-card__note', text: '暂无单盘明细' }));
  }

  const detailButton = el('button', {
    type: 'button',
    class: 'btn btn--secondary btn--small',
    text: '比赛详情',
  });
  detailButton.addEventListener('click', (event) => {
    event.stopPropagation();
    onOpen?.(match, context);
  });
  card.addEventListener('click', (event) => {
    if (event.target.closest('button')) return;
    onOpen?.(match, context);
  });

  card.append(
    el('div', { class: 'match-card__footer' }, [
      el('div', { class: 'badge-row' }, [createStatusBadge(match.status)]),
      detailButton,
    ]),
  );
  card.setAttribute(
    'aria-label',
    `${teamA} 对 ${teamB}，${draw ? '平局' : `胜者 ${winner || '未记录'}，盘分 ${scoreA ?? '—'}–${scoreB ?? '—'}`}，${statusLabel(match.status)}`,
  );
  return card;
}
