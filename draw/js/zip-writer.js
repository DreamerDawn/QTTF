/*!
 * zip-writer.js —— 极简 ZIP 写入器（store 模式，无压缩）
 * 用于在浏览器内自行生成 .xlsx，不依赖 SheetJS 等第三方库。
 * 结构：本地文件头 + 数据 + 中央目录 + 结尾记录。
 */
(function (root) {
  'use strict';

  var TT = root.TT = root.TT || {};

  /* CRC-32 查表 */
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) {
      c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function utf8Bytes(str) {
    /* 优先使用 TextEncoder；退化到手工编码 */
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    var out = [], i, c;
    for (i = 0; i < str.length; i++) {
      c = str.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F));
      else if (c >= 0xD800 && c <= 0xDBFF) {
        var c2 = str.charCodeAt(++i);
        var cp = 0x10000 + ((c & 0x3FF) << 10) + (c2 & 0x3FF);
        out.push(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3F), 0x80 | ((cp >> 6) & 0x3F), 0x80 | (cp & 0x3F));
      } else out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
    }
    return new Uint8Array(out);
  }

  /** 本地时间 → MS-DOS 时间/日期 */
  function dosTime(d) {
    var time = ((d.getHours() & 0x1F) << 11) | ((d.getMinutes() & 0x3F) << 5) | ((Math.floor(d.getSeconds() / 2)) & 0x1F);
    var date = (((d.getFullYear() - 1980) & 0x7F) << 9) | (((d.getMonth() + 1) & 0x0F) << 5) | (d.getDate() & 0x1F);
    return { time: time, date: date };
  }

  /**
   * 构造 ZIP。
   * @param {Array<{name:string, data:string|Uint8Array}>} files
   * @returns {Blob}
   */
  function buildZip(files) {
    var entries = [];
    var now = new Date();
    var dt = dosTime(now);

    files.forEach(function (f) {
      var nameBytes = utf8Bytes(f.name);
      var data = (typeof f.data === 'string') ? utf8Bytes(f.data) : f.data;
      var crc = crc32(data);
      entries.push({ nameBytes: nameBytes, data: data, crc: crc });
    });

    var totalSize = 0;
    entries.forEach(function (e) {
      totalSize += 30 + e.nameBytes.length + e.data.length;   /* 本地头 */
      totalSize += 46 + e.nameBytes.length;                   /* 中央目录 */
    });
    totalSize += 22;                                          /* 结尾记录 */

    var buf = new Uint8Array(totalSize);
    var off = 0;
    var centralOffsets = [];

    function w16(v) { buf[off++] = v & 0xFF; buf[off++] = (v >>> 8) & 0xFF; }
    function w32(v) {
      buf[off++] = v & 0xFF; buf[off++] = (v >>> 8) & 0xFF;
      buf[off++] = (v >>> 16) & 0xFF; buf[off++] = (v >>> 24) & 0xFF;
    }
    function wbytes(arr) { for (var i = 0; i < arr.length; i++) buf[off++] = arr[i]; }

    entries.forEach(function (e) {
      centralOffsets.push(off);
      /* --- 本地文件头 --- */
      w32(0x04034b50);
      w16(20);                    /* 需要的版本 */
      w16(0x0800);                /* 标志：UTF-8 文件名 */
      w16(0);                     /* 压缩方法：store */
      w16(dt.time); w16(dt.date);
      w32(e.crc);
      w32(e.data.length);         /* 压缩后大小 */
      w32(e.data.length);         /* 原始大小 */
      w16(e.nameBytes.length);
      w16(0);                     /* 额外字段长度 */
      wbytes(e.nameBytes);
      wbytes(e.data);
    });

    /* --- 中央目录 --- */
    var cdStart = off;
    entries.forEach(function (e, i) {
      w32(0x02014b50);
      w16(20);                    /* 创建版本 */
      w16(20);                    /* 需要版本 */
      w16(0x0800);
      w16(0);
      w16(dt.time); w16(dt.date);
      w32(e.crc);
      w32(e.data.length);
      w32(e.data.length);
      w16(e.nameBytes.length);
      w16(0);                     /* 额外 */
      w16(0);                     /* 注释 */
      w16(0);                     /* 磁盘号 */
      w16(0);                     /* 内部属性 */
      w32(0);                     /* 外部属性 */
      w32(centralOffsets[i]);
      wbytes(e.nameBytes);
    });
    var cdEnd = off;

    /* --- 结尾记录 --- */
    w32(0x06054b50);
    w16(0); w16(0);
    w16(entries.length);
    w16(entries.length);
    w32(cdEnd - cdStart);
    w32(cdStart);
    w16(0);

    return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  TT.buildZip = buildZip;
  TT.crc32 = crc32;

})(typeof globalThis !== 'undefined' ? globalThis : this);
