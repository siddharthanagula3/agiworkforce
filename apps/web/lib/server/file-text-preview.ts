import 'server-only';

import { officeDocumentKind } from '@/lib/server/office-document-text';

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
