import {
  cacheDirectory,
  deleteAsync,
  getInfoAsync,
  moveAsync,
  readDirectoryAsync,
  writeAsStringAsync,
  makeDirectoryAsync,
  EncodingType,
} from 'expo-file-system/legacy';
import * as Clipboard from 'expo-clipboard';
import * as Crypto from 'expo-crypto';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import {
  requestPermissionsAsync as requestPhotoPermissionsAsync,
  saveToLibraryAsync,
} from 'expo-media-library/legacy';
import { localDeviceManagedFile, type FileLineage, type ManagedFile } from '@agiworkforce/types';
import { codeFileFor } from '@agiworkforce/unified-chat/code-file-name';
import { sanitizeFilename } from '@agiworkforce/unified-chat/filename';
import { guardedFetch, isOurCloudHost } from '@/lib/egressGuard';
import { getAuthHeaders } from '@/services/authSession';
import { ApiHttpError } from '@/services/apiErrors';
import { resolveGeneratedImageUri } from '@/src/features/image/services/imagegen';
import { EXPORT_CONTENT_STYLES, markdownToExportHtml } from '@/services/exportMarkdownHtml';
import { markdownToDocxBase64 } from './docxExport';
import {
  StaleCloudAccountOperationError,
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
} from '@/src/features/auth/services/cloudAccountSession';

export const EXPORTS_DIR = `${cacheDirectory}exports/`;

const STALE_EXPORT_AGE_MS = 24 * 60 * 60 * 1000;
let staleExportSweep: Promise<void> | null = null;

// Android resolves shareAsync before the receiving app has read the file, so an export is only
// removed once it is a day old, never as soon as the share sheet closes.
export async function removeStaleExports(): Promise<void> {
  const now = Date.now();
  for (const entry of await readDirectoryAsync(EXPORTS_DIR)) {
    const uri = `${EXPORTS_DIR}${entry}/`;
    const info = await getInfoAsync(uri);
    if (info.exists && now - info.modificationTime * 1000 > STALE_EXPORT_AGE_MS) {
      await deleteAsync(uri, { idempotent: true });
    }
  }
}

async function ensureExportsDir(): Promise<void> {
  const info = await getInfoAsync(EXPORTS_DIR);
  if (!info.exists) {
    await makeDirectoryAsync(EXPORTS_DIR, { intermediates: true });
  }
}

// Keep every returned URI tied to its original export, even when titles repeat.
// Allocation failure must not fall back to overwriting an earlier file.
async function allocateExportPath(fileName: string): Promise<string> {
  staleExportSweep ??= removeStaleExports().catch(() => undefined);
  await ensureExportsDir();
  const directory = `${EXPORTS_DIR}${Crypto.randomUUID()}/`;
  if ((await getInfoAsync(directory)).exists) {
    throw new Error('Could not allocate a new export directory. Please try again.');
  }
  await makeDirectoryAsync(directory, { intermediates: false });
  return `${directory}${encodeURIComponent(fileName)}`;
}

export type ExportFormat = 'pdf' | 'text' | 'markdown' | 'docx' | 'source';

export interface ExportResult {
  uri: string;
  format: ExportFormat;
  fileName: string;
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

function exportFileName(title: string, extension: string): string {
  const name = sanitizeFilename(title);
  return extension ? sanitizeFilename(`${name}.${extension}`) : name;
}

function markdownToHtml(content: string, title: string): string {
  const { html } = markdownToExportHtml(content);

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

  const fileName = exportFileName(title, 'pdf');
  const destUri = await allocateExportPath(fileName);

  await moveAsync({ from: uri, to: destUri });

  return { uri: destUri, format: 'pdf', fileName, file: exportedFile(destUri, fileName, lineage) };
}

export async function exportHtmlToPDF(
  html: string,
  title: string,
  page: { width: number; height: number },
  lineage: Partial<FileLineage> = {},
): Promise<ExportResult> {
  if (!html.trim()) {
    throw new Error('Cannot export empty content');
  }

  const { uri } = await Print.printToFileAsync({ html, width: page.width, height: page.height });

  const fileName = exportFileName(title, 'pdf');
  const destUri = await allocateExportPath(fileName);

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

  const fileName = exportFileName(title, 'txt');
  const destUri = await allocateExportPath(fileName);

  await writeAsStringAsync(destUri, content, {
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
  const fileName = exportFileName(
    title,
    extension === '' ? '' : extension.replace(/[^a-z0-9]/gi, '') || 'txt',
  );
  const destUri = await allocateExportPath(fileName);
  await writeAsStringAsync(destUri, content, { encoding: EncodingType.UTF8 });
  return {
    uri: destUri,
    format: 'source',
    fileName,
    file: exportedFile(destUri, fileName, lineage),
  };
}

export async function exportPngImage(base64Png: string, title: string): Promise<string> {
  const destUri = await allocateExportPath(exportFileName(title, 'png'));
  await writeAsStringAsync(destUri, base64Png, { encoding: EncodingType.Base64 });
  return destUri;
}

const SHARE_UTI_BY_EXTENSION: Readonly<Record<string, string>> = {
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
  mp4: 'public.mpeg-4',
  mov: 'com.apple.quicktime-movie',
  webm: 'public.movie',
  gif: 'com.compuserve.gif',
  heic: 'public.heic',
  avif: 'public.avif',
  webp: 'org.webmproject.webp',
  mp3: 'public.mp3',
  wav: 'com.microsoft.waveform-audio',
  m4a: 'public.mpeg-4-audio',
  txt: 'public.plain-text',
};
const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
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
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  gif: 'image/gif',
  heic: 'image/heic',
  avif: 'image/avif',
  webp: 'image/webp',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  txt: 'text/plain',
};

const PLAIN_TEXT_UTI = 'public.plain-text';
const PLAIN_TEXT_MIME_TYPE = 'text/plain';

function isSourceCodeExtension(extension: string | undefined): boolean {
  return Boolean(extension) && codeFileFor(extension as string).extension === extension;
}

const EXTENSION_BY_MIME: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(MIME_BY_EXTENSION)
    .filter(([extension]) => extension !== 'jpeg')
    .map(([extension, mimeType]) => [mimeType, extension]),
);

/**
 * Share a file using the native share sheet.
 * Falls back to a descriptive error if sharing is unavailable on the device.
 *
 * @param uri - The file URI to share
 * @throws {Error} If sharing is not available on the device
 */
export async function shareFile(
  uri: string,
  options: { isCurrent?: () => boolean } = {},
): Promise<void> {
  if (options.isCurrent?.() === false) return;
  const available = await Sharing.isAvailableAsync();
  if (options.isCurrent?.() === false) return;
  if (!available) {
    throw new Error('Sharing is not available on this device');
  }

  const ext = uri.split('.').pop()?.toLowerCase();
  if (options.isCurrent?.() === false) return;
  const sourceCode = isSourceCodeExtension(ext);
  const uti = SHARE_UTI_BY_EXTENSION[ext ?? ''] ?? (sourceCode ? PLAIN_TEXT_UTI : undefined);
  const mimeType = MIME_BY_EXTENSION[ext ?? ''] ?? (sourceCode ? PLAIN_TEXT_MIME_TYPE : undefined);
  await Sharing.shareAsync(uri, {
    ...(uti ? { UTI: uti } : {}),
    ...(mimeType ? { mimeType } : {}),
  });
}

function dataUrlToBase64(dataUrl: string): string {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx < 0) throw new Error('Malformed data URL from file reader');
  return dataUrl.slice(commaIdx + 1);
}

export function blobToBase64(blob: Blob): Promise<string> {
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
const SIGNED_OUT_STATUSES: ReadonlySet<number> = new Set([401, 403]);
const GONE_STATUSES: ReadonlySet<number> = new Set([404, 410]);
const TOO_LARGE_STATUS = 413;
const FILE_TOO_LARGE_CODE = 'file_too_large';
const FILE_TOO_LARGE_MESSAGE = 'This file is too large to open on this device.';

export class FileDownloadError extends ApiHttpError {
  constructor(status: number) {
    super(
      SIGNED_OUT_STATUSES.has(status)
        ? 'You must be signed in to download this file.'
        : GONE_STATUSES.has(status)
          ? 'This file no longer exists.'
          : status === TOO_LARGE_STATUS
            ? FILE_TOO_LARGE_MESSAGE
            : `Download failed (HTTP ${status})`,
      status,
      status === TOO_LARGE_STATUS ? FILE_TOO_LARGE_CODE : null,
    );
    this.name = 'FileDownloadError';
  }
}

export function downloadFailureMessage(error: unknown, fallback: string): string {
  if (
    error instanceof FileDownloadError &&
    (SIGNED_OUT_STATUSES.has(error.status) ||
      GONE_STATUSES.has(error.status) ||
      error.status === TOO_LARGE_STATUS)
  ) {
    return error.message;
  }
  return fallback;
}

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
  if (!res.ok) throw new FileDownloadError(res.status);
  const base64 = await blobToBase64(await res.blob());
  return {
    base64,
    contentType: res.headers.get('Content-Type')?.split(';', 1)[0]?.trim().toLowerCase() ?? null,
  };
}

function nameForContentType(fileName: string, contentType: string | null): string {
  const extensionForType = contentType ? EXTENSION_BY_MIME[contentType] : undefined;
  if (!extensionForType) return fileName;
  const dotIdx = fileName.lastIndexOf('.');
  const extension = dotIdx > 0 ? fileName.slice(dotIdx + 1).toLowerCase() : '';
  if (MIME_BY_EXTENSION[extension]) return fileName;
  return `${fileName}.${extensionForType}`;
}

async function writeGeneratedFileBytes(fileName: string, base64: string): Promise<string> {
  const destUri = await allocateExportPath(sanitizeFilename(fileName));
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
  const { base64, contentType } = await fetchGeneratedFileBytes(url);
  const typedName = sanitizeFilename(nameForContentType(fileName, contentType));
  const destUri = await writeGeneratedFileBytes(typedName, base64);
  const sourceFileId = CLOUD_FILE_PATH.exec(url)?.[1] ?? null;
  return exportedFile(
    destUri,
    typedName,
    sourceFileId ? { derivedFromFileId: sourceFileId, derivation: 'copy' } : {},
  );
}

export async function downloadGeneratedFile(url: string, fileName: string): Promise<string> {
  return (await downloadGeneratedFileAsManagedFile(url, fileName)).uri;
}

function cachedFileKey(url: string): string {
  const cloudId = CLOUD_FILE_PATH.exec(url)?.[1];
  if (cloudId && /^[a-zA-Z0-9_-]+$/.test(cloudId)) return cloudId;
  let hash = 2166136261;
  for (let index = 0; index < url.length; index += 1) {
    hash = Math.imul(hash ^ url.charCodeAt(index), 16777619) >>> 0;
  }
  return hash.toString(16);
}

function cacheOwnerSegment(): string | undefined {
  return captureCloudAccountEpoch()?.ownerId.replace(/[^a-zA-Z0-9_-]/g, '');
}

const VIEWER_COPY_DIR = `${cacheDirectory}file-views/`;

async function completedViewerCopy(directoryUri: string): Promise<string | null> {
  if (!(await getInfoAsync(directoryUri)).exists) return null;
  const name = (await readDirectoryAsync(directoryUri)).find((entry) => !entry.endsWith('.part'));
  return name ? `${directoryUri}${encodeURIComponent(name)}` : null;
}

// A copy made only to show a file lives in the cache, one directory per account and file, so
// reopening reuses it, Clear cache reclaims it and sign-out removes it; exports stay in EXPORTS_DIR.
export async function viewerFileCopy(url: string, fileName: string): Promise<string> {
  const account = captureCloudAccountEpoch();
  const owner = cacheOwnerSegment();
  const directoryUri = `${VIEWER_COPY_DIR}${owner ? `accounts/${owner}` : 'device'}/${cachedFileKey(url)}/`;
  const existing = await completedViewerCopy(directoryUri);
  if (existing) return existing;
  const { base64, contentType } = await fetchGeneratedFileBytes(url);
  const fileUri = `${directoryUri}${encodeURIComponent(
    sanitizeFilename(nameForContentType(fileName, contentType)),
  )}`;
  await makeDirectoryAsync(directoryUri, { intermediates: true });
  const partialUri = `${directoryUri}${Crypto.randomUUID()}.part`;
  await writeAsStringAsync(partialUri, base64, { encoding: EncodingType.Base64 });
  if ((await getInfoAsync(fileUri)).exists) {
    await deleteAsync(partialUri, { idempotent: true });
  } else {
    await moveAsync({ from: partialUri, to: fileUri });
  }
  if (account ? !isCloudAccountEpochCurrent(account) : captureCloudAccountEpoch() !== null) {
    await deleteAsync(directoryUri, { idempotent: true });
    throw new StaleCloudAccountOperationError();
  }
  return fileUri;
}

const VIDEO_PREVIEW_DIR = `${cacheDirectory}video-previews/`;

export async function removeViewerFileCopies(): Promise<void> {
  await deleteAsync(VIEWER_COPY_DIR, { idempotent: true });
  await deleteAsync(VIDEO_PREVIEW_DIR, { idempotent: true });
}

export interface LocalVideoPlayer {
  videoUri: string;
  playerUri: string;
  directoryUri: string;
}

const PLAYABLE_VIDEO_EXTENSIONS: Readonly<Record<string, string>> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

// Previews live in the cache, one directory per account and video, so replaying reuses the bytes,
// Clear cache reclaims them and sign-out removes them; explicit exports stay in EXPORTS_DIR.
async function videoPreviewDirectory(key: string): Promise<{ uri: string; reusable: boolean }> {
  const owner = cacheOwnerSegment();
  const uri = owner
    ? `${VIDEO_PREVIEW_DIR}${owner}/${key}/`
    : `${VIDEO_PREVIEW_DIR}transient/${Crypto.randomUUID()}/`;
  if (!(await getInfoAsync(uri)).exists) {
    await makeDirectoryAsync(uri, { intermediates: true });
  }
  return { uri, reusable: Boolean(owner) };
}

async function cachedPreviewVideoName(directoryUri: string, key: string): Promise<string | null> {
  for (const extension of Object.values(PLAYABLE_VIDEO_EXTENSIONS)) {
    const name = `video-${key}.${extension}`;
    if ((await getInfoAsync(`${directoryUri}${name}`)).exists) return name;
  }
  return null;
}

export async function prepareLocalVideoPlayer(
  url: string,
  background: string,
): Promise<LocalVideoPlayer> {
  const key = cachedFileKey(url);
  const directory = await videoPreviewDirectory(key);
  const directoryUri = directory.uri;
  let videoName = directory.reusable ? await cachedPreviewVideoName(directoryUri, key) : null;
  if (!videoName) {
    const downloaded = await fetchGeneratedFileBytes(url);
    const extension = downloaded.contentType
      ? PLAYABLE_VIDEO_EXTENSIONS[downloaded.contentType]
      : undefined;
    if (!extension) {
      throw new Error('The saved video format is not supported.');
    }
    videoName = `video-${key}.${extension}`;
    const partialUri = `${directoryUri}${Crypto.randomUUID()}.part`;
    await writeAsStringAsync(partialUri, downloaded.base64, { encoding: EncodingType.Base64 });
    if ((await getInfoAsync(`${directoryUri}${videoName}`)).exists) {
      await deleteAsync(partialUri, { idempotent: true });
    } else {
      await moveAsync({ from: partialUri, to: `${directoryUri}${videoName}` });
    }
  }
  const playerUri = `${directoryUri}player.html`;
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
  return { videoUri: `${directoryUri}${videoName}`, playerUri, directoryUri };
}

const SHAREABLE_IMAGE_TYPES: Readonly<Record<string, { extension: string; mimeType: string }>> = {
  'image/png': { extension: 'png', mimeType: 'image/png' },
  'image/jpeg': { extension: 'jpg', mimeType: 'image/jpeg' },
  'image/webp': { extension: 'webp', mimeType: 'image/webp' },
  'image/gif': { extension: 'gif', mimeType: 'image/gif' },
  'image/avif': { extension: 'avif', mimeType: 'image/avif' },
  'image/heic': { extension: 'heic', mimeType: 'image/heic' },
};

export async function shareGeneratedImage(
  imagePath: string,
  fileName = 'generated-image',
  options: { isCurrent?: () => boolean } = {},
): Promise<void> {
  if (options.isCurrent?.() === false) return;
  const url = resolveGeneratedImageUri(imagePath);
  if (!url) {
    throw new Error('Only saved AGI Cloud images can be shared.');
  }
  const downloaded = await fetchGeneratedFileBytes(url);
  if (options.isCurrent?.() === false) return;
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
  if (options.isCurrent?.() === false) return;
  const available = await Sharing.isAvailableAsync();
  if (options.isCurrent?.() === false) return;
  if (!available) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(localUri, {
    mimeType: imageType.mimeType,
    dialogTitle: 'Share generated image',
  });
}

export class PhotosPermissionError extends Error {
  constructor() {
    super('Allow AGI Workforce to add photos in Settings to save images.');
    this.name = 'PhotosPermissionError';
  }
}

export async function saveGeneratedImageToPhotos(
  imagePath: string,
  fileName = 'generated-image',
  options: { isCurrent?: () => boolean } = {},
): Promise<void> {
  if (options.isCurrent?.() === false) return;
  const url = resolveGeneratedImageUri(imagePath);
  if (!url) throw new Error('Only saved AGI Cloud images can be saved.');
  const permission = await requestPhotoPermissionsAsync(true);
  if (options.isCurrent?.() === false) return;
  if (!permission.granted) throw new PhotosPermissionError();
  const downloaded = await fetchGeneratedFileBytes(url);
  if (options.isCurrent?.() === false) return;
  const imageType = downloaded.contentType ? SHAREABLE_IMAGE_TYPES[downloaded.contentType] : null;
  if (!imageType) throw new Error('The saved image format cannot be added to Photos.');
  const localUri = await writeGeneratedFileBytes(
    `${fileName}.${imageType.extension}`,
    downloaded.base64,
  );
  if (options.isCurrent?.() === false) return;
  await saveToLibraryAsync(localUri);
}

export async function readGeneratedImageBase64(
  imagePath: string,
): Promise<{ base64: string; contentType: string | null }> {
  const url = resolveGeneratedImageUri(imagePath);
  if (!url) throw new Error('Only saved AGI Cloud images can be edited.');
  return fetchGeneratedFileBytes(url);
}

export async function copyGeneratedImage(
  imagePath: string,
  options: { isCurrent?: () => boolean } = {},
): Promise<void> {
  if (options.isCurrent?.() === false) return;
  const url = resolveGeneratedImageUri(imagePath);
  if (!url) {
    throw new Error('Only saved AGI Cloud images can be copied.');
  }
  const downloaded = await fetchGeneratedFileBytes(url);
  if (options.isCurrent?.() === false) return;
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
  const fileName = exportFileName(title, 'md');
  const destUri = await allocateExportPath(fileName);
  await writeAsStringAsync(destUri, content, { encoding: EncodingType.UTF8 });
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
  const fileName = exportFileName(title, 'docx');
  const destUri = await allocateExportPath(fileName);
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

function attachmentLine(message: ChatMessage): string | null {
  const names = (message.attachments ?? [])
    .map((attachment) => attachment.fileName.trim())
    .filter((name) => name.length > 0);
  return names.length > 0 ? `Attachments: ${names.join(', ')}` : null;
}

function hasExportableContent(message: ChatMessage): boolean {
  return Boolean(message.content.trim()) || attachmentLine(message) !== null;
}

function conversationMarkdownBody(messages: ChatMessage[]): string {
  const lines: string[] = [];
  for (const m of messages) {
    if (!hasExportableContent(m)) continue;
    lines.push(`## ${roleLabel(m.role)}\n`);
    if (m.createdAt) lines.push(`_${formatTimestamp(m.createdAt)}_\n`);
    if (m.content.trim()) lines.push(m.content + '\n');
    const attachments = attachmentLine(m);
    if (attachments) lines.push(`${attachments}\n`);
  }
  return lines.join('\n');
}

export function formatConversationAsMarkdown(messages: ChatMessage[], title: string): string {
  return [`# ${title}\n`, conversationMarkdownBody(messages)].join('\n');
}

export async function exportConversationToPDF(
  messages: ChatMessage[],
  title: string,
): Promise<ExportResult> {
  return exportToPDF(conversationMarkdownBody(messages), title);
}

export async function exportConversationToMarkdown(
  messages: ChatMessage[],
  title: string,
): Promise<ExportResult> {
  const body = conversationMarkdownBody(messages);
  if (!body.trim()) throw new Error('Cannot export empty content');
  const header = `# ${title}\n\n_Exported: ${new Date().toISOString()}_\n\n---\n\n`;
  return exportToMarkdown(header + body, title);
}

export async function printConversation(messages: ChatMessage[], title: string): Promise<void> {
  const md = conversationMarkdownBody(messages);
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
  const lines: string[] = [];
  for (const m of messages) {
    if (!hasExportableContent(m)) continue;
    lines.push(`[${roleLabel(m.role)}] ${m.createdAt ? formatTimestamp(m.createdAt) : ''}`);
    if (m.content.trim()) lines.push(m.content);
    const attachments = attachmentLine(m);
    if (attachments) lines.push(attachments);
    lines.push('');
  }
  const body = lines.join('\n');
  if (!body.trim()) throw new Error('Cannot export empty content');
  const header = `${title}\nExported: ${new Date().toISOString()}\n${'─'.repeat(40)}\n\n`;
  return exportToText(header + body, title);
}
