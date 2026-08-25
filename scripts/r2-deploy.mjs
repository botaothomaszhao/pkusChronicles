import { readFileSync, writeFileSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const DIST_DIR = join(process.cwd(), 'dist');
const DEFAULT_R2_PUBLIC_URL = 'https://r2.pkuschronicles.com';

// 将 dist 下所有 HTML 中的 /img/<file> 前缀替换为 R2 公网 URL
function rewriteHtml(dir) {
  const publicUrl = process.env.R2_PUBLIC_URL || DEFAULT_R2_PUBLIC_URL;

  let files = 0;
  let images = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = rewriteHtml(full);
      files += sub.files;
      images += sub.images;
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === '.html') {
      const content = readFileSync(full, 'utf-8');
      const rewritten = content.replace(/\/img\/([^"'\s<>]+)/g, (m, f) => {
        images++;
        return `${publicUrl}/${f}`;
      });
      if (rewritten !== content) {
        writeFileSync(full, rewritten, 'utf-8');
        files++;
      }
    }
  }
  return { files, images };
}

function main() {
  // 删除 dist/img，图片改由 R2 提供，不再随站点体积发布
  const distImg = join(DIST_DIR, 'img');
  if (existsSync(distImg)) rmSync(distImg, { recursive: true });

  // 替换 dist 中 HTML 的图片引用为 R2 公网地址
  if (existsSync(DIST_DIR)) {
    const { files, images } = rewriteHtml(DIST_DIR);
    console.log(`已替换 ${files} 个文件中的 ${images} 个图片为 R2 地址`);
  }
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  main();
}
