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

### 团体赛（tie）

团体赛一场比赛由若干「盘」（rubber）组成。盘数、盘的顺序和项目都不固定，因此不用顶层 `detail.sets`，改用 `detail.rubbers`。

```json
{
  "id": "xtc-2026-team-sf-1",
  "kind": "team",
  "players": ["甲队", "乙队"],
  "score": { "gamesWon": 3, "gamesLost": 1 },
  "winner": "甲队",
  "status": "completed",
  "detail": {
    "sets": [],
    "rubbers": [
      {
        "order": 1,
        "kind": "singles",
        "players": [["甲一"], ["乙一"]],
        "score": { "gamesWon": 3, "gamesLost": 1 },
        "games": [
          { "a": 11, "b": 8 },
          { "a": 9, "b": 11 },
          { "a": 11, "b": 6 },
          { "a": 11, "b": 9 }
        ]
      },
      {
        "order": 2,
        "kind": "doubles",
        "players": [["甲一", "甲二"], ["乙一", "乙二"]],
        "score": { "gamesWon": 2, "gamesLost": 3 },
        "games": [
          { "a": 11, "b": 13 },
          { "a": 11, "b": 9 },
          { "a": 8, "b": 11 },
          { "a": 11, "b": 7 },
          { "a": 9, "b": 11 }
        ]
      }
    ],
    "venue": "QTTF Breeze Arena · 1号台",
    "playedAt": "2026-11-20",
    "time": "14:00",
    "teamNote": "甲队 3–1 晋级决赛。"
  }
}
```

规则：

- `kind: "team"` 标记团体赛；也可只靠 `detail.rubbers` 非空识别。
- `players` 是**队名**，顺序即 A/B 顺序。
- `score` 是**盘分**总比分，不是局分。
- `detail.sets` 保持空数组，团体赛不使用。
- `detail.rubbers` 按 `order` 升序展示。
- 每盘 `kind` 支持 `singles`、`doubles`、`mixed`；未识别时显示“对决”。
- 每盘 `players` 是二维数组：`[A 方选手数组, B 方选手数组]`。双打写两名选手。
- 每盘 `score` 是该盘的局分，`games` 是逐局小分。
- 盘数不固定，五盘三胜、四盘、三盘都可以；不要为凑满固定盘数添加空盘。
- `detail.teamNote` 显示在弹窗单盘明细下方，可不填。

---

## 2. 阶段赛制

每个阶段必须显式声明 `format`，同一阶段内的比赛共用该赛制。

### BO 赛制

```json
{
  "id": "doubles-group",
  "name": "小组赛",
  "type": "group",
  "format": {
    "type": "best-of",
    "games": 5
  },
  "groups": []
}
```

- `best-of` 的 `games` 必须为奇数。
- 先赢 `ceil(games / 2)` 局者获胜。
- 不需要打满全部局数。
- BO 赛制不存在平局，`winner` 必填。

### 固定 k 局制

```json
{
  "format": {
    "type": "fixed",
    "games": 6
  }
}
```

- 固定局数制必须打满 `games` 局。
- `games` 为偶数时允许平局：
  - `status: "draw"`
  - `winner: null`
  - 大比分相等
- `games` 为奇数时必须决出胜负，不能使用 `draw`。
- 固定 k 制小组不采用积分排名，按：
  1. 胜局数降序
  2. 负局数升序
  3. 相互战绩
  4. 总得分差

页面积分榜会改为显示“胜–平–负”“胜局–负局”“净胜局”，不显示积分。

### 平局示例

固定 6 局制，双方 3–3：

```json
{
  "score": { "gamesWon": 3, "gamesLost": 3 },
  "winner": null,
  "status": "draw",
  "detail": {
    "sets": [
      { "pointsWon": 11, "pointsLost": 9 },
      { "pointsWon": 8, "pointsLost": 11 },
      { "pointsWon": 11, "pointsLost": 7 },
      { "pointsWon": 9, "pointsLost": 11 },
      { "pointsWon": 11, "pointsLost": 6 },
      { "pointsWon": 8, "pointsLost": 11 }
    ]
  }
}
```

---

## 3. 新增小组

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

### 小组排名

- 小组排名由比赛自动计算，不需要手填。
- BO 小组：胜一场 3 分，负一场 0 分；按积分、胜场、场次、净胜局、净胜分排序。
- 固定 k 小组：不使用积分，按胜局、负局、相互战绩、得分差排序。
- 未赛组合保留在场次为 0 的行中；无比赛小组按 I → II → III 档排序。

---

## 4. 新增一场小组赛

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
- `winner` 必须是 `players` 中的一项；平局必须为 `null`。
- `score.gamesWon` / `gamesLost` 对应 A/B 大比分。
- `sets[].pointsWon` / `pointsLost` 对应 A/B 小分。
- `status` 常用值：`completed`、`draw`、`bye`、`default`、`cancelled`、`scheduled`。
- 固定偶数局制的平局必须使用 `status: "draw"`，不要用 `completed`。

---

## 5. 新增淘汰赛签位

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
- 决赛比赛设置 `"flags": ["final"]`。
- 铜牌赛设置 `"flags": ["bronze"]`，不参与主对阵树。
- 没有 `flags` 时，最后一个轮次被视为决赛轮。

---

## 6. ID 与文件命名

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
- 文件名与 matchId 一致：`matches/qttc-2026-d-a-1.json`
- 不要把空格、斜杠、中文写进文件名。
- 组合名可以写中文和 `/`，但 matchId 不要。

---

## 7. 面向 Agent 的操作顺序

1. 先读本 README。
2. 确认要修改的 `event-id`。
3. 读取 `index.json` 找到 `event.json`。
4. 读取 `event.json` 找分类、阶段、小组/轮次。
5. 修改阶段 `format` 前，确认整组比赛统一采用 BO 或固定 k。
6. 新增比赛：
   - 在事件结构中只添加 matchId。
   - 在 `matches/` 创建完整比赛文件。
7. 修改比分：
   - 只改对应 match 文件。
   - 同步检查 `sets`、`score`、`winner`、`totalPoints`。
8. 添加统计/走势图：填写 `detail.pointLog`，确保每局 ball 从 1 连续递增。
9. 运行：

```bash
npm run validate
npm run build
```

10. 不要创建单体 `events.json`，不要手改 `dist/` 或构建产物。

---

## 8. 校验会检查什么

`npm run validate` 会检查：

- 赛事索引、赛事文件、比赛文件是否存在
- 阶段 `format` 是否合法
- BO 的 `games` 是否为奇数
- 固定 k 制是否打满 k 局
- 固定偶数局的平局是否使用 `status: "draw"` 且 `winner: null`
- 固定奇数局、BO 是否存在非法平局
- 大比分之和是否等于 `sets` 数量
- BO 胜方是否赢够所需局数
- `pointLog` 是否连续
- `pointLog` 每局总分是否与 `sets` 一致
- `pointLog` 总得分是否与 `totalPoints` 一致
- 小组/轮次结构、路由 HTML 入口

常见错误：

| 错误 | 原因 |
|---|---|
| `缺少比赛文件` | `event.json` 引用了不存在的 matchId |
| `matchId 重复` | 两个比赛文件使用同一 id |
| `缺少 stage.format` | 阶段没有声明 BO 或固定 k |
| `best-of 的 games 必须为奇数` | BO 配置成了偶数局 |
| `固定 k 局制必须打满 k 局` | `sets` 数量与 k 不一致 |
| `平局必须使用 status:"draw"` | 大比分相等但状态仍为 completed |
| `平局 winner 必须为 null` | 平局仍填写了胜者 |
| `BO 赛制不存在平局` | BO 比赛填了相等大比分 |
| `pointLog 第 N 局总分与 set 不一致` | 逐球记录或 sets 填错 |

---

## 9. 人类快速检查清单

- [ ] 每届赛事有独立 `event.json`
- [ ] 每场比赛有独立 `matches/<id>.json`
- [ ] 每个阶段都有 `format`
- [ ] 同一小组只使用一种赛制
- [ ] BO 的 `games` 为奇数
- [ ] 固定偶数局平局使用 `status: "draw"` + `winner: null`
- [ ] 固定奇数局没有平局
- [ ] `winner` 在 `players` 中，或平局为 `null`
- [ ] `sets` 数量与 `score` 大比分一致
- [ ] 有 `pointLog` 时，球序号和局分连续
- [ ] 已运行 `npm run validate`
