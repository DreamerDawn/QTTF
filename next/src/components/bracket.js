import { el } from '../lib/dom.js';

function isBronzeMatch(match) {
  return Array.isArray(match.flags) && match.flags.includes('bronze');
}

function isFinalMatch(match) {
  return Array.isArray(match.flags) && match.flags.includes('final');
}

function mainRounds(stage) {
  return (stage.rounds || [])
    .filter((round) => !(round.matches || []).every(isBronzeMatch))
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

function bronzeMatches(stage) {
  return (stage.rounds || []).flatMap((round) => (round.matches || []).filter(isBronzeMatch));
}

function finalMatchOf(rounds) {
  const flattened = rounds.flatMap((round) => round.matches || []);
  return flattened.find(isFinalMatch) || flattened.at(-1) || null;
}

function bracketMatch(match, round, index, context, onOpen, champion, runnerUp) {
  const [p1, p2] = match.players || ['待定', '待定'];
  const isWinner = (name) => Boolean(match.winner && name === match.winner);
  const final = isFinalMatch(match);
  const classes = [
    'bracket-match',
    final ? 'is-final' : '',
    match.winner === champion ? 'is-champion-path' : '',
    match.winner === runnerUp ? 'is-runnerup-path' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const card = el('article', {
    class: classes,
    role: 'button',
    tabindex: '0',
    'aria-label': `${p1} 对 ${p2}，${match.winner ? `胜者 ${match.winner}` : '未记录胜者'}，点击查看详情`,
  });

  const head = el('div', { class: 'bracket-match__head' }, [
    el('span', { text: `第 ${match.number || index + 1} 场` }),
  ]);
  if (match.status === 'bye') {
    head.append(el('span', { text: '轮空' }));
  }

  const playerRow = (name, games, winner) =>
    el('div', { class: `bracket-player${winner ? ' is-winner' : ''}` }, [
      el('span', { class: 'bracket-player__name', text: name }),
      el('span', { class: 'bracket-player__score', text: games }),
    ]);

  card.append(
    head,
    playerRow(p1, match.score ? String(match.score.gamesWon) : '—', isWinner(p1)),
    playerRow(p2, match.score ? String(match.score.gamesLost) : '—', isWinner(p2)),
  );

  card.addEventListener('click', () => onOpen?.(match, context));
  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen?.(match, context);
    }
  });
  return card;
}

function drawConnections(canvas, lines, rounds, finalRoundIndex) {
  if (!canvas || !lines) return;
  const canvasRect = canvas.getBoundingClientRect();
  lines.replaceChildren();
  lines.setAttribute('viewBox', `0 0 ${Math.max(canvas.scrollWidth, 1)} ${Math.max(canvas.scrollHeight, 1)}`);

  const roundElements = [...canvas.querySelectorAll('.bracket__round')];
  for (let roundIndex = 0; roundIndex < roundElements.length - 1; roundIndex += 1) {
    const current = [...roundElements[roundIndex].querySelectorAll('.bracket-match')];
    const next = [...roundElements[roundIndex + 1].querySelectorAll('.bracket-match')];
    current.forEach((source, index) => {
      const target = next[Math.floor(index / 2)];
      if (!target) return;
      const sourceRect = source.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const x1 = sourceRect.right - canvasRect.left;
      const y1 = sourceRect.top + sourceRect.height / 2 - canvasRect.top;
      const x2 = targetRect.left - canvasRect.left;
      const y2 = targetRect.top + targetRect.height / 2 - canvasRect.top;
      const midX = x1 + (x2 - x1) / 2;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`);
      const targetRoundIndex = roundIndex + 1;
      path.setAttribute('class', `bracket-line${targetRoundIndex === finalRoundIndex ? ' is-final' : ''}`);
      lines.append(path);
    });
  }
}

/**
 * Render a knockout bracket for a cup event. The bracket is data-driven from the
 * existing knockout stage; no extra match data is required.
 */
export function createBracket(stage, event, onOpen) {
  if (!stage || stage.type !== 'knockout') return null;
  const rounds = mainRounds(stage);
  if (rounds.length < 2) return null;

  const finalMatch = finalMatchOf(rounds);
  const champion = finalMatch?.winner || null;
  const runnerUp = finalMatch?.players?.find((name) => name !== champion) || null;
  const finalRound = rounds.find((round) => (round.matches || []).some(isFinalMatch)) || rounds.at(-1);
  const finalRoundIndex = rounds.indexOf(finalRound);
  const bronze = bronzeMatches(stage);

  const section = el('section', {
    class: 'section bracket-section',
    'aria-labelledby': 'bracket-title',
  });
  section.append(
    el('div', { class: 'section__header' }, [
      el('div', {}, [
        el('p', { class: 'eyebrow', text: 'Knockout path' }),
        el('h2', { class: 'section__title', id: 'bracket-title', text: '晋级之路' }),
      ]),
      el('p', { class: 'section__hint', text: `${event.meta.name} · 淘汰赛对阵` }),
    ]),
  );

  const card = el('div', { class: 'bracket-card' });
  const scroll = el('div', { class: 'bracket__scroll', tabindex: '0', 'aria-label': '晋级之路对阵树，可左右滚动' });
  const canvas = el('div', { class: 'bracket__canvas' });
  const lines = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  lines.setAttribute('class', 'bracket__lines');
  lines.setAttribute('aria-hidden', 'true');
  const columns = el('div', { class: 'bracket__columns' });

  rounds.forEach((round, roundIndex) => {
    const column = el('div', {
      class: 'bracket__round',
      dataset: { roundIndex: String(roundIndex) },
    });
    column.append(el('h3', { class: 'bracket__round-title', text: round.name }));
    const matches = el('div', { class: 'bracket__matches' });
    (round.matches || []).forEach((match, matchIndex) => {
      matches.append(
        bracketMatch(
          match,
          round,
          matchIndex,
          { stageName: '淘汰赛', roundName: round.name },
          onOpen,
          champion,
          runnerUp,
        ),
      );
    });
    column.append(matches);
    columns.append(column);
  });

  canvas.append(lines, columns);
  scroll.append(canvas);
  card.append(scroll);
  section.append(card);

  if (bronze.length) {
    const bronzeWrap = el('div', { class: 'bracket-bronze' }, [
      el('h3', { class: 'bracket__round-title', text: '铜牌赛' }),
    ]);
    bronze.forEach((match, index) => {
      bronzeWrap.append(
        bracketMatch(
          match,
          { name: '铜牌赛' },
          index,
          { stageName: '淘汰赛', roundName: '铜牌赛' },
          onOpen,
          champion,
          runnerUp,
        ),
      );
    });
    section.append(bronzeWrap);
  }

  const redraw = () => drawConnections(canvas, lines, rounds, finalRoundIndex);
  requestAnimationFrame(() => {
    requestAnimationFrame(redraw);
    if ('ResizeObserver' in window) {
      const observer = new ResizeObserver(redraw);
      observer.observe(canvas);
    }
  });
  window.addEventListener('resize', redraw, { passive: true });

  return section;
}
