import { readFileSync, writeFileSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { isAsset } from './assets.mjs';

const DIST_DIR = join(process.cwd(), 'dist');
const DEFAULT_R2_PUBLIC_URL = 'https://r2.pkuschronicles.com';

// 在 dist 根级删除资产文件（改由 R2 提供，不再随站点体积发布）
function removeDistAssets(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (!isAsset(entry.name)) continue;
    rmSync(join(dir, entry.name), { force: true });
  }
}

// 将 dist 下所有 HTML 中的资产引用替换为 R2 公网 URL。
// 覆盖两种形式：src/href/data 属性，以及 CSS url()（含 &quot;/&apos; 实体引号）
function rewriteHtml(dir) {
  const publicUrl = process.env.R2_PUBLIC_URL || DEFAULT_R2_PUBLIC_URL;

  let files = 0;
  let replaced = 0;

  const replaceRef = (m, name) => {
    if (!isAsset(name)) return m;
    replaced++;
    return `${publicUrl}/${name}`;
  };

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = rewriteHtml(full);
      files += sub.files;
      replaced += sub.replaced;
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === '.html') {
      const content = readFileSync(full, 'utf-8');
      const rewritten = content
        .replace(/(?<=(?:src|href|data)=["'])\/([^"'#?\s/]+)/g, replaceRef)
        .replace(/(?<=url\(\s*(?:"|'|&quot;|&apos;)?)\/([^"'#?\s)&]+)/gi, replaceRef);
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
  removeDistAssets(DIST_DIR);

  // 替换 dist 中 HTML 的资产引用为 R2 公网地址
  const { files, replaced } = rewriteHtml(DIST_DIR);
  console.log(`已替换 ${files} 个文件中的 ${replaced} 个资产为 R2 地址`);
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  main();
}
