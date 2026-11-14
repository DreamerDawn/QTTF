import { statusLabel, statusVariant } from './format.js';

export const ZONE_TONES = {
  qualify: {
    label: '晋级 / 校运区',
    className: 'qualify',
    swatch: 'qualify',
  },
  playoff: {
    label: '附加赛区',
    className: 'playoff',
    swatch: 'playoff',
  },
  relegation: {
    label: '降级区',
    className: 'relegation',
    swatch: 'relegation',
  },
};

/** 唯一的名次 → 区域匹配入口。 */
export function zoneForRank(zones, rank) {
  if (!Array.isArray(zones) || !Number.isFinite(Number(rank))) return null;
  return (
    zones.find((zone) => Number(rank) >= Number(zone.from) && Number(rank) <= Number(zone.to)) ||
    null
  );
}

export function zoneClassName(zone) {
  if (!zone) return '';
  return ZONE_TONES[zone.tone]?.className || 'qualify';
}

export function zoneBannerClass(zone) {
  if (!zone) return '';
  return `zone-banner zone-banner--${zoneClassName(zone)}`;
}

export function zoneRowClass(zone) {
  if (!zone) return '';
  return `zone-row--${zoneClassName(zone)}`;
}

/**
 * 按名次顺序插入区域顶栏。只有区域发生变化时才插入，避免每行重复。
 * @param {Array<Record<string, unknown>>} rows
 * @param {Array<Record<string, unknown>>} zones
 */
export function buildZoneAwareRows(rows, zones) {
  const output = [];
  let previousZoneId = null;
  for (const row of rows) {
    const zone = zoneForRank(zones, row.rank);
    const zoneId = zone?.id || null;
    if (zone && zoneId !== previousZoneId) {
      output.push({ kind: 'zone', zone });
    }
    output.push({
      kind: 'row',
      row,
      zone,
      rowClass: zoneRowClass(zone),
      statusLabel: statusLabel(row.status),
      statusVariant: statusVariant(row.status),
    });
    previousZoneId = zoneId;
  }
  return output;
}

export function zoneLegend(zones) {
  return (zones || []).map((zone) => ({
    ...zone,
    toneMeta: ZONE_TONES[zone.tone] || ZONE_TONES.qualify,
  }));
}
