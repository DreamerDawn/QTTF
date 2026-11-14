#!/usr/bin/env node
/**
 * QTTF v2 数据契约校验。
 *
 * 目标不是替代 JSON Schema，而是在构建前尽早发现：
 * - 重复 ID / 路由
 * - 赛事分组、选手、比分、局分、区域范围的结构错误
 * - last3 / last5 / difference 等旧字段回流
 * - 数据路由缺少对应 HTML 入口
 *
 * 用 node scripts/validate-data.mjs 运行；有 error 时退出码为 1。
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const warnings = [];

function readJson(relativePath) {
  const absolute = resolve(root, relativePath);
  try {
    return JSON.parse(readFileSync(absolute, 'utf8'));
  } catch (error) {
    errors.push(`${relativePath}: 无法读取或解析 JSON — ${error.message}`);
    return null;
  }
}

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function warn(condition, message) {
  if (!condition) warnings.push(message);
}

function uniqueBy(items, key, label) {
  const seen = new Set();
  for (const item of items || []) {
    const value = item?.[key];
    assert(value !== undefined && value !== null && value !== '', `${label}: 缺少 ${key}`);
    if (value !== undefined && value !== null) {
      assert(!seen.has(value), `${label}: ${key} 重复 — ${value}`);
      seen.add(value);
    }
  }
}

function routeExists(route, label) {
  assert(typeof route === 'string' && route.length > 0, `${label}: route 为空`);
  if (typeof route !== 'string' || !route) return;
  const normalized = route.replace(/^\/+/, '').replace(/\/?$/, '/');
  const file = resolve(root, normalized, 'index.html');
  assert(existsSync(file), `${label}: 路由 ${route} 缺少入口文件 ${normalized}index.html`);
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function booleanTriplet(value) {
  return Array.isArray(value) && value.length === 2 && value.every((item) => typeof item === 'boolean');
}

const eventsData = readJson('src/data/events.json');
const leaguesData = readJson('src/data/leagues.json');
const rankingsData = readJson('src/data/rankings.json');
const siteData = readJson('src/data/site.json');

if (eventsData) {
  assert(eventsData.schemaVersion === 2, 'events.json: schemaVersion 必须为 2');
  const groups = eventsData.groups || [];
  const events = eventsData.events || [];
  uniqueBy(groups, 'id', 'events.groups');
  uniqueBy(events, 'id', 'events.events');
  uniqueBy(events, 'route', 'events.events');

  const groupIds = new Set(groups.map((group) => group.id));
  for (const group of groups) {
    assert(group.name, `events.groups.${group.id}: 缺少 name`);
    assert(group.description, `events.groups.${group.id}: 缺少 description`);
    assert(['blue', 'violet', 'orange', 'green'].includes(group.accent), `events.groups.${group.id}: accent 非法`);
  }

  for (const event of events) {
    const label = `events.events.${event.id || '(no-id)'}`;
    assert(groupIds.has(event.group), `${label}: group "${event.group}" 不存在`);
    assert(['published', 'coming-soon'].includes(event.status), `${label}: status 非法`);
    routeExists(event.route, label);
    assert(event.meta?.name, `${label}: 缺少 meta.name`);
    assert(event.meta?.fullName, `${label}: 缺少 meta.fullName`);
    if (event.meta?.dateRange) {
      const { start, end } = event.meta.dateRange;
      assert(!start || /^\d{4}-\d{2}-\d{2}$/.test(start), `${label}: dateRange.start 格式错误`);
      assert(!end || /^\d{4}-\d{2}-\d{2}$/.test(end), `${label}: dateRange.end 格式错误`);
      if (start && end) assert(start <= end, `${label}: dateRange 开始晚于结束`);
    }
    uniqueBy(event.participants, 'name', `${label}.participants`);
    if (event.meta?.deadline) {
      assert(/^\d{4}-\d{2}-\d{2}$/.test(event.meta.deadline), `${label}: deadline 格式错误`);
    }
    if (event.meta?.phase) {
      assert(['upcoming', 'ongoing', 'completed'].includes(event.meta.phase), `${label}: phase 非法`);
    }

    const categories = event.categories || [];
    uniqueBy(categories, 'id', `${label}.categories`);
    for (const category of categories) {
      const cLabel = `${label}.categories.${category.id || '(no-id)'}`;
      assert(category.name, `${cLabel}: 缺少 name`);
      assert(Array.isArray(category.stages), `${cLabel}: stages 必须为数组`);
      uniqueBy(category.participants || [], 'name', `${cLabel}.participants`);
      for (const stage of category.stages) {
        assert(stage.id && stage.name, `${cLabel}: stage 缺少 id/name`);
        assert(['group', 'knockout', 'other'].includes(stage.type), `${cLabel}.${stage.id}: stage.type 非法`);
      }
    }

    if (event.status === 'published') {
      const hasStage = (event.stages || []).length > 0 || categories.some((category) => (category.stages || []).length > 0);
      assert(hasStage, `${label}: 已发布赛事必须有 stages 或 categories[].stages`);
    }

    const matchIds = new Set();
    let matchCount = 0;
    const participantNames = new Set((event.participants || []).map((player) => player.name));
    for (const stage of event.stages || []) {
      assert(stage.id && stage.name, `${label}: stage 缺少 id/name`);
      assert(['group', 'knockout', 'other'].includes(stage.type), `${label}.${stage.id}: stage.type 非法`);
      const groupsOrRounds = stage.type === 'group' ? stage.groups || [] : stage.rounds || [];
      uniqueBy(
        groupsOrRounds,
        'id',
        `${label}.${stage.id}.${stage.type === 'group' ? 'groups' : 'rounds'}`,
      );
      for (const block of groupsOrRounds) {
        assert(block.name, `${label}.${stage.id}: 分组/轮次缺少 name`);
        for (const match of block.matches || []) {
          matchCount += 1;
          const mLabel = `${label}.${stage.id}.${block.name}.${match.id || '(no-id)'}`;
          assert(match.id, `${mLabel}: 缺少 id`);
          assert(!matchIds.has(match.id), `${mLabel}: 比赛 id 重复`);
          matchIds.add(match.id);
          assert(Array.isArray(match.players) && match.players.length === 2, `${mLabel}: players 必须为 2 人`);
          const [p1, p2] = match.players || [];
          assert(p1 && p2, `${mLabel}: players 不能为空`);
          if (participantNames.size) {
            warn(participantNames.has(p1), `${mLabel}: 选手 ${p1} 不在 participants 中`);
            warn(participantNames.has(p2) || p2 === '轮空', `${mLabel}: 选手 ${p2} 不在 participants 中`);
          }
          assert(
            ['completed', 'bye', 'default', 'cancelled', 'scheduled', 'unknown'].includes(match.status),
            `${mLabel}: status 非法`,
          );
          if (match.score) {
            assert(finiteNumber(match.score.gamesWon), `${mLabel}: score.gamesWon 必须为数字`);
            assert(finiteNumber(match.score.gamesLost), `${mLabel}: score.gamesLost 必须为数字`);
          }
          if (match.status === 'completed') {
            assert(match.score, `${mLabel}: 已完成比赛缺少 score`);
          }
          if (match.winner && match.status !== 'scheduled') {
            assert([p1, p2].includes(match.winner), `${mLabel}: winner 不属于对阵列`);
          }
          const detail = match.detail || {};
          assert(Array.isArray(detail.sets), `${mLabel}: detail.sets 必须为数组`);
          if (detail.time) {
            assert(/^([01]\d|2[0-3]):[0-5]\d$/.test(detail.time), `${mLabel}: detail.time 必须为 HH:MM`);
          }
          (detail.sets || []).forEach((set, index) => {
            assert(finiteNumber(set.pointsWon), `${mLabel}.sets[${index}]: pointsWon 必须为数字`);
            assert(finiteNumber(set.pointsLost), `${mLabel}.sets[${index}]: pointsLost 必须为数字`);
          });
          if (detail.timeouts !== null && detail.timeouts !== undefined) {
            assert(booleanTriplet(detail.timeouts), `${mLabel}: timeouts 必须为 2 个布尔值`);
          }
          if (detail.medicalTimeouts !== null && detail.medicalTimeouts !== undefined) {
            assert(booleanTriplet(detail.medicalTimeouts), `${mLabel}: medicalTimeouts 必须为 2 个布尔值`);
          }
          if (detail.totalPoints) {
            assert(finiteNumber(detail.totalPoints.pointsWon), `${mLabel}: totalPoints.pointsWon 必须为数字`);
            assert(finiteNumber(detail.totalPoints.pointsLost), `${mLabel}: totalPoints.pointsLost 必须为数字`);
          }
        }
      }
    }
    if (event.status === 'published') {
      warn(matchCount > 0 || categories.length > 0, `${label}: 已发布赛事没有比赛记录`);
    }
  }
}

if (leaguesData) {
  assert(leaguesData.schemaVersion === 2, 'leagues.json: schemaVersion 必须为 2');
  const leagues = leaguesData.leagues || [];
  uniqueBy(leagues, 'id', 'leagues.leagues');
  uniqueBy(leagues, 'route', 'leagues.leagues');
  for (const league of leagues) {
    const label = `leagues.leagues.${league.id || '(no-id)'}`;
    routeExists(league.route, label);
    assert(league.name && league.shortName, `${label}: 缺少 name/shortName`);
    assert(finiteNumber(league.formLength) && league.formLength > 0, `${label}: formLength 必须为正数`);
    uniqueBy(league.standings, 'rank', `${label}.standings`);
    uniqueBy(league.standings, 'team', `${label}.standings`);
    let maxForm = 0;
    for (const row of league.standings || []) {
      const rLabel = `${label}.standings.${row.team || row.rank}`;
      for (const key of [
        'matches',
        'wins',
        'draws',
        'losses',
        'gamesWon',
        'gamesLost',
        'gameDifference',
        'points',
      ]) {
        assert(finiteNumber(row[key]), `${rLabel}: ${key} 必须为数字`);
      }
      if (Array.isArray(row.lastN)) {
        maxForm = Math.max(maxForm, row.lastN.length);
        row.lastN.forEach((result, index) => {
          assert(
            ['W', 'D', 'L', ''].includes(result),
            `${rLabel}.lastN[${index}]: 只能为 W/D/L/空字符串`,
          );
        });
      } else {
        errors.push(`${rLabel}: 缺少 lastN 数组`);
      }
      warn(row.matches >= row.wins + row.draws + row.losses, `${rLabel}: 胜平负之和超过场次`);
      warn(
        row.gameDifference === row.gamesWon - row.gamesLost,
        `${rLabel}: gameDifference 与胜局-负局不一致`,
      );
    }
    if (maxForm) assert(league.formLength >= maxForm, `${label}: formLength 小于 lastN 数组长度`);

    const zones = league.zones || [];
    uniqueBy(zones, 'id', `${label}.zones`);
    const sorted = [...zones].sort((a, b) => a.from - b.from);
    for (const zone of zones) {
      const zLabel = `${label}.zones.${zone.id || '(no-id)'}`;
      assert(zone.name, `${zLabel}: 缺少 name`);
      assert(finiteNumber(zone.from) && finiteNumber(zone.to), `${zLabel}: from/to 必须为数字`);
      assert(zone.from >= 1 && zone.to >= zone.from, `${zLabel}: 名次范围非法`);
      assert(['qualify', 'playoff', 'relegation'].includes(zone.tone), `${zLabel}: tone 非法`);
    }
    for (let index = 1; index < sorted.length; index += 1) {
      warn(
        sorted[index].from > sorted[index - 1].to,
        `${label}.zones: 区域 ${sorted[index - 1].id} 与 ${sorted[index].id} 重叠`,
      );
    }

    const weeks = league.matchweeks || [];
    uniqueBy(weeks, 'id', `${label}.matchweeks`);
    for (const week of weeks) {
      const wLabel = `${label}.matchweeks.${week.id || '(no-id)'}`;
      assert(week.label, `${wLabel}: 缺少 label`);
      uniqueBy(week.matches, 'id', `${wLabel}.matches`);
      for (const match of week.matches || []) {
        const mLabel = `${wLabel}.matches.${match.id || '(no-id)'}`;
        assert(Array.isArray(match.players) && match.players.length === 2, `${mLabel}: players 必须为 2 人`);
        assert(
          ['completed', 'bye', 'default', 'cancelled', 'scheduled', 'unknown'].includes(match.status),
          `${mLabel}: status 非法`,
        );
        assert(Array.isArray(match.detail?.sets), `${mLabel}: detail.sets 必须为数组`);
        if (match.detail?.time) {
          assert(
            /^([01]\d|2[0-3]):[0-5]\d$/.test(match.detail.time),
            `${mLabel}: detail.time 必须为 HH:MM`,
          );
        }
        if (match.status === 'completed') {
          assert(match.score, `${mLabel}: 已完成比赛缺少 score`);
          const equal =
            finiteNumber(match.score?.gamesWon) &&
            finiteNumber(match.score?.gamesLost) &&
            match.score.gamesWon === match.score.gamesLost;
          if (equal) {
            assert(!match.winner, `${mLabel}: 平局比赛 winner 必须为空`);
          } else {
            assert(match.winner && match.players.includes(match.winner), `${mLabel}: winner 必须是参赛选手`);
          }
        }
        (match.detail?.sets || []).forEach((set, index) => {
          assert(finiteNumber(set.pointsWon), `${mLabel}.sets[${index}]: pointsWon 必须为数字`);
          assert(finiteNumber(set.pointsLost), `${mLabel}.sets[${index}]: pointsLost 必须为数字`);
        });
      }
    }
  }
}

if (rankingsData) {
  assert(rankingsData.schemaVersion === 2, 'rankings.json: schemaVersion 必须为 2');
  const snapshots = rankingsData.snapshots || [];
  uniqueBy(snapshots, 'id', 'rankings.snapshots');
  uniqueBy(snapshots, 'route', 'rankings.snapshots');
  assert(
    snapshots.some((snapshot) => snapshot.id === rankingsData.current),
    'rankings.json: current 未指向任何快照',
  );
  for (const snapshot of snapshots) {
    const label = `rankings.snapshots.${snapshot.id || '(no-id)'}`;
    routeExists(snapshot.route, label);
    assert(['published', 'unavailable'].includes(snapshot.status), `${label}: status 非法`);
    if (snapshot.status === 'published') {
      assert(snapshot.rows?.length > 0, `${label}: 已发布快照必须有 rows`);
    }
    uniqueBy(snapshot.rows, 'rank', `${label}.rows`);
    for (const row of snapshot.rows || []) {
      const rLabel = `${label}.rows.${row.rank}`;
      assert(row.player, `${rLabel}: 缺少 player`);
      assert(finiteNumber(row.points), `${rLabel}: points 必须为数字`);
      assert(['up', 'down', 'new', 'none'].includes(row.movement?.direction), `${rLabel}: movement.direction 非法`);
      assert(
        Array.isArray(row.history),
        `${rLabel}: history 必须为数组`,
      );
      assert(row.position <= row.rank, `${rLabel}: position 不应大于 rank`);
      if (Array.isArray(row.history)) {
        const historyTotal = row.history.reduce((sum, item) => sum + (Number(item.points) || 0), 0);
        assert(
          historyTotal === row.points,
          `${rLabel}: history 积分之和 ${historyTotal} 不等于 points ${row.points}`,
        );
      }
    }
  }
}

if (siteData) {
  assert(siteData.schemaVersion === 2, 'site.json: schemaVersion 必须为 2');
  assert(siteData.navigation?.length, 'site.json: navigation 不能为空');
  for (const item of siteData.navigation || []) {
    assert(item.label, 'site.navigation: 缺少 label');
    assert(typeof item.path === 'string', `site.navigation.${item.label}: path 必须为字符串`);
  }
  assert(siteData.home?.slides?.length, 'site.json: home.slides 不能为空');
  uniqueBy(siteData.home?.slides, 'id', 'site.home.slides');
  assert(siteData.contact?.email, 'site.json: contact.email 不能为空');
  for (const path of ['events/', 'rankings/', 'about/', 'contact/']) {
    assert(existsSync(resolve(root, path, 'index.html')), `site.json: 导航目标 ${path} 缺少入口`);
  }
}

for (const [file, data] of [
  ['events.json', eventsData],
  ['leagues.json', leaguesData],
  ['rankings.json', rankingsData],
  ['site.json', siteData],
]) {
  if (!data) continue;
  const text = JSON.stringify(data);
  for (const legacy of ['"last3"', '"last5"', '"goalsFor"', '"goalsAgainst"', '"difference"']) {
    assert(!text.includes(legacy), `${file}: 发现旧字段 ${legacy}`);
  }
}

const summary = {
  events: eventsData?.events?.length || 0,
  matches:
    eventsData?.events?.reduce(
      (sum, event) =>
        sum +
        (event.stages || []).reduce(
          (stageSum, stage) =>
            stageSum +
            (stage.type === 'group' ? stage.groups || [] : stage.rounds || []).reduce(
              (blockSum, block) => blockSum + (block.matches?.length || 0),
              0,
            ),
          0,
        ),
      0,
    ) || 0,
  leagues: leaguesData?.leagues?.length || 0,
  standings: leaguesData?.leagues?.reduce((sum, league) => sum + (league.standings?.length || 0), 0) || 0,
  matchweeks:
    leaguesData?.leagues?.reduce((sum, league) => sum + (league.matchweeks?.length || 0), 0) || 0,
  leagueMatches:
    leaguesData?.leagues?.reduce(
      (sum, league) =>
        sum + (league.matchweeks || []).reduce((weekSum, week) => weekSum + (week.matches?.length || 0), 0),
      0,
    ) || 0,
  snapshots: rankingsData?.snapshots?.length || 0,
  rankingRows: rankingsData?.snapshots?.reduce((sum, snapshot) => sum + (snapshot.rows?.length || 0), 0) || 0,
};

console.log('QTTF v2 data validation');
console.log(JSON.stringify(summary, null, 2));
if (warnings.length) {
  console.log(`\n${warnings.length} warning(s):`);
  warnings.forEach((warning) => console.log(`  ! ${warning}`));
}
if (errors.length) {
  console.error(`\n${errors.length} error(s):`);
  errors.forEach((error) => console.error(`  × ${error}`));
  process.exitCode = 1;
} else {
  console.log('\n✓ data contract is valid');
}
