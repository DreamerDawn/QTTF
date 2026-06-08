# 赛事信息 JSON 规则说明

本项目使用 `QTTC2025_赛程数据.json`（或 `matchdata.json`）作为唯一数据源，供 `index.html` 动态读取并渲染小组赛、淘汰赛、详情弹窗和统计。

## 1. 顶层结构

JSON 最外层应为对象，主要包含两个字段：`matchData` 和 `playerData`。

- `matchData`：阶段索引对象（key 为阶段名）
  - value：比赛数组
  - 常见阶段名称：`groupStage`、`knockoutStage`、`附加赛`、`排位赛`、`资格赛` 等
  - 任何 string -> array 结构都会被自动识别为阶段并渲染
  - `name`：全称，用于页面标题（推荐）
- 顶层 `matchName`：简称，页面会显示为“简称”
- `playerData`：选手元信息对象
  - key：选手姓名
  - value：选手信息（可选字段）
    - `seed`：种子号（数字）
    - `group`：分组（如 `A组`）
    - `rank`：排名（用于参赛选手卡片）
    - `points`：积分（用于参赛选手卡片）
    - `qualified`：晋级状态（字符串，如 `"Stage 2"`、`"附加赛"`；若无则显示默认标识）
    - 其他字段可扩展，例如 `country`、`rating`、`club` 等
- `competitors`：参赛选手数组（可选，优先于 `playerData`，每个项目可包含 `name`,`rank`,`points`）
- `showPodium`：布尔，开启冠/亚/季卡片显示
- `podium`: 冠/亚/季对象，可包含字段 `first`,`second`,`third`，每项包含 `name`,`rank`,`points`

示例：

```json
{
  "matchData": {
    "groupStage": [ ... ],
    "knockoutStage": [ ... ],
    "附加赛": [ ... ]
  },
  "playerData": {
    "张三": { "seed": 1, "group": "A组", "qualified": "Stage 2" },
    "李四": { "seed": 2, "group": "B组" }
  }
}
```

## 2. 比赛条目字段说明

每场比赛对象推荐字段：

- `stage`：所在小组/阶段名称（例如 `A组`、`八分之一决赛`）
- `matchNum`：场次号（用于排序）
- `players`：对阵（字符串，例如 `张三 vs 李四` 或 `张三 VS 李四`）
- `score`：最终比分（字符串，例 `3-1`，未完成可用 `无比分` / `—`）
- `winner`：获胜者姓名，作为高亮依据
- `status`：比赛状态
  - `completed`：正常完成
  - `bye`：轮空
  - `default`：弃赛
  - `cancelled`：取消
  - 其他值视为 `未知`

可选详细信息 `details`（渲染详情弹窗与统计）：

- `sets`：每局比分数组
  - 支持格式：`["11-7","9-11","11-5"]` 或对象数组 `[{p1:11,p2:7},{p1:9,p2:11}]`
- `duration`：比赛时长（分钟）
- `timeout`：暂停记录（数组，如 `[true,false]`）
- `medical`：医疗暂停记录（数组，如 `[false,true]`）
- `notes`：附加文字，如时间/场馆/备注
- `venue` / `location`：比赛场地
- `time` / `date`：时间信息
- `totals`：总分统计（p1 和 p2）
  - 例如 `{ "p1": 54, "p2": 47 }`

### 数据免疫策略

- `players` 句法解析：支持 `vs`、`VS`、`vs.`、`【对决】` 等分隔形式
- 若 `playerData` 不含选手，取 `players` 字段中姓名
- 未提供 `stage` 时默认分组 `默认`
- 未提供 `score` / `sets` 时显示“无比分”或隐藏局分

## 3. 阶段识别与排序

内部默认阶段类型：

- `group`：包含 `group` / `组赛` / `groupstage` 等关键词
- `knockout`：包含 `knockout` / `淘汰` / `决赛` / `半决赛` 等
- 其余归为 `other`

阶段标题排序采用 `stageNameOrder`：

- `附加赛`：5
- `八分之一决赛`：10
- `排位赛`：15
- `四分之一决赛`：20
- `半决赛`：30
- `铜牌赛`：40
- `决赛`：50

## 4. 交互与渲染规则

- 页面支持顶部阶段切换按钮：全部、小组赛、淘汰赛。
- `stage-section` 以 `active` 控制显示/隐藏。
- 小组赛有内部组别 Tab 切换，每个组内展示：
  - 小组排名表（动态列：胜负场（非固定4局制显示）、胜局、负局、胜分、负分、晋级状态）
  - 组内比赛卡片
- 淘汰赛按 `stage` 字段划分轮次，并按 `matchNum` 排序展示
- 小组赛晋级规则：每小组前 2 名选手标注“✓”绿色标识，或显示 `qualified` 字段值
- 小组排名顺序：胜场降序 → 负场升序 → 净胜局降序 → 净胜分降序 → 直接对战胜负 → 姓名排序
- 固定4局制循环赛：若所有比赛 sets 长度为4，则隐藏胜场/负场列

## 5. 编写示例

小组赛示例：

```json
{
  "matchData": {
    "groupStage": [
      {
        "stage": "A组",
        "matchNum": 1,
        "players": "张三 vs 李四",
        "score": "3-1",
        "winner": "张三",
        "status": "completed",
        "details": {
          "sets": ["11-8","9-11","11-6","11-7"],
          "duration": 56,
          "venue": "主馆1号场",
          "notes": "2025-05-01 09:00",
          "totals": {"p1": 42,"p2": 32}
        }
      }
    ]
  },
  "playerData": {
    "张三": {"seed": 1, "group": "A组"},
    "李四": {"seed": 5, "group": "A组"}
  }
}
```

淘汰赛示例：

```json
{
  "matchData": {
    "knockoutStage": [
      {
        "stage": "四分之一决赛",
        "matchNum": 1,
        "players": "王五 vs 赵六",
        "score": "3-2",
        "winner": "王五",
        "status": "completed",
        "details": {
          "sets": ["11-9","8-11","11-7","10-12","11-9"],
          "duration": 70,
          "venue": "主馆2号场"
        }
      }
    ]
  }
}
```

## 6. 常见问题

- 弃赛/取消：`status` 用 `default` / `cancelled`；卡片变红并显示“弃赛/取消”状态；详情不显示每局比分。
- 轮空：`status` 用 `bye`；赛程也能渲染并显示“轮空”。
- 名称拆分失败：请确保 `players` 中有 `vs` 或常用分隔符；否则会全量作为一方选手。
- 新阶段名称：未在 `groupStage` / `knockoutStage` 中定义的阶段，自动归类 `other` 并独立显示。

## 7. 维护提示

- JSON 文件与 `index.html` 同级目录即可。
- 变更后刷新页面即可立即生效，无需服务器重启。
- 若采集赛事数据来源差异较大，可以先批量标准化为本结构，再导入。
