import {writeFileSync, existsSync, mkdirSync, readFileSync, statSync, readdirSync} from 'node:fs';
import {join, extname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {processWechatLinks} from './wechat-resource.mjs';

const PUBLIC_DIR = join(process.cwd(), 'public');

function requireEnv(name) {
    const value = process.env[name];
    if (!value) throw new Error(`缺少环境变量 ${name}，请在 .env 中填写`);
    return value;
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const YUQUE_BASE_URL = requireEnv('YUQUE_BASE_URL').replace(/\/+$/, '');

function ensurePublicDir() {
    if (!existsSync(PUBLIC_DIR)) {
        mkdirSync(PUBLIC_DIR, {recursive: true});
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

let sourceUrlMap = null;

function normalizeUrl(url) {
    try {
        const u = new URL(url);
        return (u.host + u.pathname.replace(/\/+$/, '')).toLowerCase();
    } catch {
        return url.replace(/\/+$/, '').toLowerCase();
    }
}

/**
 * 构建 sourceUrl -> slug 映射，用于把正文中指向资源原始出处的外链转换为站内资源链接。
 * 忽略 query/hash、尾部分号及大小写差异。
 */
function getSourceUrlMap() {
    if (sourceUrlMap) return sourceUrlMap;
    sourceUrlMap = new Map();
    const filePath = join(process.cwd(), 'src/data/resources.json');
    if (!existsSync(filePath)) return sourceUrlMap;
    const resources = JSON.parse(readFileSync(filePath, 'utf-8'));
    for (const r of resources) {
        if (!r.sourceUrl) continue;
        sourceUrlMap.set(normalizeUrl(r.sourceUrl), r.slug);
    }
    return sourceUrlMap;
}

/**
 * 处理条目/专题的 HTML body：
 * 1. 下载 <img> 中的远程图片到 public/<filename>，并替换 src 为 /<filename>
 * 2. 将带有 title 的 <img> 转换为 <figure>/<figcaption> 题注
 * 3. 将 Markdown 脚注 [^x]: / [^x] 转换为 <ol class="footnotes-list"> 列表及行内角标
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
        ensurePublicDir();

        const urlToLocal = new Map();
        for (const src of srcs) {
            let filename;
            try {
                filename = new URL(src).pathname.split('/').pop() || '';
            } catch {
                filename = src.split('/').pop() || '';
            }
            if (!filename) continue;
            filename = decodeURIComponent(filename);
            const localPath = join(PUBLIC_DIR, filename);

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
            urlToLocal.set(src, `/${filename}`);
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

    // 3. 将 Markdown 脚注 [^x] / [^x]: 转换为 HTML 角标
    // 将连续定义段落合并为 <ol class="footnotes-list">
    result = result.replace(
        /(<p[^>]*><span[^>]*class="ne-text"[^>]*>\[\^(\d+)]: [\s\S]*?<\/p>\s*)+/gi,
        (match) => {
            const items = match.replace(
                /<p[^>]*><span[^>]*class="ne-text"[^>]*>\[\^(\d+)]: ([\s\S]*?)<\/span>([\s\S]*?)<\/p>/gi,
                (m, num, spanContent, rest) =>
                    `<li id="fn-${num}"><a href="#fnref-${num}" class="fn-back">↩</a> ${spanContent}${rest.trim()}</li>`
            );
            return `<ol class="footnotes-list">\n${items.trim()}\n</ol>`;
        }
    );
    // 再处理行内引用
    result = result.replace(
        /\[\^(\d+)\]/g,
        (match, num) =>
            `<sup class="fn-ref"><a href="#fn-${num}" id="fnref-${num}">${num}</a></sup>`
    );

    // 4. 将语雀链接转换为站内链接
    // 先统一引号为双引号
    result = result.replace(
        /\bhref\s*=\s*'([^']+)'/gi,
        'href="$1"'
    );
    result = result.replace(
        new RegExp(`href="${escapeRegExp(YUQUE_BASE_URL)}\\/[^\"]+"`, 'gi'),
        (match) => {
            const url = match.slice(6, -1);
            const yqid = url.split('/').pop();
            const target = getYqidMap().get(yqid);
            if (!target) return match;
            return `href="/${target.type}/${target.slug}"`;
        }
    );

    // 5. 将微信公众文章链接提取为独立资源页并转换链接
    result = await processWechatLinks(result);

    // 6. 将指向资源 sourceUrl 的外链转换为站内资源链接
    // `(?<!-)href` 避免误匹配语雀导出的 data-href 属性；站内链接（以 / 开头）跳过
    const sourceMap = getSourceUrlMap();
    if (sourceMap.size > 0) {
        result = result.replace(
            /(?<!-)href="([^"]+)"/g,
            (match, href) => {
                if (href.startsWith('/')) return match;
                const slug = sourceMap.get(normalizeUrl(href));
                if (!slug) return match;
                return `href="/resource/${slug}"`;
            }
        );
    }

    return result;
}

// CLI 入口：直接运行时处理指定路径的 HTML 文件
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === __filename) {
    (async () => {
        const target = process.argv[2];
        if (!target) {
            console.error('用法: node scripts/process-html.mjs <文件或目录路径>');
            process.exit(1);
        }

        const absTarget = resolve(target);
        const files = [];
        const st = statSync(absTarget);
        if (st.isFile()) {
            if (extname(absTarget).toLowerCase() !== '.html') {
                console.error('错误: 仅支持 .html 文件');
                process.exit(1);
            }
            files.push(absTarget);
        } else if (st.isDirectory()) {
            const all = readdirSync(absTarget, {recursive: true});
            for (const entry of all) {
                if (extname(entry).toLowerCase() === '.html') {
                    files.push(join(absTarget, entry));
                }
            }
        } else {
            console.error('错误: 无效路径');
            process.exit(1);
        }

        if (files.length === 0) {
            console.error('未找到 HTML 文件');
            process.exit(1);
        }

        let success = 0;
        for (const file of files) {
            try {
                const body = readFileSync(file, 'utf-8');
                const result = await processContentHtml(body);
                writeFileSync(file, result, 'utf-8');
                success++;
                console.log(`✓ ${file}`);
            } catch (err) {
                console.error(`✗ ${file}: ${err.message}`);
            }
        }
        console.log(`\n处理完成: ${success}/${files.length}`);
    })();
}
