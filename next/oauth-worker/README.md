# QTTF Decap OAuth Worker

免费部署在 Cloudflare Workers 上，为 Decap CMS 的 GitHub backend 提供 OAuth 代理。无需 Netlify、Git Gateway 或任何付费服务。

## 一次性配置

1. 在 GitHub 创建 OAuth App：<https://github.com/settings/applications/new>
   - Homepage URL：你的 Worker 地址，例如 `https://qttf-decap-oauth.<account>.workers.dev`
   - Authorization callback URL：`https://qttf-decap-oauth.<account>.workers.dev/callback`
2. 安装并登录 Wrangler：

   ```powershell
   cd v2/oauth-worker
   npm install
   npx wrangler login
   ```

3. 写入密钥（不会进入 Git）：

   ```powershell
   npx wrangler secret put GITHUB_OAUTH_ID
   npx wrangler secret put GITHUB_OAUTH_SECRET
   ```

4. 如需允许其他站点 origin，修改 `wrangler.toml` 的 `ALLOWED_ORIGINS`（逗号分隔）。
5. 部署：

   ```powershell
   npx wrangler deploy
   ```

6. 把部署输出的 URL 写入 `../admin/config.yml`：

   ```yaml
   backend:
     base_url: https://qttf-decap-oauth.<account>.workers.dev
     auth_endpoint: /auth
   ```

## 验证

- 打开 `https://qttf-decap-oauth.<account>.workers.dev/` 应返回运行提示。
- 打开站点 `/QTTF/admin/`，点击 GitHub 登录，授权后应回到 CMS 并显示四个集合。
- 若提示仓库不存在，检查 `config.yml` 的 `repo` 和 OAuth App 权限；私有仓库需将 `GITHUB_REPO_PRIVATE` 设为 `1` 并重新部署。

## 安全说明

- Client Secret 只存在于 Worker Secret，不写入仓库。
- `/auth` 只接受 `provider=github`，并用 HMAC 签名的 state 绑定允许的站点 origin，回调有效期 10 分钟。
- 回调页只向允许的 origin `postMessage` token，不使用 `*`。
