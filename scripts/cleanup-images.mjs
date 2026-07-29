import { readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const IMG_DIR = join(process.cwd(), 'public/img');
const CONTENT_DIRS = [
  join(process.cwd(), 'src/content/entries'),
  join(process.cwd(), 'src/content/topics'),
];

function main() {
  if (!existsSync(IMG_DIR)) {
    console.log('public/img/ 不存在，无需清理');
    return;
  }

  // 收集所有 HTML 中引用的图片文件名
  const referenced = new Set();
  const imgRefRegex = /\/img\/([\w.-]+)/g;
  for (const dir of CONTENT_DIRS) {
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.html')) continue;
      const content = readFileSync(join(dir, file), 'utf-8');
      let match;
      while ((match = imgRefRegex.exec(content)) !== null) {
        referenced.add(match[1]);
      }
    }
  }

  // 遍历 public/img/ 中的文件
  let deletedCount = 0;
  let skippedCount = 0;
  for (const file of readdirSync(IMG_DIR)) {
    if (!referenced.has(file)) {
      const filePath = join(IMG_DIR, file);
      rmSync(filePath);
      console.log(`[删除] ${file}`);
      deletedCount++;
    } else {
      skippedCount++;
    }
  }

  console.log(`\n完成: 删除 ${deletedCount} 个未引用文件，保留 ${skippedCount} 个引用文件`);
}

main();
