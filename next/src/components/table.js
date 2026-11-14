import { el } from '../lib/dom.js';
import { zoneBannerClass } from '../lib/zones.js';

/**
 * 通用数据表组件：列定义 + 行渲染，支持区域插入行与可排序表头。
 * @param {object} options
 * @param {Array<{key:string,label:string,className?:string,render:(row:any)=>Node|string,sortable?:boolean}>} options.columns
 * @param {Array<any>} options.rows
 * @param {string} [options.className]
 * @param {string} [options.label]
 * @param {{key:string|null,dir:number}} [options.sort]
 * @param {(key:string)=>void} [options.onSort]
 * @param {(row:any, tr:HTMLTableRowElement)=>void} [options.onRowClick]
 */
export function createTable({
  columns,
  rows,
  className = 'data-table',
  label = '',
  sort = { key: null, dir: 1 },
  onSort,
  onRowClick,
}) {
  const wrap = el('div', { class: 'table-wrap' });
  const table = el('table', { class: className });
  if (label) table.setAttribute('aria-label', label);
  const thead = el('thead');
  const headRow = el('tr');

  columns.forEach((column) => {
    const attrs = { scope: 'col', class: column.className || '' };
    if (column.sortable) {
      attrs.class += ' is-sortable';
      attrs.tabIndex = 0;
      attrs.role = 'button';
      attrs['aria-label'] = `按${column.label}排序`;
      const isActive = sort.key === column.key;
      attrs['aria-sort'] = isActive ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none';
      const activate = () => onSort?.(column.key);
      attrs.onclick = activate;
      attrs.onkeydown = (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          activate();
        }
      };
    }
    headRow.append(el('th', attrs, column.label));
  });

  thead.append(headRow);
  table.append(thead);
  const tbody = el('tbody');

  rows.forEach((entry) => {
    if (entry.kind === 'zone') {
      const tr = el('tr', { class: zoneBannerClass(entry.zone) });
      tr.append(
        el('td', {
          colspan: String(columns.length),
          text: entry.zone.name,
        }),
      );
      tbody.append(tr);
      return;
    }

    const row = entry.row ?? entry;
    const tr = el('tr', {
      class: entry.rowClass || '',
      dataset: entry.dataset || {},
    });
    if (onRowClick) {
      tr.tabIndex = 0;
      tr.style.cursor = 'pointer';
      tr.addEventListener('click', () => onRowClick(row, tr));
      tr.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onRowClick(row, tr);
        }
      });
    }

    columns.forEach((column) => {
      const td = el('td', {
        class: column.className || '',
        dataset: column.label ? { label: column.label } : {},
      });
      const content = column.render(row);
      if (content instanceof Node) td.append(content);
      else td.textContent = content ?? '';
      tr.append(td);
    });
    tbody.append(tr);
  });

  table.append(tbody);
  wrap.append(table);
  return { wrap, table, thead, tbody };
}
