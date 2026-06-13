import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pinyin } from 'pinyin';

const ENTRIES_DIR = join(process.cwd(), 'src/content/entries');
const DATA_FILE = join(process.cwd(), 'src/data/entries.json');

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

function main() {
  const yuqueDir = process.argv[2];
  if (!yuqueDir) {
    console.error('用法: node scripts/yuque-import.mjs <语雀导出目录路径>');
    process.exit(1);
  }

  // read $meta.json
  const metaPath = join(yuqueDir, '$meta.json');
  if (!existsSync(metaPath)) {
    console.error(`错误: 找不到 ${metaPath}`);
    process.exit(1);
  }
  const metaRaw = JSON.parse(readFileSync(metaPath, 'utf-8'));
  const meta = JSON.parse(metaRaw.meta);
  const docs = meta.docs;
  if (!Array.isArray(docs)) {
    console.error('错误: $meta.json 中 docs 字段不是数组');
    process.exit(1);
  }

  // read existing entries
  let existingEntries = [];
  if (existsSync(DATA_FILE)) {
    existingEntries = JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
  }

  // build yqid → entry map for dedup
  const yqidMap = new Map();
  for (const entry of existingEntries) {
    if (entry.yqid) yqidMap.set(entry.yqid, entry);
  }

  // ensure content dir
  if (!existsSync(ENTRIES_DIR)) {
    mkdirSync(ENTRIES_DIR, { recursive: true });
  }

  const newEntries = [];

  for (const docMeta of docs) {
    const yuqueSlug = docMeta.slug;
    if (!yuqueSlug) continue;
    if (yqidMap.has(yuqueSlug)) {
      console.log(`[跳过] ${yuqueSlug}`);
      continue;
    }

    // read doc body
    const docPath = join(yuqueDir, `${yuqueSlug}.json`);
    if (!existsSync(docPath)) {
      console.warn(`[警告] 找不到 ${docPath}`);
      continue;
    }
    const docRaw = JSON.parse(readFileSync(docPath, 'utf-8'));
    const body = docRaw.doc?.body;
    if (!body) {
      console.warn(`[警告] ${yuqueSlug} body 为空`);
      continue;
    }

    // parse title: "日期 - 标题"
    const titleRaw = docMeta.title;
    let date = '';
    let displayTitle = titleRaw;
    const sepIndex = titleRaw.indexOf(' - ');
    if (sepIndex !== -1) {
      date = titleRaw.substring(0, sepIndex).trim();
      displayTitle = titleRaw.substring(sepIndex + 3).trim();
    }

    // generate slug
    const yearMatch = date.match(/\d{4}/);
    const yearPrefix = yearMatch ? yearMatch[0] : '';
    const slugBase = toSlug(displayTitle);
    let slug = yearPrefix ? `${yearPrefix}-${slugBase}` : slugBase;

    // dedup slug
    const usedSlugs = new Set([
      ...existingEntries.map(e => e.slug),
      ...newEntries.map(e => e.slug),
    ]);
    let counter = 1;
    let finalSlug = slug;
    while (usedSlugs.has(finalSlug)) {
      finalSlug = yearPrefix
        ? `${yearPrefix}-${slugBase}-${counter}`
        : `${slugBase}-${counter}`;
      counter++;
    }

    // write content file
    writeFileSync(join(ENTRIES_DIR, `${finalSlug}.html`), body, 'utf-8');

    const entry = {
      slug: finalSlug,
      title: displayTitle,
      date,
      contentFile: `${finalSlug}.html`,
      yqid: yuqueSlug,
    };
    newEntries.push(entry);
    console.log(`[新增] ${yuqueSlug} → ${finalSlug}  (${displayTitle})`);
  }

  // merge & write
  const merged = [...existingEntries, ...newEntries];
  writeFileSync(DATA_FILE, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
  console.log(`\n完成: ${existingEntries.length} 已有 + ${newEntries.length} 新增 = ${merged.length} 总计`);
}

main();
