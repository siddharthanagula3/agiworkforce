import 'server-only';

import type { FileTextPreview } from '@agiworkforce/cloud-contracts';
import { MAX_FILE_TEXT_CHARS } from '@agiworkforce/types';
import { createError } from '@/lib/errors';
import {
  OfficeDocumentUnreadableError,
  extractOfficeDocumentText,
  extractSpreadsheetTable,
  officeDocumentKind,
} from '@/lib/server/office-document-text';

export type FileTextPreviewKind = 'table' | 'text' | 'office';

const TABLE_MIME_TYPES = new Set(['text/csv', 'text/tab-separated-values']);
const TEXT_MIME_TYPES = new Set([
  'application/json',
  'application/xml',
  'application/x-yaml',
  'application/yaml',
]);

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot === -1 ? '' : fileName.slice(dot + 1).toLowerCase();
}

export function fileTextPreviewKind(
  fileName: string,
  mimeType: string,
): FileTextPreviewKind | null {
  const mime = mimeType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  const extension = extensionOf(fileName);
  if (TABLE_MIME_TYPES.has(mime) || extension === 'csv' || extension === 'tsv') return 'table';
  if (officeDocumentKind(fileName, mime)) return 'office';
  if (mime.startsWith('text/') || TEXT_MIME_TYPES.has(mime)) return 'text';
  return null;
}

export async function renderFileTextPreview(
  kind: FileTextPreviewKind,
  fileName: string,
  mimeType: string,
  data: Buffer,
): Promise<FileTextPreview> {
  let text: string;
  if (kind === 'office') {
    const officeKind = officeDocumentKind(fileName, mimeType);
    if (!officeKind) throw createError.notFound('This file has no text preview');
    try {
      if (officeKind === 'xlsx') {
        const table = await extractSpreadsheetTable(data, fileName, MAX_FILE_TEXT_CHARS);
        return { kind: 'table', text: table.csv, truncated: !table.complete };
      }
      text = await extractOfficeDocumentText(data, fileName, officeKind);
    } catch (error) {
      if (error instanceof OfficeDocumentUnreadableError) {
        throw createError.validation('This document could not be read');
      }
      throw error;
    }
  } else {
    text = data.toString('utf8');
  }

  const truncated = text.length > MAX_FILE_TEXT_CHARS;
  return {
    kind: kind === 'table' ? 'table' : 'text',
    text: truncated ? text.slice(0, MAX_FILE_TEXT_CHARS) : text,
    truncated,
  };
}
