import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  UPLOAD_REJECTED_MESSAGE,
  inspectUploadBytes,
  refuseUnsafeUpload,
  scanUploadBytes,
  scanUploadForCredentials,
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

describe('inspectUploadBytes, honest files', () => {
  it.each([
    ['image/png', PNG],
    ['image/jpeg', JPEG],
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
