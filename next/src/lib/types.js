/**
 * QTTF v2 数据契约类型说明。
 *
 * 这些 JSDoc typedef 是运行时数据的“可读类型层”：
 * - 站点只使用原生 JavaScript，不引入 TypeScript 构建成本；
 * - 编辑器与 IDE 可以通过 // @ts-check 获得补全；
 * - 字段语义与 src/data/schema.json 保持一致。
 */

/**
 * @typedef {object} SiteInfo
 * @property {string} name
 * @property {string} fullName
 * @property {string} tagline
 * @property {string} description
 * @property {string} logo
 * @property {string} footer
 * @property {string} repository
 */

/**
 * @typedef {object} NavItem
 * @property {string} label
 * @property {string} path 站内相对路径，首页为空字符串。
 */

/**
 * @typedef {object} Slide
 * @property {string} id
 * @property {string} title
 * @property {string} description
 * @property {string} path
 * @property {'rose'|'teal'|'navy'|'violet'|'sunset'} theme
 */

/**
 * @typedef {object} HistoryEntry
 * @property {string} date YYYY-MM
 * @property {string} text
 */

/**
 * @typedef {object} ContactInfo
 * @property {string} email
 * @property {string} bilibili
 * @property {string} bilibiliLabel
 * @property {string} note
 */

/**
 * @typedef {object} SiteData
 * @property {2} schemaVersion
 * @property {SiteInfo} site
 * @property {NavItem[]} navigation
 * @property {{slides: Slide[], seedCount: number}} home
 * @property {{motto: string, tagline: string, intro: string, facts: Array<{label: string, value: string}>, values: string, history: HistoryEntry[]}} about
 * @property {ContactInfo} contact
 */

/**
 * @typedef {object} EventGroup
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {'blue'|'violet'|'orange'|'green'} accent
 */

/**
 * @typedef {object} EventMeta
 * @property {string} name
 * @property {string} fullName
 * @property {string} format
 * @property {{start: string|null, end: string|null}} dateRange
 * @property {string|null} venue
 * @property {string} description
 * @property {string} [tagline]
 * @property {string|null} [deadline]
 * @property {string} [organizer]
 * @property {'upcoming'|'ongoing'|'completed'} [phase]
 */

/**
 * @typedef {object} Participant
 * @property {string} name
 * @property {number|null} seed
 * @property {number|null} rank
 * @property {number|null} points
 * @property {string} [group]
 * @property {string} [qualified]
 */

/**
 * @typedef {object} PodiumItem
 * @property {string} name
 * @property {number} [rank]
 * @property {number} [points]
 */

/**
 * @typedef {object} Podium
 * @property {PodiumItem} [first]
 * @property {PodiumItem} [second]
 * @property {PodiumItem} [third]
 */

/**
 * @typedef {object} SetScore
 * @property {number} pointsWon 相对 players[0] 的得分。
 * @property {number} pointsLost 相对 players[0] 的失分。
 */

/**
 * @typedef {object} MatchDetail
 * @property {SetScore[]} sets
 * @property {number|null} durationMinutes
 * @property {[boolean, boolean]|null} timeouts
 * @property {[boolean, boolean]|null} medicalTimeouts
 * @property {{pointsWon: number, pointsLost: number}|null} totalPoints
 * @property {string|null} venue
 * @property {string|null} playedAt YYYY-MM-DD
 * @property {string|null} time HH:MM
 * @property {string|null} note
 */

/**
 * @typedef {object} Match
 * @property {string} id
 * @property {number|null} number
 * @property {number} order
 * @property {[string, string]} players
 * @property {{gamesWon: number, gamesLost: number}|null} score 相对 players[0]。
 * @property {string|null} winner
 * @property {'completed'|'bye'|'default'|'cancelled'|'scheduled'|'unknown'} status
 * @property {MatchDetail} detail
 * @property {string[]} [flags]
 */

/**
 * @typedef {object} GroupStageGroup
 * @property {string} id
 * @property {string} name
 * @property {Match[]} matches
 */

/**
 * @typedef {object} KnockoutRound
 * @property {string} id
 * @property {string} name
 * @property {number} order
 * @property {Match[]} matches
 */

/**
 * @typedef {object} Stage
 * @property {string} id
 * @property {string} name
 * @property {'group'|'knockout'|'other'} type
 * @property {GroupStageGroup[]} [groups]
 * @property {KnockoutRound[]} [rounds]
 */

/**
 * @typedef {object} EventCategory
 * @property {string} id
 * @property {string} name
 * @property {string} [fullName]
 * @property {string} [format]
 * @property {Participant[]} [participants]
 * @property {Stage[]} stages
 * @property {Podium|null} [podium]
 */

/**
 * @typedef {object} Event
 * @property {string} id
 * @property {string} route
 * @property {'qttc'|'zgcup'|'tryout'|'classleague'} group
 * @property {'published'|'coming-soon'} status
 * @property {EventMeta} meta
 * @property {Participant[]} participants
 * @property {Podium|null} podium
 * @property {Stage[]} stages
 * @property {EventCategory[]} [categories]
 */

/**
 * @typedef {object} EventsData
 * @property {2} schemaVersion
 * @property {EventGroup[]} groups
 * @property {Event[]} events
 */

/**
 * @typedef {object} StandingRow
 * @property {number} rank
 * @property {string} team
 * @property {number} matches
 * @property {number} wins
 * @property {number} draws
 * @property {number} losses
 * @property {number} gamesWon
 * @property {number} gamesLost
 * @property {number} gameDifference
 * @property {number} points
 * @property {Array<'W'|'D'|'L'|''>} lastN 数组长度即“最近 N 场”的 N。
 */

/**
 * @typedef {object} Zone
 * @property {string} id
 * @property {string} name
 * @property {number} from
 * @property {number} to
 * @property {'qualify'|'playoff'|'relegation'} tone 语义颜色；具体色值只在 tokens.css 中映射。
 * @property {number} [order]
 */

/**
 * @typedef {object} LeagueMatchweek
 * @property {string} id
 * @property {string} label 例如“第1轮”
 * @property {string} [date] YYYY-MM-DD
 * @property {Match[]} matches 与赛事比赛共用同一 Match 结构；平局 winner=null 且大比分相等。
 */

/**
 * @typedef {object} League
 * @property {string} id
 * @property {string} route
 * @property {string} group
 * @property {'published'|'coming-soon'} status
 * @property {string} name
 * @property {string} shortName
 * @property {string} tier
 * @property {string} season
 * @property {string} round
 * @property {string} lastUpdated
 * @property {string} format
 * @property {number} formLength
 * @property {StandingRow[]} standings
 * @property {LeagueMatchweek[]} [matchweeks]
 * @property {Zone[]} zones
 * @property {string} notes
 */

/**
 * @typedef {object} LeaguesData
 * @property {2} schemaVersion
 * @property {League[]} leagues
 */

/**
 * @typedef {object} Movement
 * @property {'up'|'down'|'new'|'none'} direction
 * @property {number} places
 */

/**
 * @typedef {object} RankingRow
 * @property {number} rank
 * @property {number} position
 * @property {Movement} movement
 * @property {number} points
 * @property {string} player
 * @property {Array<{event: string, expiresOn: string, position: string, points: number}>} history
 */

/**
 * @typedef {object} RankingSnapshot
 * @property {string} id
 * @property {string} route
 * @property {string} label
 * @property {'published'|'unavailable'} status
 * @property {string} title
 * @property {string} description
 * @property {RankingRow[]} rows
 */

/**
 * @typedef {object} RankingsData
 * @property {2} schemaVersion
 * @property {string} current
 * @property {RankingSnapshot[]} snapshots
 */

export {};
