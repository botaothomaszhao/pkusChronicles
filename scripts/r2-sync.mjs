import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import {
  S3Client,
  ListObjectsV2Command,
  HeadObjectCommand,
  PutObjectCommand,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';

const PUBLIC_DIR = join(process.cwd(), 'public');

const CONTENT_TYPE_MAP = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.m4v': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.zip': 'application/zip',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.txt': 'text/plain',
  '.json': 'application/json',
};

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`缺少环境变量 ${name}，请在 .env 中填写`);
  return value;
}

// 从 R2_ENDPOINT 解析 endpoint 与 bucket，格式: https://<accountid>.r2.cloudflarestorage.com/<bucket名>
function parseR2Endpoint() {
  const raw = requireEnv('R2_ENDPOINT');
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`R2_ENDPOINT 格式不正确: ${raw}`);
  }
  const bucket = url.pathname.replace(/^\/+|\/+$/g, '');
  if (!bucket) throw new Error(`R2_ENDPOINT 缺少 bucket 路径: ${raw}`);
  return { endpoint: url.origin, bucket };
}

function createClient(endpoint) {
  return new S3Client({
    region: 'auto',
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
    },
  });
}

async function listAllKeys(client, bucket) {
  const keys = [];
  let token;
  do {
    const res = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      ContinuationToken: token,
    }));
    for (const obj of res.Contents ?? []) keys.push(obj.Key);
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

/**
 * 以 public/ 为事实来源（根级所有文件），单向同步到 R2：
 * 上传本地存在但 R2 缺失或大小不同的文件，删除 R2 存在但本地缺失的对象。
 */
export async function syncImages() {
  const { endpoint, bucket } = parseR2Endpoint();
  const client = createClient(endpoint);

  const localFiles = readdirSync(PUBLIC_DIR).filter(f => statSync(join(PUBLIC_DIR, f)).isFile());
  const localSet = new Set(localFiles);

  const r2Keys = new Set(await listAllKeys(client, bucket));

  let uploaded = 0;
  for (const file of localFiles) {
    const size = statSync(join(PUBLIC_DIR, file)).size;
    let needUpload = true;
    if (r2Keys.has(file)) {
      try {
        const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: file }));
        needUpload = head.ContentLength !== size;
      } catch (err) {
        if (err.name !== 'NotFound') throw err;
      }
    }
    if (!needUpload) continue;

    const body = readFileSync(join(PUBLIC_DIR, file));
    const ext = file.slice(file.lastIndexOf('.')).toLowerCase();
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: file,
      Body: body,
      ContentType: CONTENT_TYPE_MAP[ext] ?? 'application/octet-stream',
    }));
    uploaded++;
    console.log(`[上传] ${file}`);
  }

  const toDelete = [...r2Keys].filter(k => !localSet.has(k));
  if (toDelete.length > 0) {
    await client.send(new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: toDelete.map(k => ({ Key: k })) },
    }));
    for (const k of toDelete) console.log(`[删除] ${k}`);
  }

  console.log(`\n同步完成: 上传 ${uploaded}，删除 ${toDelete.length}，本地共 ${localFiles.length} 个文件`);
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  syncImages().catch(err => {
    console.error(`同步失败: ${err.message}`);
    process.exit(1);
  });
}
