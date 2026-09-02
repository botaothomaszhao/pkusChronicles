import { extname } from 'node:path';

// 托管资产扩展名 → MIME 类型（唯一来源，供 r2-sync / r2-deploy 统一使用）。
// 内容层已保证附件资产带后缀，本表覆盖图片、视频、文档等常见类型。
export const CONTENT_TYPE_MAP = {
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

export const ASSET_EXTS = new Set(Object.keys(CONTENT_TYPE_MAP));

export function isAsset(name) {
  return ASSET_EXTS.has(extname(name).toLowerCase());
}

export function contentTypeOf(name) {
  return CONTENT_TYPE_MAP[extname(name).toLowerCase()] ?? 'application/octet-stream';
}
