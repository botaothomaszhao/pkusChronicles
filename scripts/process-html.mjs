import {writeFileSync, existsSync, mkdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';

const IMG_DIR = join(process.cwd(), 'public/img');

function ensureImgDir() {
    if (!existsSync(IMG_DIR)) {
        mkdirSync(IMG_DIR, {recursive: true});
    }
}

let yqidMap = null;

function getYqidMap() {
    if (yqidMap) return yqidMap;
    yqidMap = new Map();
    const entries = JSON.parse(readFileSync(join(process.cwd(), 'src/data/entries.json'), 'utf-8'));
    for (const e of entries) yqidMap.set(e.yqid, {type: 'entry', slug: e.slug});
    const topics = JSON.parse(readFileSync(join(process.cwd(), 'src/data/topics.json'), 'utf-8'));
    for (const t of topics) yqidMap.set(t.yqid, {type: 'topic', slug: t.slug});
    return yqidMap;
}

/**
 * 处理条目/专题的 HTML body：
 * 1. 下载 <img> 中的远程图片到 public/img/<filename>
 * 2. 替换 src 为 /img/<filename>
 * 3. 将带有 title 的 <img> 转换为 <figure>/<figcaption> 题注
 * 4. 将语雀链接 (`pkuschool.yuque.com/cl0o8b/…`) 转换为站内链接
 *
 * @param {string} body - 原始 HTML
 * @returns {Promise<string>} - 处理后的 HTML
 */
export async function processContentHtml(body) {
    const imgRegex = /<img[^>]+src="([^"]+)"[^>]*>/gi;
    const srcs = new Set();
    let match;
    while ((match = imgRegex.exec(body)) !== null) {
        srcs.add(match[1]);
    }

    let result = body;

    // 1. 下载远程图片并替换 src
    if (srcs.size > 0) {
        ensureImgDir();

        const urlToLocal = new Map();
        for (const src of srcs) {
            const filename = src.split('/').pop();
            if (!filename) continue;
            const localPath = join(IMG_DIR, filename);

            if (!existsSync(localPath)) {
                try {
                    const res = await fetch(src);
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const buffer = Buffer.from(await res.arrayBuffer());
                    writeFileSync(localPath, buffer);
                } catch (err) {
                    console.error(`[图片下载失败] ${src}: ${err.message}`);
                    continue;
                }
            }
            urlToLocal.set(src, `/img/${filename}`);
        }

        for (const [originalUrl, localPath] of urlToLocal) {
            result = result.replaceAll(originalUrl, localPath);
        }
    }

    // 2. 将带有 title 的 <img> 转换为 figure/figcaption
    result = result.replace(
        /<img\s+([^>]+?)>/gi,
        (match, attrs) => {
            const titleMatch = attrs.match(/title="([^"]+)"|title='([^']+)'/i);
            if (!titleMatch) return match;
            const caption = (titleMatch[1] ?? titleMatch[2]).trim();
            if (!caption) return match;
            const cleanAttrs = attrs.replace(/\s+title="[^"]*"|\s+title='[^']*'/i, '');
            return `<figure class="image-figure"><img ${cleanAttrs}><figcaption>${caption}</figcaption></figure>`;
        }
    );

    // 4. 将语雀链接转换为站内链接
    // 先统一引号为双引号
    result = result.replace(
        /\bhref\s*=\s*'([^']+)'/gi,
        'href="$1"'
    );
    result = result.replace(
        /href="https:\/\/pkuschool\.yuque\.com\/cl0o8b\/[^"]+"/gi,
        (match) => {
            const url = match.slice(6, -1);
            const yqid = url.split('/').pop();
            const target = getYqidMap().get(yqid);
            if (!target) return match;
            return `href="/${target.type}/${target.slug}"`;
        }
    );

    return result;
}
