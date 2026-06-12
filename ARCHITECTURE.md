# 北大附中校史网站架构

## 核心数据模型

### 条目 (Entry)
一个历史节点，是最小内容单元。有一个全局时间位置，可以属于 0~N 个专题。

```
Entry {
  slug: string            // URL 标识，如 "1920-jianxiao"
  title: string           // 标题
  date: string            // 展示用时间，可以是任意格式，如 "1920-09-15"、"1920"、"2025年春"
  summary: string         // 摘要（用于时间线/专题列表卡片）
  contentFile: string     // 内容 HTML 文件路径，如 "1920-jianxiao.html"
}
```

### 专题 (Topic)
一个主题性的条目集合，有自己的说明页和有序的子条目列表。

```
Topic {
  slug: string            // URL 标识，如 "tiyu"
  title: string           // 专题名
  descriptionFile: string // 专题说明 HTML 文件路径
  entries: string[]       // 该专题下的条目 slug 列表（有序）
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
条目正文 HTML 中使用 wiki 链接语法：
```html
<p>这一年发生的事情，参考了[[1930-kuojian|1930年的扩建计划]]。</p>
```

- `[[slug]]` → 渲染为链向 `/entry/slug` 的超链接，显示目标条目标题
- `[[slug|自定义文字]]` → 显示自定义文字

### 构建时处理
1. 解析所有条目 HTML 中的 `[[...]]`，提取引用关系
2. 生成反向索引：`backlinks: { [slug]: string[] }` — 每个条目被哪些条目引用
3. 条目详情页底部渲染"被以下页面引用"列表

## 数据文件

```
src/data/
├── entries.json        # Entry[] — 所有条目元数据
└── topics.json         # Topic[] — 所有专题定义
```

`entries.json` 中条目的数组顺序 = 时间线顺序。依靠人为排列，不依赖日期字段排序。
`topics.json` 中 Topic.entries 的顺序 = 专题内展示顺序（不必与日期一致，可自定）。

## 目录结构

```
pkuschronicles/
├── src/
│   ├── content/
│   │   ├── entries/            # 条目正文 HTML
│   │   │   ├── 1920-jianxiao.html
│   │   │   └── ...
│   │   └── topics/             # 专题说明 HTML
│   │       ├── tiyu.html
│   │       └── ...
│   ├── data/
│   │   ├── entries.json
│   │   └── topics.json
│   ├── pages/
│   │   ├── index.astro         # 时间线主页
│   │   ├── entry/
│   │   │   └── [slug].astro    # 条目详情页
│   │   └── topic/
│   │       ├── index.astro     # 专题列表
│   │       └── [slug].astro    # 专题详情页
│   ├── lib/
│   │   ├── backlinks.ts        # 构建时计算反向引用
│   │   └── wiki-parser.ts      # [[wiki link]] → <a> 转换
│   └── layouts/
│       └── BaseLayout.astro
├── astro.config.mjs
└── package.json
```

## 图片

图片全部存放于 Cloudflare R2，正文 HTML 中以绝对 URL 引用 `https://cdn.example.com/img/xxx.jpg`。
如果导出的 HTML 含本地路径，构建前通过脚本统一替换。

## 关于切换导航的实现思路

条目详情页（`[slug].astro`）在 `getStaticPaths` 中预计算：

- `prevInTimeline` / `nextInTimeline`：entries.json 中按数组索引确定的相邻条目
- `topicContexts: Array<{ topic, prevEntry, nextEntry }>`：遍历 topics，找到该条目所属的各专题及专题内前后条目
- `backlinks: string[]`：从预生成的反向索引查

所有数据在构建时即确定，运行时零开销。
