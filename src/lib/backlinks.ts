import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

export interface BacklinkNode {
  type: 'entry' | 'topic';
  slug: string;
  title: string;
}

export type BacklinkIndex = Map<string, BacklinkNode[]>;

interface Source extends BacklinkNode {
  file: string;
}

/**
 * 构建反向引用索引。
 * 只统计正文 HTML（entry 正文 + topic 描述）中的站内链接 `href="/entry/<slug>"` 和 `href="/topic/<slug>"`，
 * 页面模板生成的链接不参与计算。
 */
export function buildBacklinks(
  entries: Array<{ slug: string; title: string; contentFile: string }>,
  topics: Array<{ slug: string; title: string; descriptionFile: string }>
): BacklinkIndex {
  const sources: Source[] = [
    ...entries.map((e) => ({ type: 'entry' as const, slug: e.slug, title: e.title, file: path.resolve('src/content/entries', e.contentFile) })),
    ...topics.map((t) => ({ type: 'topic' as const, slug: t.slug, title: t.title, file: path.resolve('src/content/topics', t.descriptionFile) })),
  ];

  const index: BacklinkIndex = new Map();
  const linkRegex = /href="\/(entry|topic)\/([^"]+)"/g;

  for (const source of sources) {
    if (!existsSync(source.file)) continue;
    const html = readFileSync(source.file, 'utf-8');
    let match: RegExpExecArray | null;
    while ((match = linkRegex.exec(html)) !== null) {
      const target = `${match[1]}:${match[2]}`;
      const list = index.get(target);
      if (!list) {
        index.set(target, [{ type: source.type, slug: source.slug, title: source.title }]);
      } else if (!list.some((s) => s.type === source.type && s.slug === source.slug)) {
        list.push({ type: source.type, slug: source.slug, title: source.title });
      }
    }
  }

  return index;
}
