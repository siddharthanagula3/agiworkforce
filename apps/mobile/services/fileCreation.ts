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
  EncodingType,
} from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExportFormat = 'pdf' | 'text';

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
  return title
    .replace(/[^a-zA-Z0-9\s\-_]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 64)
    .replace(/_+$/, '') || 'export';
}

/**
 * Convert basic markdown content to styled HTML suitable for PDF rendering.
 * Handles headings, bold, italic, inline code, code blocks, lists, and paragraphs.
 */
function markdownToHtml(content: string, title: string): string {
  let html = content;

  // Escape HTML entities first (but preserve markdown syntax)
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

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

  // Move from tmp to documentDirectory with a meaningful name
  const fileName = `${sanitizeFileName(title)}.pdf`;
  const destUri = `${documentDirectory}${fileName}`;

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

  const fileName = `${sanitizeFileName(title)}.txt`;
  const destUri = `${documentDirectory}${fileName}`;

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

  await Sharing.shareAsync(uri, {
    UTI: uri.endsWith('.pdf') ? 'com.adobe.pdf' : 'public.plain-text',
    mimeType: uri.endsWith('.pdf') ? 'application/pdf' : 'text/plain',
  });
}
