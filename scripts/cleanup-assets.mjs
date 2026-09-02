import { readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join, basename } from 'node:path';

const PUBLIC_DIR = join(process.cwd(), 'public');
const RESOURCES_DATA = join(process.cwd(), 'src/data/resources.json');
const CONTENT_DIRS = [
  join(process.cwd(), 'src/content/entries'),
  join(process.cwd(), 'src/content/topics'),
  join(process.cwd(), 'src/content/pages'),
  join(process.cwd(), 'src/content/resources'),
];

function main() {
  if (!existsSync(PUBLIC_DIR)) {
    console.log('public/ 不存在，无需清理');
    return;
  }

  // 收集所有 content HTML 中引用的根路径资产名
  // 属性形式 src/href/data="/x.ext"，以及 CSS background-image: url("/x.ext")（含 &quot;/&apos; 实体引号）
  const referenced = new Set();
  const assetRefRegex =
    /(?:src|href|data)\s*=\s*"?\/([^"#?\s/]+)|url\(\s*(?:"|'|&quot;|&apos;)?\/([^"#?\s)&]+)/gi;

  // 文件型资料的 contentFile 引用的资产（如 PDF），不在 content HTML 中也要保留
  if (existsSync(RESOURCES_DATA)) {
    const resources = JSON.parse(readFileSync(RESOURCES_DATA, 'utf-8'));
    for (const resource of resources) {
      if ((resource.type === 'file' || resource.type === 'video') && resource.contentFile) {
        referenced.add(basename(resource.contentFile));
      }
    }
  }
  for (const dir of CONTENT_DIRS) {
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.html')) continue;
      const content = readFileSync(join(dir, file), 'utf-8');
      let match;
      while ((match = assetRefRegex.exec(content)) !== null) {
        referenced.add(match[1] ?? match[2]);
      }
    }
  }

  // 清理 public/ 根下未被任何 HTML 引用的文件（不限定扩展名，支持无后缀文件）
  let deletedCount = 0;
  let skippedCount = 0;
  for (const file of readdirSync(PUBLIC_DIR)) {
    if (!referenced.has(file)) {
      rmSync(join(PUBLIC_DIR, file));
      console.log(`[删除] ${file}`);
      deletedCount++;
    } else {
      skippedCount++;
    }
  }

  console.log(`\n完成: 删除 ${deletedCount} 个未引用资产，保留 ${skippedCount} 个引用资产`);
}

main();
