import { el } from '../lib/dom.js';

const SCRIPT_SRC = 'https://busuanzi.ibruce.info/busuanzi/2.3/busuanzi.pure.mini.js';
const TIMEOUT_MS = 4000;

/**
 * 页脚累计访问量（PV）。
 *
 * 纯静态站点没有后端，这里用 busuanzi 的公开计数接口：
 * 该脚本会查找 #busuanzi_value_site_pv 并填入数字。
 *
 * 设计约束：
 * - 异步加载，不阻塞首屏
 * - 数据未就位前整块隐藏，避免闪出占位符
 * - 超时或脚本不可用时显示「统计暂不可用」，而不是显示 0
 */
export function createVisitCounter() {
  const wrap = el('div', { class: 'site-footer__visits', hidden: '' });
  const label = el('span', { class: 'site-footer__visits-label', text: '累计访问' });
  const value = el('span', {
    class: 'site-footer__visits-value',
    id: 'busuanzi_value_site_pv',
    text: '—',
  });
  const unit = el('span', { class: 'site-footer__visits-unit', text: '次' });
  wrap.append(label, value, unit);

  let settled = false;
  const fail = () => {
    if (settled) return;
    settled = true;
    wrap.hidden = false;
    wrap.classList.add('is-unavailable');
    label.textContent = '访问统计暂不可用';
    value.textContent = '';
    unit.textContent = '';
  };

  // busuanzi 直接写 #busuanzi_value_site_pv 的 innerHTML，用轮询感知完成
  const timer = window.setTimeout(fail, TIMEOUT_MS);
  const poll = window.setInterval(() => {
    const text = value.textContent?.trim();
    if (text && text !== '—') {
      settled = true;
      window.clearInterval(poll);
      window.clearTimeout(timer);
      wrap.hidden = false;
      // busuanzi 可能返回 "1,234" 形式，保留原样
      label.textContent = '累计访问';
    }
  }, 250);

  const script = document.createElement('script');
  script.async = true;
  script.src = SCRIPT_SRC;
  script.addEventListener('error', () => {
    window.clearTimeout(timer);
    window.clearInterval(poll);
    fail();
  });
  document.head.append(script);

  return wrap;
}
