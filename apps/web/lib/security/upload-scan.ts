import 'server-only';

import { isCredentialPath } from '@agiworkforce/local-runtime-contract';

import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { filenameIsUnsafe, sanitizeFilename } from '@/lib/redaction';

import { isHighConfidenceSecretName } from './secret-patterns';
import { scanForSecrets } from './secrets-audit';

/**
 * Content inspection for user uploads.
 *
 * Uploads previously reached a publicly-servable URL after only three checks:
 * storage-key path safety, a MIME allowlist, and a byte-count match. None of
 * those look at the BYTES, so a file whose declared type disagrees with its
 * actual content, the classic type-confusion vector, passed cleanly.
 *
 * Every route that materialises caller-supplied bytes runs this, and
 * `scripts/check-upload-inspection-coverage.mjs` enumerates them from the
 * route tree so a new one cannot skip it. The two-phase paths scan where the
 * object becomes usable rather than where the first part lands:
 * `/api/uploads/chat-attachment/complete` (chat attachments) and
 * `POST /api/projects/[id]/knowledge-files` via
 * `lib/server/project-knowledge-extraction.ts` (project sources). Both delete
 * the stored object on rejection. The single-request routes call
 * `refuseUnsafeUpload` before the bytes are stored, so there is nothing to
 * purge.
 *
 * This scans the real bytes. It is deliberately signature- and
 * structure-based rather than a virus-definition database: the checks below
 * catch the file shapes that are dangerous *because of how this product serves
 * them* (an SVG that runs script when rendered, a PDF that auto-executes on
 * open, a disguised executable), which is a different and more tractable
 * problem than general antivirus.
 *
 * An external AV service can be layered on top via `UPLOAD_SCAN_WEBHOOK_URL`.
 * In production it is required unless an operator sets UPLOAD_SCAN_REQUIRED to
 * false; see docs/security/upload-scanning.md.
 *
 * Both ingest paths write to the PRIVATE bucket, which
 * `isPrivateObjectStorageConfigured` keeps distinct from the public one, so an
 * uploaded object is never world-readable before this scanner runs.
 *
 * This does NOT reject `text/html` for carrying script, because a knowledge
 * file legitimately can be a saved web page. What stops that markup executing
 * is `lib/security/served-bytes.ts`, which demotes every browser-executable
 * type to an opaque download on both byte-serving routes.
 */

export interface UploadScanFinding {
  code:
    | 'type_confusion'
    | 'active_content_svg'
    | 'active_content_pdf'
    | 'executable'
    | 'archive_not_allowed'
    | 'credential_material'
    | 'sensitive_filename'
    | 'unsafe_filename'
    | 'external_scanner'
    | 'encrypted_content'
    | 'limits_exceeded'
    | 'scan_unavailable'
    | 'storage_full'
    | 'changed_during_check';
  detail: string;
}

export interface UploadScanResult {
  ok: boolean;
  findings: UploadScanFinding[];
}

interface MagicSignature {
  bytes: readonly number[];
  label: string;
  mimes: readonly string[];
  formType?: { offset: number; bytes: readonly number[] };
}

const MAGIC_SIGNATURES: readonly MagicSignature[] = [
  { bytes: [0x25, 0x50, 0x44, 0x46], label: 'PDF', mimes: ['application/pdf'] },
  { bytes: [0xff, 0xd8, 0xff], label: 'JPEG', mimes: ['image/jpeg', 'image/jpg'] },
  { bytes: [0x89, 0x50, 0x4e, 0x47], label: 'PNG', mimes: ['image/png'] },
  { bytes: [0x47, 0x49, 0x46, 0x38], label: 'GIF', mimes: ['image/gif'] },
  {
    bytes: [0x52, 0x49, 0x46, 0x46],
    formType: { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
    label: 'WebP',
    mimes: ['image/webp'],
  },
  { bytes: [0x50, 0x4b, 0x03, 0x04], label: 'ZIP', mimes: [] },
];

const EXECUTABLE_SIGNATURES: ReadonlyArray<{ bytes: readonly number[]; label: string }> = [
  { bytes: [0x4d, 0x5a], label: 'DOS/PE executable' },
  { bytes: [0x7f, 0x45, 0x4c, 0x46], label: 'ELF executable' },
  { bytes: [0xcf, 0xfa, 0xed, 0xfe], label: 'Mach-O executable' },
  { bytes: [0xce, 0xfa, 0xed, 0xfe], label: 'Mach-O executable' },
  { bytes: [0xca, 0xfe, 0xba, 0xbe], label: 'Mach-O fat binary' },
  { bytes: [0x23, 0x21], label: 'script shebang' },
];

function matchesAt(bytes: Uint8Array, signature: readonly number[], offset: number): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return matchesAt(bytes, signature, 0);
}

function matchesMagic(bytes: Uint8Array, signature: MagicSignature): boolean {
  if (!startsWith(bytes, signature.bytes)) return false;
  return (
    !signature.formType || matchesAt(bytes, signature.formType.bytes, signature.formType.offset)
  );
}

function textPrefix(bytes: Uint8Array, limit = 64_000): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, limit));
}

function scanSvg(bytes: Uint8Array): UploadScanFinding[] {
  const text = textPrefix(bytes).toLowerCase();
  const findings: UploadScanFinding[] = [];
  if (/<script[\s/>]/.test(text)) {
    findings.push({ code: 'active_content_svg', detail: 'SVG contains a <script> element' });
  }
  if (/[\s/]on\w+\s*=/.test(text)) {
    findings.push({ code: 'active_content_svg', detail: 'SVG contains an inline event handler' });
  }
  if (/javascript:/.test(text)) {
    findings.push({ code: 'active_content_svg', detail: 'SVG contains a javascript: URL' });
  }
  if (/<foreignobject[\s/>]/.test(text)) {
    findings.push({ code: 'active_content_svg', detail: 'SVG contains <foreignObject>' });
  }
  return findings;
}

function scanPdf(bytes: Uint8Array): UploadScanFinding[] {
  const text = textPrefix(bytes, 256_000);
  const findings: UploadScanFinding[] = [];
  if (/\/JavaScript\b/.test(text) || /\/JS\b/.test(text)) {
    findings.push({ code: 'active_content_pdf', detail: 'PDF embeds JavaScript' });
  }
  if (/\/Launch\b/.test(text)) {
    findings.push({ code: 'active_content_pdf', detail: 'PDF contains a /Launch action' });
  }
  if (/\/EmbeddedFile\b/.test(text)) {
    findings.push({ code: 'active_content_pdf', detail: 'PDF contains an embedded file' });
  }
  return findings;
}

const TEXTUAL_MIME_PREFIXES = ['text/'];
const TEXTUAL_MIMES: ReadonlySet<string> = new Set([
  'application/json',
  'application/xml',
  'application/x-yaml',
  'application/yaml',
  'application/x-sh',
  'application/javascript',
  'application/x-httpd-php',
  'application/sql',
]);
const CREDENTIAL_SCAN_BYTES = 256_000;

/**
 * The agent's credential-path rule also matches names any document can carry,
 * such as secret.txt or customer-credentials.csv. A name like that says nothing
 * about the bytes, so for an upload the content scan decides: it still refuses
 * one that holds a recognised key.
 */
const DESCRIPTIVE_SECRET_NAME =
  /(^|\/)(secrets?|[^/]*credentials?)\.(json|ya?ml|toml|txt|ini|db|csv|xml)$/i;

function isCredentialFileName(filename: string): boolean {
  return isCredentialPath(filename) && !DESCRIPTIVE_SECRET_NAME.test(filename);
}

function essenceOf(declaredMime: string): string {
  return declaredMime.split(';', 1)[0]?.trim().toLowerCase() ?? '';
}

function isTextualMime(declaredMime: string): boolean {
  const mime = essenceOf(declaredMime);
  return TEXTUAL_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix)) || TEXTUAL_MIMES.has(mime);
}

/**
 * A file full of credentials is not malware, so the structural checks above
 * never see it, and the product then stores it, serves it through a share
 * link and feeds it to a model. Only a detection that names a format refuses
 * the upload; the entropy detector recognises no format, so what it finds is
 * reported and left to a human.
 */
export function scanUploadForCredentials(
  bytes: Uint8Array,
  declaredMime: string,
  filename?: string,
): UploadScanFinding[] {
  const findings: UploadScanFinding[] = [];

  if (filename && filenameIsUnsafe(filename)) {
    findings.push({
      code: 'unsafe_filename',
      detail: `${sanitizeFilename(filename)} was submitted as a path rather than a file name`,
    });
  }

  if (filename && isCredentialFileName(sanitizeFilename(filename))) {
    findings.push({
      code: 'sensitive_filename',
      detail: `${sanitizeFilename(filename)} is the name of a credential file`,
    });
  }

  if (!isTextualMime(declaredMime)) return findings;

  const text = textPrefix(bytes, CREDENTIAL_SCAN_BYTES);
  const names = new Set<string>();
  for (const detection of scanForSecrets(text, { includeHighEntropy: true })) {
    names.add(detection.name);
    findings.push(credentialFinding(detection.name, detection.position));
  }
  if (text.includes(NULL_CHARACTER)) {
    for (const detection of scanForSecrets(withoutNulls(text), { includeHighEntropy: true })) {
      if (names.has(detection.name)) continue;
      names.add(detection.name);
      findings.push(credentialFinding(detection.name, detection.position));
    }
  }

  return findings;
}

const NULL_CHARACTER = '\u0000';

/**
 * A reader that stores or sends a file's text drops its null characters, so
 * the detectors read the text without them as well as with them: a credential
 * that only exists once they are gone, as in a UTF-16 file read as UTF-8, is
 * text the product produces.
 */
function withoutNulls(text: string): string {
  return text.replaceAll(NULL_CHARACTER, '');
}

const CREDENTIAL_POSITION_SEPARATOR = ' at byte ';

function credentialFinding(name: string, position: number): UploadScanFinding {
  return {
    code: 'credential_material',
    detail: `${name}${CREDENTIAL_POSITION_SEPARATOR}${position}`,
  };
}

/** The detector that produced a credential finding. */
export function credentialFindingName(finding: UploadScanFinding): string {
  return finding.detail.slice(0, finding.detail.lastIndexOf(CREDENTIAL_POSITION_SEPARATOR));
}

/** Whether the credential detectors read this type's content at all; a binary type is not read. */
export function credentialScanReadsContent(declaredMime: string): boolean {
  return isTextualMime(declaredMime);
}

/**
 * The longest stretch of a file one credential detection is guaranteed to fit
 * in. The longest bounded detector match is the JWT pattern, 4,356 bytes. A
 * detector's other unbounded part is either a trailing run, which a shorter
 * match at the same start already satisfies, or the whitespace between a
 * keyword and its value, which this leaves about 16,000 bytes for.
 */
export const CREDENTIAL_SCAN_GUARD_BYTES = 16_384;

export interface CredentialScanRange {
  /** Where `bytes` starts in the file. */
  bytesStart: number;
  /** The part of the file this read answers for: a detection is reported when it starts here. */
  ownedStart: number;
  ownedEnd: number;
}

/**
 * The credential detections `scanUploadForCredentials` makes, over one window
 * of a file read in pieces. The window holds the owned range plus up to
 * `CREDENTIAL_SCAN_GUARD_BYTES` either side; only a detection that starts in
 * the owned range is reported, so owned ranges that tile the file report each
 * match once, a match that straddles the edge of one owned range included.
 */
export function scanUploadRangeForCredentials(
  bytes: Uint8Array,
  declaredMime: string,
  range: CredentialScanRange,
): UploadScanFinding[] {
  if (!isTextualMime(declaredMime)) return [];
  const before = range.ownedStart - range.bytesStart;
  const owned = range.ownedEnd - range.ownedStart;
  if (before < 0 || owned < 0 || before + owned > bytes.byteLength) {
    throw new RangeError('The owned range must lie inside the bytes read.');
  }
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const lead = decoder.decode(bytes.subarray(0, before), { stream: true });
  const middle = decoder.decode(bytes.subarray(before, before + owned), { stream: true });
  const tail = decoder.decode(bytes.subarray(before + owned));
  const findings: UploadScanFinding[] = [];
  const names = new Set<string>();
  const report = (parts: readonly [string, string, string], unseenOnly: boolean) => {
    const from = parts[0].length;
    const to = from + parts[1].length;
    for (const detection of scanForSecrets(parts.join(''), { includeHighEntropy: true })) {
      if (detection.position < from || detection.position >= to) continue;
      if (unseenOnly && names.has(detection.name)) continue;
      names.add(detection.name);
      findings.push(
        credentialFinding(detection.name, range.ownedStart + detection.position - from),
      );
    }
  };
  report([lead, middle, tail], false);
  if (
    lead.includes(NULL_CHARACTER) ||
    middle.includes(NULL_CHARACTER) ||
    tail.includes(NULL_CHARACTER)
  ) {
    report([withoutNulls(lead), withoutNulls(middle), withoutNulls(tail)], true);
  }
  return findings;
}

export function uploadFindingRejects(finding: UploadScanFinding): boolean {
  if (finding.code === 'sensitive_filename' || finding.code === 'unsafe_filename') return true;
  if (finding.code !== 'credential_material') return true;
  return isHighConfidenceSecretName(credentialFindingName(finding));
}

export function inspectUploadBytes(
  bytes: Uint8Array,
  declaredMime: string,
  readAsPdf = false,
): UploadScanResult {
  const mime = essenceOf(declaredMime);
  const findings: UploadScanFinding[] = [];

  for (const signature of EXECUTABLE_SIGNATURES) {
    if (startsWith(bytes, signature.bytes)) {
      findings.push({
        code: 'executable',
        detail: `Content is a ${signature.label} regardless of the declared type ${mime}`,
      });
    }
  }

  for (const signature of MAGIC_SIGNATURES) {
    if (!matchesMagic(bytes, signature)) continue;
    if (signature.mimes.length === 0) {
      if (mime.startsWith('image/') || mime.startsWith('text/')) {
        findings.push({
          code: 'type_confusion',
          detail: `Content is a ${signature.label} archive but was declared ${mime}`,
        });
      }
      continue;
    }
    if (!signature.mimes.includes(mime)) {
      findings.push({
        code: 'type_confusion',
        detail: `Content is ${signature.label} but was declared ${mime}`,
      });
    }
  }

  if (
    mime.startsWith('image/') &&
    mime !== 'image/svg+xml' &&
    bytes.length > 0 &&
    !MAGIC_SIGNATURES.some(
      (signature) => signature.mimes.includes(mime) && matchesMagic(bytes, signature),
    )
  ) {
    findings.push({
      code: 'type_confusion',
      detail: `Declared ${mime} but the bytes match no known image format`,
    });
  }

  if (mime === 'image/svg+xml') findings.push(...scanSvg(bytes));
  if (mime === 'application/pdf' || readAsPdf) findings.push(...scanPdf(bytes));

  return { ok: findings.length === 0, findings };
}

export interface UploadScannerStatus {
  configured: boolean;
  required: boolean;
}

/**
 * Production requires an external scanner unless an operator explicitly opts
 * out, so an unprovisioned deployment refuses uploads rather than admitting
 * unscanned bytes.
 */
export function uploadScannerStatus(): UploadScannerStatus {
  const configured = Boolean(process.env['UPLOAD_SCAN_WEBHOOK_URL']?.trim());
  const declared = process.env['UPLOAD_SCAN_REQUIRED']?.trim().toLowerCase();
  if (declared === 'true') return { configured, required: true };
  if (declared === 'false') return { configured, required: false };
  return { configured, required: process.env['NODE_ENV'] === 'production' };
}

let unconfiguredScannerReported = false;

async function runExternalScanner(bytes: Uint8Array): Promise<UploadScanFinding[]> {
  const endpoint = process.env['UPLOAD_SCAN_WEBHOOK_URL']?.trim();
  if (!endpoint) {
    const status = uploadScannerStatus();
    if (status.required) {
      return [
        {
          code: 'external_scanner',
          detail: 'A malware scanner is required for uploads and none is configured',
        },
      ];
    }
    if (!unconfiguredScannerReported && process.env['NODE_ENV'] === 'production') {
      unconfiguredScannerReported = true;
      logger.warn(
        { event: 'upload_scanner_unconfigured' },
        '[upload-scan] UPLOAD_SCAN_REQUIRED is off and no external malware scanner is configured; uploads get structural checks only',
      );
    }
    return [];
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        ...(process.env['UPLOAD_SCAN_WEBHOOK_TOKEN']
          ? { Authorization: `Bearer ${process.env['UPLOAD_SCAN_WEBHOOK_TOKEN']}` }
          : {}),
      },
      body: bytes as BodyInit,
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      return [{ code: 'external_scanner', detail: `Scanner returned ${response.status}` }];
    }
    const verdict = (await response.json()) as {
      safe?: unknown;
      detail?: unknown;
      reason?: unknown;
    };
    if (verdict.safe === true) return [];
    return [
      {
        code: verdict.reason === 'encrypted' ? 'encrypted_content' : 'external_scanner',
        detail:
          typeof verdict.detail === 'string' ? verdict.detail : 'Scanner reported the file unsafe',
      },
    ];
  } catch (error) {
    return [
      {
        code: 'external_scanner',
        detail: `Scanner unreachable: ${error instanceof Error ? error.message : 'unknown error'}`,
      },
    ];
  }
}

export const UPLOAD_REJECTED_MESSAGE =
  'This file could not be accepted because its contents failed a safety check.';

export const UPLOAD_ENCRYPTED_MESSAGE =
  'This file is password protected, so its contents could not be checked. Remove the password and upload it again.';

export const UPLOAD_SCAN_UNAVAILABLE_MESSAGE =
  "We couldn't check this file for safety. Try again later.";

export const UPLOAD_LIMITS_EXCEEDED_MESSAGE =
  "This file is too complex for us to check for safety, so it wasn't added. Try a smaller or simpler file.";

export const UPLOAD_STORAGE_FULL_MESSAGE =
  "There isn't enough storage left for this file. Delete files in your Library to make room.";

export const UPLOAD_CHANGED_DURING_CHECK_MESSAGE =
  'This file changed while we were checking it. Upload it again.';

const REFUSAL_COPY: Partial<Record<UploadScanFinding['code'], string>> = {
  encrypted_content: UPLOAD_ENCRYPTED_MESSAGE,
  limits_exceeded: UPLOAD_LIMITS_EXCEEDED_MESSAGE,
  scan_unavailable: UPLOAD_SCAN_UNAVAILABLE_MESSAGE,
  storage_full: UPLOAD_STORAGE_FULL_MESSAGE,
  changed_during_check: UPLOAD_CHANGED_DURING_CHECK_MESSAGE,
};

export function uploadRefusalMessage(
  findings: readonly UploadScanFinding[],
  fallback: string,
): string {
  for (const finding of findings) {
    const copy = REFUSAL_COPY[finding.code];
    if (typeof copy === 'string') return copy;
  }
  return fallback;
}

/**
 * For the routes that hold the bytes in one request. Nothing is stored yet, so
 * a rejection needs no purge, and the findings stay in the log rather than
 * telling the uploader which check to evade.
 */
export async function refuseUnsafeUpload(
  bytes: Uint8Array,
  declaredMime: string,
  position: UploadScanPosition,
): Promise<UploadScanResult> {
  const scan = await scanUploadBytes(bytes, declaredMime, position);
  if (!scan.ok) {
    logger.warn(
      {
        declaredMime,
        leadsObject: position.leadsObject,
        filename: position.filename ? sanitizeFilename(position.filename) : undefined,
        findings: scan.findings,
      },
      '[upload-scan] refused an upload that failed content inspection',
    );
    throw createError.validation(uploadRefusalMessage(scan.findings, UPLOAD_REJECTED_MESSAGE));
  }
  return scan;
}

/**
 * Where these bytes sit in the object. Structural inspection reads the
 * signature that leads a file, so it is meaningful only for the leading bytes:
 * part two of a PNG does not start with the PNG signature, and running the
 * whole-object check on it refuses every legitimate multi-part upload.
 */
export interface UploadScanPosition {
  leadsObject: boolean;
  filename?: string;
  /** Defaults to true. False only where the bytes are neither stored nor served; the call site says why. */
  externalScan?: boolean;
}

const NO_STRUCTURAL_FINDINGS: UploadScanResult = { ok: true, findings: [] };
const NO_EXTERNAL_FINDINGS: UploadScanFinding[] = [];

export const UPLOAD_INSPECTION_BYTES = 256_000;

function verdictOf(
  declaredMime: string,
  structural: readonly UploadScanFinding[],
  credentials: readonly UploadScanFinding[],
  external: readonly UploadScanFinding[],
): UploadScanResult {
  const findings = [...structural, ...credentials, ...external];

  const reported = credentials.filter((finding) => !uploadFindingRejects(finding));
  if (reported.length > 0) {
    logger.warn(
      { declaredMime, findings: reported.map((finding) => finding.detail) },
      '[upload-scan] upload carries material that looks like a credential',
    );
  }

  return { ok: findings.every((finding) => !uploadFindingRejects(finding)), findings };
}

/**
 * `credentialMime` is the type the credential detectors read the bytes as.
 * Where the product reads a file as text whatever type the client declared, it
 * passes a text type here, so the declared type cannot switch the detectors off.
 * `readAsPdf` does the same for the PDF active-content check: where a reader
 * opens the file as a PDF by its name, the check runs whatever type was declared.
 */
export function inspectUploadHead(
  bytes: Uint8Array,
  declaredMime: string,
  filename: string,
  credentialMime: string = declaredMime,
  readAsPdf = false,
): UploadScanResult {
  const head = bytes.subarray(0, UPLOAD_INSPECTION_BYTES);
  return verdictOf(
    declaredMime,
    inspectUploadBytes(head, declaredMime, readAsPdf).findings,
    scanUploadForCredentials(head, credentialMime, filename),
    NO_EXTERNAL_FINDINGS,
  );
}

export async function scanUploadBytes(
  bytes: Uint8Array,
  declaredMime: string,
  position: UploadScanPosition,
): Promise<UploadScanResult> {
  const { leadsObject, filename, externalScan = true } = position;
  const structural = leadsObject ? inspectUploadBytes(bytes, declaredMime) : NO_STRUCTURAL_FINDINGS;
  const credentials = scanUploadForCredentials(bytes, declaredMime, filename);
  const external = externalScan ? await runExternalScanner(bytes) : NO_EXTERNAL_FINDINGS;
  return verdictOf(declaredMime, structural.findings, credentials, external);
}
