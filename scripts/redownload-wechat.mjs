import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { importWechatUrl } from './wechat-resource.mjs';

const RESOURCES_FILE = join(process.cwd(), 'src/data/resources.json');

const targetSlug = process.argv[2];
const resources = JSON.parse(readFileSync(RESOURCES_FILE, 'utf-8'));
const targets = resources
    .filter((r) => r.sourceUrl && /^https?:\/\/mp\.weixin\.qq\.com\/s\//i.test(r.sourceUrl))
    .filter((r) => !targetSlug || r.slug === targetSlug);

let ok = 0;
let fail = 0;
for (const r of targets) {
    try {
        const resource = await importWechatUrl(r.sourceUrl);
        ok++;
        console.log(`✓ ${resource.slug}  ${resource.title}${resource.date ? `, ${resource.date}` : ''}`);
    } catch (err) {
        fail++;
        console.error(`✗ ${r.slug}: ${err.message}`);
    }
}

console.log(`\n完成: ${ok} 成功 / ${fail} 失败`);
