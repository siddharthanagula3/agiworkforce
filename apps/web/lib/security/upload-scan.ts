import 'server-only';

/**
 * Content inspection for user uploads.
 *
 * Uploads previously reached a publicly-servable URL after only three checks:
 * storage-key path safety, a MIME allowlist, and a byte-count match. None of
 * those look at the BYTES, so a file whose declared type disagrees with its
 * actual content — the classic type-confusion vector — passed cleanly.
 *
 * This scans the real bytes. It is deliberately signature- and
 * structure-based rather than a virus-definition database: the checks below
 * catch the file shapes that are dangerous *because of how this product serves
 * them* (an SVG that runs script when rendered, a PDF that auto-executes on
 * open, a disguised executable), which is a different and more tractable
 * problem than general antivirus.
 *
 * An external AV service can be layered on top via `scanUploadBytes`'s hook —
 * see `UPLOAD_SCAN_WEBHOOK_URL` below — but the product is not left defenceless
 * while that is unconfigured.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * KNOWN LIMITATION, needs a product decision — see docs/agent-context/known-flaws.md
 *
 * The R2 bucket is PUBLIC by design (zero egress cost), so an object is
 * world-readable the instant the client's presigned PUT lands — BEFORE this
 * scanner ever runs at `/complete`. Scanning here therefore cannot prevent
 * exposure; it can only refuse to register the asset and delete the object,
 * which shrinks the window from "forever" to "seconds" and stops the file being
 * reachable through `/api/files/[id]` or any share link.
 *
 * Closing the window entirely requires one of:
 *   (a) making the bucket private and proxying every read through the already
 *       auth-gated `/api/files/[id]` — costs egress, or
 *   (b) scanning at presign time, which means proxying the upload through the
 *       server and giving up direct-to-R2 uploads (Vercel caps bodies ~4.5MB).
 * Both are cost/architecture calls, not code changes.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface UploadScanFinding {
  /** Stable machine-readable reason, safe to log. */
  code:
    | 'type_confusion'
    | 'active_content_svg'
    | 'active_content_pdf'
    | 'executable'
    | 'archive_not_allowed'
    | 'external_scanner';
  /** Operator-facing detail. NEVER returned to the uploader verbatim. */
  detail: string;
}

export interface UploadScanResult {
  ok: boolean;
  findings: UploadScanFinding[];
}

/** Leading bytes that identify a format regardless of the declared MIME type. */
const MAGIC_SIGNATURES: ReadonlyArray<{
  bytes: readonly number[];
  label: string;
  /** MIME types this signature legitimately belongs to. */
  mimes: readonly string[];
}> = [
  { bytes: [0x25, 0x50, 0x44, 0x46], label: 'PDF', mimes: ['application/pdf'] },
  { bytes: [0xff, 0xd8, 0xff], label: 'JPEG', mimes: ['image/jpeg', 'image/jpg'] },
  { bytes: [0x89, 0x50, 0x4e, 0x47], label: 'PNG', mimes: ['image/png'] },
  { bytes: [0x47, 0x49, 0x46, 0x38], label: 'GIF', mimes: ['image/gif'] },
  // ZIP container. Legitimate for Office/archive types; NOT for an image.
  { bytes: [0x50, 0x4b, 0x03, 0x04], label: 'ZIP', mimes: [] },
];

/** Executable formats that must never be served, whatever they claim to be. */
const EXECUTABLE_SIGNATURES: ReadonlyArray<{ bytes: readonly number[]; label: string }> = [
  { bytes: [0x4d, 0x5a], label: 'DOS/PE executable' },
  { bytes: [0x7f, 0x45, 0x4c, 0x46], label: 'ELF executable' },
  { bytes: [0xcf, 0xfa, 0xed, 0xfe], label: 'Mach-O executable' },
  { bytes: [0xce, 0xfa, 0xed, 0xfe], label: 'Mach-O executable' },
  { bytes: [0xca, 0xfe, 0xba, 0xbe], label: 'Mach-O fat binary' },
  { bytes: [0x23, 0x21], label: 'script shebang' },
];

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, index) => bytes[index] === byte);
}

/** Decode a bounded prefix as UTF-8 for textual inspection. */
function textPrefix(bytes: Uint8Array, limit = 64_000): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, limit));
}

/**
 * SVG is XML that browsers EXECUTE. An `<script>` element, an `on*` handler, or
 * a `javascript:` URL inside one runs in the origin that renders it, which is
 * why an SVG upload is materially different from a PNG upload.
 */
function scanSvg(bytes: Uint8Array): UploadScanFinding[] {
  const text = textPrefix(bytes).toLowerCase();
  const findings: UploadScanFinding[] = [];
  if (/<script[\s>]/.test(text)) {
    findings.push({ code: 'active_content_svg', detail: 'SVG contains a <script> element' });
  }
  if (/\son\w+\s*=/.test(text)) {
    findings.push({ code: 'active_content_svg', detail: 'SVG contains an inline event handler' });
  }
  if (/javascript:/.test(text)) {
    findings.push({ code: 'active_content_svg', detail: 'SVG contains a javascript: URL' });
  }
  if (/<foreignobject[\s>]/.test(text)) {
    findings.push({ code: 'active_content_svg', detail: 'SVG contains <foreignObject>' });
  }
  return findings;
}

/**
 * PDFs can auto-run on open. `/OpenAction` with `/JavaScript`, `/Launch`, and
 * embedded files are the constructs that turn "the user previewed a document"
 * into code execution in some readers.
 */
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

/**
 * Inspect the real bytes of an upload.
 *
 * `declaredMime` is what the client SAID the file is — it is the claim being
 * checked, never the basis for the check.
 */
export function inspectUploadBytes(bytes: Uint8Array, declaredMime: string): UploadScanResult {
  const mime = declaredMime.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  const findings: UploadScanFinding[] = [];

  for (const signature of EXECUTABLE_SIGNATURES) {
    if (startsWith(bytes, signature.bytes)) {
      findings.push({
        code: 'executable',
        detail: `Content is a ${signature.label} regardless of the declared type ${mime}`,
      });
    }
  }

  // Type confusion: the bytes identify a format the declared MIME does not
  // allow. A PNG that is really a ZIP is the canonical polyglot payload.
  for (const signature of MAGIC_SIGNATURES) {
    if (!startsWith(bytes, signature.bytes)) continue;
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

  // An image MIME whose bytes match no known image signature is either
  // corrupt or disguised; neither should be served as an image.
  if (
    mime.startsWith('image/') &&
    mime !== 'image/svg+xml' &&
    bytes.length > 0 &&
    !MAGIC_SIGNATURES.some(
      (signature) => signature.mimes.includes(mime) && startsWith(bytes, signature.bytes),
    )
  ) {
    findings.push({
      code: 'type_confusion',
      detail: `Declared ${mime} but the bytes match no known image format`,
    });
  }

  if (mime === 'image/svg+xml') findings.push(...scanSvg(bytes));
  if (mime === 'application/pdf') findings.push(...scanPdf(bytes));

  return { ok: findings.length === 0, findings };
}

/**
 * Optional external scanner.
 *
 * `UPLOAD_SCAN_WEBHOOK_URL` receives the bytes and answers `{ "safe": bool }`.
 * Unconfigured is the default and is NOT treated as a failure — the structural
 * checks above still run, so the product degrades to "no AV" rather than "no
 * scanning at all".
 *
 * FAIL-CLOSED when configured: an operator who wires a scanner is asserting
 * that uploads must be scanned, so a scanner that errors or times out rejects
 * the upload rather than waving it through.
 */
async function runExternalScanner(bytes: Uint8Array): Promise<UploadScanFinding[]> {
  const endpoint = process.env['UPLOAD_SCAN_WEBHOOK_URL'];
  if (!endpoint) return [];

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
    const verdict = (await response.json()) as { safe?: unknown; detail?: unknown };
    if (verdict.safe === true) return [];
    return [
      {
        code: 'external_scanner',
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

/** Structural inspection plus the optional external scanner. */
export async function scanUploadBytes(
  bytes: Uint8Array,
  declaredMime: string,
): Promise<UploadScanResult> {
  const structural = inspectUploadBytes(bytes, declaredMime);
  const external = await runExternalScanner(bytes);
  const findings = [...structural.findings, ...external];
  return { ok: findings.length === 0, findings };
}
