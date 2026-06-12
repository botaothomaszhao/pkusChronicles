export function parseWikiLinks(html: string): string[] {
  const refs: string[] = [];
  const regex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    refs.push(match[1]);
  }
  return refs;
}

export function renderWikiLinks(html: string, getTitle: (slug: string) => string): string {
  return html.replace(
    /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    (_, slug: string, text?: string) => {
      const title = text || getTitle(slug);
      return `<a href="/entry/${slug}">${title}</a>`;
    }
  );
}
