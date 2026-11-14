# 赛事数据维护说明

本目录是 QTTC 赛事数据的唯一来源。请不要再把赛事或比赛合并进一个大的 `events.json`。

- 每届赛事：一个目录
- 每届赛事结构：`event.json`
- 每场比赛：`matches/<matchId>.json`
- 赛事总索引：`index.json`

页面加载时由 `src/lib/data.js` 自动组装，不需要手动生成聚合文件。

---

## 1. 目录结构

```text
src/data/events/
├── index.json
├── qttc-2026/
│   ├── event.json
│   └── matches/
│       ├── qttc-2026-d-a-1.json
│       └── ...
├── qttc-2025/
│   ├── event.json
│   └── matches/
└── ...
```

### `index.json`

只保存赛事分组和赛事文件索引。

```json
{
  "schemaVersion": 3,
  "groups": [
    {
      "id": "qttc",
      "name": "QTTC",
      "description": "年度旗舰赛事",
      "accent": "blue"
    }
  ],
  "events": [
    {
      "id": "qttc-2026",
      "file": "qttc-2026/event.json"
    }
  ]
}
```

新增一届赛事时：

1. 新建 `src/data/events/<event-id>/`
2. 新建 `event.json`
3. 新建 `matches/`
4. 在 `index.json` 的 `events` 中登记
5. 新增对应 HTML 入口并加入 `vite.config.js`

### `event.json`

保存赛事信息、参赛者、小组/淘汰赛结构。**只放 matchId，不放比赛详情。**

```json
{
  "id": "qttc-2026",
  "route": "events/qttc/qttc2026/",
  "group": "qttc",
  "status": "published",
  "meta": {
    "name": "QTTC 2026",
    "fullName": "2026年丘班乒乓球锦标赛暨“觚棻”杯",
    "format": "小组赛 + 淘汰赛",
    "dateRange": {
      "start": "2026-11-09",
      "end": "2026-12-04"
    },
    "venue": "QTTF Breeze Arena",
    "deadline": "2026-11-07",
    "organizer": "丘班乒乓球联合会",
    "phase": "ongoing",
    "description": "赛事简介"
  },
  "participants": [],
  "podium": null,
  "stages": [],
  "categories": []
}
```

### `matches/<matchId>.json`

保存这一场的**全部数据**。

```json
{
  "id": "qttc-2026-d-a-1",
  "number": 1,
  "order": 1,
  "players": ["陈子扬/唐近尧", "刘函宇/梁博涛"],
  "score": { "gamesWon": 3, "gamesLost": 2 },
  "winner": "陈子扬/唐近尧",
  "status": "completed",
  "flags": ["group-a"],
  "detail": {
    "sets": [
      { "pointsWon": 10, "pointsLost": 12 },
      { "pointsWon": 12, "pointsLost": 10 },
      { "pointsWon": 8, "pointsLost": 11 },
      { "pointsWon": 14, "pointsLost": 12 },
      { "pointsWon": 11, "pointsLost": 8 }
    ],
    "durationMinutes": 27,
    "timeouts": [false, true],
    "medicalTimeouts": [false, false],
    "totalPoints": { "pointsWon": 55, "pointsLost": 53 },
    "venue": "QTTF Breeze Arena · 1号台",
    "playedAt": "2026-11-12",
    "time": "17:46",
    "note": "第5局B组合5–9时普通暂停。",
    "pointLog": []
  }
}
```

`pointLog` 可选；有逐球记录时，比赛详情弹窗会显示全场/单局统计和走势图。

```json
{
  "game": 1,
  "ball": 1,
  "scorer": "B",
  "serve": "B",
  "scoreBefore": { "A": 0, "B": 0 },
  "scoreAfter": { "A": 0, "B": 1 },
  "deuce": false
}
```

---

## 2. 新增小组

在 `event.json` 对应分类的 `stages` 中找到 `type: "group"` 的阶段，在 `groups` 中加入：

```json
{
  "id": "doubles-a",
  "name": "A组",
  "matches": []
}
```

- `id` 在本阶段内唯一。
- `name` 是页面显示名称。
- `matches` 只写 matchId，例如 `"qttc-2026-d-a-1"`。
- 不要把比赛对象直接写进 `event.json`。

参赛组合放入对应分类的 `participants`：

```json
{
  "name": "陈子扬/唐近尧",
  "seed": null,
  "rank": null,
  "points": null,
  "group": "A组",
  "tier": "II"
}
```

双打组合名统一用 `"甲/乙"` 格式。

### 小组积分

- 小组排名由比赛自动计算，不需要手填。
- 胜一场 3 分，负一场 0 分。
- 页面按积分、胜场、已赛场次、净胜局、净胜分排序。
- 未赛组合保留在场次为 0 的行中。

---

## 3. 新增一场小组赛

1. 在 `event.json` 的对应小组 `matches` 中加入新 matchId。
2. 在 `matches/` 中新建同名 JSON。
3. 在比赛文件中填写 `players`、`score`、`winner`、`detail.sets`。
4. 如果有逐球数据，填写 `detail.pointLog`。
5. 运行校验。

比赛文件示例：

```json
{
  "id": "qttc-2026-d-a-2",
  "number": 2,
  "order": 2,
  "players": ["陈子扬/唐近尧", "朱恩骏/胡雅文"],
  "score": { "gamesWon": 3, "gamesLost": 1 },
  "winner": "陈子扬/唐近尧",
  "status": "completed",
  "detail": {
    "sets": [
      { "pointsWon": 11, "pointsLost": 7 },
      { "pointsWon": 9, "pointsLost": 11 },
      { "pointsWon": 11, "pointsLost": 6 },
      { "pointsWon": 11, "pointsLost": 8 }
    ],
    "durationMinutes": 24,
    "timeouts": [false, false],
    "medicalTimeouts": [false, false],
    "totalPoints": { "pointsWon": 42, "pointsLost": 32 },
    "venue": "QTTF Breeze Arena · 1号台",
    "playedAt": "2026-11-13",
    "time": "17:30",
    "note": ""
  }
}
```

规则：

- `players` 顺序就是 A/B 顺序。
- `winner` 必须是 `players` 中的一项。
- `score.gamesWon` / `gamesLost` 对应 A/B 大比分。
- `sets[].pointsWon` / `pointsLost` 对应 A/B 小分。
- `status` 常用值：`completed`、`bye`、`default`、`cancelled`、`scheduled`。

---

## 4. 新增淘汰赛签位

在分类的 `stages` 中找到 `type: "knockout"` 的阶段，在 `rounds` 中加入轮次：

```json
{
  "id": "qf",
  "name": "四分之一决赛",
  "order": 20,
  "matches": [
    "qttc-2026-k-qf-1",
    "qttc-2026-k-qf-2",
    "qttc-2026-k-qf-3",
    "qttc-2026-k-qf-4"
  ]
}
```

规则：

- `order` 决定左右顺序，从小到大。
- 每轮 `matches` 按签位顺序排列。
- 下一轮第 1 场默认由上一轮第 1、2 场胜者组成，第 2 场由第 3、4 场胜者组成，依此类推。
- 决赛比赛设置：

```json
"flags": ["final"]
```

- 铜牌赛设置：

```json
"flags": ["bronze"]
```

- 铜牌赛不参与主对阵树；没有 `flags` 时，最后一个轮次被视为决赛轮。

---

## 5. ID 与文件命名

推荐格式：

```text
<event-id>-<category>-<stage>-<number>
```

例如：

```text
qttc-2026-d-a-1
qttc-2026-d-k-qf-1
qttc-2026-s-k-final
```

要求：

- 全局 matchId 唯一。
- 文件名与 matchId 一致：

```text
matches/qttc-2026-d-a-1.json
```

- 不要把空格、斜杠、中文写进文件名。
- 组合名可以写中文和 `/`，但 matchId 不要。

---

## 6. 面向 Agent 的操作顺序

1. 先读本 README。
2. 确认要修改的 `event-id`。
3. 读取 `index.json` 找到 `event.json`。
4. 读取 `event.json` 找分类、阶段、小组/轮次。
5. 如果要新增比赛：
   - 在事件结构中只添加 matchId。
   - 在 `matches/` 创建完整比赛文件。
6. 如果要修改比分：
   - 只改对应 match 文件。
   - 同步检查 `sets`、`score`、`winner`、`totalPoints`。
7. 如果需要统计/走势图：
   - 添加 `detail.pointLog`，确保每个 game 从 ball 1 连续递增。
8. 运行：

```bash
npm run validate
npm run build
```

9. 不要创建新的单体 `events.json`。
10. 不要手改 `dist/` 或构建产物。

---

## 7. 校验会检查什么

`npm run validate` 会检查：

- 赛事索引、赛事文件、比赛文件是否存在
- matchId 是否被引用且文件存在
- ID 是否重复
- 比分、胜者、局分是否一致
- `pointLog` 是否连续
- `pointLog` 每局总分是否与 `sets` 一致
- `pointLog` 总得分是否与 `totalPoints` 一致
- 小组/轮次结构
- 赛事路由 HTML 入口是否存在
- 新增赛事是否登记

常见错误：

| 错误 | 原因 |
|---|---|
| `缺少比赛文件` | `event.json` 引用了不存在的 matchId |
| `matchId 重复` | 两个比赛文件使用同一 id |
| `winner 不属于对阵列` | winner 与 players 不一致 |
| `pointLog 第 N 局总分与 set 不一致` | 逐球记录或 sets 填错 |
| `路由缺少入口文件` | 新赛事没有对应 `index.html` |
| `stage.type 非法` | 只能使用 `group` / `knockout` / `other` |

---

## 8. 人类快速检查清单

- [ ] 每届赛事有独立 `event.json`
- [ ] 每场比赛有独立 `matches/<id>.json`
- [ ] `event.json` 中只出现 matchId，不出现完整比赛对象
- [ ] 双打组合名使用 `甲/乙`
- [ ] `winner` 在 `players` 中
- [ ] `sets` 与 `score` 一致
- [ ] 有 `pointLog` 时，球序号和局分连续
- [ ] 新赛事已加入 `index.json`
- [ ] 新赛事有 HTML 入口和 `vite.config.js` 入口
- [ ] 已运行 `npm run validate`
