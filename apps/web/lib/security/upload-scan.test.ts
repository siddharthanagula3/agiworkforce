import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  UPLOAD_CHANGED_DURING_CHECK_MESSAGE,
  UPLOAD_ENCRYPTED_MESSAGE,
  UPLOAD_INSPECTION_BYTES,
  UPLOAD_LIMITS_EXCEEDED_MESSAGE,
  UPLOAD_REJECTED_MESSAGE,
  UPLOAD_SCAN_UNAVAILABLE_MESSAGE,
  UPLOAD_STORAGE_FULL_MESSAGE,
  type UploadScanFinding,
  inspectUploadBytes,
  inspectUploadHead,
  refuseUnsafeUpload,
  scanUploadBytes,
  scanUploadForCredentials,
  scanUploadRangeForCredentials,
  uploadFindingRejects,
  uploadRefusalMessage,
  uploadScannerStatus,
} from './upload-scan';

/**
 * Uploads reached a publicly-servable URL after only three checks, path
 * safety, a MIME allowlist, and a byte count, none of which open the file.
 * These cover the shapes that are dangerous specifically because of how this
 * product serves them.
 */

const bytes = (...values: number[]) => Uint8Array.from(values);
const utf8 = (text: string) => new TextEncoder().encode(text);

const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0);
const ZIP = bytes(0x50, 0x4b, 0x03, 0x04);
const PDF = utf8('%PDF-1.7\nharmless document body');
const WEBP = Uint8Array.from(
  Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64'),
);
const riff = (formType: string, firstChunk: string) =>
  Uint8Array.from([
    ...utf8('RIFF'),
    0x24,
    0x00,
    0x00,
    0x00,
    ...utf8(formType),
    ...utf8(firstChunk),
  ]);
const WAV = riff('WAVE', 'fmt ');
const AVI = riff('AVI ', 'LIST');

describe('inspectUploadBytes, honest files', () => {
  it.each([
    ['image/png', PNG],
    ['image/jpeg', JPEG],
    ['image/webp', WEBP],
    ['application/pdf', PDF],
  ])('accepts a real %s', (mime, content) => {
    expect(inspectUploadBytes(content, mime).ok).toBe(true);
  });

  it('accepts a plain text file', () => {
    expect(inspectUploadBytes(utf8('just some notes'), 'text/plain').ok).toBe(true);
  });

  it('tolerates a charset on the declared type', () => {
    expect(inspectUploadBytes(utf8('hello'), 'text/plain; charset=utf-8').ok).toBe(true);
  });
});

describe('inspectUploadBytes, type confusion', () => {
  it('rejects a ZIP disguised as a PNG', () => {
    const result = inspectUploadBytes(ZIP, 'image/png');
    expect(result.ok).toBe(false);
    expect(result.findings.some((f) => f.code === 'type_confusion')).toBe(true);
  });

  it('rejects a PDF disguised as a JPEG', () => {
    const result = inspectUploadBytes(PDF, 'image/jpeg');
    expect(result.ok).toBe(false);
    expect(result.findings.some((f) => f.code === 'type_confusion')).toBe(true);
  });

  it('rejects an image MIME whose bytes match no image format', () => {
    const result = inspectUploadBytes(utf8('not an image at all'), 'image/png');
    expect(result.ok).toBe(false);
  });
});

describe('inspectUploadBytes, WebP', () => {
  it('reads the fixture as the RIFF container a real WebP is', () => {
    expect(new TextDecoder().decode(WEBP.subarray(0, 4))).toBe('RIFF');
    expect(new TextDecoder().decode(WEBP.subarray(8, 12))).toBe('WEBP');
    expect(new DataView(WEBP.buffer).getUint32(4, true)).toBe(WEBP.length - 8);
  });

  it.each([
    ['WAV', WAV],
    ['AVI', AVI],
  ])('rejects a %s container declared as a WebP', (_label, content) => {
    const result = inspectUploadBytes(content, 'image/webp');
    expect(result.ok).toBe(false);
    expect(result.findings.map((finding) => finding.code)).toEqual(['type_confusion']);
  });

  it.each([
    ['WAV', WAV, 'audio/wav'],
    ['AVI', AVI, 'video/x-msvideo'],
  ])('does not mistake a %s declared as itself for an image', (_label, content, mime) => {
    expect(inspectUploadBytes(content, mime)).toEqual({ ok: true, findings: [] });
  });

  it.each([
    ['the container tag alone', WEBP.subarray(0, 4)],
    ['a header cut before the form type', WEBP.subarray(0, 8)],
    ['a header cut inside the form type', WEBP.subarray(0, 11)],
  ])('rejects %s', (_label, content) => {
    const result = inspectUploadBytes(content, 'image/webp');
    expect(result.ok).toBe(false);
    expect(result.findings.map((finding) => finding.code)).toEqual(['type_confusion']);
  });

  it('reads the form type at its own offset, not wherever the letters appear', () => {
    const misplaced = Uint8Array.from([...utf8('RIFF'), ...utf8('WEBP'), ...utf8('VP8L')]);

    expect(inspectUploadBytes(misplaced, 'image/webp').ok).toBe(false);
  });

  it('rejects a WebP disguised as a PNG and names what it really is', () => {
    const result = inspectUploadBytes(WEBP, 'image/png');
    expect(result.ok).toBe(false);
    expect(result.findings).toContainEqual({
      code: 'type_confusion',
      detail: 'Content is WebP but was declared image/png',
    });
  });

  it('lets a WebP attachment through the gate the upload routes call', async () => {
    const result = await scanUploadBytes(WEBP, 'image/webp', {
      leadsObject: true,
      filename: 'photo.webp',
    });

    expect(result).toEqual({ ok: true, findings: [] });
  });
});

describe('inspectUploadBytes, executables', () => {
  it.each([
    ['DOS/PE', bytes(0x4d, 0x5a, 0x90, 0x00)],
    ['ELF', bytes(0x7f, 0x45, 0x4c, 0x46)],
    ['Mach-O', bytes(0xcf, 0xfa, 0xed, 0xfe)],
    ['shebang script', utf8('#!/bin/sh\nrm -rf /')],
  ])('rejects a %s however it is declared', (_label, content) => {
    const result = inspectUploadBytes(content, 'text/plain');
    expect(result.ok).toBe(false);
    expect(result.findings.some((f) => f.code === 'executable')).toBe(true);
  });
});

describe('inspectUploadBytes, SVG active content', () => {
  it('accepts a static SVG', () => {
    const svg = utf8(
      '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>',
    );
    expect(inspectUploadBytes(svg, 'image/svg+xml').ok).toBe(true);
  });

  it.each([
    ['script element', '<svg><script>fetch("/api/me")</script></svg>'],
    ['inline handler', '<svg><rect onload="alert(1)"/></svg>'],
    ['javascript: URL', '<svg><a href="javascript:alert(1)">x</a></svg>'],
    ['foreignObject', '<svg><foreignObject><iframe src="x"/></foreignObject></svg>'],
  ])('rejects an SVG carrying a %s', (_label, markup) => {
    const result = inspectUploadBytes(utf8(markup), 'image/svg+xml');
    expect(result.ok).toBe(false);
    expect(result.findings.some((f) => f.code === 'active_content_svg')).toBe(true);
  });

  it('is case-insensitive, so uppercase markup cannot evade it', () => {
    const result = inspectUploadBytes(utf8('<SVG><SCRIPT>x</SCRIPT></SVG>'), 'image/svg+xml');
    expect(result.ok).toBe(false);
  });

  it.each([
    ['script with a solidus separator', '<svg><script/src="https://evil.test/x.js"></svg>'],
    ['handler after a solidus', '<svg/onload=alert(1)>'],
    ['foreignObject with a solidus', '<svg><foreignobject/x></svg>'],
  ])('rejects %s, which the [\\s>] classes used to miss', (_label, markup) => {
    const result = inspectUploadBytes(utf8(markup), 'image/svg+xml');
    expect(result.ok).toBe(false);
    expect(result.findings.some((f) => f.code === 'active_content_svg')).toBe(true);
  });
});

describe('inspectUploadBytes, PDF active content', () => {
  it.each([
    ['JavaScript', '%PDF-1.7\n/OpenAction << /S /JavaScript /JS (app.alert(1)) >>'],
    ['launch action', '%PDF-1.7\n<< /S /Launch /F (cmd.exe) >>'],
    ['embedded file', '%PDF-1.7\n/EmbeddedFile 12 0 R'],
  ])('rejects a PDF containing %s', (_label, content) => {
    const result = inspectUploadBytes(utf8(content), 'application/pdf');
    expect(result.ok).toBe(false);
    expect(result.findings.some((f) => f.code === 'active_content_pdf')).toBe(true);
  });
});

describe('inspectUploadBytes, reporting', () => {
  it('reports every distinct problem rather than stopping at the first', () => {
    const result = inspectUploadBytes(utf8('#!/bin/sh\necho hi'), 'image/png');
    expect(result.findings.length).toBeGreaterThan(1);
    expect(result.findings.some((f) => f.code === 'executable')).toBe(true);
    expect(result.findings.some((f) => f.code === 'type_confusion')).toBe(true);
  });

  it('handles an empty file without throwing', () => {
    expect(() => inspectUploadBytes(new Uint8Array(), 'image/png')).not.toThrow();
  });
});

describe('scanUploadBytes, external scanner requirement', () => {
  it('refuses an upload when a scanner is required and none is configured', async () => {
    vi.stubEnv('UPLOAD_SCAN_WEBHOOK_URL', '');
    vi.stubEnv('UPLOAD_SCAN_REQUIRED', 'true');
    try {
      const { scanUploadBytes } = await import('./upload-scan');
      const result = await scanUploadBytes(utf8('just some notes'), 'text/plain', {
        leadsObject: true,
      });
      expect(result.ok).toBe(false);
      expect(result.findings.map((finding) => finding.code)).toEqual(['external_scanner']);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('keeps structural checks only when no scanner is configured or required', async () => {
    vi.stubEnv('UPLOAD_SCAN_WEBHOOK_URL', '');
    vi.stubEnv('UPLOAD_SCAN_REQUIRED', '');
    try {
      const { scanUploadBytes, uploadScannerStatus } = await import('./upload-scan');
      expect(uploadScannerStatus()).toEqual({ configured: false, required: false });
      expect(
        (await scanUploadBytes(utf8('just some notes'), 'text/plain', { leadsObject: true })).ok,
      ).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('fails closed when the configured scanner rejects the file', async () => {
    vi.stubEnv('UPLOAD_SCAN_WEBHOOK_URL', 'https://scanner.example.test/scan');
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ safe: false, detail: 'Eicar test signature' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    try {
      const { scanUploadBytes } = await import('./upload-scan');
      const result = await scanUploadBytes(utf8('X5O!P%@AP'), 'text/plain', { leadsObject: true });
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(result.findings).toEqual([
        { code: 'external_scanner', detail: 'Eicar test signature' },
      ]);
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });
  it('asks for the password to be removed when the scanner could not open the file', async () => {
    vi.stubEnv('UPLOAD_SCAN_WEBHOOK_URL', 'https://scanner.example.test/scan');
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              safe: false,
              detail: 'ClamAV detected Heuristics.Encrypted.PDF',
              reason: 'encrypted',
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
      ),
    );
    try {
      const { refuseUnsafeUpload } = await import('./upload-scan');
      const refusal = await refuseUnsafeUpload(PDF, 'application/pdf', {
        leadsObject: true,
        filename: 'statement.pdf',
      }).catch((error: unknown) => error);
      expect((refusal as Error).message).toContain('Remove the password and upload it again.');
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });
});

describe('the external scanner opt-out', () => {
  async function scanWithWebhook(position: { leadsObject: boolean; externalScan?: boolean }) {
    vi.stubEnv('UPLOAD_SCAN_WEBHOOK_URL', 'https://scanner.example.test/scan');
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ safe: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    try {
      const { scanUploadBytes } = await import('./upload-scan');
      const result = await scanUploadBytes(utf8('just some notes'), 'text/plain', position);
      return { fetchMock, result };
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  }

  it('calls the configured scanner when nothing opts out', async () => {
    const { fetchMock } = await scanWithWebhook({ leadsObject: true });

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('skips the round trip when the call site opts out', async () => {
    const { fetchMock, result } = await scanWithWebhook({ leadsObject: true, externalScan: false });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });

  it('keeps the structural check when the round trip is skipped', async () => {
    const executable = bytes(0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00);

    const result = await scanUploadBytes(executable, 'audio/mpeg', {
      leadsObject: true,
      externalScan: false,
    });

    expect(result.ok).toBe(false);
    expect(result.findings.map((finding) => finding.code)).toContain('executable');
  });
});

describe('credential material in an upload', () => {
  const bytesOf = (text: string) => new TextEncoder().encode(text);

  it('rejects a text upload carrying a recognised live credential', async () => {
    const result = await scanUploadBytes(
      bytesOf(`STRIPE_SECRET_KEY=sk_live_${'EXAMPLE'.repeat(4)}\n`),
      'text/plain',
      { leadsObject: true, filename: 'notes.txt' },
    );

    expect(result.ok).toBe(false);
    expect(result.findings.map((finding) => finding.code)).toContain('credential_material');
  });

  it('rejects a file whose name is itself a credential file', async () => {
    const result = await scanUploadBytes(bytesOf('nothing to see'), 'text/plain', {
      leadsObject: true,
      filename: '.env.production',
    });

    expect(result.ok).toBe(false);
    expect(result.findings.map((finding) => finding.code)).toContain('sensitive_filename');
  });

  it.each(['secret.txt', 'secrets.json', 'customer-credentials.csv', 'Credentials.txt'])(
    'accepts an ordinary document named %s when its contents hold no key',
    async (filename) => {
      const result = await scanUploadBytes(
        bytesOf('Internal memo. The launch code is PURPLE-42.'),
        'text/plain',
        {
          leadsObject: true,
          filename,
        },
      );

      expect(result).toEqual({ ok: true, findings: [] });
    },
  );

  it('still refuses a document named secrets.json that holds a recognised key', async () => {
    const result = await scanUploadBytes(
      bytesOf(`{"stripe": "sk_live_${'EXAMPLE'.repeat(4)}"}`),
      'application/json',
      { leadsObject: true, filename: 'secrets.json' },
    );

    expect(result.ok).toBe(false);
    expect(result.findings.map((finding) => finding.code)).toContain('credential_material');
  });

  it('rejects terraform state by name, because its contents are provider secrets', async () => {
    const result = await scanUploadBytes(bytesOf('{}'), 'application/json', {
      leadsObject: true,
      filename: 'terraform.tfstate',
    });

    expect(result.findings.map((finding) => finding.code)).toContain('sensitive_filename');
    expect(result.ok).toBe(false);
  });

  it('reports an unrecognised high-entropy token without refusing the upload', async () => {
    const result = await scanUploadBytes(
      bytesOf('value = "Xk7pQ2vLm9RtZa4YbW3CnH8sJfE6dU1gOiPy5N0qBx"\n'),
      'text/plain',
      { leadsObject: true, filename: 'config.txt' },
    );

    expect(result.ok).toBe(true);
    expect(result.findings.map((finding) => finding.code)).toContain('credential_material');
  });

  it('leaves a clean text upload alone', async () => {
    const result = await scanUploadBytes(bytesOf('a perfectly ordinary note\n'), 'text/plain', {
      leadsObject: true,
      filename: 'a.txt',
    });

    expect(result).toEqual({ ok: true, findings: [] });
  });

  it('scans a textual type declared with parameters or in capitals', () => {
    const body = bytesOf(`STRIPE_SECRET_KEY=sk_live_${'EXAMPLE'.repeat(4)}\n`);

    for (const mime of ['application/json; charset=utf-8', 'Application/JSON']) {
      expect(
        scanUploadForCredentials(body, mime, 'keys.json').map((finding) => finding.code),
      ).toContain('credential_material');
    }
  });

  it('does not scan binary bytes for credentials', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    expect(scanUploadForCredentials(png, 'image/png', 'a.png')).toEqual([]);
  });
});

describe('a file name that carries a path', () => {
  it('rejects the upload rather than storing it under a rewritten name', async () => {
    const result = await scanUploadBytes(utf8('notes'), 'text/plain', {
      leadsObject: true,
      filename: '../../etc/passwd',
    });

    expect(result.ok).toBe(false);
    expect(result.findings.map((finding) => finding.code)).toContain('unsafe_filename');
  });

  it('matches a credential file name through the traversal that hid it', async () => {
    const result = await scanUploadBytes(utf8('nothing'), 'text/plain', {
      leadsObject: true,
      filename: 'a/b/../.env.production',
    });

    expect(result.findings.map((finding) => finding.code)).toContain('sensitive_filename');
    expect(result.ok).toBe(false);
  });
});

describe('external scanner requirement', () => {
  it('requires a scanner in production when the operator has said nothing', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPLOAD_SCAN_WEBHOOK_URL', '');
    vi.stubEnv('UPLOAD_SCAN_REQUIRED', '');

    expect(uploadScannerStatus()).toEqual({ configured: false, required: true });
    const result = await scanUploadBytes(utf8('ordinary note'), 'text/plain', {
      leadsObject: true,
      filename: 'a.txt',
    });
    expect(result.ok).toBe(false);
    expect(result.findings.map((finding) => finding.code)).toContain('external_scanner');

    vi.unstubAllEnvs();
  });

  it('admits the file only when an operator opts out explicitly', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPLOAD_SCAN_WEBHOOK_URL', '');
    vi.stubEnv('UPLOAD_SCAN_REQUIRED', 'false');

    expect(uploadScannerStatus()).toEqual({ configured: false, required: false });
    expect(
      (
        await scanUploadBytes(utf8('ordinary note'), 'text/plain', {
          leadsObject: true,
          filename: 'a.txt',
        })
      ).ok,
    ).toBe(true);

    vi.unstubAllEnvs();
  });

  it('leaves development unblocked', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('UPLOAD_SCAN_WEBHOOK_URL', '');
    vi.stubEnv('UPLOAD_SCAN_REQUIRED', '');

    expect(uploadScannerStatus()).toEqual({ configured: false, required: false });

    vi.unstubAllEnvs();
  });
});

describe('refuseUnsafeUpload, the gate the single-request routes call', () => {
  it('returns the scan when the bytes are what they claim to be', async () => {
    await expect(
      refuseUnsafeUpload(PNG, 'image/png', { leadsObject: true, filename: 'logo.png' }),
    ).resolves.toMatchObject({
      ok: true,
    });
  });

  it('refuses an executable wearing an image name', async () => {
    const executable = bytes(0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00);

    const refusal = await refuseUnsafeUpload(executable, 'image/png', {
      leadsObject: true,
      filename: 'avatar.png',
    }).catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(Error);
    expect((refusal as Error).message).toBe(UPLOAD_REJECTED_MESSAGE);
  });

  it('refuses a bundle carrying a live key and never names the key back', async () => {
    const bundle = utf8('---\nname: helper\n---\nuse AWS_SECRET_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE\n');

    const refusal = await refuseUnsafeUpload(bundle, 'text/markdown', {
      leadsObject: true,
      filename: 'skill.md',
    }).catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(Error);
    expect((refusal as Error).message).toBe(UPLOAD_REJECTED_MESSAGE);
    expect((refusal as Error).message).not.toContain('AKIA');
  });
});

describe('where the bytes sit in the object', () => {
  const MZ = bytes(0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00);
  // Interior bytes of a real file: no signature leads them, which is the whole
  // point of the distinction.
  const CONTINUATION = bytes(0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x62, 0x00);

  it('refuses a leading part whose bytes contradict the declared type', async () => {
    const result = await scanUploadBytes(CONTINUATION, 'image/png', { leadsObject: true });

    expect(result.ok).toBe(false);
    expect(result.findings.map((finding) => finding.code)).toContain('type_confusion');
  });

  it('accepts the same bytes as a continuation, so a multi-part upload survives', async () => {
    const result = await scanUploadBytes(CONTINUATION, 'image/png', { leadsObject: false });

    expect(result).toEqual({ ok: true, findings: [] });
  });

  it('accepts a continuation that happens to begin with the executable signature', async () => {
    expect((await scanUploadBytes(MZ, 'video/mp4', { leadsObject: false })).ok).toBe(true);
    expect((await scanUploadBytes(MZ, 'video/mp4', { leadsObject: true })).ok).toBe(false);
  });

  it('still reads a continuation for credentials, because a secret sits anywhere', async () => {
    const leaked = utf8('AWS_SECRET_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE\n');

    const result = await scanUploadBytes(leaked, 'text/plain', { leadsObject: false });

    expect(result.ok).toBe(false);
    expect(result.findings.map((finding) => finding.code)).toContain('credential_material');
  });

  it('catches a secret that only exists once the parts are joined', async () => {
    const key = `sk_live_${'EXAMPLE'.repeat(4)}`;
    const head = utf8(`STRIPE_SECRET_KEY=${key.slice(0, 12)}`);
    const tail = utf8(`${key.slice(12)}\n`);

    const asParts = await Promise.all([
      scanUploadBytes(head, 'text/plain', { leadsObject: true }),
      scanUploadBytes(tail, 'text/plain', { leadsObject: false }),
    ]);
    const assembled = await scanUploadBytes(Uint8Array.from([...head, ...tail]), 'text/plain', {
      leadsObject: true,
    });

    expect(asParts.every((part) => part.ok)).toBe(true);
    expect(assembled.ok).toBe(false);
    expect(assembled.findings.map((finding) => finding.code)).toContain('credential_material');
  });
});

describe('inspectUploadHead', () => {
  const MZ = bytes(0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00);
  const SVG_WITH_SCRIPT = utf8(
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
  );
  const PDF_WITH_SCRIPT = utf8('%PDF-1.7\n1 0 obj << /JavaScript (app.alert(1)) >> endobj');

  it.each([
    ['an honest PNG', PNG, 'image/png'],
    ['an honest JPEG', JPEG, 'image/jpeg'],
    ['an honest PDF', PDF, 'application/pdf'],
    ['an honest WebP', WEBP, 'image/webp'],
    ['a JPEG declared as PNG', JPEG, 'image/png'],
    ['an executable declared as an image', MZ, 'image/png'],
    ['an archive declared as text', ZIP, 'text/plain'],
    ['an SVG that runs script', SVG_WITH_SCRIPT, 'image/svg+xml'],
    ['a PDF that embeds JavaScript', PDF_WITH_SCRIPT, 'application/pdf'],
    ['plain text', utf8('notes for the meeting'), 'text/plain'],
  ])('gives the findings inspectUploadBytes gives for %s', (_label, input, mime) => {
    const head = inspectUploadHead(input, mime, 'file.bin');
    const whole = inspectUploadBytes(input, mime);

    expect(head.findings).toEqual(whole.findings);
    expect(head.ok).toBe(whole.ok);
  });

  it('gives the findings scanUploadBytes gives without the external scan, credentials and file name included', async () => {
    const leaked = utf8('STRIPE_SECRET_KEY=sk_live_' + 'EXAMPLE'.repeat(4) + '\n');
    const cases: Array<[Uint8Array, string, string]> = [
      [leaked, 'text/plain', 'notes.txt'],
      [utf8('nothing to see'), 'text/plain', '.env.production'],
      [utf8('notes'), 'text/plain', '../../etc/passwd'],
      [MZ, 'image/png', 'avatar.png'],
      [PNG, 'image/png', 'logo.png'],
    ];

    for (const [input, mime, filename] of cases) {
      const head = inspectUploadHead(input, mime, filename);
      const scanned = await scanUploadBytes(input, mime, {
        leadsObject: true,
        filename,
        externalScan: false,
      });
      expect(head).toEqual(scanned);
    }
  });

  it('refuses a credential file name and a path posing as a name', () => {
    expect(inspectUploadHead(utf8('x'), 'text/plain', '.env.production').ok).toBe(false);
    expect(
      inspectUploadHead(utf8('x'), 'text/plain', '../../etc/passwd').findings.map(
        (finding) => finding.code,
      ),
    ).toContain('unsafe_filename');
  });

  it('inspects the first UPLOAD_INSPECTION_BYTES and nothing after them', () => {
    expect(UPLOAD_INSPECTION_BYTES).toBe(256_000);
    const secret = utf8('STRIPE_SECRET_KEY=sk_live_' + 'EXAMPLE'.repeat(4) + '\n');
    const padding = (length: number) => new Uint8Array(length).fill(0x20);

    const inside = Uint8Array.from([...padding(UPLOAD_INSPECTION_BYTES - 200), ...secret]);
    const beyond = Uint8Array.from([...padding(UPLOAD_INSPECTION_BYTES + 10), ...secret]);

    expect(inspectUploadHead(inside, 'text/plain', 'a.txt').ok).toBe(false);
    expect(inspectUploadHead(beyond, 'text/plain', 'a.txt').ok).toBe(true);
    expect(inspectUploadHead(beyond, 'text/plain', 'a.txt')).toEqual(
      inspectUploadHead(beyond.subarray(0, UPLOAD_INSPECTION_BYTES), 'text/plain', 'a.txt'),
    );
  });

  it('never calls the external scanner, even when one is required or configured', () => {
    vi.stubEnv('UPLOAD_SCAN_WEBHOOK_URL', 'https://scanner.example.test/scan');
    vi.stubEnv('UPLOAD_SCAN_REQUIRED', 'true');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    try {
      const result = inspectUploadHead(utf8('just some notes'), 'text/plain', 'notes.txt');
      expect(result).toEqual({ ok: true, findings: [] });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }

    vi.stubEnv('UPLOAD_SCAN_WEBHOOK_URL', '');
    vi.stubEnv('UPLOAD_SCAN_REQUIRED', 'true');
    try {
      expect(
        inspectUploadHead(utf8('just some notes'), 'text/plain', 'notes.txt').findings,
      ).toEqual([]);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe('uploadRefusalMessage, the copy for the large file refusals', () => {
  const finding = (code: UploadScanFinding['code']): UploadScanFinding => ({ code, detail: code });

  it.each([
    [
      'scan_unavailable',
      UPLOAD_SCAN_UNAVAILABLE_MESSAGE,
      "We couldn't check this file for safety. Try again later.",
    ],
    [
      'limits_exceeded',
      UPLOAD_LIMITS_EXCEEDED_MESSAGE,
      "This file is too complex for us to check for safety, so it wasn't added. Try a smaller or simpler file.",
    ],
    [
      'storage_full',
      UPLOAD_STORAGE_FULL_MESSAGE,
      "There isn't enough storage left for this file. Delete files in your Library to make room.",
    ],
    [
      'changed_during_check',
      UPLOAD_CHANGED_DURING_CHECK_MESSAGE,
      'This file changed while we were checking it. Upload it again.',
    ],
  ] as const)('answers %s with its own copy', (code, constant, copy) => {
    expect(constant).toBe(copy);
    expect(uploadRefusalMessage([finding(code)], 'fallback')).toBe(copy);
  });

  it('keeps the encrypted copy and the fallback for every other finding', () => {
    expect(uploadRefusalMessage([finding('encrypted_content')], 'fallback')).toBe(
      UPLOAD_ENCRYPTED_MESSAGE,
    );
    expect(uploadRefusalMessage([finding('executable')], 'fallback')).toBe('fallback');
    expect(uploadRefusalMessage([], 'fallback')).toBe('fallback');
  });

  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])(
    'answers the fallback for the code %s that is not one of ours',
    (code) => {
      const stray = { code, detail: code } as unknown as UploadScanFinding;
      expect(uploadRefusalMessage([stray], 'fallback')).toBe('fallback');
      expect(uploadRefusalMessage([stray, finding('storage_full')], 'fallback')).toBe(
        UPLOAD_STORAGE_FULL_MESSAGE,
      );
    },
  );

  it('treats each of the new codes as a refusal, never as a report', () => {
    for (const code of [
      'scan_unavailable',
      'limits_exceeded',
      'storage_full',
      'changed_during_check',
    ] as const) {
      expect(uploadFindingRejects(finding(code))).toBe(true);
    }
  });

  it('carries no em dash in any copy', () => {
    for (const copy of [
      UPLOAD_SCAN_UNAVAILABLE_MESSAGE,
      UPLOAD_LIMITS_EXCEEDED_MESSAGE,
      UPLOAD_STORAGE_FULL_MESSAGE,
      UPLOAD_CHANGED_DURING_CHECK_MESSAGE,
    ]) {
      expect(copy).not.toContain(String.fromCharCode(0x2014));
    }
  });
});

describe('text whose credential only exists once its null characters are gone', () => {
  const KEY = `sk_live_${'EXAMPLE'.repeat(4)}`;
  const utf16 = (text: string) => new Uint8Array(Buffer.from(text, 'utf16le'));
  const credentials = (findings: readonly UploadScanFinding[]) =>
    findings.filter((finding) => finding.code === 'credential_material');

  it('finds a key written as UTF-16 with no byte-order mark, which reads as UTF-8 with a null after each character', () => {
    const findings = credentials(
      scanUploadForCredentials(utf16(`notes\nkey ${KEY}\n`), 'text/plain', 'notes.txt'),
    );

    expect(findings).toHaveLength(1);
    expect(uploadFindingRejects(findings[0]!)).toBe(true);
  });

  it('finds a key with one null inside it, and reports a key readable either way once', () => {
    const broken = `${KEY.slice(0, 12)}\u0000${KEY.slice(12)}`;

    expect(credentials(scanUploadForCredentials(utf8(broken), 'text/plain'))).toHaveLength(1);
    expect(
      credentials(scanUploadForCredentials(utf8(`${KEY}\n\u0000trailing`), 'text/plain')),
    ).toHaveLength(1);
  });

  it('reports such a key from the window that owns its start and from no other', () => {
    const filler = utf16('the quick brown fox jumps over the lazy dog\n'.repeat(40));
    const key = utf16(`${KEY}\n`);
    const bytes = new Uint8Array(filler.byteLength * 2 + key.byteLength);
    bytes.set(filler, 0);
    bytes.set(key, filler.byteLength);
    bytes.set(filler, filler.byteLength + key.byteLength);
    const scan = (ownedStart: number, ownedEnd: number) =>
      credentials(
        scanUploadRangeForCredentials(bytes, 'text/plain', { bytesStart: 0, ownedStart, ownedEnd }),
      );

    expect(scan(0, filler.byteLength)).toEqual([]);
    expect(scan(filler.byteLength, filler.byteLength + key.byteLength)).toHaveLength(1);
    expect(scan(filler.byteLength + key.byteLength, bytes.byteLength)).toEqual([]);
  });

  it('reads text with no null character exactly as before', () => {
    const plain = utf8(`key ${KEY}\n`);

    expect(credentials(scanUploadForCredentials(plain, 'text/plain'))).toHaveLength(1);
    expect(
      credentials(
        scanUploadRangeForCredentials(plain, 'text/plain', {
          bytesStart: 0,
          ownedStart: 0,
          ownedEnd: plain.byteLength,
        }),
      ),
    ).toHaveLength(1);
  });
});
