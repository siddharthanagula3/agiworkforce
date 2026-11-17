import 'server-only';

import type { ChatFileIntakeRefusalCode } from '@agiworkforce/cloud-contracts';
import { SECRET_PATTERN_RULES } from '@agiworkforce/utils/secret-redaction';
import JSZip from 'jszip';

import { chatLargeFileKind, type ChatLargeFilePolicy } from '@/lib/chat-attachment-policy';
import {
  DecompressionLimitError,
  MAX_ARCHIVE_MEMBERS,
  decompressionBudget,
  type DecompressionBudget,
} from '@/lib/security/archive-bounds';
import {
  CREDENTIAL_SCAN_GUARD_BYTES,
  credentialFindingName,
  type UploadScanFinding,
} from '@/lib/security/upload-scan';
import {
  isOfficeTextPart,
  officeDocumentKind,
  openOfficeArchive,
  OfficeDocumentUnreadableError,
  type OfficeDocumentFailureReason,
} from '@/lib/server/office-document-text';
import {
  findingNamesFormat,
  mergeInspectionFindings,
  openBytesRange,
  scanCredentialRange,
  type OpenObjectRange,
} from './full-inspection';

/**
 * How far the credential scan of an Office package has got. It holds part
 * indexes, lengths, offsets and detector names only, never any of the file's
 * text, and moves only through the directive a step returns, so a retried step
 * scans the same bytes again.
 */
export interface PackageInspectionCursor {
  scan: 'package';
  etag: string;
  /**
   * The part the next step starts in: 0 is the package's own bytes, then each
   * member in the order the archive lists them.
   */
  part: number;
  /** Set once the scan is inside the package that member holds: its member, counted from 1. */
  nested?: number;
  /** Set while the scan reads that member's text with its markup removed. */
  view?: 'unmarked';
  /** The first byte of that part whose detections the next step answers for. */
  ownedFrom: number;
  /** The length of that part as the scan reads it, once a step has measured it and stopped inside it. */
  partBytes?: number;
  /** Inflated bytes of every member measured so far, counted against the scan's total. */
  inflatedBytes: number;
  findings: UploadScanFinding[];
}

interface UnreadablePackage {
  kind: 'unreadable';
  refusal: ChatFileIntakeRefusalCode;
  reason: string;
}

export type PackageScanOutcome =
  | { kind: 'continue'; cursor: PackageInspectionCursor }
  | { kind: 'finished'; findings: UploadScanFinding[] }
  | { kind: 'rejected'; findings: UploadScanFinding[] }
  | UnreadablePackage;

const CREDENTIAL_TEXT_TYPE = 'text/plain';
const PACKAGE_PART = 0;
const ZIP_LOCAL_HEADER = Uint8Array.of(0x50, 0x4b, 0x03, 0x04);
const ZIP_CENTRAL_FILE_HEADER = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
const ZIP_END_OF_CENTRAL_DIRECTORY = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
const ZIP64_END_LOCATOR = Buffer.from([0x50, 0x4b, 0x06, 0x07]);
const ZIP64_END_OF_CENTRAL_DIRECTORY = Buffer.from([0x50, 0x4b, 0x06, 0x06]);
const NO_BYTES = new Uint8Array(0);
const LESS_THAN = 0x3c;
const GREATER_THAN = 0x3e;
const SLASH = 0x2f;
const QUESTION_MARK = 0x3f;
const EXCLAMATION_MARK = 0x21;
const MARKUP_WHITESPACE: ReadonlySet<number> = new Set([0x20, 0x09, 0x0a, 0x0d]);
const RELATIONSHIP_PART = /\.rels$/i;
const VML_PART = /\.vml$/i;

/**
 * The URL password detector reads `password=` and any eight characters after
 * it, which a protection attribute Office writes, `<sheetProtection
 * password="CF7A"/>`, also is. Over markup it answers only in a relationship
 * part, whose attributes are the package's links.
 */
const URL_PASSWORD_DETECTOR = SECRET_PATTERN_RULES['password-assignment'].label;

/**
 * What a scanned range is, which decides the detectors that answer over it: a
 * file declared as text answers to every one, as the text scan after the head
 * would read it; markup and text to every one that names a credential format.
 */
type Reading = 'declared_text' | 'markup' | 'relationships' | 'text';

function findingAnswers(finding: UploadScanFinding, reading: Reading): boolean {
  if (reading === 'declared_text' || finding.code !== 'credential_material') return true;
  if (!findingNamesFormat(finding)) return false;
  return reading !== 'markup' || credentialFindingName(finding) !== URL_PASSWORD_DETECTOR;
}

function readingOf(
  member: JSZip.JSZipObject | null,
  view: PackageInspectionCursor['view'],
  declaredAsText: boolean,
): Reading {
  if (!member) return declaredAsText ? 'declared_text' : 'markup';
  if (view === 'unmarked') return 'text';
  return RELATIONSHIP_PART.test(member.name) ? 'relationships' : 'markup';
}

function hasUnmarkedView(name: string): boolean {
  return isOfficeTextPart(name) || VML_PART.test(name);
}

/**
 * A package that cannot be read to its end is refused whatever the workspace's
 * policy, the way the malware scan refuses an archive it cannot open: an
 * encrypted one as encrypted, one past the archive's bounds as over the limits,
 * and a damaged one as not the type it was declared. A package carrying macros
 * can be read, so it is scanned and left to preparation, which refuses it with
 * its own reason.
 */
const REFUSAL_BY_OFFICE_REASON: Readonly<
  Record<Exclude<OfficeDocumentFailureReason, 'macro_present'>, ChatFileIntakeRefusalCode>
> = {
  encrypted: 'encrypted',
  archive_bomb: 'limits_exceeded',
  corrupt: 'type_mismatch',
};

function unreadable(refusal: ChatFileIntakeRefusalCode, reason: string): UnreadablePackage {
  return { kind: 'unreadable', refusal, reason };
}

const DAMAGED = unreadable('type_mismatch', 'corrupt');
const ALIASED_MEMBERS = unreadable('type_mismatch', 'member_names');
const OVER_BUDGET = unreadable('limits_exceeded', 'archive_budget');
const TOO_MANY_MEMBERS = unreadable('limits_exceeded', 'archive_members');
const NESTED_TOO_DEEP = unreadable('limits_exceeded', 'nested_depth');
const NESTED_TOO_LARGE = unreadable('limits_exceeded', 'nested_bytes');

/**
 * Whether a reader of the sealed file would open it as an Office package:
 * preparation picks its reader by the kind, the turn's attachment reader by
 * the declared type or the name.
 */
export function packageScanApplies(row: { fileName: string; mimeType: string }): boolean {
  const kind = chatLargeFileKind(row.fileName, row.mimeType);
  return (
    kind === 'office' ||
    kind === 'spreadsheet' ||
    officeDocumentKind(row.fileName, row.mimeType) !== null
  );
}

export function firstPackageCursor(etag: string): PackageInspectionCursor {
  return {
    scan: 'package',
    etag,
    part: PACKAGE_PART,
    ownedFrom: 0,
    inflatedBytes: 0,
    findings: [],
  };
}

export function isPackageCursor(cursor: { scan?: unknown }): cursor is PackageInspectionCursor {
  return cursor.scan === 'package';
}

class InflatedMemberError extends Error {
  constructor(readonly limit: 'damaged' | 'changed') {
    super(
      limit === 'damaged'
        ? 'An archive member could not be inflated.'
        : 'An archive member inflated to a different length on a second read.',
    );
    this.name = 'InflatedMemberError';
  }
}

function joined(head: Uint8Array, chunk: Uint8Array): Uint8Array {
  if (head.byteLength === 0) return chunk;
  const bytes = new Uint8Array(head.byteLength + chunk.byteLength);
  bytes.set(head, 0);
  bytes.set(chunk, head.byteLength);
  return bytes;
}

function startsWith(bytes: Uint8Array, signature: Uint8Array): boolean {
  return (
    bytes.byteLength >= signature.byteLength &&
    signature.every((byte, index) => bytes[index] === byte)
  );
}

/** A member's bytes as the detectors read them, transformed a chunk at a time. */
interface MemberView {
  push(chunk: Uint8Array): Uint8Array;
  end(): Uint8Array;
}

const UTF16_HEAD_BYTES = 4;

/** A byte order mark, or an XML declaration written in UTF-16. */
function utf16Encoding(head: Uint8Array): 'utf-16le' | 'utf-16be' | null {
  const [first, second, third, fourth] = head;
  if (first === 0xff && second === 0xfe) return 'utf-16le';
  if (first === 0xfe && second === 0xff) return 'utf-16be';
  if (first === LESS_THAN && second === 0 && third === 0x3f && fourth === 0) return 'utf-16le';
  if (first === 0 && second === LESS_THAN && third === 0 && fourth === 0x3f) return 'utf-16be';
  return null;
}

/** The member as UTF-8: a UTF-16 part is decoded, any other part passes through unchanged. */
function textView(): MemberView {
  const encoder = new TextEncoder();
  let head: Uint8Array | null = NO_BYTES;
  let decoder: TextDecoder | null = null;
  const decode = (bytes: Uint8Array, stream: boolean): Uint8Array =>
    decoder ? encoder.encode(decoder.decode(bytes, { stream })) : bytes;
  const settle = (bytes: Uint8Array): void => {
    head = null;
    const encoding = utf16Encoding(bytes);
    if (encoding) decoder = new TextDecoder(encoding);
  };
  return {
    push(chunk) {
      if (head === null) return decode(chunk, true);
      const bytes = joined(head, chunk);
      if (bytes.byteLength < UTF16_HEAD_BYTES) {
        head = bytes;
        return NO_BYTES;
      }
      settle(bytes);
      return decode(bytes, true);
    },
    end() {
      if (head !== null) {
        const rest = head;
        settle(rest);
        return decode(rest, false);
      }
      return decoder ? encoder.encode(decoder.decode()) : NO_BYTES;
    },
  };
}

/**
 * The member's text with every `<...>` tag dropped, so runs the markup splits
 * are joined. Whitespace alone between two tags is kept only between a start
 * tag and an end tag, where it is an element's text; anywhere else it is how
 * the writer laid the markup out, so it is dropped too. A run of it longer
 * than a scan guard is kept, since no match could span it, so the view never
 * holds more than that.
 */
function unmarkedView(): MemberView {
  const text = textView();
  let inTag = false;
  let tagFirstByte = false;
  let startTag = false;
  let lastTagByte = 0;
  let lastTagOpened = false;
  let onlyWhitespace = true;
  const pending = new Uint8Array(CREDENTIAL_SCAN_GUARD_BYTES);
  let pendingBytes = 0;
  const strip = (bytes: Uint8Array): Uint8Array => {
    const out = new Uint8Array(bytes.byteLength + pending.byteLength);
    let length = 0;
    const flush = (): void => {
      out.set(pending.subarray(0, pendingBytes), length);
      length += pendingBytes;
      pendingBytes = 0;
    };
    for (const byte of bytes) {
      if (inTag) {
        if (tagFirstByte) {
          tagFirstByte = false;
          startTag = byte !== SLASH && byte !== QUESTION_MARK && byte !== EXCLAMATION_MARK;
          if (lastTagOpened && byte === SLASH) flush();
          else pendingBytes = 0;
        }
        if (byte === GREATER_THAN) {
          inTag = false;
          lastTagOpened = startTag && lastTagByte !== SLASH;
          onlyWhitespace = true;
        }
        lastTagByte = byte;
      } else if (byte === LESS_THAN) {
        inTag = true;
        tagFirstByte = true;
        lastTagByte = byte;
      } else if (
        onlyWhitespace &&
        MARKUP_WHITESPACE.has(byte) &&
        pendingBytes < pending.byteLength
      ) {
        pending[pendingBytes] = byte;
        pendingBytes += 1;
      } else {
        flush();
        onlyWhitespace = false;
        out[length] = byte;
        length += 1;
      }
    }
    return out.subarray(0, length);
  };
  return {
    push: (chunk) => strip(text.push(chunk)),
    end: () => {
      const rest = strip(text.end());
      pendingBytes = 0;
      return rest;
    },
  };
}

function memberView(view: PackageInspectionCursor['view']): MemberView {
  return view === 'unmarked' ? unmarkedView() : textView();
}

/**
 * Inflates a member once to learn how long it is and how long it reads,
 * stopping as soon as it inflates past `remaining`, which gives null. A paused
 * stream stops its inflater; destroying it would throw out of band.
 */
function measureMember(
  entry: JSZip.JSZipObject,
  view: PackageInspectionCursor['view'],
  remaining: number,
): Promise<{ inflated: number; length: number } | null> {
  return new Promise((resolve, reject) => {
    const stream = entry.nodeStream('nodebuffer');
    const transform = memberView(view);
    let inflated = 0;
    let length = 0;
    let settled = false;
    const finish = (outcome: { inflated: number; length: number } | null | Error): void => {
      if (settled) return;
      settled = true;
      stream.pause();
      if (outcome instanceof Error) reject(outcome);
      else resolve(outcome);
    };
    stream.on('data', (chunk: Buffer) => {
      if (settled) return;
      inflated += chunk.byteLength;
      if (inflated > remaining) {
        finish(null);
        return;
      }
      length += transform.push(chunk).byteLength;
    });
    stream.on('error', () => finish(new InflatedMemberError('damaged')));
    stream.on('end', () => {
      if (settled) return;
      length += transform.end().byteLength;
      finish({ inflated, length });
    });
  });
}

/** The member inflated whole, or null once it passes `maxBytes`. */
function inflateMember(entry: JSZip.JSZipObject, maxBytes: number): Promise<Uint8Array | null> {
  return new Promise((resolve, reject) => {
    const stream = entry.nodeStream('nodebuffer');
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;
    const finish = (outcome: Uint8Array | null | Error): void => {
      if (settled) return;
      settled = true;
      stream.pause();
      if (outcome instanceof Error) reject(outcome);
      else resolve(outcome);
    };
    stream.on('data', (chunk: Buffer) => {
      if (settled) return;
      total += chunk.byteLength;
      if (total > maxBytes) {
        finish(null);
        return;
      }
      chunks.push(chunk);
    });
    stream.on('error', () => finish(new InflatedMemberError('damaged')));
    stream.on('end', () => finish(Buffer.concat(chunks, total)));
  });
}

function memberStartsWith(entry: JSZip.JSZipObject, signature: Uint8Array): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const stream = entry.nodeStream('nodebuffer');
    let head: Uint8Array = NO_BYTES;
    let settled = false;
    const finish = (outcome: boolean | Error): void => {
      if (settled) return;
      settled = true;
      stream.pause();
      if (outcome instanceof Error) reject(outcome);
      else resolve(outcome);
    };
    stream.on('data', (chunk: Buffer) => {
      if (settled) return;
      head = joined(head, chunk);
      if (head.byteLength >= signature.byteLength) finish(startsWith(head, signature));
    });
    stream.on('error', () => finish(new InflatedMemberError('damaged')));
    stream.on('end', () => finish(startsWith(head, signature)));
  });
}

/** The member's bytes from `start` to `end` as the view reads them, as a stream the range scanner reads. */
function memberRange(
  entry: JSZip.JSZipObject,
  view: PackageInspectionCursor['view'],
  start: number,
  end: number,
): ReadableStream<Uint8Array> {
  const source = entry.nodeStream('nodebuffer');
  const transform = memberView(view);
  let position = 0;
  let done = false;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const deliver = (bytes: Uint8Array): void => {
        const bytesStart = position;
        position += bytes.byteLength;
        const from = Math.max(start - bytesStart, 0);
        const to = Math.min(end - bytesStart, bytes.byteLength);
        if (to > from) controller.enqueue(bytes.subarray(from, to));
        if (position >= end) {
          done = true;
          source.pause();
          controller.close();
        }
      };
      source.on('data', (chunk: Buffer) => {
        if (done) return;
        deliver(transform.push(chunk));
        if (!done && (controller.desiredSize ?? 0) <= 0) source.pause();
      });
      source.on('error', () => {
        if (done) return;
        done = true;
        controller.error(new InflatedMemberError('damaged'));
      });
      source.on('end', () => {
        if (done) return;
        deliver(transform.end());
        if (done) return;
        done = true;
        controller.close();
      });
    },
    pull() {
      if (!done) source.resume();
    },
    cancel() {
      done = true;
      source.pause();
    },
  });
}

/** Where the central directory ends: at the ZIP64 end record when there is one, else at the end record. */
function centralDirectoryBounds(bytes: Buffer): { start: number; end: number } | null {
  const end = bytes.lastIndexOf(ZIP_END_OF_CENTRAL_DIRECTORY);
  if (end < 0 || end + 22 > bytes.byteLength) return null;
  const directoryBytes = bytes.readUInt32LE(end + 12);
  const zip64 =
    bytes.readUInt16LE(end + 8) === 0xffff ||
    bytes.readUInt16LE(end + 10) === 0xffff ||
    directoryBytes === 0xffffffff ||
    bytes.readUInt32LE(end + 16) === 0xffffffff;
  if (!zip64) return end >= directoryBytes ? { start: end - directoryBytes, end } : null;
  const locator = end - 20;
  if (locator < 0 || !bytes.subarray(locator, locator + 4).equals(ZIP64_END_LOCATOR)) return null;
  const zip64End = bytes.lastIndexOf(ZIP64_END_OF_CENTRAL_DIRECTORY, locator);
  if (zip64End < 0 || zip64End + 56 > locator) return null;
  const zip64Bytes = Number(bytes.readBigUInt64LE(zip64End + 40));
  return zip64End >= zip64Bytes ? { start: zip64End - zip64Bytes, end: zip64End } : null;
}

/**
 * The records the archive's central directory holds, counted by walking them.
 * The ZIP library and the sandbox's reader both start the directory its size
 * back from where it ends; the library then reads records while their
 * signature holds, the sandbox's reader for the directory's size, and the
 * count in the end record is read by neither. A directory that is not a run of
 * whole records reaching its end gives null.
 */
function centralDirectoryRecords(bytes: Buffer): number | null {
  const bounds = centralDirectoryBounds(bytes);
  if (!bounds) return null;
  let records = 0;
  let offset = bounds.start;
  while (offset < bounds.end) {
    if (offset + 46 > bounds.end) return null;
    if (!bytes.subarray(offset, offset + 4).equals(ZIP_CENTRAL_FILE_HEADER)) return null;
    offset +=
      46 +
      bytes.readUInt16LE(offset + 28) +
      bytes.readUInt16LE(offset + 30) +
      bytes.readUInt16LE(offset + 32);
    records += 1;
  }
  return offset === bounds.end ? records : null;
}

/**
 * The ZIP library keeps one member per name, so a later record whose name is
 * the same as, or resolves to, an earlier one hides it from the scan while a
 * reader that walks every record still opens it.
 */
function exposesEveryRecord(bytes: Uint8Array, zip: JSZip): boolean {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return centralDirectoryRecords(buffer) === Object.keys(zip.files).length;
}

function membersOf(zip: JSZip): JSZip.JSZipObject[] {
  const members: JSZip.JSZipObject[] = [];
  zip.forEach((_, entry) => {
    if (!entry.dir) members.push(entry);
  });
  return members;
}

type OpenedPackage = { kind: 'opened'; members: JSZip.JSZipObject[] } | UnreadablePackage;

async function openPackage(data: Uint8Array, fileName: string): Promise<OpenedPackage> {
  const buffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  let zip: JSZip;
  try {
    zip = (await openOfficeArchive(buffer, fileName, 'per-member')).zip;
  } catch (error) {
    if (!(error instanceof OfficeDocumentUnreadableError)) throw error;
    if (error.reason !== 'macro_present') {
      return unreadable(REFUSAL_BY_OFFICE_REASON[error.reason], error.reason);
    }
    zip = await JSZip.loadAsync(buffer);
  }
  if (!exposesEveryRecord(data, zip)) return ALIASED_MEMBERS;
  return { kind: 'opened', members: membersOf(zip) };
}

/**
 * A member that is itself a package, such as the workbook behind a chart. It
 * is read whole, so it may be no larger than the package that carries it, and
 * may hold as many members as an archive a reader opens.
 */
async function openNestedPackage(
  entry: JSZip.JSZipObject,
  maxBytes: number,
  budget: DecompressionBudget,
): Promise<OpenedPackage> {
  const bytes = await inflateMember(entry, maxBytes);
  if (bytes === null) return NESTED_TOO_LARGE;
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    return DAMAGED;
  }
  if (!exposesEveryRecord(bytes, zip)) return ALIASED_MEMBERS;
  const members = membersOf(zip);
  if (!admitsMembers(budget, members.length)) return TOO_MANY_MEMBERS;
  return { kind: 'opened', members };
}

function admitsMembers(budget: DecompressionBudget, count: number): boolean {
  try {
    budget.admitMembers(count);
    return true;
  } catch (error) {
    if (error instanceof DecompressionLimitError) return false;
    throw error;
  }
}

async function scanText(
  key: string,
  byteCount: number,
  ownedFrom: number,
  ownedTo: number,
  openRange: OpenObjectRange,
): Promise<{ findings: UploadScanFinding[]; rejected: boolean }> {
  const scanned = await scanCredentialRange({
    openRange,
    key,
    mimeType: CREDENTIAL_TEXT_TYPE,
    byteCount,
    ownedFrom,
    ownedTo,
  });
  if (scanned.kind === 'short') throw new InflatedMemberError('changed');
  return scanned;
}

/**
 * One step of the credential scan of an Office package, over the whole file
 * read once under the entity tag. The package's own bytes, then every member
 * inflated, a UTF-16 one decoded, then each text part again with its markup
 * removed, then the members of any package a member holds, are read at most a
 * text step's bytes, and at most an archive's members, per step. Only the
 * detectors that name a credential format answer over any of it, since
 * Office's own numbers and identifiers trip the others. Members may inflate to
 * no more than the malware scan reads, and no more than the archive ratio
 * allows. No reader of the sealed file runs here: every text part a reader
 * would extract from has been read with its markup removed.
 */
export async function scanPackageStep(input: {
  data: Uint8Array;
  row: { fileName: string };
  cursor: PackageInspectionCursor;
  policy: ChatLargeFilePolicy;
  /** The file is declared as a text type, so its own bytes answer to every detector. */
  declaredAsText: boolean;
}): Promise<PackageScanOutcome> {
  const { data, row, cursor, policy, declaredAsText } = input;
  const opened = await openPackage(data, row.fileName);
  if (opened.kind === 'unreadable') return opened;
  const { members } = opened;
  const budget = decompressionBudget(data.byteLength, policy.largeFiles.maxPackageInflatedBytes);
  if (!admitsMembers(budget, members.length)) return TOO_MANY_MEMBERS;

  const stepBytes = policy.kinds.text.bytesPerStep;
  let { part, nested, view, ownedFrom, partBytes, inflatedBytes, findings } = cursor;
  if (inflatedBytes > budget.ceiling) return OVER_BUDGET;
  let held: { part: number; members: JSZip.JSZipObject[] } | null = null;
  let spent = 0;
  let visited = 0;
  const continueHere = (): PackageScanOutcome => ({
    kind: 'continue',
    cursor: {
      scan: 'package',
      etag: cursor.etag,
      part,
      ...(nested === undefined ? {} : { nested }),
      ...(view === undefined ? {} : { view }),
      ownedFrom,
      ...(partBytes === undefined ? {} : { partBytes }),
      inflatedBytes,
      findings,
    },
  });

  try {
    while (part <= members.length) {
      const outer = part === PACKAGE_PART ? null : members[part - 1]!;
      let member = outer;
      if (outer && nested !== undefined) {
        if (!held || held.part !== part) {
          const inner = await openNestedPackage(outer, data.byteLength, budget);
          if (inner.kind === 'unreadable') return inner;
          held = { part, members: inner.members };
        }
        member = held.members[nested - 1] ?? null;
        if (!member) return DAMAGED;
      }

      if (partBytes === undefined) {
        if (!member) {
          partBytes = data.byteLength;
        } else if (view === undefined) {
          const measured = await measureMember(member, view, budget.ceiling - inflatedBytes);
          if (measured === null) return OVER_BUDGET;
          inflatedBytes += measured.inflated;
          partBytes = measured.length;
        } else {
          const measured = await measureMember(member, view, Number.MAX_SAFE_INTEGER);
          partBytes = measured?.length ?? 0;
        }
      }

      if (partBytes > ownedFrom) {
        const ownedTo = Math.min(partBytes, ownedFrom + stepBytes - spent);
        const reading = member;
        const readingView = view;
        const scanned = await scanText(
          reading?.name ?? 'package',
          partBytes,
          ownedFrom,
          ownedTo,
          reading
            ? async (_key, start, end) => memberRange(reading, readingView, start, end)
            : openBytesRange(data),
        );
        const answering = readingOf(reading, readingView, declaredAsText);
        findings = mergeInspectionFindings(
          findings,
          scanned.findings.filter((finding) => findingAnswers(finding, answering)),
        );
        if (scanned.rejected) return { kind: 'rejected', findings };
        spent += ownedTo - ownedFrom;
        if (ownedTo < partBytes) {
          ownedFrom = ownedTo;
          return continueHere();
        }
      }

      ownedFrom = 0;
      partBytes = undefined;
      if (member && view === undefined && hasUnmarkedView(member.name)) {
        view = 'unmarked';
      } else {
        view = undefined;
        visited += 1;
        if (!outer) {
          part += 1;
        } else if (nested === undefined) {
          if (await memberStartsWith(outer, ZIP_LOCAL_HEADER)) {
            const inner = await openNestedPackage(outer, data.byteLength, budget);
            if (inner.kind === 'unreadable') return inner;
            held = { part, members: inner.members };
            if (inner.members.length > 0) nested = 1;
            else part += 1;
          } else {
            part += 1;
          }
        } else {
          if (member && (await memberStartsWith(member, ZIP_LOCAL_HEADER))) return NESTED_TOO_DEEP;
          if (nested < (held?.members.length ?? 0)) {
            nested += 1;
          } else {
            nested = undefined;
            held = null;
            part += 1;
          }
        }
      }
      if ((spent >= stepBytes || visited >= MAX_ARCHIVE_MEMBERS) && part <= members.length) {
        return continueHere();
      }
    }
  } catch (error) {
    if (error instanceof InflatedMemberError && error.limit === 'damaged') return DAMAGED;
    throw error;
  }

  return { kind: 'finished', findings };
}
