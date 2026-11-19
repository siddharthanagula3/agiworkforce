import 'server-only';

import { SECRET_PATTERN_RULES } from '@agiworkforce/utils/secret-redaction';

import { chatLargeFileKind, type ChatLargeFileKind } from '@/lib/chat-attachment-policy';
import { HIGH_ENTROPY_DETECTION_NAME } from '@/lib/security/entropy';
import {
  CREDENTIAL_SCAN_GUARD_BYTES,
  UPLOAD_INSPECTION_BYTES,
  credentialFindingName,
  credentialScanReadsContent,
  scanUploadRangeForCredentials,
  uploadFindingRejects,
  type UploadScanFinding,
} from '@/lib/security/upload-scan';
import { getPrivateObjectStream } from '@/lib/server/object-storage';
import type { NotebookInspectionCursor } from './notebook-inspection';
import type { PackageInspectionCursor } from './package-inspection';
import type { PdfInspectionCursor } from './pdf-inspection';

/**
 * How far the credential scan of a large text file has got. It crosses the
 * workflow's step boundary, so it holds offsets and detector names only, never
 * any of the file's text. A run that starts again from the row's state starts
 * the scan again from the first byte.
 */
export interface TextInspectionCursor {
  scan?: undefined;
  etag: string;
  /** The first byte whose detections the next step answers for. */
  ownedFrom: number;
  /** One finding per detector the scan after the head has found so far. */
  findings: UploadScanFinding[];
}

export type ChatFileInspectionCursor =
  TextInspectionCursor | PackageInspectionCursor | PdfInspectionCursor | NotebookInspectionCursor;

/** Bytes one window answers for: with a guard either side it reads as much as the head does. */
export const CREDENTIAL_WINDOW_OWNED_BYTES =
  UPLOAD_INSPECTION_BYTES - 2 * CREDENTIAL_SCAN_GUARD_BYTES;

const KINDS_READ_AS_TEXT: ReadonlySet<ChatLargeFileKind> = new Set<ChatLargeFileKind>([
  'text',
  'delimited',
  'html',
  'notebook',
]);
const CREDENTIAL_TEXT_TYPE = 'text/plain';

/**
 * The type the credential detectors read a large file as. Chat accepts a file
 * by its name as well as its declared type, and preparation and the sandbox
 * read a `.txt` as text whatever type was declared, so a text kind by the
 * declared type or by the name alone is read as text here too.
 */
export function credentialScanMimeType(row: { fileName: string; mimeType: string }): string {
  if (credentialScanReadsContent(row.mimeType)) return row.mimeType;
  const kinds = [
    chatLargeFileKind(row.fileName, row.mimeType),
    chatLargeFileKind(row.fileName, ''),
  ];
  return kinds.some((kind) => kind !== null && KINDS_READ_AS_TEXT.has(kind))
    ? CREDENTIAL_TEXT_TYPE
    : row.mimeType;
}

/**
 * Whether the head inspection leaves bytes the credential detectors would
 * read. The head answers for matches inside its first `UPLOAD_INSPECTION_BYTES`;
 * the scan after it answers from one guard earlier, so a match that straddles
 * the end of the head is found.
 */
export function credentialScanContinuesAfterHead(row: {
  fileName: string;
  mimeType: string;
  byteCount: number;
}): boolean {
  return (
    credentialScanReadsContent(credentialScanMimeType(row)) &&
    row.byteCount > UPLOAD_INSPECTION_BYTES
  );
}

export function firstCursorAfterHead(etag: string): TextInspectionCursor {
  return { etag, ownedFrom: UPLOAD_INSPECTION_BYTES - CREDENTIAL_SCAN_GUARD_BYTES, findings: [] };
}

/** Adds what a step found, keeping the first finding of each detector. */
export function mergeInspectionFindings(
  carried: readonly UploadScanFinding[],
  found: readonly UploadScanFinding[],
): UploadScanFinding[] {
  const merged = [...carried];
  const names = new Set(merged.map(credentialFindingName));
  for (const finding of found) {
    const name = credentialFindingName(finding);
    if (names.has(name)) continue;
    names.add(name);
    merged.push(finding);
  }
  return merged;
}

/**
 * Detectors that name no credential format. Documents are full of long
 * numbers, identifiers and digests, and these read them as card numbers, SSNs
 * and random strings, so they never answer over a document's content, only
 * over a file declared as text.
 */
const FORMATLESS_DETECTORS: ReadonlySet<string> = new Set([
  HIGH_ENTROPY_DETECTION_NAME,
  SECRET_PATTERN_RULES['credit-card-number'].label,
  SECRET_PATTERN_RULES['us-ssn'].label,
]);

/** Whether a finding names a credential format, or is not a credential finding at all. */
export function findingNamesFormat(finding: UploadScanFinding): boolean {
  return (
    finding.code !== 'credential_material' ||
    !FORMATLESS_DETECTORS.has(credentialFindingName(finding))
  );
}

export type OpenObjectRange = (
  key: string,
  start: number,
  endExclusive: number,
) => Promise<ReadableStream<Uint8Array> | null>;

/** Bytes already in memory, read through the same ranged windows as a stored object. */
export function openBytesRange(bytes: Uint8Array): OpenObjectRange {
  return async (_key, start, end) =>
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.subarray(start, end));
        controller.close();
      },
    });
}

export const openPrivateObjectRange: OpenObjectRange = async (key, start, endExclusive) => {
  const stream = await getPrivateObjectStream(key, `bytes=${start}-${endExclusive - 1}`);
  return stream?.body ?? null;
};

export interface CredentialRangeRequest {
  openRange: OpenObjectRange;
  key: string;
  mimeType: string;
  byteCount: number;
  ownedFrom: number;
  ownedTo: number;
  /** A document's content, which only the detectors that name a format answer over, each from a word's start. */
  readsDocument?: boolean;
}

const KEY_PREFIX = [0x73, 0x6b, 0x2d] as const;
const KEY_PREFIX_STAND_IN = 0x78;

function isWordByte(byte: number): boolean {
  return (
    (byte >= 0x30 && byte <= 0x39) ||
    (byte >= 0x41 && byte <= 0x5a) ||
    (byte >= 0x61 && byte <= 0x7a) ||
    byte === 0x5f ||
    byte === 0x2d
  );
}

/**
 * The `sk-` key detector has no left edge, so over a document it reads the
 * slug of a printed or linked URL, `risk-management-and-internal-control`, as
 * a key. In a document a key starts a word: an `sk-` inside one has its `s`
 * set to `x`, a lowercase letter every other detector's character classes
 * read exactly as they read `s`, so no other detection is lost or made.
 */
function unglueKeyPrefixes(bytes: Uint8Array): void {
  for (let at = 1; at + KEY_PREFIX.length <= bytes.byteLength; at += 1) {
    if (
      bytes[at] === KEY_PREFIX[0] &&
      bytes[at + 1] === KEY_PREFIX[1] &&
      bytes[at + 2] === KEY_PREFIX[2] &&
      isWordByte(bytes[at - 1]!)
    ) {
      bytes[at] = KEY_PREFIX_STAND_IN;
    }
  }
}

export type CredentialRangeOutcome =
  { kind: 'short' } | { kind: 'read'; findings: UploadScanFinding[]; rejected: boolean };

/** The bytes of one ranged read, kept only from the start of the window being scanned. */
class RangeBuffer {
  private chunks: Uint8Array[] = [];
  private held = 0;

  constructor(
    private readonly reader: ReadableStreamDefaultReader<Uint8Array>,
    private start: number,
  ) {}

  /** False when the read ends before `end`. */
  async fillTo(end: number): Promise<boolean> {
    while (this.start + this.held < end) {
      const { done, value } = await this.reader.read();
      if (done) return false;
      if (!value || value.byteLength === 0) continue;
      this.chunks.push(value);
      this.held += value.byteLength;
    }
    return true;
  }

  /** A copy of the bytes from `from` to `to`, both inside what is held. */
  slice(from: number, to: number): Uint8Array {
    const out = new Uint8Array(to - from);
    let chunkStart = this.start;
    let filled = 0;
    for (const chunk of this.chunks) {
      const chunkEnd = chunkStart + chunk.byteLength;
      if (chunkEnd > from && chunkStart < to) {
        const begin = Math.max(from, chunkStart) - chunkStart;
        const end = Math.min(to, chunkEnd) - chunkStart;
        out.set(chunk.subarray(begin, end), filled);
        filled += end - begin;
      }
      chunkStart = chunkEnd;
      if (chunkStart >= to) break;
    }
    return out;
  }

  dropBefore(offset: number): void {
    while (this.chunks.length > 0) {
      const first = this.chunks[0]!;
      const firstEnd = this.start + first.byteLength;
      if (firstEnd > offset) {
        if (offset > this.start) {
          this.chunks[0] = first.subarray(offset - this.start);
          this.held -= offset - this.start;
          this.start = offset;
        }
        return;
      }
      this.chunks.shift();
      this.held -= first.byteLength;
      this.start = firstEnd;
    }
  }
}

/**
 * Scans the credential detections that start between `ownedFrom` and
 * `ownedTo` with one ranged read, a window at a time. Each window answers for
 * `CREDENTIAL_WINDOW_OWNED_BYTES` and reads a guard either side of them, so
 * memory stays at one window and a match across a window edge is still
 * whole in the window that answers for its start. It stops at the first
 * finding that refuses the file.
 */
export async function scanCredentialRange(
  request: CredentialRangeRequest,
): Promise<CredentialRangeOutcome> {
  const { byteCount, ownedFrom, ownedTo } = request;
  if (
    !Number.isSafeInteger(ownedFrom) ||
    !Number.isSafeInteger(ownedTo) ||
    ownedFrom < 0 ||
    ownedTo <= ownedFrom ||
    ownedTo > byteCount
  ) {
    throw new RangeError('A credential scan needs an owned range inside the file.');
  }
  const readStart = Math.max(0, ownedFrom - CREDENTIAL_SCAN_GUARD_BYTES);
  const readEnd = Math.min(byteCount, ownedTo + CREDENTIAL_SCAN_GUARD_BYTES);
  const stream = await request.openRange(request.key, readStart, readEnd);
  if (!stream) return { kind: 'short' };

  const reader = stream.getReader();
  const buffer = new RangeBuffer(reader, readStart);
  let findings: UploadScanFinding[] = [];
  try {
    for (let windowStart = ownedFrom; windowStart < ownedTo;) {
      const windowEnd = Math.min(windowStart + CREDENTIAL_WINDOW_OWNED_BYTES, ownedTo);
      const bytesStart = Math.max(readStart, windowStart - CREDENTIAL_SCAN_GUARD_BYTES);
      const bytesEnd = Math.min(readEnd, windowEnd + CREDENTIAL_SCAN_GUARD_BYTES);
      if (!(await buffer.fillTo(bytesEnd))) return { kind: 'short' };
      const windowBytes = buffer.slice(bytesStart, bytesEnd);
      if (request.readsDocument) unglueKeyPrefixes(windowBytes);
      const detected = scanUploadRangeForCredentials(windowBytes, request.mimeType, {
        bytesStart,
        ownedStart: windowStart,
        ownedEnd: windowEnd,
      });
      const found = request.readsDocument ? detected.filter(findingNamesFormat) : detected;
      findings = mergeInspectionFindings(findings, found);
      if (found.some(uploadFindingRejects)) return { kind: 'read', findings, rejected: true };
      windowStart = windowEnd;
      buffer.dropBefore(Math.max(readStart, windowStart - CREDENTIAL_SCAN_GUARD_BYTES));
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  return { kind: 'read', findings, rejected: false };
}
