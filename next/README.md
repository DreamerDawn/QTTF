# QTTF v2 — 重构版静态站点

> 本目录是**独立的新版本**。根目录旧版文件全部保持只读、未被修改；仓库中位于 `next/`，可单独安装、开发、构建。
>
> 生产预览部署在 `https://<user>.github.io/QTTF/next/`。根目录 `.github/workflows/deploy.yml` 会同时打包旧站和 `next/dist`，因此不会覆盖旧站。

## 1. 技术选型

| 能力 | 选择 | 原因 |
|---|---|---|
| 静态打包 | **Vite 8** | 原生多页面入口、开发服务器快、GitHub Pages `base` 支持清晰、配置量小 |
| 页面/组件 | **原生 ES Modules + 模板函数** | 现有多为轻交互，引入 React/Vue 成本高；组件仍是共享模块，不复制 HTML |
| 样式 | **CSS 设计令牌 + 分层 CSS** | 颜色、间距、圆角、阴影、断点集中管理 |
| 数据维护 | **JSON + Git** | 无后台登录、无 OAuth 服务；改数据后提交，Actions 自动发布 |
| 部署 | **GitHub Actions + Pages** | 纯静态，无付费后端 |

没有选择 Parcel：本项目是典型的多入口静态站，Vite 的 `rollupOptions.input`、`base`、PostCSS 与 GitHub Pages 文档更直接；Parcel 的零配置优势在这里不足以抵消多页面路径与部署控制的额外不确定性。

## 2. 快速开始

要求 Node.js **20.19+**（推荐 22/24）。

```powershell
cd next
npm install
npm run dev
```

打开：

- 站点：<http://127.0.0.1:5173/QTTF/>

`npm run dev` 只启动 Vite（5173）。内容管理页面已移除，数据通过编辑 `src/data/*.json` 维护。

### 常用命令

```powershell
npm run dev        # 仅启动 Vite
npm run dev:site   # 只启动站点
npm run validate   # 数据契约校验
npm run build      # 输出 dist/
npm run preview    # 预览生产构建（默认 4173）
npm run check      # validate + build
```

如果使用 pnpm：

```powershell
pnpm install
pnpm dev
pnpm validate
pnpm build
```

## 3. 目录结构

```text
next/
├── index.html                          # / 首页
├── homepage/index.html                 # 旧 /homepage 兼容跳转
├── events/
│   ├── index.html                      # /events/ 赛事总览
│   ├── league/index.html               # 旧 /events/league/ 兼容跳转
│   ├── league/qsl/index.html           # QSL 积分榜
│   ├── league/qcl/index.html           # QCL 积分榜
│   ├── qttc/qttc2025/index.html        # 2025 赛事详情
│   ├── qttc/qttc2026/index.html        # 2026 单打/双打签表页
│   ├── qttc/qttc2024/index.html        # 保留旧链接 → 档案整理中
│   ├── zgcup2024/index.html            # 保留旧链接 → 档案整理中
│   └── tryout/xtcq2026/index.html      # 保留旧链接 → 档案整理中
├── rankings/
│   ├── index.html                      # 最新排名
│   ├── 2026-01/index.html              # 2026年1月快照
│   ├── 2026-06/index.html              # 2026年6月最新快照
│   └── 2024-10 … 2025-11/index.html    # 无数据快照的空状态页
├── about/index.html
├── contact/index.html
├── 404.html
├── src/
│   ├── data/
│   │   ├── site.json                   # 站点 / 导航 / 首页 / 关于 / 联系
│   │   ├── events.json                 # 所有赛事、阶段、比赛、选手、领奖台
│   │   ├── leagues.json                # 联赛、积分榜、区域
│   │   ├── rankings.json               # 排名快照
│   │   └── schema.json                 # JSON Schema 说明
│   ├── styles/
│   │   ├── tokens.css                  # 设计令牌（唯一颜色/断点来源）
│   │   ├── base.css                    # reset、排版、布局工具
│   │   ├── components.css              # 导航、页脚、卡片、按钮、表格、徽章、弹窗、状态
│   │   └── pages.css                   # 页面级布局，仍只使用令牌
│   ├── components/                     # nav / footer / table / tabs / badge / match-card / match-dialog / status
│   ├── lib/                            # data / format / stats / zones / router / dom / types
│   └── pages/                          # home / events / event-detail / qttc2026 / league / rankings / about / contact / 404
├── public/
│   └── QTTF.png
├── scripts/validate-data.mjs
├── .github/workflows/                  # 部署/校验模板（需复制到仓库根目录）
├── vite.config.js
├── postcss.config.js
├── package.json
└── README.md
```

所有 HTML 入口都只有 `<div id="app">` 与一个页面模块引用；导航、页脚、样式、数据读取不在页面间复制。

## 4. 数据契约

### 4.1 四个文件，四个职责

| 文件 | 顶层键 | 职责 |
|---|---|---|
| `src/data/site.json` | `schemaVersion`, `site`, `navigation`, `home`, `about`, `contact` | 站点级信息与首页内容 |
| `src/data/events.json` | `schemaVersion`, `groups`, `events` | 所有赛事；每项含 `meta`、`participants`、`podium`、`stages` |
| `src/data/leagues.json` | `schemaVersion`, `leagues` | 联赛；每项含 `standings`、`matchweeks`、`zones`、`notes` |
| `src/data/rankings.json` | `schemaVersion`, `current`, `snapshots` | 排名快照；每项含 `rows`、`movement`、`history` |

统一的命名约定：

- 比分：`score.gamesWon` / `score.gamesLost`
- 局内得分：`sets[].pointsWon` / `sets[].pointsLost`（相对 `players[0]`）
- 比赛时间：`detail.playedAt`（YYYY-MM-DD）+ `detail.time`（HH:MM）；`detail.venue` 记录球台/场地
- 近期战绩：`lastN` 数组；表头根据数组长度显示“最近 N 场”
- 联赛逐场赛况：`matchweeks[].matches` 复用赛事比赛结构；平局时 `winner: null` 且大比分相等
- 区域语义：`tone: "qualify" | "playoff" | "relegation"`；具体色值仅存在于 `tokens.css`
- 日期：`YYYY-MM-DD`
- 路由：`route` 始终以 `/` 结尾

完整字段类型见 `src/lib/types.js` 的 JSDoc typedef，JSON Schema 见 `src/data/schema.json`。

### 4.2 旧字段 → 新字段映射

| 旧结构 | 新结构 | 说明 |
|---|---|---|
| `matchName` | `event.meta.name` | 赛事简称 |
| `matchData.Name` | `event.meta.fullName` | 赛事全称 |
| 顶层 `format` | `event.meta.format` | 赛制 |
| `matchData.groupStage[]` | `event.stages[type=group].groups[].matches[]` | 小组赛 |
| `matchData.knockoutStage[]` | `event.stages[type=knockout].rounds[].matches[]` | 淘汰赛 |
| `players: "A vs B"` | `players: ["A", "B"]` | 不再运行时拆分字符串 |
| `score: "3-2"` | `score: { gamesWon: 3, gamesLost: 2 }` | 数字类型 |
| `details.sets: ["9-11", …]` | `detail.sets: [{ pointsWon: 9, pointsLost: 11 }, …]` | 数字类型 |
| `details.duration` | `detail.durationMinutes` | 明确单位 |
| `details.timeout` | `detail.timeouts` | 保留双布尔数组 |
| `details.medical` | `detail.medicalTimeouts` | 语义更清楚 |
| `details.totals.p1/p2` | `detail.totalPoints.pointsWon/pointsLost` | 统一前缀 |
| `details.notes` | `detail.note` | 单数字段 |
| `details.date` | `detail.playedAt` | 统一日期字段 |
| `playerData{}` | `event.participants[]` | 数组，带 `seed/rank/points/group` |
| `podium.first/second/third` | 不变 | 但只在 `showPodium` 不必要的情况下由数据是否存在决定 |
| `leagueName` | `league.name` | |
| `teams[]` | `standings[]` | |
| `last3` | `lastN` | **不出现 last3/last5 硬编码** |
| `zones{ key: {range, color} }` | `zones[{ from, to, tone }]` | 数组保持顺序；颜色语义化 |
| `color: "green"/"grey"` | `tone: "qualify"/"playoff"/"relegation"` | 颜色映射集中在 `lib/zones.js` 与 `tokens.css` |
| `supplement` | `notes` | |
| `rankings.json` 顶层数组 | `snapshots[].rows[]` | 支持历史快照 |
| 排名 `name` | `row.player` | 与联赛 `team` 明确区分 |
| 排名 `difference: "↑2"` | `movement: { direction, places }` | 结构可排序、可访问 |
| 排名 `expires_on` | `history[].expiresOn` | camelCase |

### 4.3 旧文件 → 新模块

| 旧文件 | v2 中的取代者 |
|---|---|
| `homepage/index.html` | `index.html` + `src/pages/home.js`；`homepage/index.html` 仅做兼容跳转 |
| `events/index.html` | `events/index.html` + `src/pages/events.js` |
| `events/qttc/qttc2025/index.html` | `src/pages/event-detail.js` + `src/data/events.json` |
| `events/qttc/qttc2025/matchdata.json` | `src/data/events.json` 的 `qttc-2025` |
| `events/league/qsl/index.html` | `src/pages/league.js` + `src/data/leagues.json` |
| `events/league/qcl/index.html` | 同上 |
| `events/league/league.json`、`qsl/league.json`、`qcl/25-26ii/league.json` 等重复副本 | 合并为 `src/data/leagues.json` |
| `rankings/index.html` | `src/pages/rankings.js` |
| `rankings/rankings.json`、`rankings/2026-01/rankings.json` | 合并为 `src/data/rankings.json` |
| `about/index.html` | `about/index.html` + `src/pages/about.js` |
| 各页内联 `<style>` / `<header>` / 页脚 | `src/styles/*` + `src/components/{nav,footer}.js` |
| `newmatch/`、`model.html` | 内部开发工具，未迁移；根目录原文件仍在 |
| `404.html` / `contact/` 等占位页 | 统一状态组件 + 真实联系页 / 404 页 |

### 4.4 数据说明与已知差异

1. **QSL 数据**取 `events/league/qsl/league.json`（包含完整补充说明）；QCL 取 `events/league/qcl/league.json` 的真实 11 队数据。
2. QCL 的 `25-26ii/league.json` 实际是 QSL 的 8 队副本，未迁移，避免两个联赛显示同一份榜单。
3. 源数据中 QCL 的“邹雨岑”存在 `matches: 1` 与 `draws: 3` 不一致。**原样保留**并在 `npm run validate` 中给出 warning，等待维护者核对，不在重构中篡改赛果。
4. QTTC 2024、追光杯、选拔赛旧页面原本就是“建设中”占位；v2 保留路由并显示统一的“赛事档案整理中”空状态，不伪造数据。
5. `events/tryout/xtcq2026/matchdata.json` 与 QTTC 2025 小组赛高度重复，未能确认是真实赛果，因此未作为已发布赛事迁移；对应路由保留为档案整理中。
6. 历史排名月份（2024-10、2024-11、2025-07、2025-11）没有可迁移的结构化数据，v2 生成对应 URL 的空状态页，避免 404。
7. 旧版 `↓-3` 这类别扭的負号会规范为 `↓3`；这是有意的展示修正。
8. 联赛区域颜色由旧的 green/grey 两色映射改为语义化三色（晋级绿、附加赛蓝、降级灰）；逻辑与区域范围不变，属于有意的视觉优化。
9. 联赛排序首次点击降序（旧实现首次点击为升序）。这是有意的可用性修正；点击“排名”恢复默认顺序。
10. 导航当前页改为持久高亮，不再依赖鼠标悬停切换 `active`；这是可访问性优化。
11. 赛事参赛选手按真实排名排序；`rank: null` 的选手排在最后，不再因为 `Number(null) === 0` 被排到最前。
12. 首页主入口改为 `/`；旧 `/homepage/` 继续可用（自动跳转）。
13. `2026-06` 排名由维护者提供的积分表补录：共 23 行，`QTTC 2025`、`XTC Qualification`、`XTC Final`、`League(Test)` 四项积分之和即总分；并列第 19 名用 `position: 19`、`rank: 19/20/21` 表达。积分为 0 的赛事名次代码统一为 `DNP`；其余暂无名次信息的非零赛事显示 `—`。

## 5. 设计系统

- 视觉方向：极简中性底 + 高斯模糊玻璃卡片，参考 DeepSeek 官网。
- 品牌主色采用 DeepSeek 蓝 `#4d6bfe` 的 AA 微调值 `--accent: #4a63e8`；暗色模式使用 `#6799fe`。
- 页面底色：亮色 `#f9f8f8`，暗色 `#0a0a0a`，不再使用页面渐变。
- 玻璃令牌集中在 `src/styles/tokens.css`：
  - `--glass-bg` / `--glass-bg-hover` / `--glass-bg-fallback`
  - `--glass-blur`（12px）与 `--glass-blur-mobile`（6px）
  - `--glass-border` / `--glass-shadow` / `--glass-radius`
  - `--nav-bg` / `--nav-blur`
  - 所有颜色、语义色、区域色、字体、流体间距、圆角、投影
- 流体字号和间距使用 `clamp()`，不再在某个像素突然跳变。
- 卡片网格、功能卡、赛事卡、比赛卡、选手卡、领奖台均使用 `repeat(auto-fit, minmax(min(100%, …), 1fr))` 内在网格。
- 组件级响应式使用容器查询：
  - `@container card (--cq-card)`：窄卡片 footer 纵向排列；
  - `@container match-card (--cq-card)`：窄比赛卡选手/比分堆叠；
  - `@container data-table (--cq-table)`：窄容器下表格转为字段卡片行，并保留可排序表头。
- 页面级媒体查询只保留结构性场景：导航折叠（`--bp-nav`，48rem）、侧栏出现（`--bp-wide`，60.0625rem）与性能/偏好降级。
- `backdrop-filter` 同时声明 `-webkit-backdrop-filter`，并配合 `transform: translateZ(0)` / `will-change: transform`；不支持、移动端、`prefers-reduced-transparency` 时退回纯色半透明背景。
- 暗色模式自动跟随 `prefers-color-scheme: dark`，无额外切换逻辑。

视觉参考（由无头 Edge 在 1440px / 320px 下生成）：

- [桌面首页](docs/screenshots/home-desktop.png)
- [移动端首页](docs/screenshots/home-mobile.png)
- [移动端联赛积分榜](docs/screenshots/league-mobile.png)
- [桌面端排名](docs/screenshots/rankings-desktop.png)
- [移动端排名 ITTF 行卡片](docs/screenshots/rankings-mobile.png)
- [移动端排名积分构成](docs/screenshots/rankings-mobile-open.png)
- [窄屏小组排名](docs/screenshots/group-standings-mobile.png)
- [QTTC 2026 桌面端](docs/screenshots/qttc2026-desktop.png)
- [QTTC 2026 签表空状态](docs/screenshots/qttc2026-draws.png)
- [QTTC 2026 移动端](docs/screenshots/qttc2026-mobile.png)
- [横向比赛卡](docs/screenshots/match-card.png)
- [晋级之路对阵树](docs/screenshots/bracket-desktop.png)
- [关于页桌面端](docs/screenshots/about-desktop.png)
- [关于页移动端](docs/screenshots/about-mobile.png)
- [关于页时间线](docs/screenshots/about-timeline.png)
- [联赛每周赛况空状态](docs/screenshots/league-weekly-empty.png)
- [深色首页](docs/screenshots/home-dark.png)

## 6. 页面与交互

- **首页**：5 张轮播（自动播放 8s、可暂停/点选）、4 个功能卡、种子选手（从最新排名派生，不再硬编码 `sampleRankings`）。
- **赛事总览**：4 个系列卡片，实时搜索；联赛与赛事自动归组。
- **QTTC 2026**：单打 / 双打分类，分类内切换小组赛 / 淘汰赛；海报式米白、薄荷、海军蓝主题，数据留空时不伪造签表。
- **赛事详情**：
  - 阶段导航：全部 / 小组赛 / 淘汰赛
  - 小组 Tab：A–F
  - 小组排名：胜/负/胜局/负局/胜分/负分/晋级；固定四局制自动隐藏胜/负列
  - “晋级之路”对阵树：数据驱动生成淘汰赛轮次、SVG 连接线、决赛路径高亮；点击对阵卡打开详情
  - 比赛卡：横向记分牌，顺序为“选手 → 总比分 → 各局小分”；顶部固定显示“第 N 场”和“日期 + 时间 + 场地”，胜方行高亮并带方块“胜”，平局显示“平局”且不标记胜方
  - 比赛详情弹窗：每局比分表 + 总得分/暂停/医疗暂停表 + 场馆/时长/备注
- **联赛**：搜索、按积分/胜局/净胜局排序、区域顶栏与行背景、动态 `最近 N 场` 徽章、补充说明。
  - 积分榜下方新增“每周赛况”，周次 Tabs + 横向比赛卡集合
  - 逐场比分待录入时显示统一空状态，不伪造比分
  - 平局通过 `winner: null` 与相等大比分表达，卡片显示“平局”且不高亮任何一方
- **排名**：ITTF 风格行卡片；窄屏显示“排名方块 → 姓名 → 变化 → 积分”，展开后显示类别/赛事/失效日/名次/积分。
- **关于**：均衡排版的宗旨 Hero、关键档案、三年理念关键词、按年份分组的时间线；窄屏在大标题逗号处均衡换行，不出现单字孤行。
- **联系/404**：共享导航页脚与设计令牌；联系页替换了旧占位页。
- **统一状态**：loading 骨架、空状态、错误状态均由 `components/status.js` 渲染。

## 7. 数据维护（无后台）

内容管理页面与 OAuth 依赖已移除，站点是纯静态发布。数据直接编辑：

- `src/data/events.json`：赛事、阶段、比赛、签表
- `src/data/leagues.json`：积分榜、每周赛况
- `src/data/rankings.json`：排名快照
- `src/data/site.json`：导航、首页、关于、联系

修改后运行：

```powershell
npm run validate
npm run build
```

字段说明见 `src/lib/types.js` 与 `src/data/schema.json`。

## 8. 部署与版本隔离

### 8.1 构建

```powershell
cd next
npm run build
```

产物为 `next/dist/`，包含：

- 20 个独立 HTML 页面
- `dist/assets/*`（JS/CSS）
- `dist/QTTF.png`

默认 `base` 是 `/QTTF/`，适合 `https://<user>.github.io/QTTF/`。若部署到自定义域名或根路径：

```powershell
$env:BASE_PATH='/'
npm run build
```

或在 CI 中设置 `BASE_PATH`。

### 8.2 本地预览生产包

```powershell
npm run preview
# http://127.0.0.1:4173/QTTF/
```

### 8.3 GitHub Actions

仓库根目录的 `.github/workflows/deploy.yml` 负责发布：

- 在 `next/` 中安装、校验、构建
- 使用 `BASE_PATH=/${{ github.event.repository.name }}/next/`
- 把旧站根目录与 `next/dist` 一起打包
- 部署到 `/QTTF/` 与 `/QTTF/next/`

仓库 `next/` 是部署源码；修改后推送 `main` 即可触发。

## 9. 校验与验收记录

已在当前工作区完成：

```text
npm run validate
  events: 5
  matches: 34
  leagues: 2
  standings: 19
  matchweeks: 0
  leagueMatches: 0
  snapshots: 6
  rankingRows: 43
  ✓ data contract is valid
  ! QCL 邹雨岑 胜平负之和超过场次（源数据待核对）

npm run build
  ✓ 20 个 HTML 入口构建成功
  ✓ 全部 HTML 中引用的 /QTTF/ 资源在 preview 下返回 200

浏览器冒烟测试：
  ✓ 首页 5 张轮播、8 个种子、4 个功能卡
  ✓ 赛事阶段筛选、A–F 小组切换、比赛弹窗统计表
  ✓ 联赛搜索、积分排序、动态最近 3 场徽章、3 个区域顶栏
  ✓ 排名行展开/收起历史

响应式视觉检查（320 / 768 / 1024 / 1440 / 1920，7 个页面）：
  ✓ 无页面级横向滚动、无内容溢出
  ✓ 大卡片 background-image 均为 none，无渐变残留
  ✓ 联赛积分榜在 320/768 为字段卡片行，1024 起恢复表格
  ✓ 选手排名在 320/768/1024 为字段卡片行，1440 起恢复表格
  ✓ 320 下可排序表头仍可点击，排名历史仍可展开，导航可折叠

第二阶段功能验证：
  ✓ 排名窄屏为“排名 → 姓名/变化 → 积分”ITTF 行卡片
  ✓ 历史积分显示类别、赛事、失效日、名次、积分
  ✓ 比赛卡为“选手 → 总比分 → 各局小分”，胜方行有方块“胜”
  ✓ 平局显示“平局”且不标胜方
  ✓ QTTC 2025 晋级之路 4 轮、14 条连接线，无“冠军/亚军”说明文字
  ✓ 点击对阵卡打开比赛详情
  ✓ 联赛“每周赛况”空状态正常
  ✓ 联赛比赛卡显示“第 N 场 + 日期时间 + 场地”
  ✓ 关于页 1120/508/320 下大标题分别为 1/2/2 行，无单字孤行
  ✓ 关于页关键档案、理念关键词、按年份时间线与侧栏链接正常
  ✓ QTTC 2026 单打/双打分类、小组赛/淘汰赛切换与空状态
  ✓ QTTC 2026 在 320px 下无页面横向滚动
  ✓ 内容管理页面与页脚入口已移除
  ✓ 深色模式自动切换；prefers-reduced-transparency 下 blur 为 none

另已验证 BASE_PATH=/custom-base/ 时所有资源链接自动改写；
默认构建仍为 /QTTF/。
```

## 10. 维护提示

- 新增赛事：编辑 `events` 列表；新增后必须同时新增对应 `route` 的 HTML 入口（或复用现有通用入口），否则 `npm run validate` 会报路由缺失。
- 新增联赛：编辑 `leagues`，`lastN` 数组长度会自动决定“最近 N 场”。
- 修改区域颜色：只改 `tokens.css` 的 `--zone-*`，不要改页面内联样式。
- 修改页面断点：只改 `tokens.css` 的 `@custom-media`；修改组件容器阈值：只改 `tokens.css` 的 `@custom-container`。`postcss.config.js` 会自动展开，无需在组件内重复数值。
- 提交前运行 `npm run check`。
- `QTTF.png` 约 1.6 MB，后续可压缩为 WebP/AVIF 并保留 fallback；本次优先保证资源路径独立可用。

## 11. 原项目完整性声明

- 根目录 `homepage/`、`events/`、`rankings/`、`about/`、`contact/`、`404.html`、`model.html`、`newmatch/`、所有旧 JSON、旧图片均未修改。
- 仓库根目录新增 `.github/workflows/deploy.yml`；`next/` 源码通过该工作流构建并发布到 `/QTTF/next/`。
- `next/` 不通过相对路径引用根目录源码、样式或数据。
- 旧站仍随同一个 Pages artifact 发布，`/QTTF/` 不受影响。

