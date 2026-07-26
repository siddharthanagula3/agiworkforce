/**
 * File Creation & Export Service
 *
 * Handles exporting chat message content to PDF and text files,
 * and sharing them via the system share sheet.
 *
 * Uses expo-print for PDF generation, expo-file-system for file I/O,
 * and expo-sharing for the native share dialog.
 */

import {
  documentDirectory,
  getInfoAsync,
  deleteAsync,
  moveAsync,
  writeAsStringAsync,
  makeDirectoryAsync,
  EncodingType,
} from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
// Cloud generated-file downloads: guardedFetch keeps the Local-mode zero-leak
// chokepoint in front of the request; the Bearer token is only attached to
// our-cloud hosts (never leaked to arbitrary URLs).
import { guardedFetch, isOurCloudHost } from '@/lib/egressGuard';
import { getAuthHeaders } from '@/services/authSession';
import { resolveGeneratedImageUri } from '@/src/features/image/services/imagegen';

/**
 * All user-initiated chat exports are written here (not the documentDirectory
 * root) so "Delete everything" (wipeAllLocalData) can remove them in one shot.
 */
export const EXPORTS_DIR = `${documentDirectory}exports/`;

async function ensureExportsDir(): Promise<void> {
  const info = await getInfoAsync(EXPORTS_DIR);
  if (!info.exists) {
    await makeDirectoryAsync(EXPORTS_DIR, { intermediates: true });
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExportFormat = 'pdf' | 'text' | 'markdown';

export interface ExportResult {
  uri: string;
  format: ExportFormat;
  fileName: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Sanitize a title string for use as a file name.
 * Strips non-alphanumeric characters (except hyphens/underscores/spaces),
 * collapses whitespace, and truncates to 64 characters.
 */
function sanitizeFileName(title: string): string {
  return (
    title
      .replace(/[^a-zA-Z0-9\s\-_]/g, '')
      .replace(/\s+/g, '_')
      .slice(0, 64)
      .replace(/_+$/, '') || 'export'
  );
}

/**
 * Convert basic markdown content to styled HTML suitable for PDF rendering.
 * Handles headings, bold, italic, inline code, code blocks, lists, and paragraphs.
 */
function markdownToHtml(content: string, title: string): string {
  let html = content;

  // Escape HTML entities first (but preserve markdown syntax)
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Code blocks (``` ... ```) — must be processed before inline formatting
  html = html.replace(
    /```(?:\w+)?\n?([\s\S]*?)```/g,
    '<pre style="background:#1a1a2e;color:#e0e0e0;padding:12px;border-radius:8px;font-size:13px;line-height:1.5;overflow-x:auto;font-family:Menlo,monospace;">$1</pre>',
  );

  // Headings (### → h3, ## → h2, # → h1)
  html = html.replace(/^### (.+)$/gm, '<h3 style="color:#1a1a1a;margin:16px 0 8px;">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 style="color:#1a1a1a;margin:20px 0 10px;">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 style="color:#1a1a1a;margin:24px 0 12px;">$1</h1>');

  // Bold (**text**)
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Italic (*text*)
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Inline code (`code`)
  html = html.replace(
    /`([^`]+)`/g,
    '<code style="background:#f0f0f0;padding:2px 6px;border-radius:4px;font-size:13px;font-family:Menlo,monospace;">$1</code>',
  );

  // Unordered list items (- item or * item)
  html = html.replace(/^[-*] (.+)$/gm, '<li style="margin:4px 0;">$1</li>');

  // Ordered list items (1. item)
  html = html.replace(/^\d+\. (.+)$/gm, '<li style="margin:4px 0;">$1</li>');

  // Wrap consecutive <li> elements in <ul>
  html = html.replace(
    /(<li[^>]*>.*?<\/li>\n?)+/g,
    '<ul style="padding-left:20px;margin:8px 0;">$&</ul>',
  );

  // Paragraphs: convert double newlines to paragraph breaks
  html = html
    .split(/\n{2,}/)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      // Don't wrap blocks that are already HTML elements
      if (
        trimmed.startsWith('<h') ||
        trimmed.startsWith('<pre') ||
        trimmed.startsWith('<ul') ||
        trimmed.startsWith('<ol') ||
        trimmed.startsWith('<li')
      ) {
        return trimmed;
      }
      return `<p style="margin:8px 0;line-height:1.6;">${trimmed.replace(/\n/g, '<br/>')}</p>`;
    })
    .join('\n');

  const timestamp = new Date().toLocaleDateString('en-US', {
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

// ---------------------------------------------------------------------------
// Export Functions
// ---------------------------------------------------------------------------

/**
 * Export chat content as a PDF file.
 * Converts markdown to styled HTML, then uses expo-print to generate PDF.
 *
 * @param content - The markdown content to export
 * @param title - Title for the document header and file name
 * @returns The file URI and metadata
 * @throws {Error} On PDF generation or file system errors
 */
export async function exportToPDF(content: string, title: string): Promise<ExportResult> {
  if (!content.trim()) {
    throw new Error('Cannot export empty content');
  }

  const html = markdownToHtml(content, title);
  const { uri } = await Print.printToFileAsync({ html });

  // Move from tmp to the exports dir with a meaningful name
  await ensureExportsDir();
  const fileName = `${sanitizeFileName(title)}.pdf`;
  const destUri = `${EXPORTS_DIR}${fileName}`;

  // Remove existing file if present (overwrite)
  const info = await getInfoAsync(destUri);
  if (info.exists) {
    await deleteAsync(destUri, { idempotent: true });
  }

  await moveAsync({ from: uri, to: destUri });

  return { uri: destUri, format: 'pdf', fileName };
}

/**
 * Export chat content as a plain text file.
 *
 * @param content - The text content to export
 * @param title - Title used for the file name and header
 * @returns The file URI and metadata
 * @throws {Error} On file system errors
 */
export async function exportToText(content: string, title: string): Promise<ExportResult> {
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

  return { uri: destUri, format: 'text', fileName };
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

// ---------------------------------------------------------------------------
// Cloud generated-file download (x_generated_files → local bytes)
// ---------------------------------------------------------------------------

/** Strip the `data:<mime>;base64,` prefix a FileReader data URL carries. */
function dataUrlToBase64(dataUrl: string): string {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx < 0) throw new Error('Malformed data URL from file reader');
  return dataUrl.slice(commaIdx + 1);
}

/** Blob → base64 via FileReader (RN's fetch lacks a usable arrayBuffer path). */
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
  // Preserve the real extension so the share sheet picks a sensible UTI/mime.
  const dotIdx = fileName.lastIndexOf('.');
  const baseName = dotIdx > 0 ? fileName.slice(0, dotIdx) : fileName;
  const ext = dotIdx > 0 ? `.${fileName.slice(dotIdx + 1).replace(/[^a-zA-Z0-9]/g, '')}` : '';
  const destUri = `${EXPORTS_DIR}${sanitizeFileName(baseName)}${ext}`;
  await writeAsStringAsync(destUri, base64, { encoding: EncodingType.Base64 });
  return destUri;
}

export async function downloadGeneratedFile(url: string, fileName: string): Promise<string> {
  const { base64 } = await fetchGeneratedFileBytes(url);
  return writeGeneratedFileBytes(fileName, base64);
}

const SHAREABLE_IMAGE_TYPES: Readonly<Record<string, { extension: string; mimeType: string }>> = {
  'image/png': { extension: 'png', mimeType: 'image/png' },
  'image/jpeg': { extension: 'jpg', mimeType: 'image/jpeg' },
  'image/webp': { extension: 'webp', mimeType: 'image/webp' },
};

/**
 * Share a durable generated image as local bytes, never as an authenticated
 * cloud URL. Other apps cannot use the Clerk bearer token and must not receive
 * an owner-scoped `/api/files` identity that looks public but returns 401.
 */
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

// ---------------------------------------------------------------------------
// Markdown Export
// ---------------------------------------------------------------------------

export async function exportToMarkdown(content: string, title: string): Promise<ExportResult> {
  if (!content.trim()) throw new Error('Cannot export empty content');
  const header = `# ${title}\n\n_Exported: ${new Date().toISOString()}_\n\n---\n\n`;
  await ensureExportsDir();
  const fileName = `${sanitizeFileName(title)}.md`;
  const destUri = `${EXPORTS_DIR}${fileName}`;
  await writeAsStringAsync(destUri, header + content, { encoding: EncodingType.UTF8 });
  return { uri: destUri, format: 'markdown', fileName };
}

// ---------------------------------------------------------------------------
// Conversation-level exports
// ---------------------------------------------------------------------------

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
