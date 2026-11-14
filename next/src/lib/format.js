const DATE_FORMAT = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

const SHORT_DATE_FORMAT = new Intl.DateTimeFormat('zh-CN', {
  month: 'long',
  day: 'numeric',
});

export function formatDate(value) {
  if (!value) return '待定';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return DATE_FORMAT.format(date);
}

export function formatDateRange(range) {
  if (!range?.start && !range?.end) return '日期待定';
  if (!range?.start) return `截至 ${formatDate(range.end)}`;
  if (!range?.end || range.start === range.end) return formatDate(range.start);
  const start = new Date(`${range.start}T00:00:00`);
  const end = new Date(`${range.end}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return `${range.start} – ${range.end}`;
  }
  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
    return `${formatDate(range.start)} – ${SHORT_DATE_FORMAT.format(end)}`;
  }
  return `${formatDate(range.start)} – ${formatDate(range.end)}`;
}

export function formatScore(score) {
  if (!score) return '—';
  return `${score.gamesWon ?? 0}–${score.gamesLost ?? 0}`;
}

export function formatSet(set) {
  return `${set.pointsWon ?? 0}–${set.pointsLost ?? 0}`;
}

export const STATUS_LABELS = {
  completed: '已完成',
  bye: '轮空',
  default: '弃赛',
  cancelled: '取消',
  scheduled: '未开始',
  unknown: '未知',
};

export function statusLabel(status) {
  return STATUS_LABELS[String(status || 'unknown').toLowerCase()] || '未知';
}

export function statusVariant(status) {
  const key = String(status || 'unknown').toLowerCase();
  if (key === 'completed') return 'w';
  if (key === 'default' || key === 'cancelled') return 'l';
  if (key === 'bye' || key === 'scheduled') return 'info';
  return 'empty';
}

export function formatMovement(movement) {
  if (!movement || movement.direction === 'none') {
    return { text: '—', tone: 'none' };
  }
  if (movement.direction === 'new') return { text: 'NEW', tone: 'new' };
  const arrows = { up: '↑', down: '↓' };
  const arrow = arrows[movement.direction] || '';
  return {
    text: `${arrow}${movement.places || ''}`,
    tone: movement.direction,
  };
}

export function formatForm(result) {
  const key = String(result || '').toUpperCase();
  if (key === 'W') return { text: 'W', tone: 'w', label: '胜' };
  if (key === 'D') return { text: 'D', tone: 'd', label: '平' };
  if (key === 'L') return { text: 'L', tone: 'l', label: '负' };
  return { text: '–', tone: 'empty', label: '无记录' };
}

export function formatMatchPlayers(players) {
  const [p1 = '待定', p2 = '待定'] = Array.isArray(players) ? players : [];
  return { p1, p2 };
}

export function formatDuration(minutes) {
  if (minutes === null || minutes === undefined) return '无数据';
  if (Number(minutes) === 0) return '未记录';
  return `${minutes} 分钟`;
}

export function boolLabel(value) {
  if (value === true) return '有';
  if (value === false) return '无';
  return '无数据';
}

export function formatNoteDate(note) {
  if (!note) return null;
  const match = String(note).match(/(20\d{2})年(\d{1,2})月(\d{1,2})日/);
  if (!match) return null;
  return `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`;
}
