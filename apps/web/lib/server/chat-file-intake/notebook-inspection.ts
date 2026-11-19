import 'server-only';

import { chatLargeFileKind, type ChatLargeFilePolicy } from '@/lib/chat-attachment-policy';
import type { UploadScanFinding } from '@/lib/security/upload-scan';
import { PreparationRefusedError } from '@/lib/server/chat-file-preparation/progress-store';
import { extractNotebookCellText } from '@/lib/server/chat-file-preparation/text-stream';
import { mergeInspectionFindings, openBytesRange, scanCredentialRange } from './full-inspection';

/**
 * How far the credential scan of a notebook's cells has got. The file's own
 * bytes are scanned first, as text; this pass reads the cells as preparation
 * gives them to the model, where JSON escapes are decoded and the lines of a
 * cell are joined, so text the product derives is never text no scan read. It
 * holds an offset into that text and detector names only, and moves only
 * through the directive a step returns.
 */
export interface NotebookInspectionCursor {
  scan: 'notebook';
  etag: string;
  /** The first byte of the cells' text, as UTF-8, whose detections the next step answers for. */
  ownedFrom: number;
  /** What the scans before this one found, then one finding per detector this one has found. */
  findings: UploadScanFinding[];
}

export type NotebookScanOutcome =
  | { kind: 'continue'; cursor: NotebookInspectionCursor }
  | { kind: 'finished'; findings: UploadScanFinding[] }
  | { kind: 'rejected'; findings: UploadScanFinding[] };

const CREDENTIAL_TEXT_TYPE = 'text/plain';
const encoder = new TextEncoder();

/** Whether preparation would read the sealed file's cells: it picks its reader by the same kind. */
export function notebookScanApplies(row: { fileName: string; mimeType: string }): boolean {
  return chatLargeFileKind(row.fileName, row.mimeType) === 'notebook';
}

export function firstNotebookCursor(
  etag: string,
  findings: readonly UploadScanFinding[],
): NotebookInspectionCursor {
  return { scan: 'notebook', etag, ownedFrom: 0, findings: [...findings] };
}

export function isNotebookCursor(cursor: { scan?: unknown }): cursor is NotebookInspectionCursor {
  return cursor.scan === 'notebook';
}

/**
 * A file preparation refuses, as unreadable or as holding more containers than
 * its kind allows, gives the model no cell text, and its bytes were already
 * scanned, so there is nothing more to read.
 */
function cellText(data: Uint8Array, policy: ChatLargeFilePolicy): string | null {
  try {
    return extractNotebookCellText(data, policy.kinds.notebook);
  } catch (error) {
    if (error instanceof PreparationRefusedError) return null;
    throw error;
  }
}

/**
 * One step over the cells' text: at most a text step's bytes, read by every
 * detector, as a text file holding the same text would be.
 */
export async function scanNotebookStep(input: {
  data: Uint8Array;
  cursor: NotebookInspectionCursor;
  policy: ChatLargeFilePolicy;
}): Promise<NotebookScanOutcome> {
  const { cursor } = input;
  const text = cellText(input.data, input.policy);
  const bytes = text === null ? null : encoder.encode(text);
  if (bytes === null || cursor.ownedFrom >= bytes.byteLength) {
    return { kind: 'finished', findings: cursor.findings };
  }

  const ownedTo = Math.min(
    bytes.byteLength,
    cursor.ownedFrom + input.policy.kinds.text.bytesPerStep,
  );
  const scanned = await scanCredentialRange({
    openRange: openBytesRange(bytes),
    key: 'cells',
    mimeType: CREDENTIAL_TEXT_TYPE,
    byteCount: bytes.byteLength,
    ownedFrom: cursor.ownedFrom,
    ownedTo,
  });
  if (scanned.kind === 'short') throw new RangeError('Cell text in memory read short.');
  if (scanned.rejected) return { kind: 'rejected', findings: scanned.findings };

  const findings = mergeInspectionFindings(cursor.findings, scanned.findings);
  return ownedTo === bytes.byteLength
    ? { kind: 'finished', findings }
    : { kind: 'continue', cursor: { ...cursor, ownedFrom: ownedTo, findings } };
}
