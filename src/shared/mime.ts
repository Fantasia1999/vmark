/**
 * MIME type resolution and browser viewability detection.
 */

const MIME_MAP: Record<string, string> = {
  // Documents & viewing
  pdf: 'application/pdf',

  // Images
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  avif: 'image/avif',
  tif: 'image/tiff',
  tiff: 'image/tiff',

  // Audio
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',

  // Video
  mp4: 'video/mp4',
  webm: 'video/webm',
  ogv: 'video/ogg',
  mov: 'video/quicktime',

  // Web & text
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  txt: 'text/plain',
  log: 'text/plain',
  csv: 'text/plain',
  tsv: 'text/plain',
  json: 'application/json',
  xml: 'application/xml',
  yaml: 'text/plain',
  yml: 'text/plain',
  toml: 'text/plain',
  ini: 'text/plain',
  env: 'text/plain',

  // Code formats (render as text in browser tabs)
  js: 'text/plain',
  mjs: 'text/plain',
  ts: 'text/plain',
  tsx: 'text/plain',
  jsx: 'text/plain',
  py: 'text/plain',
  rb: 'text/plain',
  go: 'text/plain',
  rs: 'text/plain',
  java: 'text/plain',
  c: 'text/plain',
  cpp: 'text/plain',
  h: 'text/plain',
  hpp: 'text/plain',
  cs: 'text/plain',
  php: 'text/plain',
  sh: 'text/plain',
  bash: 'text/plain',
  zsh: 'text/plain',
  sql: 'text/plain',

  // Archives
  zip: 'application/zip',
  tar: 'application/x-tar',
  gz: 'application/gzip',
  tgz: 'application/gzip',
  '7z': 'application/x-7z-compressed',
  rar: 'application/vnd.rar',

  // Office & Binaries
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  exe: 'application/octet-stream',
  dmg: 'application/octet-stream',
  pkg: 'application/octet-stream',
  bin: 'application/octet-stream',
};

/**
 * Extract the lowercased extension without the leading dot.
 */
export function getExtension(filePath: string): string {
  const clean = filePath.split(/[?#]/)[0] ?? '';
  const lastSlash = Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\'));
  const fileName = lastSlash >= 0 ? clean.slice(lastSlash + 1) : clean;
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0) {
    return '';
  }
  return fileName.slice(dot + 1).toLowerCase();
}

/**
 * Get MIME type for a file path or extension.
 */
export function getMimeType(filePath: string, fallback = 'application/octet-stream'): string {
  const ext = getExtension(filePath);
  return (ext && MIME_MAP[ext]) || fallback;
}

/**
 * Check if the file format can be natively rendered in a browser tab
 * (e.g. PDF, images, audio, video, web, plain text).
 */
export function isBrowserViewable(filePath: string, mime?: string): boolean {
  const resolvedMime = mime || getMimeType(filePath);
  if (
    resolvedMime.startsWith('image/') ||
    resolvedMime.startsWith('audio/') ||
    resolvedMime.startsWith('video/') ||
    resolvedMime.startsWith('text/') ||
    resolvedMime === 'application/pdf' ||
    resolvedMime === 'application/json' ||
    resolvedMime === 'application/xml'
  ) {
    return true;
  }
  return false;
}
