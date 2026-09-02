import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { pinyin } from 'pinyin';
import { parse as parseCss, generate as generateCss } from 'css-tree';

const WX_BASE_URL = 'https://wx.bdfz.net';
const PUBLIC_DIR = join(process.cwd(), 'public');
const RESOURCES_DIR = join(process.cwd(), 'src/content/resources');
const RESOURCES_FILE = join(process.cwd(), 'src/data/resources.json');
const FETCH_TIMEOUT_MS = 30000;

function timeoutSignal() {
  return AbortSignal.timeout(FETCH_TIMEOUT_MS);
}

const WECHAT_LINK_REGEX = /^https?:\/\/mp\.weixin\.qq\.com\/s\//i;
const RAW_WECHAT_LINK_REGEX = /^mp\.weixin\.qq\.com\/s\//i;

function stripTones(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function toSlug(text) {
  const result = [];
  for (const readings of pinyin(text)) {
    result.push(stripTones(readings[0]));
  }
  return result.join('-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    || 'untitled';
}

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    return (u.host + u.pathname.replace(/\/+$/, '')).toLowerCase();
  } catch {
    return url.replace(/\/+$/, '').toLowerCase();
  }
}

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function loadResources() {
  if (!existsSync(RESOURCES_FILE)) return [];
  return JSON.parse(readFileSync(RESOURCES_FILE, 'utf-8'));
}

let wechatMap = null;

function getWechatMap() {
  if (wechatMap) return wechatMap;
  wechatMap = new Map();
  for (const r of loadResources()) {
    if (r.sourceUrl) wechatMap.set(normalizeUrl(r.sourceUrl), { slug: r.slug, title: r.title });
  }
  return wechatMap;
}

// 与 yuque-import.mjs 保持一致：有日期按日期升序在前，无日期保持相对顺序在后
function compareDate(a, b) {
  const pa = a.date.split('.').map(Number);
  const pb = b.date.split('.').map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const va = pa[i] ?? 0;
    const vb = pb[i] ?? 0;
    if (va !== vb) return va - vb;
  }
  return 0;
}

function compareResource(a, b) {
  if (!a.date && !b.date) return 0;
  if (!a.date) return 1;
  if (!b.date) return -1;
  return compareDate(a, b);
}

/**
 * 解析图片 src，返回 { url, filename }。
 * - 绝对路径（https://img.bdfz.net/... 等）：直接下载，文件名取末段。
 * - 相对路径（/img?u=<encoded> 兜底代理）：拼上 WX_BASE_URL 下载，文件名与扩展名取自
 *   解码后的 u 参数（原始 CDN URL，如 .../640?wx_fmt=gif）。
 */
function resolveImageSrc(src) {
  const isRelative = src.startsWith('/');
  const downloadUrl = isRelative ? `${WX_BASE_URL}${src}` : src;

  let filename;
  try {
    const parsed = new URL(src, WX_BASE_URL);
    let base = parsed.pathname.split('/').pop() || '';

    if (isRelative && base === 'img') {
      const encoded = parsed.searchParams.get('u');
      if (encoded) {
        const real = new URL(decodeURIComponent(encoded));
        base = real.pathname.split('/').pop() || '';
        const fmt = real.searchParams.get('wx_fmt');
        if (fmt && !extname(base)) base += `.${fmt}`;
      }
    }
    filename = decodeURIComponent(base);
  } catch {
    filename = '';
  }
  return { url: downloadUrl, filename };
}

export async function downloadRemoteImages(html) {
  const srcs = new Set();

  // <img src="..."> 中的图片
  const imgRegex = /<img[^>]+src="([^"]+)"[^>]*>/gi;
  let match;
  while ((match = imgRegex.exec(html)) !== null) {
    srcs.add(match[1]);
  }

  // CSS background-image: url(...) 中的远程图片（含 &quot;/&apos; 等实体引号）
  const bgRegex = /background-image\s*:\s*url\(([^)]+)\)/gi;
  while ((match = bgRegex.exec(html)) !== null) {
    const raw = match[1]
      .trim()
      .replace(/^(&quot;|&apos;|"|')/, '')
      .replace(/(&quot;|&apos;|"|')$/, '');
    if (raw) srcs.add(raw);
  }

  if (srcs.size === 0) return html;

  ensureDir(PUBLIC_DIR);
  const urlToLocal = new Map();
  for (const src of srcs) {
    const { url, filename } = resolveImageSrc(src);
    if (!filename) continue;
    const localPath = join(PUBLIC_DIR, filename);

    if (!existsSync(localPath)) {
      try {
        const res = await fetch(url, { signal: timeoutSignal() });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buffer = Buffer.from(await res.arrayBuffer());
        writeFileSync(localPath, buffer);
      } catch (err) {
        console.error(`[微信图片下载失败] ${src}: ${err.message}`);
        continue;
      }
    }
    urlToLocal.set(src, `/${filename}`);
  }

  let result = html;
  for (const [originalUrl, localPath] of urlToLocal) {
    result = result.replaceAll(originalUrl, localPath);
  }
  return result;
}

export function extractBody(html) {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const body = bodyMatch ? bodyMatch[1] : html;

  // 保留 <head> 中的 <style>，否则部分 CSS 缺失
  const headPart = bodyMatch ? html.slice(0, bodyMatch.index) : '';
  const styles = [];
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m;
  while ((m = styleRegex.exec(headPart)) !== null) {
    styles.push(m[0]);
  }

  return styles.join('\n') + body;
}

/**
 * 移除 html 中第一个匹配 openRegex 的平衡元素（含其闭合标签）。
 * tagName 用于计算嵌套深度，保证只删最外层对应元素。
 */
function stripBalancedElement(html, openRegex, tagName) {
  const open = html.match(openRegex);
  if (!open) return html;
  const start = open.index;
  let depth = 1;
  const re = new RegExp(`</?${tagName}\\b[^>]*>`, 'gi');
  re.lastIndex = start + open[0].length;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[0].startsWith('</')) depth--;
    else depth++;
    if (depth === 0) {
      return html.slice(0, start) + html.slice(m.index + m[0].length);
    }
  }
  return html;
}

export function cleanArticleBody(body) {
  let html = stripBalancedElement(body, /<div[^>]*class="source"[^>]*>/i, 'div');
  return stripBalancedElement(html, /<footer[^>]*>/i, 'footer').trim();
}

export function extractPublishedDate(html) {
  const match = html.match(/Published:\s*(\d{4})-(\d{2})-(\d{2})/i);
  if (!match) return undefined;
  const [, y, m, d] = match;
  return `${y}.${Number(m)}.${Number(d)}`;
}

export async function ingestArticle(wechatUrl) {
  const resp = await fetch(`${WX_BASE_URL}/api/ingest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: wechatUrl }),
    signal: timeoutSignal(),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const detail = data.error || data.hint || `HTTP ${resp.status}`;
    throw new Error(detail);
  }
  if (!data.ok) throw new Error(data.error || 'ingest 返回 ok=false');
  return data;
}

export async function fetchArticleContent(apiSlug) {
  const resp = await fetch(`${WX_BASE_URL}/${apiSlug}`, { signal: timeoutSignal() });
  if (!resp.ok) throw new Error(`渲染页 HTTP ${resp.status}`);
  return await resp.text();
}

function anchorTextIsRawLink(href, text) {
  const trimmed = text.trim();
  if (trimmed === href) return true;
  const bare = href.replace(/^https?:\/\//i, '');
  if (trimmed === bare) return true;
  return WECHAT_LINK_REGEX.test(trimmed) || RAW_WECHAT_LINK_REGEX.test(trimmed);
}

// 把微信渲染页 <style> 里的全局选择器收敛到 .entry-content，避免污染站点导航/标题/结尾等
function collectSelectors(node, out) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'Atrule' && /keyframes$/i.test(node.name)) return;
  if (node.type === 'Selector') {
    out.push(node);
    return;
  }
  if (node.type === 'SelectorList') {
    node.children.forEach((c) => collectSelectors(c, out));
    return;
  }
  for (const key of Object.keys(node)) {
    const v = node[key];
    if (!v || typeof v !== 'object') continue;
    if (typeof v.forEach === 'function') v.forEach((c) => collectSelectors(c, out));
    else if (v.type) collectSelectors(v, out);
  }
}

function scopeCss(css) {
  const ast = parseCss(css);
  const sels = [];
  collectSelectors(ast, sels);
  for (const s of sels) {
    const first = s.children.first;
    if (s.children.size === 1 && first?.type === 'PseudoClassSelector' && first.name === 'root') {
      // :root 变量需要落在内容容器上，才能被子元素继承
      s.children.clear();
      s.children.prependData({ type: 'ClassSelector', name: 'entry-content' });
    } else {
      s.children.prependData({ type: 'Combinator', name: ' ' });
      s.children.prependData({ type: 'ClassSelector', name: 'entry-content' });
    }
  }
  return generateCss(ast);
}

function scopeHtmlCss(html) {
  return html.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (full, css) => {
    try {
      return full.replace(css, scopeCss(css));
    } catch {
      return full;
    }
  });
}

/**
 * 导入 / 重新导入一条微信资源：拉取内容、下载图片、写入资源文件并更新 resources.json。
 * 已有同 sourceUrl 资源则覆盖其内容与元数据（保留 slug），否则新建。
 */
export async function importWechatUrl(wechatUrl) {
  const data = await ingestArticle(wechatUrl);
  const title = data.title.trim();
  const content = await fetchArticleContent(data.slug);
  const body = cleanArticleBody(extractBody(content));
  const localContent = await downloadRemoteImages(body);
  const scopedContent = scopeHtmlCss(localContent);
  const publishedDate = extractPublishedDate(content);

  const resources = loadResources();
  const existing = resources.find((r) => r.sourceUrl && normalizeUrl(r.sourceUrl) === normalizeUrl(wechatUrl));
  const knownSlugs = new Set(resources.map((r) => r.slug));

  let finalSlug = existing ? existing.slug : toSlug(title);
  let counter = 1;
  while (!existing && knownSlugs.has(finalSlug)) {
    finalSlug = `${toSlug(title)}-${counter}`;
    counter++;
  }

  ensureDir(RESOURCES_DIR);
  writeFileSync(join(RESOURCES_DIR, `${finalSlug}.html`), scopedContent, 'utf-8');

  const resource = {
    slug: finalSlug,
    ...(title ? { title } : existing ? { title: existing.title } : {}),
    type: 'article',
    sourceUrl: wechatUrl,
    contentFile: `${finalSlug}.html`,
    ...(publishedDate ? { date: publishedDate } : {}),
  };
  if (existing) Object.assign(existing, resource);
  else resources.push(resource);
  resources.sort(compareResource);
  writeFileSync(RESOURCES_FILE, JSON.stringify(resources, null, 2) + '\n', 'utf-8');

  return resource;
}

export async function processWechatLinks(html) {
  const map = getWechatMap();

  const found = [];
  const linkRegex = /(?<!-)href="([^"]+)"[^>]*>/gi;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    if (WECHAT_LINK_REGEX.test(match[1])) found.push(match[1]);
  }
  if (found.length === 0) return html;

  const urlToResource = new Map();
  for (const wechatUrl of found) {
    const key = normalizeUrl(wechatUrl);
    if (urlToResource.has(key)) continue;

    const existing = map.get(key);
    if (existing) {
      urlToResource.set(key, existing);
      continue;
    }

    try {
      const resource = await importWechatUrl(wechatUrl);
      map.set(key, resource);
      urlToResource.set(key, resource);
      console.log(`[微信资源] ${wechatUrl} → ${resource.slug}  (${resource.title}${resource.date ? `, ${resource.date}` : ''})`);
    } catch (err) {
      console.error(`[微信资源失败] ${wechatUrl}: ${err.message}`);
    }
  }

  if (urlToResource.size === 0) return html;

  return html.replace(
    /<a\b([^>]*)>([\s\S]*?)<\/a>/gi,
    (full, attrs, inner) => {
      const hrefMatch = attrs.match(/href="([^"]+)"/i);
      if (!hrefMatch) return full;
      const href = hrefMatch[1];
      if (!WECHAT_LINK_REGEX.test(href)) return full;
      const resource = urlToResource.get(normalizeUrl(href));
      if (!resource) return full;

      const newAttrs = attrs.replace(/href="[^"]+"/i, `href="/resource/${resource.slug}"`);
      const newInner = anchorTextIsRawLink(href, inner) ? resource.title : inner;
      return `<a${newAttrs}>${newInner}</a>`;
    }
  );
}
