/**
 * 站点全部内部链接都经过这里，确保 GitHub Pages 子路径部署时不丢 base。
 */
const BASE = import.meta.env.BASE_URL.endsWith('/')
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;

export const baseUrl = BASE;

/** 把站内路径转为带 base 的 URL。 */
export function sitePath(path = '') {
  const clean = String(path).replace(/^\/+/, '');
  return `${BASE}${clean}`;
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
