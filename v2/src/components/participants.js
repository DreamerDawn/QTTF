import { el } from '../lib/dom.js';

/** 数值排序键：空值排最后。 */
function sortValue(value) {
  return value === null || value === undefined || value === '' ? Number.POSITIVE_INFINITY : Number(value);
}

/**
 * 参赛名单网格。种子位优先，其次按排名，未排名者最后。
 * 单打用「名选手」，双打用「对组合」，由 `unit` 指定。
 */
export function participantsSection(participants, { title = '参赛选手', unit = '名选手' } = {}) {
  if (!participants?.length) return null;
  const sorted = [...participants].sort((a, b) => {
    const seedA = sortValue(a.seed);
    const seedB = sortValue(b.seed);
    const hasSeedA = Number.isFinite(seedA);
    const hasSeedB = Number.isFinite(seedB);
    if (hasSeedA !== hasSeedB) return hasSeedA ? -1 : 1;
    if (hasSeedA && seedA !== seedB) return seedA - seedB;
    const rankA = sortValue(a.rank);
    const rankB = sortValue(b.rank);
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
          text:
            participant.points === null || participant.points === undefined
              ? '积分 —'
              : `积分 ${participant.points}`,
        }),
      ]),
    );
  });

  return el('section', { class: 'section' }, [
    el('div', { class: 'section__header' }, [
      el('h2', { class: 'section__title', text: title }),
      el('p', { class: 'section__hint', text: `${participants.length} ${unit}` }),
    ]),
    grid,
  ]);
}
