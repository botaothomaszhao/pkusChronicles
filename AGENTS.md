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
node scripts/yuque-import.mjs [--topic <slug>] <语雀导出目录>   # 导入语雀知识库到 entries
```

## 项目结构

- `src/data/entries.json` — 所有条目元数据，数组顺序 = 时间线顺序
- `src/data/topics.json` — 专题定义
- `src/content/entries/*.html` — 条目正文（纯 HTML，非 Markdown）
- `src/content/topics/*.html` — 专题说明（纯 HTML）
- `src/lib/wiki-parser.ts` — `[[slug]]` / `[[slug|text]]` wiki 链接解析与渲染
- `src/lib/backlinks.ts` — 构建时反向引用计算（目前 `content` 读取为空，待修复）
- `scripts/yuque-import.mjs` — 从语雀导出目录导入条目
- `ARCHITECTURE.md` — 详尽的架构文档，数据处理和路由逻辑以它为参考
- `TODO.md` — 待办事项列表，面向开发者，没有提到时无需关注

## 路径别名

`@/*` → `src/*`（tsconfig 配置）

## 内容约定

- 条目正文 HTML 中使用 `[[slug]]` 或 `[[slug|显示文字]]` 引用其他条目
- 图片以绝对 URL 引用 Cloudflare R2：`https://cdn.example.com/img/xxx.jpg`
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
