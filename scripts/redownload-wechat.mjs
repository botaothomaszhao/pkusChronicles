import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    ingestArticle,
    fetchArticleContent,
    extractBody,
    cleanArticleBody,
    extractPublishedDate,
    downloadRemoteImages,
} from './wechat-resource.mjs';

const RESOURCES_FILE = join(process.cwd(), 'src/data/resources.json');
const RESOURCES_DIR = join(process.cwd(), 'src/content/resources');

const targetSlug = process.argv[2];
const resources = JSON.parse(readFileSync(RESOURCES_FILE, 'utf-8'));
const targets = resources
    .filter((r) => r.sourceUrl && /^https?:\/\/mp\.weixin\.qq\.com\/s\//i.test(r.sourceUrl))
    .filter((r) => !targetSlug || r.slug === targetSlug);

let ok = 0;
let fail = 0;
for (const r of targets) {
    try {
        const data = await ingestArticle(r.sourceUrl);
        const content = await fetchArticleContent(data.slug);
        const body = cleanArticleBody(extractBody(content));
        const localContent = await downloadRemoteImages(body);
        const publishedDate = extractPublishedDate(content);

        writeFileSync(join(RESOURCES_DIR, r.contentFile), localContent, 'utf-8');

        const newTitle = data.title.trim();
        if (newTitle && newTitle !== r.title) r.title = newTitle;
        if (publishedDate && publishedDate !== r.date) r.date = publishedDate;

        ok++;
        console.log(`✓ ${r.slug}  ${r.title}${publishedDate ? `, ${publishedDate}` : ''}`);
    } catch (err) {
        fail++;
        console.error(`✗ ${r.slug}: ${err.message}`);
    }
}

writeFileSync(RESOURCES_FILE, JSON.stringify(resources, null, 2) + '\n', 'utf-8');
console.log(`\n完成: ${ok} 成功 / ${fail} 失败`);
