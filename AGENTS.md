# AGENTS.md

## 技术栈

- **Astro 5** (SSG), TypeScript strict mode
- 纯静态站点，无运行时服务端逻辑

## 关键命令

```bash
npm run dev      # 开发服务器
npm run build    # 构建到 dist/
npm run preview  # 预览构建结果
```

无 lint / typecheck / test 脚本。提交前手动 `npm run build` 确认无报错。

```bash
npm run yuque-import -- [--topic <slug>] <语雀导出目录>   # 直接运行导入脚本
npm run process-html -- [<文件/目录路径>] # 独立运行处理管线，参数为 .html 文件或含 .html 文件的目录（递归）
node scripts/cleanup-images.mjs                            # 清理 public/img/ 中未被任何 HTML 引用的图片
npm run r2-sync                                   # 以 public/img/ 为准同步图片到 R2（上传缺失/变更，删除 R2 多余对象）
npm run deploy                                    # build + r2-deploy + wrangler deploy
```

环境变量在 `.env`（已 gitignore）中配置，模板见 `.env.example`。`deploy`/`r2-sync` 使用 `--env-file-if-exists`，无 `.env` 也能运行：缺私有凭证时 `r2-deploy` 跳过同步，`R2_PUBLIC_URL` 为公开地址、脚本内置默认值，可被环境变量覆盖。

## 项目结构

- `src/data/entries.json` — 所有条目元数据，数组顺序 = 时间线顺序
- `src/data/topics.json` — 专题定义
- `src/content/entries/*.html` — 条目正文（纯 HTML，非 Markdown）
- `src/content/topics/*.html` — 专题说明（纯 HTML）
- `src/lib/backlinks.ts` — 构建时反向引用计算（统计 entry 正文与 topic 描述 HTML 中的站内链接）
- `scripts/yuque-import.mjs` — 从语雀导出目录导入条目，自动下载图片到 `public/img/` 并替换 HTML 中的 src
- `scripts/process-html.mjs` — HTML 处理管线（图片下载、后续注释格式等其他转换），被 `yuque-import.mjs` 调用，也可独立运行
- `scripts/cleanup-images.mjs` — 清理 `public/img/` 中未被任何 HTML 引用的图片
- `scripts/r2-sync.mjs` — 以 `public/img/` 为事实来源单向同步图片到 R2（上传/删除），凭证来自 `.env`
- `scripts/r2-deploy.mjs` — build 后运行：同步 R2 + 删除 `dist/img/` + 将 dist 中 HTML 的 `/img/` 替换为 R2 公网 URL
- `public/img/` — 导入时下载的本地图片（`.gitignore` 中排除，不上传 git），本地唯一留存
- `ARCHITECTURE.md` — 详尽的架构文档，数据处理和路由逻辑以它为参考
- `TODO.md` — 待办事项列表，面向开发者，没有提到时无需关注

## 路径别名

`@/*` → `src/*`（tsconfig 配置）

## 内容约定

- 条目正文 HTML 中使用 `<a href="/entry/<slug>">` 或 `<a href="/topic/<slug>">` 引用其他页面
- 图片以 `/img/<uuid>.ext` 引用本地图片（位于 `public/img/`）；构建产物由 `scripts/r2-deploy.mjs` 替换为 `https://r2.pkuschronicles.com/<uuid>.ext`，源码始终用本地路径
- 所有页面中文 (zh-CN)

## 数据模型

见 `ARCHITECTURE.md` 的完整定义。核心要点：
- `Entry`: slug, title, date, contentFile, yqid
- `Topic`: slug, title, descriptionFile, entries[]
- 时间线顺序 = entries.json 数组顺序（不依赖 date 字段）
- 一个条目可属 0~N 个专题

## git 约定

commit消息格式为 `<type>(<scope>): <subject>`，正文用中文
如果是内容更新，scope 填 `content`

## AGENT指令

项目结构等有较大变动时，需要更新 `ARCHITECTURE.md` 和 `AGENTS.md` 中的相关描述。请确保两者和实际代码保持一致。
