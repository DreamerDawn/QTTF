/*!
 * export.js —— 导出：PNG（SVG→Canvas 高分辨率）、PDF（A4 横向打印/矢量）、JSON、XLSX
 * 全部为浏览器原生能力，无任何第三方库。
 */
(function (root) {
  'use strict';

  var TT = root.TT;
  var util = TT.util;

  /* ==================== 通用下载 ==================== */

  function download(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function downloadText(text, filename, mime) {
    download(new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' }), filename);
  }

  /* ==================== PNG（SVG → Canvas） ==================== */

  /**
   * 把 SVG 字符串栅格化为 PNG Blob。
   * @param {string} svgText
   * @param {Object} opt { scale:number, background:string }
   * @returns {Promise<{blob:Blob, width:number, height:number}>}
   */
  function svgToPng(svgText, opt) {
    opt = opt || {};
    var scale = Math.max(1, Math.min(6, opt.scale || 3));
    return new Promise(function (resolve, reject) {
      var m = /viewBox="([^\"]+)"/.exec(svgText);
      var vb = m ? m[1].split(/\s+/).map(Number) : null;
      var baseW = vb && vb.length === 4 ? vb[2] : 1684;
      var baseH = vb && vb.length === 4 ? vb[3] : 1190;

      var img = new Image();
      var blobUrl;
      var cleaned = svgText;
      /* 确保没有 <?xml 前置声明（某些浏览器会拒绝） */
      cleaned = cleaned.replace(/^\s*<?xml[^>]*>\s*/i, '');

      img.onload = function () {
        try {
          var W = Math.round(baseW * scale);
          var H = Math.round(baseH * scale);
          var canvas = document.createElement('canvas');
          canvas.width = W;
          canvas.height = H;
          var ctx = canvas.getContext('2d');
          ctx.fillStyle = opt.background || '#fbfaf7';
          ctx.fillRect(0, 0, W, H);
          ctx.drawImage(img, 0, 0, W, H);
          URL.revokeObjectURL(blobUrl);
          canvas.toBlob(function (blob) {
            if (!blob) { reject(new Error('PNG 编码失败')); return; }
            resolve({ blob: blob, width: W, height: H });
          }, 'image/png');
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = function () {
        URL.revokeObjectURL(blobUrl);
        reject(new Error('SVG 载入失败（可能包含不兼容内容）'));
      };

      var blob = new Blob([cleaned], { type: 'image/svg+xml;charset=utf-8' });
      blobUrl = URL.createObjectURL(blob);
      img.src = blobUrl;
    });
  }

  /**
   * 把任意 SVG 文本放进 A4 横向文档并调用打印（导出 PDF）。
   * @param {string} svgText
   * @param {Object} meta {title, filename}
   */
  function exportSvgTextAsPdf(svgText, meta) {
    meta = meta || {};
    var cleaned = String(svgText || '').replace(/^\s*<?xml[^>]*>\s*/i, '');
    var doc = [
      '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">',
      '<title>', escHtml(meta.title || '签表'), '</title>',
      '<style>',
      '@page { size: A4 landscape; margin: 6mm; }',
      'html,body{margin:0;padding:0;background:#fff;}',
      'svg{display:block;width:100%;height:auto;page-break-inside:avoid;page-break-after:avoid;}',
      '@media screen { body{padding:14px;font-family:system-ui,sans-serif;}',
      '.tip{padding:10px 14px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;',
      'color:#1e40af;font-size:13px;margin-bottom:10px;} }',
      '@media print { .tip{display:none;} }',
      '</style></head><body>',
      '<div class="tip">已打开打印视图：在打印对话框中选择「另存为 PDF」，纸张选 <b>A4 横向</b>、边距「默认/最小」，并勾选「背景图形」。此视图为矢量输出，中文不会乱码。</div>',
      '<div class="sheet">', cleaned, '</div></body></html>'
    ].join('');

    var win = window.open('', '_blank');
    if (!win) {
      return Promise.reject(new Error('打印窗口被浏览器拦截：请允许弹出窗口后重试，或改用「导出 PNG」。'));
    }
    win.document.open();
    win.document.write(doc);
    win.document.close();
    return new Promise(function (resolve) {
      setTimeout(function () {
        try { win.focus(); win.print(); } catch (e) { /* 用户可能取消 */ }
        resolve({ ok: true });
      }, 450);
    });
  }

  /**
   * 导出签表 PNG。
   * @param {Object} bracket drawKnockout 结果
   * @param {Object} meta { title, subtitle, filename, scale, footer }
   */
  function exportBracketPng(bracket, meta) {
    meta = meta || {};
    var svgOut = TT.Bracket.renderBracket(bracket, {
      title: meta.title, subtitle: meta.subtitle, footer: meta.footer
    });
    return svgToPng(svgOut.svg, { scale: meta.scale || 3 }).then(function (r) {
      download(r.blob, (meta.filename || ('淘汰赛签表-' + util.stamp())) + '.png');
      return r;
    });
  }

  /* ==================== PDF（浏览器原生打印，矢量文字） ==================== */

  /**
   * 生成 PDF：把 SVG 放进一个 A4 横向的临时文档并调用打印对话框 → “另存为 PDF”。
   * 由于是原生渲染，中文文字以矢量字形输出，不会出现乱码或位图模糊。
   * @param {Object} bracket
   * @param {Object} meta
   */
  function exportBracketPdf(bracket, meta) {
    meta = meta || {};
    var svgOut = TT.Bracket.renderBracket(bracket, {
      title: meta.title, subtitle: meta.subtitle, footer: meta.footer
    });

    var doc = [
      '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">',
      '<title>', escHtml(meta.title || '淘汰赛签表'), '</title>',
      '<style>',
      '@page { size: A4 landscape; margin: 6mm; }',
      'html,body{margin:0;padding:0;background:#fff;}',
      'svg{display:block;width:100%;height:auto;page-break-inside:avoid;page-break-after:avoid;}',
      '.sheet{width:100%;}',
      /* 屏幕预览时给出提示 */
      '@media screen { body{padding:14px;font-family:system-ui,sans-serif;} .tip{padding:10px 14px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;color:#1e40af;font-size:13px;margin-bottom:10px;} }',
      '@media print { .tip{display:none;} }',
      '</style></head><body>',
      '<div class="tip">已打开打印视图：在打印对话框中选择「另存为 PDF」，纸张选 <b>A4 横向</b>、边距「默认/最小」，并勾选「背景图形」以获得完整边框。此视图为矢量输出，中文不会乱码。</div>',
      '<div class="sheet">', svgOut.svg.replace(/^\s*<?xml[^>]*>\s*/i, ''), '</div>',
      '</body></html>'
    ].join('');

    var win = window.open('', '_blank');
    if (!win) {
      return Promise.reject(new Error('打印窗口被浏览器拦截：请允许弹出窗口后重试，或改用「导出 PNG」/「打印」按钮。'));
    }
    win.document.open();
    win.document.write(doc);
    win.document.close();
    /* 等 SVG 渲染完再触发打印 */
    return new Promise(function (resolve) {
      var done = false;
      function go() {
        if (done) return;
        done = true;
        try {
          win.focus();
          win.print();
        } catch (e) { /* 用户可能在打印对话框里取消 */ }
        resolve({ ok: true });
      }
      setTimeout(go, 450);
    });
  }

  function escHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* 当前文档内直接打印（用户已打开签表页时使用） */
  function printCurrent() {
    window.print();
  }

  /* ==================== JSON ==================== */

  function exportJson(payload, filename) {
    downloadText(JSON.stringify(payload, null, 2),
      (filename || ('签表数据-' + util.stamp())) + '.json', 'application/json');
  }

  /* ==================== XLSX ==================== */

  function exportXlsx(ctx, filename) {
    var sheets = TT.Xlsx.buildSheets(ctx);
    var blob = TT.Xlsx.buildXlsx(sheets, { title: ctx.title || '抽签结果' });
    download(blob, (filename || ('抽签结果-' + util.stamp())) + '.xlsx');
  }

  /* ==================== CSV（导入模板回写） ==================== */

  function toCsv(rows) {
    function cell(v) {
      var s = v == null ? '' : String(v);
      if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    }
    return rows.map(function (r) { return r.map(cell).join(','); }).join('\r\n');
  }

  /** 导入模板（列序与导出参赛名单一致，含 rank） */
  function exportEntryTemplateCsv(filename) {
    var rows = [
      ['entryName', 'player1', 'player2', 'rank', 'seedRank', 'tier', 'groupPoints', 'remark'],
      ['张伟', '张伟', '', '1', '1', '1', '', '示例：单打'],
      ['李强 / 王芳', '李强', '王芳', '2', '', '2', '1980', '示例：双打']
    ];
    downloadText('\ufeff' + toCsv(rows), (filename || '导入模板') + '.csv', 'text/csv');
  }

  /**
   * 导出当前参赛名单（与导入完全兼容，可编辑后重新导入）。
   * 列：entryName, player1, player2, rank, seedRank, tier, groupPoints, remark
   * @param {Object[]} entries
   * @param {string} eventType 'singles' | 'doubles'
   * @param {string} [filename]
   */
  function exportEntriesCsv(entries, eventType, filename) {
    var doubles = eventType === 'doubles';
    var rows = [['entryName', 'player1', 'player2', 'rank', 'seedRank', 'tier', 'groupPoints', 'remark']];
    (entries || []).forEach(function (e) {
      var name = TT.util.entryName(e);
      var p1 = (e.players && e.players[0]) || '';
      var p2 = doubles ? ((e.players && e.players[1]) || '') : '';
      rows.push([
        name,
        p1 || name,
        p2,
        e.rank == null ? '' : e.rank,
        e.seedRank == null ? '' : e.seedRank,
        e.tier == null ? '' : e.tier,
        e.groupPoints == null ? '' : e.groupPoints,
        e.remark || ''
      ]);
    });
    downloadText('\ufeff' + toCsv(rows), (filename || '参赛名单') + '.csv', 'text/csv');
    return rows.length - 1;
  }

  TT.Export = {
    download: download,
    downloadText: downloadText,
    svgToPng: svgToPng,
    exportBracketPng: exportBracketPng,
    exportBracketPdf: exportBracketPdf,
    exportSvgTextAsPdf: exportSvgTextAsPdf,
    printCurrent: printCurrent,
    exportJson: exportJson,
    exportXlsx: exportXlsx,
    exportEntriesCsv: exportEntriesCsv,
    toCsv: toCsv,
    exportEntryTemplateCsv: exportEntryTemplateCsv
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);
