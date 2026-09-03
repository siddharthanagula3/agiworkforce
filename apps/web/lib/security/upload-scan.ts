import 'server-only';

export interface UploadScanFinding {
  code:
    | 'type_confusion'
    | 'active_content_svg'
    | 'active_content_pdf'
    | 'executable'
    | 'archive_not_allowed'
    | 'external_scanner';
  detail: string;
}

export interface UploadScanResult {
  ok: boolean;
  findings: UploadScanFinding[];
}

const MAGIC_SIGNATURES: ReadonlyArray<{
  bytes: readonly number[];
  label: string;
  mimes: readonly string[];
}> = [
  { bytes: [0x25, 0x50, 0x44, 0x46], label: 'PDF', mimes: ['application/pdf'] },
  { bytes: [0xff, 0xd8, 0xff], label: 'JPEG', mimes: ['image/jpeg', 'image/jpg'] },
  { bytes: [0x89, 0x50, 0x4e, 0x47], label: 'PNG', mimes: ['image/png'] },
  { bytes: [0x47, 0x49, 0x46, 0x38], label: 'GIF', mimes: ['image/gif'] },
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

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, index) => bytes[index] === byte);
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

export async function scanUploadBytes(
  bytes: Uint8Array,
  declaredMime: string,
): Promise<UploadScanResult> {
  const structural = inspectUploadBytes(bytes, declaredMime);
  const external = await runExternalScanner(bytes);
  const findings = [...structural.findings, ...external];
  return { ok: findings.length === 0, findings };
}
