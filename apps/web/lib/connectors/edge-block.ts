import 'server-only';

const EDGE_BLOCK_STATUS = 403;
const HTML_DOCUMENT_RE = /^\s*<(?:!doctype\s+html|html|head|body)\b/i;

function responseText(record: Record<string, unknown>): string | null {
  const data = record['data'];
  if (!data || typeof data !== 'object') return null;
  const text = (data as Record<string, unknown>)['text'];
  return typeof text === 'string' ? text : null;
}

export function isEdgeBlockedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as Record<string, unknown>;
  if (record['status'] !== EDGE_BLOCK_STATUS) return false;
  const text = responseText(record);
  return text !== null && HTML_DOCUMENT_RE.test(text);
}
