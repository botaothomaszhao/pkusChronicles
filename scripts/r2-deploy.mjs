import { readFileSync, writeFileSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { syncImages } from './r2-sync.mjs';

const DIST_DIR = join(process.cwd(), 'dist');
const DEFAULT_R2_PUBLIC_URL = 'https://r2.pkuschronicles.com';

// 将 dist 下所有 HTML 中的 /img/<file> 前缀替换为 R2 公网 URL
function rewriteHtml(dir) {
  const publicUrl = process.env.R2_PUBLIC_URL || DEFAULT_R2_PUBLIC_URL;

  let count = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      count += rewriteHtml(full);
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === '.html') {
      const content = readFileSync(full, 'utf-8');
      const rewritten = content.replace(/\/img\/([^"'\s<>]+)/g, (m, f) => `${publicUrl}/${f}`);
      if (rewritten !== content) {
        writeFileSync(full, rewritten, 'utf-8');
        count++;
      }
    }
  }
  return count;
}

async function main() {
  // 私有凭证齐全时才同步 R2；否则跳过（图片可能已在别处同步过），仅处理 dist
  const hasCredentials =
    process.env.R2_ENDPOINT &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY;

  if (hasCredentials) {
    await syncImages();
  } else {
    console.log('跳过 R2 图片同步（缺少 R2 凭证，配置 .env 或环境变量即可启用）');
  }

  // 删除 dist/img，图片改由 R2 提供，不再随站点体积发布
  const distImg = join(DIST_DIR, 'img');
  if (existsSync(distImg)) rmSync(distImg, { recursive: true });

  // 替换 dist 中 HTML 的图片引用为 R2 公网地址
  if (existsSync(DIST_DIR)) {
    const rewritten = rewriteHtml(DIST_DIR);
    console.log(`已替换 ${rewritten} 个 HTML 文件的图片引用为 R2 地址`);
  }
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  main().catch(err => {
    console.error(`部署失败: ${err.message}`);
    process.exit(1);
  });
}
