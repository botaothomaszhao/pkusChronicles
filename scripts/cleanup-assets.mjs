import { readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join, extname, basename } from 'node:path';

const PUBLIC_DIR = join(process.cwd(), 'public');
const RESOURCES_DATA = join(process.cwd(), 'src/data/resources.json');
const CONTENT_DIRS = [
  join(process.cwd(), 'src/content/entries'),
  join(process.cwd(), 'src/content/topics'),
  join(process.cwd(), 'src/content/pages'),
  join(process.cwd(), 'src/content/resources'),
];

// 与 r2-sync 共享的托管资产扩展名（仅这些会被上传至 R2，清理也只针对它们）
const ASSET_EXTS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg',
  '.pdf', '.mp4', '.webm', '.m4v', '.mp3',
  '.zip', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.txt', '.json',
]);

function main() {
  if (!existsSync(PUBLIC_DIR)) {
    console.log('public/ 不存在，无需清理');
    return;
  }

  // 收集所有 content HTML 中引用的根路径资产名
  const referenced = new Set();
  const assetRefRegex = /(?:src|href|data)="\/([^"#?\s/]+)"/g;

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
        referenced.add(match[1]);
      }
    }
  }

  // 仅清理 public/ 根下、归属托管资产扩展名、且未被任何 HTML 引用的文件
  let deletedCount = 0;
  let skippedCount = 0;
  for (const file of readdirSync(PUBLIC_DIR)) {
    if (!ASSET_EXTS.has(extname(file).toLowerCase())) continue;
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
