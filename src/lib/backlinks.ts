import { parseWikiLinks } from './wiki-parser';

interface BacklinkIndex {
  [slug: string]: string[];
}

export function buildBacklinks(entries: Array<{ slug: string; contentFile: string }>): BacklinkIndex {
  const index: BacklinkIndex = {};
  for (const entry of entries) {
    index[entry.slug] = [];
  }
  for (const entry of entries) {
    const content = '';
    const refs = parseWikiLinks(content);
    for (const ref of refs) {
      if (index[ref]) {
        index[ref].push(entry.slug);
      }
    }
  }
  return index;
}
