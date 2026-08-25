import {existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execSync} from 'node:child_process';
import {pinyin} from 'pinyin';
import {processContentHtml} from './process-html.mjs';

const ENTRIES_DIR = join(process.cwd(), 'src/content/entries');
const DATA_FILE = join(process.cwd(), 'src/data/entries.json');
const TOPICS_FILE = join(process.cwd(), 'src/data/topics.json');
const TOPICS_DIR = join(process.cwd(), 'src/content/topics');
const PAGES_DIR = join(process.cwd(), 'src/content/pages');
const LINKS_FILE = join(PAGES_DIR, 'links.html');

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

async function main() {
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
  if (yuqueDir.endsWith('.lakebook') || yuqueDir.endsWith('.tar')) {
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

  // === Phase 1: 收集元数据、计算 slug ===

  let existingEntries = [];
  if (existsSync(DATA_FILE)) {
    existingEntries = JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
  }

  let existingTopics = [];
  if (existsSync(TOPICS_FILE)) {
    existingTopics = JSON.parse(readFileSync(TOPICS_FILE, 'utf-8'));
  }

  const existingYqidMap = new Map();
  for (const entry of existingEntries) {
    if (entry.yqid) existingYqidMap.set(entry.yqid, entry);
  }

  const usedSlugs = new Set(existingEntries.map(e => e.slug));
  const processedYqids = new Set();
  const topicDocs = [];
  const newEntryData = [];
  let updatedCount = 0;

  // 所有待处理 HTML 的内容（Phase 2 中处理）
  const pendingHtml = [];
  const staleFiles = [];

  for (const docMeta of docs) {
    const yuqueSlug = docMeta.slug;
    if (!yuqueSlug) continue;

    const docPath = join(yuqueDir, `${yuqueSlug}.json`);
    if (!existsSync(docPath)) {
      console.warn(`[警告] 找不到 ${docPath}`);
      continue;
    }
    const docRaw = JSON.parse(readFileSync(docPath, 'utf-8'));
    const bodyRaw = docRaw.doc?.body;
    if (!bodyRaw) {
      console.warn(`[警告] ${yuqueSlug} body 为空`);
      continue;
    }

    const titleRaw = docMeta.title;

    // 统一拆分：`<前缀> - <内容>`，前缀决定文档类型
    const [prefixPart, ...titleParts] = titleRaw.split(' - ');
    const hasSep = titleParts.length > 0;
    const prefix = prefixPart.trim();
    const rest = titleParts.join(' - ').trim();

    // 专题文档
    if (hasSep && prefix === 'topic') {
      const topicTitle = rest;
      const topicSlug = toSlug(topicTitle);
      topicDocs.push({ yqid: yuqueSlug, slug: topicSlug, title: topicTitle, bodyRaw });

      pendingHtml.push({
        bodyRaw,
        filePath: join(TOPICS_DIR, `${topicSlug}.html`),
        isTopic: true,
      });

      processedYqids.add(yuqueSlug);
      console.log(`[专题] ${yuqueSlug} → ${topicSlug}  (${topicTitle})`);
      continue;
    }

    // 友情链接文档
    if (hasSep && prefix === 'links') {
      pendingHtml.push({
        bodyRaw,
        filePath: LINKS_FILE,
        isTopic: false,
      });
      console.log(`[友情链接] ${yuqueSlug} → links.html`);
      continue;
    }

    // 常规条目：需满足 `<日期> - <标题>` 结构，否则忽略
    const date = prefix;
    const displayTitle = rest;
    if (!hasSep || !date.match(/\d{4}/)) {
      console.log(`[忽略] ${yuqueSlug}: ${titleRaw} 无日期或日期格式非法`);
      continue;
    }

    const yearMatch = date.match(/\d{4}/);
    const yearPrefix = yearMatch ? yearMatch[0] : '';
    const slugBase = toSlug(displayTitle);
    // slug 去重
    let finalSlug = yearPrefix ? `${yearPrefix}-${slugBase}` : slugBase;
    let counter = 1;
    const existingEntry = existingYqidMap.get(yuqueSlug);
    while (usedSlugs.has(finalSlug)) {
      if (existingEntry && existingEntry.slug === finalSlug) break;
      finalSlug = yearPrefix ? `${yearPrefix}-${slugBase}-${counter}` : `${slugBase}-${counter}`;
      counter++;
    }
    usedSlugs.add(finalSlug);

    if (existingEntry) {
      // 覆盖已有条目
      const newFile = `${finalSlug}.html`;
      if (existingEntry.contentFile && existingEntry.contentFile !== newFile) {
        staleFiles.push(join(ENTRIES_DIR, existingEntry.contentFile));
      }
      existingEntry.slug = finalSlug;
      existingEntry.title = displayTitle;
      existingEntry.date = date;
      existingEntry.contentFile = newFile;
      processedYqids.add(yuqueSlug);
      updatedCount++;
      console.log(`[覆盖] ${yuqueSlug} → ${finalSlug}  (${displayTitle})`);
    } else {
      newEntryData.push({
        yqid: yuqueSlug,
        slug: finalSlug,
        title: displayTitle,
        date,
        contentFile: `${finalSlug}.html`,
      });
      processedYqids.add(yuqueSlug);
      console.log(`[新增] ${yuqueSlug} → ${finalSlug}  (${displayTitle})`);
    }

    pendingHtml.push({
      bodyRaw,
      filePath: join(ENTRIES_DIR, `${finalSlug}.html`),
      isTopic: false,
    });
  }

  // === 写入 entries.json ===

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
  const merged = [...existingEntries, ...newEntryData];
  merged.sort(compareDate);
  writeFileSync(DATA_FILE, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
  console.log(`\n完成: ${existingEntries.length} 已有 (${updatedCount} 覆盖) + ${newEntryData.length} 新增 = ${merged.length} 总计`);

  // === 写入 topics.json ===

  const yqidDate = new Map();
  for (const e of merged) if (e.yqid) yqidDate.set(e.yqid, e.date);

  const hasTopicWork = topicDocs.length > 0 || (topicSlug && processedYqids.size > 0);
  if (hasTopicWork) {
    let topics = [...existingTopics];
    const modifiedTopics = new Set();
    if (topicDocs.length > 0 && !existsSync(TOPICS_DIR)) mkdirSync(TOPICS_DIR, { recursive: true });

    for (let i = 0; i < topicDocs.length; i++) {
      const td = topicDocs[i];
      const isFirstForArg = topicSlug && i === 0;
      const targetSlug = isFirstForArg ? topicSlug : td.slug;
      const descFile = `${targetSlug}.html`;

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
      modifiedTopics.add(topic);

      // 修正专题描述文件路径
      const descPath = join(TOPICS_DIR, descFile);
      const pendingIdx = pendingHtml.findIndex(p => p.isTopic && p.bodyRaw === td.bodyRaw);
      if (pendingIdx !== -1) pendingHtml[pendingIdx].filePath = descPath;

      console.log(`[专题${isFirstForArg ? '描述' : ''}] ${targetSlug}: ${td.title}`);
    }

    if (topicSlug && processedYqids.size > 0) {
      let topic = topics.find(t => t.slug === topicSlug);
      if (!topic) {
        const descFile = `${topicSlug}.html`;
        const descPath = join(TOPICS_DIR, descFile);
        if (!existsSync(descPath)) writeFileSync(descPath, '', 'utf-8');
        topic = { slug: topicSlug, title: topicSlug, descriptionFile: descFile, entries: [] };
        topics.push(topic);
      }
      modifiedTopics.add(topic);
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

    // 仅对本次有改动的专题重排
    for (const topic of modifiedTopics) {
      topic.entries.sort((a, b) => compareDate(
        { date: yqidDate.get(a) ?? '' },
        { date: yqidDate.get(b) ?? '' }
      ));
    }

    writeFileSync(TOPICS_FILE, JSON.stringify(topics, null, 2) + '\n', 'utf-8');
  }

  // === Phase 2: 处理 HTML，写入内容文件 ===

  if (pendingHtml.some(p => !p.isTopic) && !existsSync(ENTRIES_DIR)) {
    mkdirSync(ENTRIES_DIR, { recursive: true });
  }
  if (pendingHtml.some(p => p.filePath === LINKS_FILE) && !existsSync(PAGES_DIR)) {
    mkdirSync(PAGES_DIR, { recursive: true });
  }

  for (const { bodyRaw, filePath } of pendingHtml) {
    const body = await processContentHtml(bodyRaw);
    writeFileSync(filePath, body, 'utf-8');
  }

  // 清理因覆盖（slug 变更）而废弃的旧文件
  for (const f of staleFiles) {
    if (existsSync(f)) rmSync(f);
  }
}

await main();
