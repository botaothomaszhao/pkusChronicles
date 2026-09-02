import { readFileSync, writeFileSync, rmSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const DIST_DIR = join(process.cwd(), 'dist');
const PUBLIC_DIR = join(process.cwd(), 'public');
const DEFAULT_R2_PUBLIC_URL = 'https://r2.pkuschronicles.com';

// 以 public/ 根级文件清单为事实来源来识别资产（不依赖扩展名，支持无后缀文件）
function loadPublicAssets() {
  if (!existsSync(PUBLIC_DIR)) return new Set();
  return new Set(readdirSync(PUBLIC_DIR).filter(f => statSync(join(PUBLIC_DIR, f)).isFile()));
}

// 在 dist 根级删除资产文件（改由 R2 提供，不再随站点体积发布）
function removeDistAssets(dir, assets) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (!assets.has(entry.name)) continue;
    rmSync(join(dir, entry.name), { force: true });
  }
}

// 将 dist 下所有 HTML 中指向公共资产（/filename）的引用替换为 R2 公网 URL
function rewriteHtml(dir, assets) {
  const publicUrl = process.env.R2_PUBLIC_URL || DEFAULT_R2_PUBLIC_URL;

  let files = 0;
  let replaced = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = rewriteHtml(full, assets);
      files += sub.files;
      replaced += sub.replaced;
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === '.html') {
      const content = readFileSync(full, 'utf-8');
      const rewritten = content.replace(
        /(?<=(?:src|href|data)=["'])\/([^"'#?\s/]+)/g,
        (m, name) => {
          if (!assets.has(name)) return m;
          replaced++;
          return `${publicUrl}/${name}`;
        }
      );
      if (rewritten !== content) {
        writeFileSync(full, rewritten, 'utf-8');
        files++;
      }
    }
  }
  return { files, replaced };
}

function main() {
  if (!existsSync(DIST_DIR)) {
    console.log('dist/ 不存在，跳过');
    return;
  }

  // 删除 dist 根级资产（改由 R2 提供，不再随站点体积发布）
  const assets = loadPublicAssets();
  removeDistAssets(DIST_DIR, assets);

  // 替换 dist 中 HTML 的资产引用为 R2 公网地址
  const { files, replaced } = rewriteHtml(DIST_DIR, assets);
  console.log(`已替换 ${files} 个文件中的 ${replaced} 个资产为 R2 地址`);
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  main();
}
