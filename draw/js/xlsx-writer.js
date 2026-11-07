/*!
 * xlsx-writer.js —— 原生生成 .xlsx（SpreadsheetML），不依赖 SheetJS
 *
 * 工作表：
 *   1) 选手名单  —— entry 级明细（姓名、球员、种子序、档位、积分、备注、所属小组、位置）
 *   2) 小组分组  —— 组 × 位置 矩阵 + 出线标记
 *   3) 淘汰赛签表 —— 表格化签位（签位号、选手、小组名次、轮次、场次号、时间、球台），便于数据处理
 *   另附 4) 场次清单 —— 每场比赛一行（场次号、轮次、对阵、时间/球台占位）
 */
(function (root) {
  'use strict';

  var TT = root.TT = root.TT || {};
  var util = TT.util;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  /** 列号 → 字母（1 → A） */
  function colName(n) {
    var s = '';
    while (n > 0) {
      var r = (n - 1) % 26;
      s = String.fromCharCode(65 + r) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  /**
   * 生成一个工作表的 XML。
   * @param {string} name 工作表名（≤31 字符）
   * @param {Array<Array>} rows 二维数组；第一行为表头
   * @param {Object} [opt] { colWidths:number[], freezeTop:boolean }
   */
  function sheetXml(name, rows, opt) {
    opt = opt || {};
    var maxCols = 0;
    rows.forEach(function (r) { maxCols = Math.max(maxCols, r.length); });

    var cols = '';
    var widths = opt.colWidths || [];
    for (var c = 1; c <= maxCols; c++) {
      var w = widths[c - 1] || (c === 1 ? 18 : 14);
      cols += '<col min="' + c + '" max="' + c + '" width="' + w + '" customWidth="1"/>';
    }

    var body = rows.map(function (row, ri) {
      var cells = '';
      for (var ci = 0; ci < maxCols; ci++) {
        var v = row[ci];
        if (v == null || v === '') continue;
        var isNum = (typeof v === 'number' && isFinite(v));
        var styleIdx = ri === 0 ? 1 : (isNum ? 2 : 3);
        var content = isNum
          ? '<v>' + v + '</v>'
          : '<is><t xml:space="preserve">' + esc(v) + '</t></is>';
        cells += '<cell r="' + (ri + 1) + '" s="' + styleIdx + '">' + content + '</cell>';
      }
      return '<row r="' + (ri + 1) + '"' + (ri === 0 ? ' ht="1"' : '') + '>' + cells + '</row>';
    }).join('');

    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetPr><outlinePr/></sheetPr>' +
      '<dimension ref="A1:' + colName(maxCols) + rows.length + '"/>' +
      '<sheetViews><sheetView workbookViewId="0">' +
      (opt.freezeTop ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' : '') +
      '<selection activeCell="A1" sqref="A1"/></sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="17"/>' +
      '<cols>' + cols + '</cols>' +
      '<sheetData>' + body + '</sheetData>' +
      '</worksheet>';
  }

  var STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="0"/>' +
    '<fonts count="2">' +
    '<font><sz val="11"/><name val="Microsoft YaHei"/><charset val="134"/></font>' +
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Microsoft YaHei"/><charset val="134"/></font>' +
    '</fonts>' +
    '<fills count="3">' +
    '<fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF1E3A8A"/><bgColor indexed="64"/></patternFill></fill>' +
    '</fills>' +
    '<borders count="2">' +
    '<border><left/><right/><top/><bottom/><diagonal/></border>' +
    '<border><left style="thin"><color rgb="FFD0D7E2"/></left>' +
    '<right style="thin"><color rgb="FFD0D7E2"/></right>' +
    '<top style="thin"><color rgb="FFD0D7E2"/></top>' +
    '<bottom style="thin"><color rgb="FFD0D7E2"/></bottom><diagonal/></border>' +
    '</borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="4">' +
    /* 0 默认 */
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    /* 1 表头：深蓝底 + 白字加粗 + 居中 + 边框 */
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' +
    '<alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
    /* 2 数字：居中 + 边框 */
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1">' +
    '<alignment horizontal="center" vertical="center"/></xf>' +
    /* 3 文本：左对齐 + 自动换行 + 边框 */
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1">' +
    '<alignment horizontal="left" vertical="center" wrapText="1"/></xf>' +
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  var WORKBOOK = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<workbookPr/>' +
    '<sheets>{SHEETS}</sheets>' +
    '</workbook>';

  var WORKBOOK_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '{RELS}' +
    '</Relationships>';

  var ROOT_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
    '</Relationships>';

  var CONTENT_TYPES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '{SHEET_OVERRIDES}' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '</Types>';

  var CORE = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
    'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    '<dc:title>{TITLE}</dc:title><dc:creator>tt-draw</dc:creator>' +
    '<dcterms:created xsi:type="dcterms:W3CDTF">{NOW}</dcterms:created>' +
    '</cp:coreProperties>';

  /**
   * 生成 xlsx Blob。
   * @param {Array<{name:string, rows:Array<Array>, colWidths?:number[]}>} sheets
   * @param {Object} [meta] { title }
   */
  function buildXlsx(sheets, meta) {
    meta = meta || {};
    var files = [];

    var sheetTags = '', sheetRels = '', sheetOverrides = '';
    sheets.forEach(function (sh, i) {
      var idx = i + 1;
      files.push({
        name: 'xl/worksheets/sheet' + idx + '.xml',
        data: sheetXml(sh.name, sh.rows, { colWidths: sh.colWidths, freezeTop: true })
      });
      sheetTags += '<sheet name="' + esc(sh.name.slice(0, 31)) + '" sheetId="' + idx + '" r:id="rId' + idx + '"/>';
      sheetRels += '<Relationship Id="rId' + idx + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + idx + '.xml"/>';
      sheetOverrides += '<Override PartName="/xl/worksheets/sheet' + idx + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
    });

    var styleRid = sheets.length + 1;
    sheetRels += '<Relationship Id="rId' + styleRid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>';

    files.push({
      name: 'xl/workbook.xml',
      data: WORKBOOK.replace('{SHEETS}', sheetTags)
    });
    files.push({
      name: 'xl/_rels/workbook.xml.rels',
      data: WORKBOOK_RELS.replace('{RELS}', sheetRels)
    });
    files.push({ name: 'xl/styles.xml', data: STYLES });
    files.push({
      name: 'docProps/core.xml',
      data: CORE.replace('{TITLE}', esc(meta.title || '抽签结果'))
        .replace('{NOW}', new Date().toISOString().replace(/\.\d+Z$/, 'Z'))
    });
    files.push({
      name: '_rels/.rels',
      data: ROOT_RELS
    });
    files.push({
      name: '[Content_Types].xml',
      data: CONTENT_TYPES.replace('{SHEET_OVERRIDES}', sheetOverrides)
    });

    return TT.buildZip(files);
  }

  /* ==================== 针对本项目的数据表构造 ==================== */

  /**
   * 构造三张（+1）工作表的数据。
   * @param {Object} ctx { config, entries, groups, bracket, seed, tierMap }
   */
  function buildSheets(ctx) {
    var entries = ctx.entries || [];
    var groups = ctx.groups || [];
    var bracket = ctx.bracket;
    var cfg = ctx.config || {};
    var tiers = ctx.tierMap || {};

    /* ---- 1) 选手名单 ---- */
    var s1 = [];
    s1.push(['序号', '参赛名', '球员1', '球员2', '种子序', '档位', '组合积分', '备注', '小组', '组内位置', '出线名次']);
    var entryOrder = TT.sortEntries(entries);
    var placeMap = {};
    if (groups.length) {
      groups.forEach(function (g) {
        g.members.forEach(function (m, idx) {
          placeMap[m.id] = { group: g.label, slot: idx + 1 };
        });
      });
    }
    var qualMap = {};
    if (bracket && bracket.qualifiers) {
      bracket.qualifiers.forEach(function (q) { qualMap[q.entryId] = q.label; });
    }
    entryOrder.forEach(function (e, i) {
      var pl = placeMap[e.id] || {};
      s1.push([
        i + 1,
        util.entryName(e),
        e.players[0] || '',
        e.players[1] || '',
        e.seedRank == null ? '' : e.seedRank,
        tiers[e.id] == null ? '' : tiers[e.id],
        e.groupPoints == null ? '' : e.groupPoints,
        e.remark || '',
        pl.group || '',
        pl.slot || '',
        qualMap[e.id] || ''
      ]);
    });

    /* ---- 2) 小组分组 ---- */
    var s2 = [];
    var maxSize = groups.length ? Math.max.apply(null, groups.map(function (g) { return g.size; })) : 0;
    var head = ['小组', '人数'];
    for (var i = 1; i <= maxSize; i++) head.push('第' + i + '位');
    head = head.concat(['出线']);
    s2.push(head);
    groups.forEach(function (g) {
      var row = [g.label, g.size];
      for (var k = 0; k < maxSize; k++) {
        var m = g.members[k];
        row.push(m ? util.entryName(m) : '');
      }
      /* 出线标记 */
      var out = [];
      for (var q = 1; q <= (cfg.qualifiersPerGroup || 0); q++) {
        if (g.members[q - 1]) out.push(util.qualLabel(g.index, q));
      }
      row.push(out.join(' / '));
      s2.push(row);
    });
    /* 出线者明细（第二块） */
    s2.push([]);
    s2.push(['出线代号', '小组', '组内名次', '参赛名', '种子序', '档位', '签位']);
    if (bracket && bracket.qualifiers) {
      bracket.qualifiers.slice().sort(function (a, b) {
        if (a.groupIndex !== b.groupIndex) return a.groupIndex - b.groupIndex;
        return a.rank - b.rank;
      }).forEach(function (q) {
        s2.push([q.label, q.groupLabel, q.rank, q.name, q.seedRank == null ? '' : q.seedRank,
          q.tier == null ? '' : q.tier, q.slot || '']);
      });
    }

    /* ---- 3) 淘汰赛签表（表格化） ---- */
    var s3 = [];
    s3.push(['签位', '参赛名', '出线代号', '小组', '组内名次', '种子序', '首轮场次', '时间', '球台', '备注']);
    if (bracket) {
      for (var sl = 1; sl <= bracket.size; sl++) {
        var c = bracket.slots[sl];
        var firstMatch = Math.floor((sl - 1) / 2) + 1;
        if (!c) { s3.push([sl, '', '', '', '', '', firstMatch, '', '', '']); continue; }
        if (c.kind === 'bye') {
          s3.push([sl, '轮空', '', '', '', '', firstMatch, '', '', '免赛晋级']);
        } else {
          s3.push([sl, c.qual.name, c.qual.label, c.qual.groupLabel, c.qual.rank,
            c.qual.seedRank == null ? '' : c.qual.seedRank, firstMatch, '', '', '']);
        }
      }
    }

    var sheets = [
      { name: '选手名单', rows: s1, colWidths: [6, 26, 14, 14, 8, 7, 10, 20, 8, 9, 10] },
      { name: '小组分组', rows: s2, colWidths: [8, 6, 24, 24, 24, 24, 24, 14] },
      { name: '淘汰赛签表', rows: s3, colWidths: [6, 26, 10, 8, 9, 8, 10, 14, 10, 14] }
    ];

    /* ---- 4) 场次清单（附加，便于编排时间/球台） ---- */
    if (bracket && bracket.rounds) {
      var s4 = [];
      s4.push(['场次号', '轮次', '签位A', '选手A', '签位B', '选手B', '类型', '时间', '球台', '胜者晋级']);
      var rows4 = [];
      bracket.rounds.forEach(function (rd) {
        rd.matches.forEach(function (m) {
          var aName = m.a ? (m.a.kind === 'bye' ? '轮空' : m.a.qual.name) : '待定';
          var bName = m.b ? (m.b.kind === 'bye' ? '轮空' : m.b.qual.name) : '待定';
          var to = m.winnerTo ? (m.winnerTo.round + ' 轮') : (rd.matches.length === 1 ? '冠军' : '');
          rows4.push([m.no, rd.name, m.slotA || '', aName, m.slotB || '', bName,
            m.bye ? '轮空' : '比赛', '', '', to]);
        });
      });
      if (bracket.thirdPlace) {
        rows4.push([bracket.thirdPlace.no, '三四名决赛', '', '待定', '', '待定', '比赛', '', '', '第三名']);
      }
      rows4.forEach(function (r) { s4.push(r); });
      sheets.push({ name: '场次清单', rows: s4, colWidths: [8, 12, 8, 24, 8, 24, 8, 14, 10, 10] });
    }

    return sheets;
  }

  TT.Xlsx = { buildXlsx: buildXlsx, buildSheets: buildSheets, colName: colName };

})(typeof globalThis !== 'undefined' ? globalThis : this);
