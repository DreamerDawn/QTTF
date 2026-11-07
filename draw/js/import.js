/*!
 * import.js —— 导入：CSV / Excel(.xlsx) 解析 + 字段校验
 *
 * 模板字段：entryName、player1、player2、seedRank、tier、groupPoints、remark
 * 解析后的行统一映射到 entry 结构，再由 core.validateEntries 校验。
 */
(function (root) {
  'use strict';

  var TT = root.TT;
  var util = TT.util;

  /* ==================== CSV ==================== */

  /** 解析 CSV 文本为二维数组（支持引号、转义、CRLF、BOM） */
  function parseCsv(text) {
    var s = String(text || '').replace(/^\ufeff/, '');
    var rows = [];
    var row = [];
    var field = '';
    var inQuotes = false;
    var i = 0;
    while (i < s.length) {
      var ch = s[i];
      if (inQuotes) {
        if (ch === '"') {
          if (s[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        }
        field += ch; i++; continue;
      }
      if (ch === '"') { inQuotes = true; i++; continue; }
      if (ch === ',' || ch === '\t') { row.push(field); field = ''; i++; continue; }
      if (ch === '\r') { i++; continue; }
      if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
      field += ch; i++;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    /* 去掉全空行 */
    return rows.filter(function (r) {
      return r.some(function (c) { return String(c).trim() !== ''; });
    });
  }

  /* ==================== XLSX（读取） ==================== */

  /**
   * 极简 xlsx 读取：解 zip → 读 sharedStrings.xml + 第一张 sheet。
   * 只依赖浏览器原生 DecompressionStream（Deflate）——现代浏览器均支持。
   * 若环境不支持，则回退为提示用户另存为 CSV。
   */
  function unzipEntries(arrayBuffer) {
    var buf = new Uint8Array(arrayBuffer);
    var view = new DataView(arrayBuffer);
    /* 找结尾记录以取得中央目录偏移 */
    var eocd = -1;
    for (var i = buf.length - 22; i >= 0 && i > buf.length - 65558; i--) {
      if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('不是有效的 xlsx/zip 文件');
    var count = view.getUint16(eocd + 10, true);
    var cdOffset = view.getUint32(eocd + 16, true);

    var files = {};
    var p = cdOffset;
    for (var k = 0; k < count; k++) {
      if (view.getUint32(p, true) !== 0x02014b50) break;
      var method = view.getUint16(p + 10, true);
      var compSize = view.getUint32(p + 20, true);
      var nameLen = view.getUint16(p + 28, true);
      var extraLen = view.getUint16(p + 30, true);
      var commentLen = view.getUint16(p + 32, true);
      var localOff = view.getUint32(p + 42, true);
      var name = decodeUtf8(buf.subarray(p + 46, p + 46 + nameLen));
      /* 本地头：取实际数据偏移 */
      var lNameLen = view.getUint16(localOff + 26, true);
      var lExtraLen = view.getUint16(localOff + 28, true);
      var dataStart = localOff + 30 + lNameLen + lExtraLen;
      files[name] = { method: method, data: buf.subarray(dataStart, dataStart + compSize) };
      p += 46 + nameLen + extraLen + commentLen;
    }
    return files;
  }

  function decodeUtf8(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += '%' + ('0' + bytes[i].toString(16)).slice(-2);
    try { return decodeURIComponent(s); } catch (e) { return ''; }
  }

  function inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined') {
      return Promise.reject(new Error('当前浏览器不支持解压 xlsx（缺少 DecompressionStream）。请改用 CSV 导入，或在 Excel 中“另存为 CSV”。'));
    }
    var ds = new DecompressionStream('deflate-raw');
    var stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Response(stream).text();
  }

  function readFileEntry(files, name) {
    var f = files[name];
    if (!f) return Promise.resolve('');
    if (f.method === 0) return Promise.resolve(decodeUtf8(f.data));
    return inflateRaw(f.data).then(function (txt) { return txt; });
  }

  /** 从 worksheet XML 提取行数据 */
  function parseSheetXml(xml, sharedStrings) {
    var rows = [];
    var rowRe = /<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
    var m;
    while ((m = rowRe.exec(xml))) {
      var rowIdx = parseInt(m[1], 10) - 1;
      var rowXml = m[2];
      var cells = [];
      var cellRe = /<c[^>]*r="([A-Z]+)(\d+)"[^>]*?(t="(\w+)")?[^>]*>([\s\S]*?)<\/c>/g;
      var cm;
      while ((cm = cellRe.exec(rowXml))) {
        var colRef = cm[1];
        var colIdx = colToIndex(colRef);
        var body = cm[5] || '';
        var val = '';
        var tMatch = /<v>([\s\S]*?)<\/v>/.exec(body);
        var isMatch = /<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/.exec(body);
        if (isMatch) val = unxml(isMatch[1]);
        else if (tMatch) {
          val = unxml(tMatch[1]);
          if ((cm[3] || '') === 's' && sharedStrings) {
            var si = parseInt(val, 10);
            val = sharedStrings[si] != null ? sharedStrings[si] : val;
          }
        }
        cells[colIdx] = val;
      }
      rows[rowIdx] = cells;
    }
    /* 压实 */
    var out = [];
    rows.forEach(function (r) {
      if (!r) return;
      var arr = [];
      for (var i = 0; i < r.length; i++) arr.push(r[i] == null ? '' : r[i]);
      if (arr.some(function (v) { return String(v).trim() !== ''; })) out.push(arr);
    });
    return out;
  }

  function colToIndex(letters) {
    var n = 0;
    for (var i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
    return n - 1;
  }

  function unxml(s) {
    return String(s)
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/&#(\d+);/g, function (_, d) { return String.fromCharCode(parseInt(d, 10)); });
  }

  /**
   * 读取 xlsx 的第一张工作表 → 二维数组
   */
  function readXlsx(arrayBuffer) {
    var files = unzipEntries(arrayBuffer);
    var shared = [];
    var shareName = 'xl/sharedStrings.xml';
    var sheetName = 'xl/worksheets/sheet1.xml';
    return readFileEntry(files, shareName).then(function (shareXml) {
      if (shareXml) {
        var re = /<si[\s\S]*?>([\s\S]*?)<\/si>/g, mm;
        while ((mm = re.exec(shareXml))) {
          var t = /<t[^>]*>([\s\S]*?)<\/t>/.exec(mm[1]);
          shared.push(t ? unxml(t[1]) : '');
        }
      }
      return readFileEntry(files, sheetName);
    }).then(function (sheetXml) {
      if (!sheetXml) throw new Error('xlsx 中没有找到第一张工作表');
      return parseSheetXml(sheetXml, shared);
    });
  }

  /* ==================== 行 → entry ==================== */

  var FIELD_ALIASES = {
    entryName: ['entryname', 'entry', '参赛名', '姓名', '名称', '选手', '组合'],
    player1: ['player1', '球员1', '选手1', 'p1'],
    player2: ['player2', '球员2', '选手2', 'p2'],
    rank: ['rank', '排名', '名次', '积分排名'],
    seedRank: ['seedrank', 'seed', '种子', '种子序', '种子号'],
    tier: ['tier', '档位', '档'],
    groupPoints: ['groupPoints', 'points', '组合积分', '积分', '分数'],
    remark: ['remark', '备注', '说明']
  };

  function normalizeKey(k) {
    return String(k == null ? '' : k).trim().toLowerCase().replace(/\s|_/g, '');
  }

  function detectHeader(row) {
    var idx = {};
    var keys = Object.keys(FIELD_ALIASES);
    for (var i = 0; i < row.length; i++) {
      var nk = normalizeKey(row[i]);
      if (!nk) continue;
      keys.forEach(function (k) {
        if (idx[k] != null) return;
        if (FIELD_ALIASES[k].some(function (a) { return normalizeKey(a) === nk; })) idx[k] = i;
      });
    }
    /* 至少有 entryName 或 player1 才认作表头 */
    var okHeader = (idx.entryName != null) || (idx.player1 != null);
    return { header: okHeader ? idx : null, detected: idx };
  }

  /**
   * 把表格行转为 entry 数组（自动识别表头；无表头则按列序猜测）。
   * @param {Array<Array>} rows
   * @param {'singles'|'doubles'} eventType
   */
  function rowsToEntries(rows, eventType) {
    if (!rows || !rows.length) return { entries: [], notes: ['表格为空。'] };
    var hd = detectHeader(rows[0]);
    var idx = hd.header;
    var start = 0;
    var notes = [];
    if (idx) {
      start = 1;
    } else {
      /* 无表头：按默认列序 entryName, player1, player2, rank, seedRank, tier, groupPoints, remark */
      idx = { entryName: 0, player1: 1, player2: 2, rank: 3, seedRank: 4, tier: 5, groupPoints: 6, remark: 7 };
      notes.push('未识别到表头，已按默认列序解析（entryName / player1 / player2 / rank / seedRank / tier / groupPoints / remark）。');
    }

    var out = [];
    for (var r = start; r < rows.length; r++) {
      var row = rows[r];
      if (!row) continue;
      var get = function (key) {
        var i = idx[key];
        if (i == null) return '';
        return row[i] == null ? '' : String(row[i]).trim();
      };
      var entryName = get('entryName');
      var p1 = get('player1');
      var p2 = get('player2');
      /* 单打：优先 player1；否则用 entryName（若含斜杠会自动拆分） */
      var players;
      if (eventType === 'doubles') {
        if (p1 || p2) players = [p1, p2];
        else players = [entryName];
      } else {
        players = [p1 || entryName];
      }
      if (!players[0] && !players[1]) continue;   /* 跳过空行 */

      var num = function (s) {
        if (s === '' || s == null) return null;
        var n = Number(String(s).replace(/[^\d.\-]/g, ''));
        return isFinite(n) ? n : null;
      };

      out.push(TT.normalizeEntry({
        players: players,
        rank: num(get('rank')),
        seedRank: num(get('seedRank')),
        tier: num(get('tier')),
        groupPoints: num(get('groupPoints')),
        remark: get('remark')
      }, out.length));
    }

    return { entries: out, notes: notes };
  }

  /* ==================== 文件读取入口 ==================== */

  /**
   * 读取一个 File（.csv/.txt/.xlsx）→ entries
   * @returns {Promise<{entries, notes}>}
   */
  function readFile(file, eventType) {
    var name = (file.name || '').toLowerCase();
    if (/\.xlsx$/.test(name)) {
      return file.arrayBuffer().then(function (ab) {
        return readXlsx(ab);
      }).then(function (rows) {
        return rowsToEntries(rows, eventType);
      });
    }
    /* CSV / TXT */
    return file.text().then(function (txt) {
      var rows = parseCsv(txt);
      return rowsToEntries(rows, eventType);
    });
  }

  TT.Import = {
    parseCsv: parseCsv,
    readXlsx: readXlsx,
    rowsToEntries: rowsToEntries,
    readFile: readFile,
    FIELD_ALIASES: FIELD_ALIASES
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);
