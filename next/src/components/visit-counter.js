import { el } from '../lib/dom.js';

/**
 * 页脚累计访问量（PV）。
 *
 * 纯静态站点没有后端，用 abacus（https://abacus.jasoncameron.dev）做计数：
 * `/hit/{namespace}/{key}` 自增并返回当前值，`/get/...` 只读。
 * 该服务对静态站点免费、响应带 `access-control-allow-origin: *`、限流 30 次/10 秒。
 *
 * 设计约束：
 * - 异步请求，不阻塞首屏
 * - 数据未就位前整块隐藏，避免闪出占位符
 * - 超时或服务不可用时显示「统计暂不可用」，而不是显示 0
 * - 同一会话内节流，避免刷新页面反复自增
 */
const ENDPOINT = 'https://abacus.jasoncameron.dev';
const NAMESPACE = 'dreamerdawn-qttf';
const KEY = 'site';
const TIMEOUT_MS = 6000;
const SESSION_KEY = 'qttf.visitCounted';

function formatCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n.toLocaleString('zh-CN');
}

export function createVisitCounter() {
  const wrap = el('div', { class: 'site-footer__visits', hidden: '' });
  const label = el('span', { class: 'site-footer__visits-label', text: '累计访问' });
  const value = el('span', { class: 'site-footer__visits-value', text: '—' });
  const unit = el('span', { class: 'site-footer__visits-unit', text: '次' });
  wrap.append(label, value, unit);

  let settled = false;
  const finish = (text) => {
    if (settled) return;
    settled = true;
    wrap.hidden = false;
    if (text === null) {
      wrap.classList.add('is-unavailable');
      label.textContent = '访问统计暂不可用';
      value.textContent = '';
      unit.textContent = '';
      value.remove();
      unit.remove();
      return;
    }
    value.textContent = text;
  };

  // 同一会话只自增一次；之后刷新走只读，避免数字虚高。
  let counted = false;
  try {
    counted = window.sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    counted = false;
  }
  const method = counted ? 'get' : 'hit';
  const url = `${ENDPOINT}/${method}/${NAMESPACE}/${KEY}`;

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);

  fetch(url, { signal: controller.signal, cache: 'no-store' })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((data) => {
      window.clearTimeout(timer);
      const text = formatCount(data?.value);
      if (text === null) throw new Error('bad payload');
      try {
        window.sessionStorage.setItem(SESSION_KEY, '1');
      } catch {
        /* 隐私模式下忽略 */
      }
      finish(text);
    })
    .catch(() => {
      window.clearTimeout(timer);
      finish(null);
    });

  return wrap;
}
