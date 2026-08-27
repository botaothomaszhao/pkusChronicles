import { readFileSync, writeFileSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const DIST_DIR = join(process.cwd(), 'dist');
const DEFAULT_R2_PUBLIC_URL = 'https://r2.pkuschronicles.com';

// 与 cleanup-assets / r2-sync 一致的托管资产扩展名，用来识别 HTML 中的资产引用
const ASSET_EXTS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg',
  '.pdf', '.mp4', '.webm', '.m4v', '.mp3',
  '.zip', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.txt', '.json',
]);

function isAsset(name) {
  return ASSET_EXTS.has(extname(name).toLowerCase());
}

// 在 dist 根级删除资产文件（改由 R2 提供，不再随站点体积发布）
function removeDistAssets(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (!isAsset(entry.name)) continue;
    rmSync(join(dir, entry.name), { force: true });
  }
}

// 将 dist 下所有 HTML 中指向公共资产（/filename）的引用替换为 R2 公网 URL
function rewriteHtml(dir) {
  const publicUrl = process.env.R2_PUBLIC_URL || DEFAULT_R2_PUBLIC_URL;

  let files = 0;
  let assets = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = rewriteHtml(full);
      files += sub.files;
      assets += sub.assets;
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === '.html') {
      const content = readFileSync(full, 'utf-8');
      const rewritten = content.replace(
        /(?<=(?:src|href|data)=["'])\/([^"'#?\s/]+)/g,
        (m, name) => {
          if (!isAsset(name)) return m;
          assets++;
          return `${publicUrl}/${name}`;
        }
      );
      if (rewritten !== content) {
        writeFileSync(full, rewritten, 'utf-8');
        files++;
      }
    }
  }
  return { files, assets };
}

function main() {
  if (!existsSync(DIST_DIR)) {
    console.log('dist/ 不存在，跳过');
    return;
  }

  // 删除 dist 根级资产（改由 R2 提供，不再随站点体积发布）
  removeDistAssets(DIST_DIR);

  // 替换 dist 中 HTML 的资产引用为 R2 公网地址
  const { files, assets } = rewriteHtml(DIST_DIR);
  console.log(`已替换 ${files} 个文件中的 ${assets} 个资产为 R2 地址`);
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  main();
}
