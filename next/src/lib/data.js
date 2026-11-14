import siteJson from '../data/site.json';
import { sitePath } from './router.js';

/** 站点数据很小，静态导入即可在首屏立即渲染导航和页脚。 */
export const site = siteJson;

const cache = {
  events: null,
  leagues: null,
  rankings: null,
};

export function resetDataCache() {
  cache.events = null;
  cache.leagues = null;
  cache.rankings = null;
}

export async function loadEvents() {
  if (!cache.events) {
    cache.events = import('../data/events.json').then((module) => module.default);
  }
  return cache.events;
}

export async function loadLeagues() {
  if (!cache.leagues) {
    cache.leagues = import('../data/leagues.json').then((module) => module.default);
  }
  return cache.leagues;
}

export async function loadRankings() {
  if (!cache.rankings) {
    cache.rankings = import('../data/rankings.json').then((module) => module.default);
  }
  return cache.rankings;
}

export async function loadHomeData() {
  const [events, leagues, rankings] = await Promise.all([
    loadEvents(),
    loadLeagues(),
    loadRankings(),
  ]);
  return { events, leagues, rankings };
}

export function normalizeRoute(route = '') {
  return String(route)
    .replace(/^\/+/, '')
    .replace(/index\.html$/, '')
    .replace(/\/?$/, '/');
}

export function findEvent(eventsData, id) {
  return eventsData.events.find((event) => event.id === id) || null;
}

export function findEventByRoute(eventsData, route) {
  const target = normalizeRoute(route);
  return eventsData.events.find((event) => normalizeRoute(event.route) === target) || null;
}

export function findLeague(leaguesData, id) {
  return leaguesData.leagues.find((league) => league.id === id) || null;
}

export function findLeagueByRoute(leaguesData, route) {
  const target = normalizeRoute(route);
  return leaguesData.leagues.find((league) => normalizeRoute(league.route) === target) || null;
}

export function findSnapshot(rankingsData, id) {
  return rankingsData.snapshots.find((snapshot) => snapshot.id === id) || null;
}

export function findSnapshotByRoute(rankingsData, route) {
  const target = normalizeRoute(route);
  return rankingsData.snapshots.find((snapshot) => normalizeRoute(snapshot.route) === target) || null;
}

export function latestSnapshot(rankingsData) {
  return (
    findSnapshot(rankingsData, rankingsData.current) ||
    rankingsData.snapshots.find((snapshot) => snapshot.status === 'published') ||
    rankingsData.snapshots[0] ||
    null
  );
}

export function eventHref(event) {
  return sitePath(event.route);
}

export function leagueHref(league) {
  return sitePath(league.route);
}

export function snapshotHref(snapshot) {
  return sitePath(snapshot.route);
}

export function homeSlides() {
  return site.home.slides.map((slide) => ({
    ...slide,
    href: sitePath(slide.path),
  }));
}

export function seedsFromRankings(rankingsData, limit = site.home.seedCount || 8) {
  const latest = latestSnapshot(rankingsData);
  if (!latest) return [];
  return latest.rows.slice(0, limit).map((row) => ({
    rank: row.rank,
    name: row.player,
    points: row.points,
    movement: row.movement,
  }));
}

/** 赛事总览的四个系列卡片，自动合并同组赛事与联赛。 */
export function groupSummaries(eventsData, leaguesData) {
  return eventsData.groups.map((group) => {
    const events = eventsData.events
      .filter((event) => event.group === group.id)
      .map((event) => ({
        kind: 'event',
        id: event.id,
        title: event.meta.name,
        subtitle: event.meta.fullName,
        description: event.meta.description,
        status: event.status,
        phase: event.meta.phase || null,
        dateRange: event.meta.dateRange,
        href: eventHref(event),
        searchText: [
          event.meta.name,
          event.meta.fullName,
          event.meta.description,
          event.meta.format,
        ]
          .filter(Boolean)
          .join(' '),
      }));

    const leagues = leaguesData.leagues
      .filter((league) => league.group === group.id)
      .map((league) => ({
        kind: 'league',
        id: league.id,
        title: `${league.shortName} · ${league.name}`,
        subtitle: `${league.tier} · ${league.round}`,
        description: '',
        status: league.status,
        dateRange: null,
        href: leagueHref(league),
        searchText: [league.name, league.shortName, league.tier, league.group]
          .filter(Boolean)
          .join(' '),
      }));

    return {
      ...group,
      items: [...leagues, ...events],
    };
  });
}

export function groupItemsSearchText(group) {
  return [group.name, group.description, ...group.items.map((item) => item.searchText)]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}
