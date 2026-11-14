/** 安全地把数据写入 HTML 模板。 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function qs(selector, root = document) {
  const el = root.querySelector(selector);
  if (!el) throw new Error(`Element not found: ${selector}`);
  return el;
}

export function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value == null) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'style') node.setAttribute('style', value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, String(value));
  }
  if (typeof children === 'string') node.textContent = children;
  else if (children instanceof Node) node.append(children);
  else for (const child of children) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function setMeta({ title, description }) {
  if (title) document.title = title;
  if (description) {
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.append(meta);
    }
    meta.content = description;
  }
}

export function fragment(html) {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content;
}

export function formatNumber(value) {
  if (value === null || value === undefined || value === '') return '—';
  return new Intl.NumberFormat('zh-CN').format(value);
}

export function clampText(value, fallback = '暂无') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}
