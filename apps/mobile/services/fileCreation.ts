import {
  documentDirectory,
  getInfoAsync,
  deleteAsync,
  moveAsync,
  writeAsStringAsync,
  makeDirectoryAsync,
  EncodingType,
} from 'expo-file-system/legacy';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import {
  requestPermissionsAsync as requestPhotoPermissionsAsync,
  saveToLibraryAsync,
} from 'expo-media-library/legacy';
import { localDeviceManagedFile, type FileLineage, type ManagedFile } from '@agiworkforce/types';
import { guardedFetch, isOurCloudHost } from '@/lib/egressGuard';
import { getAuthHeaders } from '@/services/authSession';
import { resolveGeneratedImageUri } from '@/src/features/image/services/imagegen';
import {
  EXPORT_CONTENT_STYLES,
  EXPORT_MATH_SCRIPT,
  markdownToExportHtml,
} from '@/services/exportMarkdownHtml';
import { markdownToDocxBase64 } from './docxExport';

export const EXPORTS_DIR = `${documentDirectory}exports/`;

async function ensureExportsDir(): Promise<void> {
  const info = await getInfoAsync(EXPORTS_DIR);
  if (!info.exists) {
    await makeDirectoryAsync(EXPORTS_DIR, { intermediates: true });
  }
}

export type ExportFormat = 'pdf' | 'text' | 'markdown' | 'docx' | 'source';

export interface ExportResult {
  uri: string;
  format: ExportFormat;
  fileName: string;
  /**
   * The same file the web and the desktop describe. The phone used to return a
   * bare uri, so an export taken here had no identity anything else recognised.
   */
  file: ManagedFile;
}

function exportedFile(uri: string, fileName: string, lineage: Partial<FileLineage> = {}) {
  return localDeviceManagedFile({
    path: uri,
    name: fileName,
    origin: 'generated',
    sourceSurface: 'mobile',
    lineage,
  });
}

function sanitizeFileName(title: string): string {
  return (
    title
      .replace(/[^a-zA-Z0-9\s\-_]/g, '')
      .replace(/\s+/g, '_')
      .slice(0, 64)
      .replace(/_+$/, '') || 'export'
  );
}

function markdownToHtml(content: string, title: string): string {
  const { html, hasMath } = markdownToExportHtml(content);

  const timestamp = new Date().toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      font-size: 15px;
      line-height: 1.6;
      color: #1a1a1a;
      padding: 32px 24px;
      max-width: 680px;
      margin: 0 auto;
    }
    .header {
      border-bottom: 2px solid #21808d;
      padding-bottom: 12px;
      margin-bottom: 24px;
    }
    .header h1 {
      font-size: 22px;
      color: #1a1a1a;
      margin: 0 0 4px;
    }
    .header .meta {
      font-size: 12px;
      color: #666;
    }
    ${EXPORT_CONTENT_STYLES}
    .footer {
      margin-top: 32px;
      padding-top: 12px;
      border-top: 1px solid #e0e0e0;
      font-size: 11px;
      color: #999;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">Exported on ${timestamp}</div>
  </div>
  <div class="content">
    ${html}
  </div>
  <div class="footer">
    Exported from AGI Workforce
  </div>
  ${hasMath ? EXPORT_MATH_SCRIPT : ''}
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Export chat content as a PDF file.
 * Converts markdown to styled HTML, then uses expo-print to generate PDF.
 *
 * @param content - The markdown content to export
 * @param title - Title for the document header and file name
 * @returns The file URI and metadata
 * @throws {Error} On PDF generation or file system errors
 */
export async function exportToPDF(
  content: string,
  title: string,
  lineage: Partial<FileLineage> = {},
): Promise<ExportResult> {
  if (!content.trim()) {
    throw new Error('Cannot export empty content');
  }

  const html = markdownToHtml(content, title);
  const { uri } = await Print.printToFileAsync({ html });

  await ensureExportsDir();
  const fileName = `${sanitizeFileName(title)}.pdf`;
  const destUri = `${EXPORTS_DIR}${fileName}`;

  const info = await getInfoAsync(destUri);
  if (info.exists) {
    await deleteAsync(destUri, { idempotent: true });
  }

  await moveAsync({ from: uri, to: destUri });

  return { uri: destUri, format: 'pdf', fileName, file: exportedFile(destUri, fileName, lineage) };
}

/**
 * Export chat content as a plain text file.
 *
 * @param content - The text content to export
 * @param title - Title used for the file name and header
 * @returns The file URI and metadata
 * @throws {Error} On file system errors
 */
export async function exportToText(
  content: string,
  title: string,
  lineage: Partial<FileLineage> = {},
): Promise<ExportResult> {
  if (!content.trim()) {
    throw new Error('Cannot export empty content');
  }

  const timestamp = new Date().toISOString();
  const header = `${title}\nExported: ${timestamp}\n${'─'.repeat(40)}\n\n`;
  const fullContent = header + content;

  await ensureExportsDir();
  const fileName = `${sanitizeFileName(title)}.txt`;
  const destUri = `${EXPORTS_DIR}${fileName}`;

  await writeAsStringAsync(destUri, fullContent, {
    encoding: EncodingType.UTF8,
  });

  return { uri: destUri, format: 'text', fileName, file: exportedFile(destUri, fileName, lineage) };
}

export async function exportSourceFile(
  content: string,
  title: string,
  extension: string,
  lineage: Partial<FileLineage> = {},
): Promise<ExportResult> {
  if (!content.trim()) throw new Error('Cannot export empty content');
  await ensureExportsDir();
  const fileName = `${sanitizeFileName(title)}.${extension.replace(/[^a-z0-9]/gi, '') || 'txt'}`;
  const destUri = `${EXPORTS_DIR}${fileName}`;
  await writeAsStringAsync(destUri, content, { encoding: EncodingType.UTF8 });
  return {
    uri: destUri,
    format: 'source',
    fileName,
    file: exportedFile(destUri, fileName, lineage),
  };
}

export async function exportPngImage(base64Png: string, title: string): Promise<string> {
  await ensureExportsDir();
  const destUri = `${EXPORTS_DIR}${sanitizeFileName(title)}.png`;
  await writeAsStringAsync(destUri, base64Png, { encoding: EncodingType.Base64 });
  return destUri;
}

/**
 * Share a file using the native share sheet.
 * Falls back to a descriptive error if sharing is unavailable on the device.
 *
 * @param uri - The file URI to share
 * @throws {Error} If sharing is not available on the device
 */
export async function shareFile(uri: string): Promise<void> {
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error('Sharing is not available on this device');
  }

  const ext = uri.split('.').pop()?.toLowerCase();
  const utiMap: Record<string, string> = {
    pdf: 'com.adobe.pdf',
    md: 'net.daringfireball.markdown',
    docx: 'org.openxmlformats.wordprocessingml.document',
    xlsx: 'org.openxmlformats.spreadsheetml.sheet',
    pptx: 'org.openxmlformats.presentationml.presentation',
    csv: 'public.comma-separated-values-text',
    json: 'public.json',
    html: 'public.html',
    svg: 'public.svg-image',
    png: 'public.png',
    jpg: 'public.jpeg',
    jpeg: 'public.jpeg',
    zip: 'public.zip-archive',
  };
  const mimeMap: Record<string, string> = {
    pdf: 'application/pdf',
    md: 'text/markdown',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    csv: 'text/csv',
    json: 'application/json',
    html: 'text/html',
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    zip: 'application/zip',
  };
  await Sharing.shareAsync(uri, {
    UTI: utiMap[ext ?? ''] ?? 'public.plain-text',
    mimeType: mimeMap[ext ?? ''] ?? 'text/plain',
  });
}

function dataUrlToBase64(dataUrl: string): string {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx < 0) throw new Error('Malformed data URL from file reader');
  return dataUrl.slice(commaIdx + 1);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read downloaded file bytes'));
    reader.onload = () => {
      try {
        resolve(dataUrlToBase64(String(reader.result)));
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * Download a Cloud-mode generated file (`x_generated_files`) to the exports
 * dir so it can be previewed/shared with the native sheet.
 *
 * The file lives behind the authenticated `/api/files/{id}` route on the
 * cloud origin (401 unauthenticated), so:
 *   - `url` must already be absolute (resolved via `resolveGeneratedFileUri`
 *     in chatExecutionStore).
 *   - the Clerk Bearer token is attached ONLY when the host is ours.
 *   - `guardedFetch` fail-closes the request in Local mode (generated files
 *     only exist in Cloud mode, so a Local-mode call is a bug upstream).
 *
 * @returns The local `file://` URI of the downloaded file.
 * @throws {Error} On HTTP failure (surfaced honestly to the caller's alert).
 */
async function fetchGeneratedFileBytes(
  url: string,
): Promise<{ base64: string; contentType: string | null }> {
  let host: string | undefined;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(`Generated file URL is not absolute: ${url}`);
  }
  const headers: Record<string, string> = isOurCloudHost(host) ? await getAuthHeaders() : {};

  const res = await guardedFetch(url, { headers });
  if (!res.ok) {
    throw new Error(
      res.status === 401 || res.status === 403
        ? 'You must be signed in to download this file.'
        : `Download failed (HTTP ${res.status})`,
    );
  }
  const base64 = await blobToBase64(await res.blob());
  return {
    base64,
    contentType: res.headers.get('Content-Type')?.split(';', 1)[0]?.trim().toLowerCase() ?? null,
  };
}

async function writeGeneratedFileBytes(fileName: string, base64: string): Promise<string> {
  await ensureExportsDir();
  const dotIdx = fileName.lastIndexOf('.');
  const baseName = dotIdx > 0 ? fileName.slice(0, dotIdx) : fileName;
  const ext = dotIdx > 0 ? `.${fileName.slice(dotIdx + 1).replace(/[^a-zA-Z0-9]/g, '')}` : '';
  const destUri = `${EXPORTS_DIR}${sanitizeFileName(baseName)}${ext}`;
  await writeAsStringAsync(destUri, base64, { encoding: EncodingType.Base64 });
  return destUri;
}

const CLOUD_FILE_PATH = /\/api\/files\/([^/?#]+)/;

/**
 * A downloaded cloud file is the same file on this device, so it carries the
 * cloud asset id it was copied from rather than starting a new history.
 */
export async function downloadGeneratedFileAsManagedFile(
  url: string,
  fileName: string,
): Promise<ManagedFile> {
  const { base64 } = await fetchGeneratedFileBytes(url);
  const destUri = await writeGeneratedFileBytes(fileName, base64);
  const sourceFileId = CLOUD_FILE_PATH.exec(url)?.[1] ?? null;
  return exportedFile(
    destUri,
    fileName,
    sourceFileId ? { derivedFromFileId: sourceFileId, derivation: 'copy' } : {},
  );
}

export async function downloadGeneratedFile(url: string, fileName: string): Promise<string> {
  return (await downloadGeneratedFileAsManagedFile(url, fileName)).uri;
}

function videoFileKey(url: string): string {
  const cloudId = CLOUD_FILE_PATH.exec(url)?.[1];
  if (cloudId && /^[a-zA-Z0-9_-]+$/.test(cloudId)) return cloudId;
  let hash = 2166136261;
  for (let index = 0; index < url.length; index += 1) {
    hash = Math.imul(hash ^ url.charCodeAt(index), 16777619) >>> 0;
  }
  return hash.toString(16);
}

export interface LocalVideoPlayer {
  videoUri: string;
  playerUri: string;
  directoryUri: string;
}

export async function prepareLocalVideoPlayer(
  url: string,
  background: string,
): Promise<LocalVideoPlayer> {
  const key = videoFileKey(url);
  const cachedVideo = `${EXPORTS_DIR}video-${key}.mp4`;
  const videoUri = (await getInfoAsync(cachedVideo)).exists
    ? cachedVideo
    : await downloadGeneratedFile(url, `video-${key}.mp4`);
  const videoName = videoUri.slice(videoUri.lastIndexOf('/') + 1);
  const playerUri = `${EXPORTS_DIR}player-${key}.html`;
  await writeAsStringAsync(
    playerUri,
    [
      '<!DOCTYPE html><html><head><meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      `<style>html,body{margin:0;height:100%;background:${background}}`,
      'video{width:100%;height:100%;object-fit:contain}</style></head><body>',
      `<video src="${videoName}" controls playsinline autoplay></video>`,
      '</body></html>',
    ].join(''),
    { encoding: EncodingType.UTF8 },
  );
  return { videoUri, playerUri, directoryUri: EXPORTS_DIR };
}

const SHAREABLE_IMAGE_TYPES: Readonly<Record<string, { extension: string; mimeType: string }>> = {
  'image/png': { extension: 'png', mimeType: 'image/png' },
  'image/jpeg': { extension: 'jpg', mimeType: 'image/jpeg' },
  'image/webp': { extension: 'webp', mimeType: 'image/webp' },
};

export async function shareGeneratedImage(
  imagePath: string,
  fileName = 'generated-image',
): Promise<void> {
  const url = resolveGeneratedImageUri(imagePath);
  if (!url) {
    throw new Error('Only saved AGI Cloud images can be shared.');
  }
  const downloaded = await fetchGeneratedFileBytes(url);
  const imageType = downloaded.contentType ? SHAREABLE_IMAGE_TYPES[downloaded.contentType] : null;
  if (!imageType) {
    throw new Error('The saved image format is not supported for sharing.');
  }
  const dotIndex = fileName.lastIndexOf('.');
  const baseName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  const localUri = await writeGeneratedFileBytes(
    `${baseName}.${imageType.extension}`,
    downloaded.base64,
  );
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(localUri, {
    mimeType: imageType.mimeType,
    dialogTitle: 'Share generated image',
  });
}

export async function saveGeneratedImageToPhotos(
  imagePath: string,
  fileName = 'generated-image',
): Promise<void> {
  const url = resolveGeneratedImageUri(imagePath);
  if (!url) throw new Error('Only saved AGI Cloud images can be saved.');
  const permission = await requestPhotoPermissionsAsync(true);
  if (!permission.granted) {
    throw new Error('Allow AGI Workforce to add photos in Settings to save images.');
  }
  const downloaded = await fetchGeneratedFileBytes(url);
  const imageType = downloaded.contentType ? SHAREABLE_IMAGE_TYPES[downloaded.contentType] : null;
  if (!imageType) throw new Error('The saved image format cannot be added to Photos.');
  const localUri = await writeGeneratedFileBytes(
    `${fileName}.${imageType.extension}`,
    downloaded.base64,
  );
  await saveToLibraryAsync(localUri);
}

export async function readGeneratedImageBase64(
  imagePath: string,
): Promise<{ base64: string; contentType: string | null }> {
  const url = resolveGeneratedImageUri(imagePath);
  if (!url) throw new Error('Only saved AGI Cloud images can be edited.');
  return fetchGeneratedFileBytes(url);
}

export async function copyGeneratedImage(imagePath: string): Promise<void> {
  const url = resolveGeneratedImageUri(imagePath);
  if (!url) {
    throw new Error('Only saved AGI Cloud images can be copied.');
  }
  const downloaded = await fetchGeneratedFileBytes(url);
  if (!downloaded.contentType || !SHAREABLE_IMAGE_TYPES[downloaded.contentType]) {
    throw new Error('The saved image format cannot be copied.');
  }
  await Clipboard.setImageAsync(downloaded.base64);
}

export async function exportToMarkdown(
  content: string,
  title: string,
  lineage: Partial<FileLineage> = {},
): Promise<ExportResult> {
  if (!content.trim()) throw new Error('Cannot export empty content');
  const header = `# ${title}\n\n_Exported: ${new Date().toISOString()}_\n\n---\n\n`;
  await ensureExportsDir();
  const fileName = `${sanitizeFileName(title)}.md`;
  const destUri = `${EXPORTS_DIR}${fileName}`;
  await writeAsStringAsync(destUri, header + content, { encoding: EncodingType.UTF8 });
  return {
    uri: destUri,
    format: 'markdown',
    fileName,
    file: exportedFile(destUri, fileName, lineage),
  };
}

export async function exportToDocx(
  content: string,
  title: string,
  lineage: Partial<FileLineage> = {},
): Promise<ExportResult> {
  if (!content.trim()) throw new Error('Cannot export empty content');
  const base64 = await markdownToDocxBase64(content, title);
  await ensureExportsDir();
  const fileName = `${sanitizeFileName(title)}.docx`;
  const destUri = `${EXPORTS_DIR}${fileName}`;
  await writeAsStringAsync(destUri, base64, { encoding: EncodingType.Base64 });
  return { uri: destUri, format: 'docx', fileName, file: exportedFile(destUri, fileName, lineage) };
}

import type { ChatMessage } from '@/types/chat';

function roleLabel(role: string): string {
  return role === 'user' ? 'You' : role === 'assistant' ? 'Assistant' : role;
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function formatConversationAsMarkdown(messages: ChatMessage[], title: string): string {
  const lines = [`# ${title}\n`];
  for (const m of messages) {
    if (!m.content.trim()) continue;
    lines.push(`## ${roleLabel(m.role)}\n`);
    if (m.createdAt) lines.push(`_${formatTimestamp(m.createdAt)}_\n`);
    lines.push(m.content + '\n');
  }
  return lines.join('\n');
}

export async function exportConversationToPDF(
  messages: ChatMessage[],
  title: string,
): Promise<ExportResult> {
  const md = formatConversationAsMarkdown(messages, title);
  return exportToPDF(md, title);
}

export async function printConversation(messages: ChatMessage[], title: string): Promise<void> {
  const md = formatConversationAsMarkdown(messages, title);
  if (!md.trim()) throw new Error('Cannot print empty content');
  try {
    await Print.printAsync({ html: markdownToHtml(md, title) });
  } catch (error) {
    if (error instanceof Error && /did not complete|cancel/i.test(error.message)) return;
    throw error;
  }
}

export async function exportConversationToText(
  messages: ChatMessage[],
  title: string,
): Promise<ExportResult> {
  const lines = [`${title}\nExported: ${new Date().toISOString()}\n${'─'.repeat(40)}\n`];
  for (const m of messages) {
    if (!m.content.trim()) continue;
    lines.push(`[${roleLabel(m.role)}] ${m.createdAt ? formatTimestamp(m.createdAt) : ''}`);
    lines.push(m.content);
    lines.push('');
  }
  return exportToText(lines.join('\n'), title);
}
