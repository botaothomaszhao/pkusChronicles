# 北大附中校史网站架构

## 核心数据模型

### 条目 (Entry)
一个历史节点，是最小内容单元。有一个全局时间位置，可以属于 0~N 个专题。

```
Entry {
  slug: string            // URL 标识，如 "1920-jianxiao"
  title: string           // 标题
  date: string            // 展示用时间，可以是任意格式，如 "1920-09-15"、"1920"、"2025年春"
  contentFile: string     // 内容 HTML 文件路径，如 "1920-jianxiao.html"
  yqid?: string           // 语雀原始 slug，用于去重
}
```

### 专题 (Topic)
一个主题性的条目集合，有自己的说明页和有序的子条目列表。

```
Topic {
  slug: string            // URL 标识，如 "tiyu"
  title: string           // 专题名
  descriptionFile: string // 专题说明 HTML 文件路径
  entries: string[]       // 该专题下的条目 yqid 列表（有序）；无 yqid 的条目可回退用 slug
}
```

### 资料 (Resource)
以独立页面存档的资料：公众号文章转存、视频、文件（PDF 等）、网页等。可被引用，也可引用别人。日期可选。

```
Resource {
  slug: string            // URL 标识
  title: string           // 标题
  type: 'article' | 'webpage' | 'video' | 'file'   // 资料形式
  date?: string           // 可选时间，如 "2023.8.10"
  sourceUrl?: string      // 可选原始出处链接（公众号/B站/网盘等）
  contentFile?: string    // 可选正文 HTML；file 类型时为 PDF 等文件的根路径
  description?: string    // 可选描述文字，显示在原始出处之后、文件预览/正文之前
  yqid?: string           // 语雀原始 slug，用于去重
}
```

### 引用 (Reference)
条目内容中通过 wiki 语法引用其他条目，构建时自动计算反向索引（backlinks）。

```
Backlink {
  from: string            // 引用者 slug
  to: string              // 被引用者 slug
}
```

## 页面路由

| 路由 | 页面 | 说明 |
|------|------|------|
| `/` | 时间线主页 | 所有条目按 entries.json 中定义的顺序展示 |
| `/entry/[slug]` | 条目详情页 | 正文 + 所在专题导航 + 引用/被引用列表 |
| `/topic` | 专题列表页 | 所有专题概览 |
| `/topic/[slug]` | 专题详情页 | 说明 + 下属条目有序列表 |
| `/resource` | 资料保存汇总页 | 全部独立存档的资料列表 |
| `/resource/[slug]` | 资料详情页 | 正文 + 原始出处 + 引用列表 |
| `/links` | 友情链接页 | 正文来自 `src/content/pages/links.html`，同样经 processContentHtml 处理 |

## 条目详情页的导航上下文

一个条目页面承载多渠道入口的上下文：

```
┌─────────────────────────────────────────┐
│  面包屑：时间线 > 1910年代 > 1920-建校    │
│  或      专题 > 体育史 > 1920-建校         │
│           （多专题时并行展示）              │
├─────────────────────────────────────────┤
│                                         │
│  正文 HTML                               │
│                                         │
├─────────────────────────────────────────┤
│  ← 上一条（时间线）  下一条（时间线） →     │
│                                         │
│  所属专题：体育史                          │
│  ← 上一节点    下一节点 →                 │
│  所属专题：建筑史                          │
│  ← 上一节点    下一节点 →                 │
│                                         │
├─────────────────────────────────────────┤
│  被以下页面引用：                          │
│  · 1930-扩建新楼                         │
│  · 1950-体育成就                         │
└─────────────────────────────────────────┘
```

**时间线导航**：按 `entries.json` 中数组顺序的前后条目（即编辑/导出时确定的顺序，不依赖日期字段）。
**专题导航**：按专题内 entries 顺序的前后条目，每个专题一行。
**面包屑**：根据入口来源高亮对应路径，也可始终显示所有路径。

## 引用系统

### 写法
正文 HTML 中通过站内链接引用其他页面（由 `scripts/process-html.mjs` 从语雀链接转换生成，也可手写）：
```html
<p>这一年发生的事情，参考了<a href="/entry/1930-kuojian">1930年的扩建计划</a>。</p>
```

- `href="/entry/<slug>"` → 引用条目
- `href="/topic/<slug>"` → 引用专题
- `href="/resource/<slug>"` → 引用资料

### 构建时处理
1. 解析 `src/content/entries/*.html`、`src/content/topics/*.html` 与 `src/content/resources/*.html` 中的站内链接，提取引用关系
2. 生成反向索引：`"entry:<slug>" / "topic:<slug>" / "resource:<slug>" → 来源列表[{type, slug, title}]` — 每个页面被哪些正文提及
3. 仅统计正文 HTML；页眉页脚、专题条目列表、所属专题等模板生成的链接不参与计算
4. 条目、专题与资料详情页底部渲染"引用"列表

## 语雀导入约定

`scripts/yuque-import.mjs` 按标题 `<前缀> - <内容>` 的前缀分流文档类型：

| 标题前缀 | 处理为 | 说明 |
|----------|--------|------|
| `<日期>`（含四位年份） | 时间线条目 | 如 `1960 - 建校`；无分隔符或缺年份则忽略 |
| `topic` | 专题 | `topic - 体育史` |
| `links` | 友情链接页 | `links - ...` |
| `resource [日期]` | 资料条目（type=article） | 如 `resource - 文章名` 或 `resource 2023.8.10 - 文章名`，日期可选 |

resource 的日期会写入 Resource.date 并参与资料排序（有日期按日期升序在前，无日期按导入序在后）。資料文档不进入任何专题。

## 环境变量与脚本配置

项目中的脚本会读取根目录 `.env`，其中包含导入/部署所需变量：

- `YUQUE_BASE_URL`：语雀文档原始链接前缀。
- `R2_ENDPOINT`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`：用于 `scripts/r2-sync.mjs` 同步附件资产到 Cloudflare R2；`R2_PUBLIC_URL` 用于 `scripts/r2-deploy.mjs` 把构建产物中指向 `public/` 根级资产的引用（`/<name>`）替换为公网 URL

脚本统一使用 `node --env-file=.env ...` 运行，或者用 `npm run yuque-import -- ...` / `npm run process-html -- ...` 这类包装命令。

## 数据文件

```
src/data/
├── entries.json        # Entry[] — 所有条目元数据
├── topics.json         # Topic[] — 所有专题定义
└── resources.json      # Resource[] — 所有资料元数据，数组顺序 = 资料保存页展示顺序
```

`entries.json` 中条目的数组顺序 = 时间线顺序。依靠人为排列，不依赖日期字段排序。
`topics.json` 中 Topic.entries 的顺序 = 专题内展示顺序（不必与日期一致，可自定）。
`resources.json` 中资料按日期可选排序：有日期的按日期升序在前，无日期的按导入顺序在后。

## 目录结构

```
pkuschronicles/
├── src/
│   ├── content/
│   │   ├── entries/            # 条目正文 HTML
│   │   │   ├── 1920-jianxiao.html
│   │   │   └── ...
│   │   ├── topics/             # 专题说明 HTML
│   │   │   ├── tiyu.html
│   │   │   └── ...
│   │   ├── resources/          # 资料正文 HTML（可空目录）
│   │   │   └── ...
│   │   └── pages/              # 独立页面正文 HTML（如友情链接）
│   │       └── links.html
│   ├── data/
│   │   ├── entries.json
│   │   ├── topics.json
│   │   └── resources.json
│   ├── pages/
│   │   ├── index.astro         # 时间线主页
│   │   ├── entry/
│   │   │   └── [slug].astro    # 条目详情页
│   │   ├── topic/
│   │   │   ├── index.astro     # 专题列表
│   │   │   └── [slug].astro    # 专题详情页
│   │   ├── resource/
│   │   │   ├── index.astro     # 资料保存汇总页
│   │   │   └── [slug].astro    # 资料详情页
│   │   └── links.astro         # 友情链接页
│   ├── lib/
│   │   └── backlinks.ts        # 构建时计算反向引用
│   └── layouts/
│       └── BaseLayout.astro
├── astro.config.mjs
└── package.json
```

## 附件资产

附件资产（图片、视频、PDF 及其他文件）统一扁平存放在 `public/` 根目录，文件名保持 UUID 或 ASCII 名（如 `1783671726076-xxxx.png`、`some-doc.pdf`）。源码 HTML 以根路径引用：`/<filename>`；R2 直链则为 `https://r2.pkuschronicles.com/<filename>`。

- **`scripts/process-html.mjs`** 在导入时自动将 `<img src="...">` 的远程图片下载到 `public/<uuid>.ext`，并把正文 `src` 替换为 `/<uuid>.ext`（UUID 来自 URL 最后一段）
- **`scripts/wechat-resource.mjs`** 被 `processContentHtml` 调用：扫描正文中指向 `https://mp.weixin.qq.com/s/...` 的链接，经由 `https://wx.bdfz.net`（API）抓取文章、下载其图片、生成资源页（`type: article`，`sourceUrl` 为原始链接）写入 `resources.json`，并把链接替换为 `/resource/<slug>`；若锚点文本本身就是链接则一并替换为文章标题。以 `sourceUrl` 判重，未入库资源自动新生成。抓取时移除页面外壳（`source`/`footer`/`h1`/`meta`，仅保留 `<article>` 内容），保留 `<head>` 中的 `<style>` 块并用 `css-tree` 把其中的全局选择器收敛到 `.entry-content`（`@font-face`/`@keyframes` 不动、`:root` 变量改落到 `.entry-content` 上），确保样式只作用于内容、不污染站点导航/标题/结尾，并从渲染页 `.meta` 的 `Published: YYYY-MM-DD` 提取日期写入 `Resource.date`（点分格式，如 `2022.3.14`），资源列表按日期升序与无日期组排序
- **`scripts/yuque-import.mjs`** 处理资料（`resource` 前缀）时，正文与条目走同一管线，附件同样落在 `public/` 根
- `public/` 根级资产已加入 `.gitignore`，不上传 git，仅本地留存（同步到 R2 后线上访问）

**R2 存储**：附件通过 Cloudflare R2 提供线上访问，本地 `public/` 根级文件为唯一事实来源，单向同步到 R2：

- **`scripts/r2-sync.mjs`** 用 S3 兼容 API（`@aws-sdk/client-s3`）同步：以 `public/` 根级所有文件为准，上传本地存在但 R2 缺失或大小不同的文件，删除 R2 存在但本地缺失的对象（即本地清理未引用资产后，线上同步删除）。支持图片、PDF、视频等常用扩展名（`CONTENT_TYPE_MAP`）
- **`scripts/r2-deploy.mjs`** 在 `npm run build` 后运行：从 `dist/` 删除 `public/` 中存在的同名根级资产（不再随站点体积发布），并将 `dist/` 下所有 HTML 中指向这些资产的引用（`/<name>`）替换为 `https://r2.pkuschronicles.com/<name>`；不做同步。注意仅替换 `public/` 清单内的文件名，避免误伤 `/entry/`、`/topic/` 等站内路由
- 源码正文 HTML 始终使用 `/<filename>`，仅构建产物指向 R2 公网地址
- R2 凭证与环境变量见 `.env.example`（复制为 `.env` 填写，已 gitignore）。`R2_PUBLIC_URL` 为公开地址、`r2-deploy` 内置默认值，可被环境变量覆盖；`r2-sync` 用 `--env-file-if-exists` 加载，无 `.env` 也能运行（同步需在本地或 CI 单独执行 `npm run r2-sync`）

**清理未引用资产**：运行 `node scripts/cleanup-assets.mjs`，扫描所有 content HTML（`entries`/`topics`/`pages`/`resources`）中引用的根路径资产，删除 `public/` 根下未被引用且属于托管扩展名的文件。`npm run r2-sync` 会先自动执行这一步，再同步到 R2。

**部署**：`npm run deploy`（= build + r2 同步与替换 + wrangler deploy）。

## 关于切换导航的实现思路

条目详情页（`[slug].astro`）在 `getStaticPaths` 中预计算：

- `prevInTimeline` / `nextInTimeline`：entries.json 中按数组索引确定的相邻条目
- `topicContexts: Array<{ topic, prevEntry, nextEntry }>`：遍历 topics，找到该条目所属的各专题及专题内前后条目
- `backlinks`：调用 `buildBacklinks()` 从反向索引查（entry 页查 `entry:<slug>`，topic 页查 `topic:<slug>`）

所有数据在构建时即确定，运行时零开销。
