import { readFileSync, writeFileSync, rmSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const DIST_DIR = join(process.cwd(), 'dist');
const PUBLIC_DIR = join(process.cwd(), 'public');
const DEFAULT_R2_PUBLIC_URL = 'https://r2.pkuschronicles.com';

// 将 dist 下所有 HTML 中指向公共资产（public/ 根级文件）的引用替换为 R2 公网 URL
function rewriteHtml(dir, assetSet) {
  const publicUrl = process.env.R2_PUBLIC_URL || DEFAULT_R2_PUBLIC_URL;

  let files = 0;
  let assets = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = rewriteHtml(full, assetSet);
      files += sub.files;
      assets += sub.assets;
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === '.html') {
      const content = readFileSync(full, 'utf-8');
      const rewritten = content.replace(
        /(?<=(?:src|href|data)=["'])\/([^"'#?\s/]+)/g,
        (m, name) => {
          if (!assetSet.has(name)) return m;
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

  // public/ 根级托管资产清单
  const assetSet = new Set(
    existsSync(PUBLIC_DIR)
      ? readdirSync(PUBLIC_DIR).filter(f => statSync(join(PUBLIC_DIR, f)).isFile())
      : []
  );

  // 从 dist 删除这些资产（改由 R2 提供，不再随站点体积发布）
  for (const name of assetSet) {
    const p = join(DIST_DIR, name);
    if (existsSync(p)) rmSync(p, { force: true });
  }

  // 替换 dist 中 HTML 的资产引用为 R2 公网地址
  const { files, assets } = rewriteHtml(DIST_DIR, assetSet);
  console.log(`已替换 ${files} 个文件中的 ${assets} 个资产为 R2 地址`);
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  main();
}
