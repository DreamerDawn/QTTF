import { defineConfig } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

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
  'admin/index.html',
];

/**
 * Decap CMS 的 config.yml 必须能从 /admin/config.yml 读取。
 * 放在 admin/ 源目录便于维护，构建时复制到 dist/admin/，开发时由中间件提供。
 */
function adminConfigPlugin() {
  const configFile = resolve(root, 'admin/config.yml');
  return {
    name: 'qttf-admin-config',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = new URL(req.url || '/', 'http://localhost').pathname;
        const basePrefix = base.endsWith('/') ? base.slice(0, -1) : base;
        const stripped = pathname.startsWith(basePrefix) ? pathname.slice(basePrefix.length) : pathname;
        if (stripped === '/admin/config.yml') {
          res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
          res.end(readFileSync(configFile, 'utf-8'));
          return;
        }
        next();
      });
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'admin/config.yml',
        source: readFileSync(configFile, 'utf-8'),
      });
    },
  };
}

export default defineConfig({
  base,
  appType: 'mpa',
  plugins: [adminConfigPlugin()],
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
