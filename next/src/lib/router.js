/**
 * 站点全部内部链接都经过这里，确保 GitHub Pages 子路径部署时不丢 base。
 */
const BASE = import.meta.env.BASE_URL.endsWith('/')
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;

export const baseUrl = BASE;

/**
 * 部署根。本站在 GitHub Pages 上以 `<root>/next/` 形式发布，
 * 而 `draw/`、`pingpong-scorer/` 等独立工具放在部署根，不在 next/ 下。
 * `sitePath()` 只能生成 next/ 内部的地址，跨出这层必须用这里。
 */
const DEPLOY_ROOT = BASE.replace(/[^/]+\/$/, '');

/** 把站内路径转为带 base 的 URL。 */
export function sitePath(path = '') {
  const clean = String(path).replace(/^\/+/, '');
  return `${BASE}${clean}`;
}

/** 指向部署根（next/ 的上一层）的路径，用于 roots 里的独立工具页。 */
export function rootPath(path = '') {
  const clean = String(path).replace(/^\/+/, '');
  return `${DEPLOY_ROOT}${clean}`;
}

/** 当前页面相对站点根的路径，例如 events/league/qsl/。 */
export function currentPath() {
  let pathname = window.location.pathname;
  if (BASE !== '/' && pathname.startsWith(BASE)) {
    pathname = pathname.slice(BASE.length);
  } else {
    pathname = pathname.replace(/^\/+/, '');
  }
  try {
    pathname = decodeURI(pathname);
  } catch {
    /* keep raw path */
  }
  if (pathname === '' || pathname === '/') return '';
  return pathname.replace(/^\/+/, '').replace(/\/?$/, '/');
}

/** 导航项是否对应当前页面。 */
export function isNavActive(navPath, activePath = currentPath()) {
  const target = String(navPath || '').replace(/^\/+/, '');
  if (!target) return activePath === '' || activePath === 'homepage/';
  return activePath === target || activePath.startsWith(target);
}

export function eventPath(route) {
  return sitePath(route || '');
}

export function redirectHome(replace = true) {
  const target = sitePath('');
  if (replace) window.location.replace(target);
  else window.location.assign(target);
}
