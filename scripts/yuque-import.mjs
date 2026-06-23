import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { pinyin } from 'pinyin';

const ENTRIES_DIR = join(process.cwd(), 'src/content/entries');
const DATA_FILE = join(process.cwd(), 'src/data/entries.json');
const TOPICS_FILE = join(process.cwd(), 'src/data/topics.json');
const TOPICS_DIR = join(process.cwd(), 'src/content/topics');

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
  const args = process.argv.slice(2);
  let yuqueDir = '';
  let topicSlug = '';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--topic') {
      topicSlug = args[++i];
    } else {
      yuqueDir = args[i];
    }
  }
  if (!yuqueDir) {
    console.error('用法: node scripts/yuque-import.mjs [--topic <slug>] <语雀导出目录路径>');
    process.exit(1);
  }

  // 如果输入是 .lakebook 文件，作为 tar 解压
  if (yuqueDir.endsWith('.lakebook')) {
    if (!existsSync(yuqueDir)) {
      console.error(`错误: 找不到 ${yuqueDir}`);
      process.exit(1);
    }
    const tmpDir = mkdtempSync(join(tmpdir(), 'yuque-import-'));
    console.log(`[解压] ${yuqueDir} → ${tmpDir}`);
    execSync(`tar -xf "${yuqueDir}" -C "${tmpDir}"`, { stdio: 'pipe' });
    const items = readdirSync(tmpDir).filter(f => !f.startsWith('.'));
    if (items.length !== 1) {
      console.error(`错误: .lakebook 解压后应包含 1 个目录，实际有 ${items.length} 个`);
      process.exit(1);
    }
    yuqueDir = join(tmpDir, items[0]);
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
  let updatedCount = 0;
  const processedYqids = new Set();
  const topicDocs = [];
  const removeEntryYqids = new Set();

  for (const docMeta of docs) {
    const yuqueSlug = docMeta.slug;
    if (!yuqueSlug) continue;

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

    // 专题文档: 标题格式为 "topic - 标题"
    const titleRaw = docMeta.title;
    if (titleRaw.startsWith('topic - ')) {
      const topicTitle = titleRaw.slice(7).trim();
      const topicSlugFromTitle = toSlug(topicTitle);
      topicDocs.push({ yqid: yuqueSlug, slug: topicSlugFromTitle, title: topicTitle, body });
      if (yqidMap.has(yuqueSlug)) removeEntryYqids.add(yuqueSlug);
      console.log(`[专题] ${yuqueSlug} → ${topicSlugFromTitle}  (${topicTitle})`);
      continue;
    }

    // parse title: "日期 - 标题"
    let date = '';
    let displayTitle = titleRaw;
    const sepIndex = titleRaw.indexOf(' - ');
    if (sepIndex !== -1) {
      date = titleRaw.substring(0, sepIndex).trim();
      displayTitle = titleRaw.substring(sepIndex + 3).trim();
    }

    if (!date) {
      console.warn(`[缺少时间] ${yuqueSlug}  (${displayTitle})`);
    }

    // generate slug
    const yearMatch = date.match(/\d{4}/);
    const yearPrefix = yearMatch ? yearMatch[0] : '';
    const slugBase = toSlug(displayTitle);
    let slug = yearPrefix ? `${yearPrefix}-${slugBase}` : slugBase;

    // overwrite existing entry
    if (yqidMap.has(yuqueSlug)) {
      const existing = yqidMap.get(yuqueSlug);

      // dedup slug (exclude self)
      const usedSlugs = new Set(existingEntries.filter(e => e !== existing).map(e => e.slug));
      let finalSlug = slug;
      let counter = 1;
      while (usedSlugs.has(finalSlug)) {
        finalSlug = yearPrefix ? `${yearPrefix}-${slugBase}-${counter}` : `${slugBase}-${counter}`;
        counter++;
      }

      // rename file if slug changed
      const newFile = `${finalSlug}.html`;
      const oldPath = join(ENTRIES_DIR, existing.contentFile);
      const newPath = join(ENTRIES_DIR, newFile);
      if (oldPath !== newPath) {
        if (existsSync(oldPath)) renameSync(oldPath, newPath);
      }
      writeFileSync(newPath, body, 'utf-8');

      existing.slug = finalSlug;
      existing.title = displayTitle;
      existing.date = date;
      existing.contentFile = newFile;
      processedYqids.add(yuqueSlug);
      console.log(`[覆盖] ${yuqueSlug} → ${finalSlug}  (${displayTitle})`);
      updatedCount++;
      continue;
    }

    // dedup slug among remaining entries
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
    processedYqids.add(yuqueSlug);
    newEntries.push(entry);
    console.log(`[新增] ${yuqueSlug} → ${finalSlug}  (${displayTitle})`);
  }

  // 移除转为专题的旧条目
  if (removeEntryYqids.size > 0) {
    for (const yqid of removeEntryYqids) {
      const entry = yqidMap.get(yqid);
      const entryPath = join(ENTRIES_DIR, entry.contentFile);
      if (existsSync(entryPath)) rmSync(entryPath);
    }
    existingEntries = existingEntries.filter(e => !removeEntryYqids.has(e.yqid));
  }

  // merge & sort by date（同 date 保持相对顺序，稳定排序）
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
  const merged = [...existingEntries, ...newEntries];
  merged.sort(compareDate);
  writeFileSync(DATA_FILE, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
  const added = newEntries.length;
  console.log(`\n完成: ${existingEntries.length} 已有 (${updatedCount} 覆盖) + ${added} 新增 = ${merged.length} 总计`);

  // 处理专题
  const hasTopicWork = topicDocs.length > 0 || (topicSlug && processedYqids.size > 0);
  if (hasTopicWork) {
    let topics = [];
    if (existsSync(TOPICS_FILE)) {
      topics = JSON.parse(readFileSync(TOPICS_FILE, 'utf-8'));
    }
    if (!existsSync(TOPICS_DIR)) mkdirSync(TOPICS_DIR, { recursive: true });

    // 处理本次导入的专题文档
    for (let i = 0; i < topicDocs.length; i++) {
      const td = topicDocs[i];
      const isFirstForArg = topicSlug && i === 0;
      const targetSlug = isFirstForArg ? topicSlug : td.slug;
      const descFile = `${targetSlug}.html`;

      // 先按 yqid 查找，再按 slug 查找
      let topic = topics.find(t => t.yqid === td.yqid);
      if (!topic) topic = topics.find(t => t.slug === targetSlug);

      if (topic) {
        topic.title = td.title;
        if (td.yqid && !topic.yqid) topic.yqid = td.yqid;
        topic.slug = targetSlug;
        topic.descriptionFile = descFile;
      } else {
        topic = { slug: targetSlug, title: td.title, descriptionFile: descFile, entries: [], yqid: td.yqid };
        topics.push(topic);
      }

      writeFileSync(join(TOPICS_DIR, descFile), td.body, 'utf-8');
      console.log(`[专题${isFirstForArg ? '描述' : ''}] ${targetSlug}: ${td.title}`);
    }

    // 将条目 yqid 加入 --topic 专题
    if (topicSlug && processedYqids.size > 0) {
      let topic = topics.find(t => t.slug === topicSlug);
      if (!topic) {
        const descFile = `${topicSlug}.html`;
        const descPath = join(TOPICS_DIR, descFile);
        if (!existsSync(descPath)) writeFileSync(descPath, '', 'utf-8');
        topic = { slug: topicSlug, title: topicSlug, descriptionFile: descFile, entries: [] };
        topics.push(topic);
      }
      let addedCount = 0;
      for (const entry of merged) {
        const yqid = entry.yqid;
        if (yqid && processedYqids.has(yqid) && !topic.entries.includes(yqid)) {
          topic.entries.push(yqid);
          addedCount++;
        }
      }
      console.log(`[专题] ${topicSlug}: 添加 ${addedCount} 个条目`);
    }

    writeFileSync(TOPICS_FILE, JSON.stringify(topics, null, 2) + '\n', 'utf-8');
  }
}

main();
