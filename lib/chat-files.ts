export type ChatFileAttachment = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
};

const FILE_MARKER = /\n?\[\[TCFILES1:([^\]]+)\]\]$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IMAGE_PREVIEW_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif', 'image/bmp']);
const VIDEO_PREVIEW_TYPES = new Set(['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-m4v', 'video/3gpp', 'video/mpeg', 'video/x-msvideo']);

export function serializeChatContent(text: string, files: ChatFileAttachment[]) {
  if (!files.length) return text;
  return `${text.trim()}\n[[TCFILES1:${encodeURIComponent(JSON.stringify(files))}]]`;
}

export function parseChatContent(content: string): { text: string; files: ChatFileAttachment[] } {
  const match = FILE_MARKER.exec(content);
  if (!match) return { text: content, files: [] };
  try {
    const parsed = JSON.parse(decodeURIComponent(match[1]));
    if (!Array.isArray(parsed) || parsed.length > 20) return { text: content, files: [] };
    const files = parsed.filter((file): file is ChatFileAttachment => Boolean(
      file && typeof file === 'object'
      && UUID_PATTERN.test(file.id)
      && typeof file.filename === 'string' && file.filename.length > 0 && file.filename.length <= 255
      && typeof file.mimeType === 'string' && file.mimeType.length <= 128
      && Number.isSafeInteger(file.size) && file.size >= 0,
    ));
    return files.length ? { text: content.slice(0, match.index).trimEnd(), files } : { text: content, files: [] };
  } catch {
    return { text: content, files: [] };
  }
}

const fileCdnUrl = (process.env.NEXT_PUBLIC_FILE_CDN_URL || 'https://manus.k1god.com').replace(/\/$/, '');

export function getChatFileUrls(file: ChatFileAttachment) {
  return {
    download: `${fileCdnUrl}/v1/files/${file.id}/download`,
    preview: IMAGE_PREVIEW_TYPES.has(file.mimeType) ? `${fileCdnUrl}/v1/files/${file.id}/preview` : null,
    videoPreview: VIDEO_PREVIEW_TYPES.has(file.mimeType) ? `${fileCdnUrl}/v1/files/${file.id}/preview` : null,
  };
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
