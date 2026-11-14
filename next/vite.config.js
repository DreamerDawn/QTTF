import { defineConfig } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

/**
 * GitHub Pages 项目站点默认部署在 /QTTF/ 子路径。
 * 部署到自定义域名或根路径时，构建前设置 BASE_PATH=/ 即可。
 */
const base = process.env.BASE_PATH || '/QTTF/';

/** 所有页面都是独立 HTML 入口，不做 SPA 路由。 */
const htmlEntries = [
  'index.html',
  'homepage/index.html',
  'events/index.html',
  'events/qttc/qttc2024/index.html',
  'events/qttc/qttc2025/index.html',
  'events/qttc/qttc2026/index.html',
  'events/zgcup2024/index.html',
  'events/tryout/xtcq2026/index.html',
  'events/league/index.html',
  'events/league/qsl/index.html',
  'events/league/qcl/index.html',
  'rankings/index.html',
  'rankings/2024-10/index.html',
  'rankings/2024-11/index.html',
  'rankings/2025-07/index.html',
  'rankings/2025-11/index.html',
  'rankings/2026-01/index.html',
  'rankings/2026-06/index.html',
  'about/index.html',
  'contact/index.html',
  '404.html',
];

export default defineConfig({
  base,
  appType: 'mpa',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: Object.fromEntries(
        htmlEntries.map((file) => {
          const key = file
            .replace(/\/index\.html$/, '')
            .replace(/\.html$/, '')
            .replace(/\//g, '-')
            .replace(/-$/, '') || 'home';
          return [key, resolve(root, file)];
        }),
      ),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
});
