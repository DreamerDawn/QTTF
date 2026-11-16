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

function validateStageFormat(stage, label) {
  const format = stage.format;
  assert(format && typeof format === 'object', `${label}: 缺少 stage.format`);
  if (!format || typeof format !== 'object') return null;
  assert(['best-of', 'fixed'].includes(format.type), `${label}: stage.format.type 必须为 best-of/fixed`);
  assert(Number.isInteger(format.games) && format.games > 0, `${label}: stage.format.games 必须为正整数`);
  if (format.type === 'best-of') {
    assert(format.games % 2 === 1, `${label}: best-of 的 games 必须为奇数`);
  }
  return format.type && Number.isInteger(format.games) ? format : null;
}

function formatLabel(format) {
  if (!format) return '赛制未设置';
  return format.type === 'fixed' ? `固定 ${format.games} 局` : `BO${format.games}`;
}

/**
 * 团体赛单盘校验：盘数须等于大比分之和；每盘为三局两胜（或 stage.rubberFormat 指定）。
 * rubbers 为空时视为单盘明细缺失，只校验大比分。
 */
function validateRubbers(match, stage, won, lost, label) {
  const rubbers = Array.isArray(match.detail?.rubbers) ? match.detail.rubbers : [];
  if (!rubbers.length) return;

  assert(
    won + lost === rubbers.length,
    `${label}: 大比分之和 ${won + lost} 与单盘数量 ${rubbers.length} 不一致`,
  );

  const rubberFormat = stage?.rubberFormat;
  const target = Number.isInteger(rubberFormat?.games)
    ? Math.ceil(rubberFormat.games / 2)
    : 2;

  rubbers.forEach((rubber, index) => {
    const rLabel = `${label}.rubbers[${index}]`;
    assert(
      Array.isArray(rubber.players) && rubber.players.length === 2,
      `${rLabel}: players 必须是 [A 方, B 方] 两方`,
    );
    (rubber.players || []).forEach((side, sideIndex) => {
      assert(
        Array.isArray(side) && side.length >= 1 && side.length <= 2,
        `${rLabel}: 第 ${sideIndex + 1} 方选手必须是 1–2 人的数组`,
      );
    });
    const gamesWon = rubber.score?.gamesWon;
    const gamesLost = rubber.score?.gamesLost;
    assert(
      Number.isInteger(gamesWon) && Number.isInteger(gamesLost),
      `${rLabel}: 缺少 score.gamesWon / gamesLost`,
    );
    if (!Number.isInteger(gamesWon) || !Number.isInteger(gamesLost)) return;

    const irregular = ['bye', 'default', 'cancelled'].includes(
      String(rubber.status || '').toLowerCase(),
    );
    if (!irregular) {
      assert(gamesWon !== gamesLost, `${rLabel}: 单盘不应为平局`);
    }
    assert(
      Math.max(gamesWon, gamesLost) === target,
      `${rLabel}: 每盘 ${rubberFormat?.games || 3} 局制，胜方应赢 ${target} 局`,
    );

    const games = Array.isArray(rubber.games) ? rubber.games : [];
    if (games.length) {
      assert(
        games.length === gamesWon + gamesLost,
        `${rLabel}: games 数量 ${games.length} 与单盘局分 ${gamesWon + gamesLost} 不一致`,
      );
      games.forEach((game, gameIndex) => {
        assert(
          finiteNumber(game.a) && finiteNumber(game.b),
          `${rLabel}.games[${gameIndex}]: a / b 必须为数字`,
        );
      });
    }
  });
}

function validateMatchResult(match, format, label, stage = null) {
  const status = String(match.status || '').toLowerCase();
  if (['bye', 'default', 'cancelled', 'scheduled', 'unknown'].includes(status)) return;
  assert(format, `${label}: 无法校验结果，缺少合法 stage.format`);
  if (!format) return;
  assert(match.score, `${label}: 已完成比赛缺少 score`);
  if (!match.score) return;

  const won = match.score.gamesWon;
  const lost = match.score.gamesLost;
  assert(Number.isInteger(won) && won >= 0, `${label}: gamesWon 必须为非负整数`);
  assert(Number.isInteger(lost) && lost >= 0, `${label}: gamesLost 必须为非负整数`);
  if (!Number.isInteger(won) || !Number.isInteger(lost)) return;

  const sets = Array.isArray(match.detail?.sets) ? match.detail.sets : [];
  // 每局小分未知时允许 sets 为空数组：只登记大比分，不展示逐球数据。
  if (sets.length > 0) {
    assert(won + lost === sets.length, `${label}: 大比分之和 ${won + lost} 与 sets 数量 ${sets.length} 不一致`);
  } else {
    assert(
      match.detail?.pointsLogged !== true,
      `${label}: sets 为空时不能声明 pointsLogged`,
    );
  }

  validateRubbers(match, stage, won, lost, label);

  if (format.type === 'fixed') {
    if (sets.length === 0) {
      assert(
        won + lost === format.games,
        `${label}: ${formatLabel(format)}大比分之和必须为 ${format.games}`,
      );
    } else {
      assert(
        sets.length === format.games,
        `${label}: ${formatLabel(format)}必须打满 ${format.games} 局，当前 ${sets.length} 局`,
      );
    }
    const canDraw = format.games % 2 === 0;
    if (canDraw && won === lost) {
      assert(status === 'draw', `${label}: 固定偶数局平局必须使用 status:"draw"`);
      assert(match.winner === null, `${label}: 平局 winner 必须为 null`);
    } else {
      assert(status === 'completed', `${label}: 非平局比赛 status 必须为 "completed"`);
      assert(
        match.winner && match.players?.includes(match.winner),
        `${label}: 非平局比赛 winner 必须为参赛选手`,
      );
      assert(won !== lost, `${label}: 胜局与负局相等时不能标记为非平局`);
    }
    return;
  }

  assert(format.type === 'best-of', `${label}: 未知赛制类型`);
  assert(status === 'completed', `${label}: BO 赛制不能使用 status:"draw"`);
  assert(won !== lost, `${label}: BO 赛制不存在平局`);
  assert(won + lost <= format.games, `${label}: sets 数量超过 BO${format.games} 上限`);
  assert(
    Math.max(won, lost) === Math.ceil(format.games / 2),
    `${label}: BO${format.games} 的胜方应赢 ${Math.ceil(format.games / 2)} 局`,
  );
  assert(
    match.winner && match.players?.includes(match.winner),
    `${label}: BO 赛制 winner 必须为参赛选手`,
  );
}

function loadSplitEvents() {
  const index = readJson('src/data/events/index.json');
  if (!index) return null;
  const matchCache = new Map();
  const matchOwner = new Map();
  const readMatch = (eventId, matchId) => {
    const owner = matchOwner.get(matchId);
    assert(
      !owner || owner === eventId,
      `比赛 id 跨赛事重复：${matchId}（${owner} / ${eventId}）`,
    );
    matchOwner.set(matchId, eventId);
    const key = `${eventId}/${matchId}`;
    if (!matchCache.has(key)) {
      const match = readJson(`src/data/events/${eventId}/matches/${matchId}.json`);
      if (!match) throw new Error(`比赛文件不存在：${eventId}/matches/${matchId}.json`);
      matchCache.set(key, match);
    }
    return matchCache.get(key);
  };
  const hydrateStage = (stage, eventId) => {
    const blockKey = stage.type === 'group' ? 'groups' : 'rounds';
    return {
      ...stage,
      [blockKey]: (stage[blockKey] || []).map((block) => ({
        ...block,
        matches: (block.matches || []).map((matchId) => readMatch(eventId, matchId)),
      })),
    };
  };
  const hydrateEvent = (event) => ({
    ...event,
    stages: (event.stages || []).map((stage) => hydrateStage(stage, event.id)),
    categories: (event.categories || []).map((category) => ({
      ...category,
      stages: (category.stages || []).map((stage) => hydrateStage(stage, event.id)),
    })),
  });
  return {
    schemaVersion: index.schemaVersion,
    groups: index.groups || [],
    events: (index.events || []).map((entry) => hydrateEvent(readJson(`src/data/events/${entry.file}`))),
  };
}

const eventsData = loadSplitEvents();
const leaguesData = readJson('src/data/leagues.json');
const rankingsData = readJson('src/data/rankings.json');
const siteData = readJson('src/data/site.json');

if (eventsData) {
  assert(eventsData.schemaVersion === 3, 'events/index.json: schemaVersion 必须为 3');
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
    categories.forEach((category) => {
      (category.participants || []).forEach((player) => participantNames.add(player.name));
    });
    const allStages = [
      ...(event.stages || []),
      ...categories.flatMap((category) => category.stages || []),
    ];
    for (const stage of allStages) {
      assert(stage.id && stage.name, `${label}: stage 缺少 id/name`);
      assert(['group', 'knockout', 'other'].includes(stage.type), `${label}.${stage.id}: stage.type 非法`);
      const stageFormat = validateStageFormat(stage, `${label}.${stage.id}`);
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
            ['completed', 'draw', 'bye', 'default', 'cancelled', 'scheduled', 'unknown'].includes(match.status),
            `${mLabel}: status 非法`,
          );
          if (match.score) {
            assert(finiteNumber(match.score.gamesWon), `${mLabel}: score.gamesWon 必须为数字`);
            assert(finiteNumber(match.score.gamesLost), `${mLabel}: score.gamesLost 必须为数字`);
          }
          const detail = match.detail || {};
          assert(Array.isArray(detail.sets), `${mLabel}: detail.sets 必须为数组`);
          validateMatchResult(match, stageFormat, mLabel, stage);
          if (detail.time) {
            assert(/^([01]\d|2[0-3]):[0-5]\d$/.test(detail.time), `${mLabel}: detail.time 必须为 HH:MM`);
          }
          if (Array.isArray(detail.pointLog) && detail.pointLog.length) {
            const byGame = new Map();
            detail.pointLog.forEach((point) => {
              if (!byGame.has(point.game)) byGame.set(point.game, []);
              byGame.get(point.game).push(point);
            });
            for (const [gameNo, points] of byGame) {
              const sorted = [...points].sort((a, b) => a.ball - b.ball);
              let a = 0;
              let b = 0;
              sorted.forEach((point, index) => {
                const pLabel = `${mLabel}.pointLog.G${gameNo}.${point.ball}`;
                assert(point.ball === index + 1, `${pLabel}: ball 必须从 1 连续递增`);
                assert(point.scoreBefore?.A === a && point.scoreBefore?.B === b, `${pLabel}: scoreBefore 不连续`);
                if (point.scorer === 'A') a += 1;
                else if (point.scorer === 'B') b += 1;
                else assert(false, `${pLabel}: scorer 必须为 A/B`);
                assert(point.scoreAfter?.A === a && point.scoreAfter?.B === b, `${pLabel}: scoreAfter 与 scorer 不一致`);
              });
              const set = detail.sets?.[gameNo - 1];
              assert(set, `${mLabel}: pointLog 第 ${gameNo} 局缺少 set`);
              assert(set.pointsWon === a && set.pointsLost === b, `${mLabel}: pointLog 第 ${gameNo} 局总分与 set 不一致`);
            }
            const loggedA = [...byGame.values()].flat().reduce((sum, point) => sum + (point.scorer === 'A' ? 1 : 0), 0);
            const loggedB = [...byGame.values()].flat().reduce((sum, point) => sum + (point.scorer === 'B' ? 1 : 0), 0);
            if (detail.totalPoints) {
              assert(loggedA === detail.totalPoints.pointsWon, `${mLabel}: pointLog 总得分 A 不一致`);
              assert(loggedB === detail.totalPoints.pointsLost, `${mLabel}: pointLog 总得分 B 不一致`);
            }
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
          ['completed', 'draw', 'bye', 'default', 'cancelled', 'scheduled', 'unknown'].includes(match.status),
          `${mLabel}: status 非法`,
        );
        assert(Array.isArray(match.detail?.sets), `${mLabel}: detail.sets 必须为数组`);
        if (match.detail?.time) {
          assert(
            /^([01]\d|2[0-3]):[0-5]\d$/.test(match.detail.time),
            `${mLabel}: detail.time 必须为 HH:MM`,
          );
        }
        if (match.status === 'completed' || match.status === 'draw') {
          assert(match.score, `${mLabel}: 已完成比赛缺少 score`);
          const equal =
            finiteNumber(match.score?.gamesWon) &&
            finiteNumber(match.score?.gamesLost) &&
            match.score.gamesWon === match.score.gamesLost;
          if (equal) {
            assert(match.status === 'draw', `${mLabel}: 平局比赛必须使用 status:"draw"`);
            assert(match.winner === null, `${mLabel}: 平局比赛 winner 必须为 null`);
          } else {
            assert(match.status === 'completed', `${mLabel}: 非平局比赛 status 必须为 completed`);
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
    eventsData?.events?.reduce((sum, event) => {
      let count = 0;
      const countStages = (stages) => {
        (stages || []).forEach((stage) => {
          const blocks = stage.type === 'group' ? stage.groups || [] : stage.rounds || [];
          blocks.forEach((block) => {
            count += block.matches?.length || 0;
          });
        });
      };
      countStages(event.stages);
      (event.categories || []).forEach((category) => countStages(category.stages));
      return sum + count;
    }, 0) || 0,
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
