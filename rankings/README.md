本地测试与部署说明
=================

快速目的：在本地预览 `rankings/index.html`（从同目录 `rankings.json` 加载数据），以及在 GitHub Pages 上部署。

本地测试（推荐使用静态服务器）
- 方法 A：Python 3 内置服务器（简单、无依赖）

  在命令行中切换到本目录（包含 `index.html` 与 `rankings.json`）：

  ```bash
  cd "d:/QTTF/QTTF website/rankings"
  python -m http.server 8000
  ```

  然后在浏览器打开：http://localhost:8000/  （点击 `index.html`）

- 方法 B：使用 Node 工具（若已安装）

  使用 `npx serve`（一次性无需全局安装）：

  ```bash
  cd "d:/QTTF/QTTF website/rankings"
  npx serve -p 8000
  ```

注意：不要直接以 `file://` 打开 `index.html`，多数浏览器会阻止对本地 JSON 的 `fetch`，导致页面无法加载数据。

编辑排名数据
- 打开并编辑同目录的 `rankings.json`，文件为标准 JSON 数组，每一项示例如下：

```json
{ "rank": 1, "position": 1, "difference": "", "points": 9750, "name": "WANG Chuqin" }
```

- 差值字段（`difference`）可填写：
  - 上升：`"↑1"`（显示绿色）
  - 下降：`"↓-1"`（显示红色）
  - 无变化：空字符串 `""` 或省略

部署到 GitHub Pages
- 确保仓库中 `QTTF website/rankings/index.html` 与 `QTTF website/rankings/rankings.json` 一并提交并推送。
- 在仓库设置中启用 GitHub Pages，选择 `main` 或 `gh-pages` 分支，并指定根或 `/（docs）` 文件夹（按你仓库结构配置）。
- 部署后，页面将能通过 HTTP 正常访问并加载 `rankings.json`。

故障排查
- 页面显示“数据加载失败”：请确认 `rankings.json` 与 `index.html` 在同一目录，且通过 HTTP(s) 访问（非 file://）。
- 控制台（F12）可查看 fetch 错误详情。

如需我把 README 加到仓库根或生成一个简单的 GitHub Actions 自动发布脚本，告诉我你的偏好。 
