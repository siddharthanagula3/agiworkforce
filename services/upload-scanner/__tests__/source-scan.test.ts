import { randomBytes } from 'node:crypto';
import { createServer, type AddressInfo } from 'node:net';
import { describe, expect, it, vi } from 'vitest';

import { SOURCE_SCAN_DEFAULTS } from '../src/config.ts';
import type { SignatureStatus } from '../src/clamd.ts';
import { checkSourceUrl } from '../src/source-fetch.ts';
import {
  createPdfActiveContentDetector,
  createSourceScanLiveness,
  runSourceScan,
  scanDeadlineMs,
  signatureReason,
  type LiveScanEnd,
} from '../src/source-scan.ts';
import { startFakeClamd } from './fake-clamd.ts';
import { startFakeSource } from './fake-source.ts';

const HOSTS = ['storage.test-bucket.example'];
const MIB = 1024 * 1024;
const GOOD: SignatureStatus = {
  engine: '1.4.6',
  version: 27790,
  publishedAt: new Date('2026-09-28T04:00:00Z'),
};

function detects(...chunks: string[]): boolean {
  const detector = createPdfActiveContentDetector();
  for (const chunk of chunks) detector.push(Buffer.from(chunk, 'latin1'));
  return detector.finish();
}

function detectsInChunks(bytes: Buffer, chunkSize: number): boolean {
  const detector = createPdfActiveContentDetector();
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    detector.push(bytes.subarray(offset, offset + chunkSize));
  }
  return detector.finish();
}

function pdfWithStream(body: Buffer, before = '', after = ''): Buffer {
  return Buffer.concat([
    Buffer.from(
      `%PDF-1.7\n${before}1 0 obj\n<< /Length ${body.length} /Filter /FlateDecode >>\nstream\r\n`,
      'latin1',
    ),
    body,
    Buffer.from(`\r\nendstream\nendobj\n${after}%%EOF\n`, 'latin1'),
  ]);
}

function tokenLadenBody(size: number): Buffer {
  const body = randomBytes(size);
  const chunk = 64 * 1024;
  const planted: Array<[number, string]> = [
    [1000, '/JS '],
    [chunk - 4, '/JavaScript('],
    [3 * chunk - 1, '/EmbeddedFile/'],
    [size - 200, '/Launch<<'],
  ];
  for (const [offset, token] of planted) body.write(token, offset, 'latin1');
  return body;
}

describe('per-scan deadline', () => {
  it('is the base plus the time the slowest allowed rate needs for the declared bytes', () => {
    expect(scanDeadlineMs(500 * MIB, SOURCE_SCAN_DEFAULTS)).toBe(130_000);
    expect(scanDeadlineMs(10 * MIB, SOURCE_SCAN_DEFAULTS)).toBe(32_000);
    expect(scanDeadlineMs(1, { baseMs: 1000, minBytesPerSec: 3 })).toBe(1334);
  });
});

describe('source URL rules', () => {
  it('accepts an https URL on an allowlisted host', () => {
    const checked = checkSourceUrl(
      'https://STORAGE.test-bucket.example/chat/abc?X-Amz-Signature=1',
      HOSTS,
    );
    expect(checked).toMatchObject({ ok: true });
  });

  it.each([
    ['http://storage.test-bucket.example/a', 'not_https'],
    ['https://other.example/a', 'host_not_allowed'],
    ['https://storage.test-bucket.example.evil.example/a', 'host_not_allowed'],
    ['https://127.0.0.1/a', 'ip_literal'],
    ['https://0x7f000001/a', 'ip_literal'],
    ['https://[::1]/a', 'ip_literal'],
    ['https://user:pass@storage.test-bucket.example/a', 'credentials'],
    ['https://storage.test-bucket.example:8443/a', 'port'],
    ['not a url', 'invalid_url'],
  ])('refuses %s as %s', (url, rule) => {
    expect(checkSourceUrl(url, HOSTS)).toEqual({ ok: false, rule });
  });
});

describe('PDF active content tokens', () => {
  it.each(['/JavaScript ', '/JS(', '/Launch<<', '/EmbeddedFile/'])('finds %s', (token) => {
    expect(detects(`%PDF-1.7 ${token} rest`)).toBe(true);
  });

  it('finds a token split across chunks and one at the very end of the stream', () => {
    expect(detects('%PDF-1.7 /Java', 'Scr', 'ipt >>')).toBe(true);
    expect(detects('%PDF-1.7 /Embedded', 'File')).toBe(true);
    expect(detects('%PDF-1.7 ', '/', 'J', 'S')).toBe(true);
  });

  it('ignores names that only start with a token', () => {
    expect(detects('%PDF-1.7 /JSX /Launcher /JavaScriptX /EmbeddedFiles')).toBe(false);
    expect(detects('%PDF-1.7 /JS', 'X')).toBe(false);
  });

  it('reads past a 32 MiB stream body whose random bytes hold every token', () => {
    const pdf = pdfWithStream(tokenLadenBody(32 * MIB));

    expect(detectsInChunks(pdf, 64 * 1024)).toBe(false);
  });

  it('still finds a token before or after a large stream body', () => {
    const body = tokenLadenBody(4 * MIB);

    expect(detectsInChunks(pdfWithStream(body, '<< /S /Launch /F (a.exe) >>\n'), 64 * 1024)).toBe(
      true,
    );
    expect(
      detectsInChunks(pdfWithStream(body, '', '2 0 obj << /JS (app.alert(1)) >>\n'), 64 * 1024),
    ).toBe(true);
  });

  it('follows stream and endstream keywords split at any chunk boundary', () => {
    const inside = Buffer.from('/JS (inside) /Launch ', 'latin1');
    const clean = pdfWithStream(inside);
    const active = pdfWithStream(inside, '', '/EmbeddedFile ');

    for (let size = 1; size <= 12; size += 1) {
      expect({ size, found: detectsInChunks(clean, size) }).toEqual({ size, found: false });
      expect({ size, found: detectsInChunks(active, size) }).toEqual({ size, found: true });
    }
  });

  it('treats the stream keyword as a stream only after a dictionary', () => {
    expect(detects('%PDF-1.7 (a stream\n) /JS (x) endstream')).toBe(true);
    expect(detects('%PDF-1.7 << /Length 3 >>\nstream\nabc\nendstream /JavaScript ')).toBe(true);
  });
});

describe('PDF stream openers', () => {
  const FORGED_TAIL = '1 0 obj << /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >> endobj\n';

  it('does not start a skipped region at a stream keyword inside a comment', () => {
    expect(detects(`%PDF-1.7\n% >>\nstream\n${FORGED_TAIL}%%EOF\n`)).toBe(true);
    expect(detects(`%PDF-1.7\n1 0 obj << /A 1 >> % >> stream\n${FORGED_TAIL}%%EOF\n`)).toBe(true);
  });

  it('does not start a skipped region at a stream keyword inside a string', () => {
    expect(detects(`%PDF-1.7\n<< /Title (>>stream\n) >>\n${FORGED_TAIL}%%EOF\n`)).toBe(true);
    expect(detects(`%PDF-1.7\n<< /Title (a \\) >> stream\n b) >>\n${FORGED_TAIL}%%EOF\n`)).toBe(
      true,
    );
    expect(detects(`%PDF-1.7\n<< /Title (a (b) >>\nstream\n c) >>\n${FORGED_TAIL}%%EOF\n`)).toBe(
      true,
    );
  });

  it('does not start a skipped region at a stream keyword inside a hex string', () => {
    expect(detects(`%PDF-1.7\n<< /ID <41 >>\nstream\n 42> >>\n${FORGED_TAIL}%%EOF\n`)).toBe(true);
  });

  it('still opens a stream after a string, a comment and a hex string that hold other marks', () => {
    const opened = (before: string) =>
      detects(`%PDF-1.7\n${before}>>\nstream\n/JS /Launch /EmbeddedFile \nendstream\n%%EOF\n`);

    expect(opened('<< /T (100%) ')).toBe(false);
    expect(opened('<< /T (a \\( b) ')).toBe(false);
    expect(opened('<< /T (a (b) c) ')).toBe(false);
    expect(opened('<< /I <4141> ')).toBe(false);
    expect(opened('<< /L 1 >> % >> stream\n<< /L 2 ')).toBe(false);
  });

  it('reads forged and genuine openers the same at every chunk size', () => {
    const files = [
      `%PDF-1.7\n% >>\nstream\n${FORGED_TAIL}%%EOF\n`,
      `%PDF-1.7\n<< /T (a \\) >>\nstream\n b) >>\n${FORGED_TAIL}`,
      `%PDF-1.7\n<< /I <41\n42> /T (100%) >>\r\nstream\r\n/JS /Launch \r\nendstream\n%%EOF\n`,
    ];
    const expected = [true, true, false];

    for (const [index, file] of files.entries()) {
      for (let size = 1; size <= 14; size += 1) {
        expect({ index, size, found: detectsInChunks(Buffer.from(file, 'latin1'), size) }).toEqual({
          index,
          size,
          found: expected[index],
        });
      }
    }
  });

  it('refuses a file that ends inside a stream', () => {
    expect(detects('%PDF-1.7\n<< /Length 9 >>\nstream\nplain data')).toBe(true);
    expect(detects('%PDF-1.7\n<< /Length 9 >>\nstream\nplain data\nendstream\n')).toBe(false);
  });
});

describe('signature reasons', () => {
  it('names encrypted and limit detections and leaves malware unnamed', () => {
    expect(signatureReason('Heuristics.Encrypted.PDF')).toBe('encrypted');
    expect(signatureReason('Heuristics.Limits.Exceeded.MaxFileSize')).toBe('limits_exceeded');
    expect(signatureReason('Win.Test.EICAR_HDB-1')).toBeUndefined();
  });
});

describe('source scan liveness', () => {
  it('passes probe results through while no source scan is live', () => {
    const liveness = createSourceScanLiveness();
    expect(liveness.observe({ scanning: false, signatures: null })).toEqual({
      scanning: false,
      signatures: null,
    });
  });

  it('counts the EICAR half alive and uses the last good signatures during a live scan', () => {
    const liveness = createSourceScanLiveness();
    liveness.observe({ scanning: true, signatures: GOOD });
    const scan = liveness.begin();

    expect(liveness.observe({ scanning: false, signatures: null })).toEqual({
      scanning: true,
      signatures: GOOD,
    });

    scan.end('answered');
    expect(liveness.observe({ scanning: false, signatures: null })).toEqual({
      scanning: false,
      signatures: null,
    });
  });

  it('has no signatures to offer when none was ever read', () => {
    const liveness = createSourceScanLiveness();
    liveness.begin();
    expect(liveness.observe({ scanning: false, signatures: null })).toEqual({
      scanning: true,
      signatures: null,
    });
  });

  it('withholds the exemption after a deadline with no reply until a probe succeeds', () => {
    const liveness = createSourceScanLiveness();
    liveness.observe({ scanning: true, signatures: GOOD });
    liveness.begin().end('deadline');

    const later = liveness.begin();
    expect(liveness.observe({ scanning: false, signatures: null })).toEqual({
      scanning: false,
      signatures: null,
    });

    liveness.observe({ scanning: true, signatures: GOOD });
    expect(liveness.observe({ scanning: false, signatures: null })).toEqual({
      scanning: true,
      signatures: GOOD,
    });
    later.end('answered');
  });

  it('exempts a probe asked during a live scan even when its answer arrives after the scan ended', () => {
    const liveness = createSourceScanLiveness();
    liveness.observe({ scanning: true, signatures: GOOD });
    const scan = liveness.begin();
    const asked = liveness.ask();
    scan.end('answered');

    expect(liveness.observe({ scanning: false, signatures: null }, asked)).toEqual({
      scanning: true,
      signatures: GOOD,
    });
    expect(liveness.observe({ scanning: false, signatures: null })).toEqual({
      scanning: false,
      signatures: null,
    });
  });

  it('marks earlier probes stale when the last live scan ends and at every deadline', () => {
    const liveness = createSourceScanLiveness();
    const stale = vi.fn();
    liveness.onStale(stale);

    const first = liveness.begin();
    const second = liveness.begin();
    first.end('answered');
    expect(stale).not.toHaveBeenCalled();
    second.end('answered');
    expect(stale).toHaveBeenCalledTimes(1);

    const third = liveness.begin();
    const fourth = liveness.begin();
    third.end('deadline');
    expect(stale).toHaveBeenCalledTimes(2);
    fourth.end('closed');
    expect(stale).toHaveBeenCalledTimes(3);
  });

  it('does not let a probe asked before a deadline lift the withholding', () => {
    const liveness = createSourceScanLiveness();
    liveness.observe({ scanning: true, signatures: GOOD });
    const asked = liveness.ask();
    liveness.begin().end('deadline');
    liveness.observe({ scanning: true, signatures: GOOD }, asked);

    liveness.begin();
    expect(liveness.observe({ scanning: false, signatures: null })).toEqual({
      scanning: false,
      signatures: null,
    });
  });

  it('counts each scan once however often it ends', () => {
    const liveness = createSourceScanLiveness();
    const first = liveness.begin();
    const second = liveness.begin();
    first.end('closed');
    first.end('closed');
    expect(liveness.observe({ scanning: false, signatures: null }).scanning).toBe(true);
    second.end('answered');
    expect(liveness.observe({ scanning: false, signatures: null }).scanning).toBe(false);
  });
});

describe('runSourceScan', () => {
  it("ends the live scan at clamd's early reply or close, not when the source has been read to the end", async () => {
    const clamd = await startFakeClamd({ refuseStream: 'stream: OK' });
    const source = await startFakeSource();
    const path = '/chat-attachments/staging/early-reply';
    const bytes = randomBytes(1024 * 1024);
    const etag = source.put(path, { bytes, mode: 'slow', slowChunkMs: 4000 });
    const real = createSourceScanLiveness();
    const ends: Array<{ how: LiveScanEnd; at: number }> = [];
    const signals: AbortSignal[] = [];
    const started = Date.now();

    try {
      const verdict = await runSourceScan(
        {
          jobId: 'early-reply:1',
          sourceUrl: new URL(source.urlFor(path)),
          byteCount: bytes.length,
          etag,
          mimeType: 'application/octet-stream',
          deadlineMs: 60_000,
        },
        {
          clamd: clamd.address,
          fetchSource: (url, init) => {
            if (init.signal) signals.push(init.signal);
            return source.fetchSource(url, init);
          },
          liveness: {
            ...real,
            begin: () => {
              const live = real.begin();
              return {
                end: (how) => {
                  ends.push({ how, at: Date.now() - started });
                  live.end(how);
                },
              };
            },
          },
          log: () => undefined,
          now: Date.now,
        },
      );

      expect(verdict).toMatchObject({ outcome: 'incomplete', reason: 'scan_failed' });
      expect(verdict.bytes).toBeLessThan(bytes.length);
      expect(ends).toHaveLength(1);
      expect(['answered', 'closed']).toContain(ends[0]?.how);
      expect(ends[0]?.at).toBeLessThan(2000);
      expect(Date.now() - started).toBeLessThan(2000);
      expect(signals.map((signal) => signal.aborted)).toEqual([true]);
      expect(real.observe({ scanning: false, signatures: null }).scanning).toBe(false);
    } finally {
      await source.close();
      await clamd.close();
    }
  }, 30_000);

  it('releases the opened download when clamd cannot be reached', async () => {
    const closed = createServer();
    await new Promise<void>((resolve) => closed.listen(0, '127.0.0.1', resolve));
    const { port } = closed.address() as AddressInfo;
    await new Promise<void>((resolve) => closed.close(() => resolve()));
    const source = await startFakeSource();
    const path = '/chat-attachments/staging/unreachable-clamd';
    const bytes = randomBytes(1024 * 1024);
    const etag = source.put(path, { bytes, mode: 'slow', slowChunkMs: 2000 });
    const opened: Response[] = [];
    const signals: AbortSignal[] = [];

    try {
      const verdict = await runSourceScan(
        {
          jobId: 'unreachable-clamd:1',
          sourceUrl: new URL(source.urlFor(path)),
          byteCount: bytes.length,
          etag,
          mimeType: 'application/octet-stream',
          deadlineMs: 30_000,
        },
        {
          clamd: { host: '127.0.0.1', port },
          fetchSource: async (url, init) => {
            if (init.signal) signals.push(init.signal);
            const response = await source.fetchSource(url, init);
            opened.push(response);
            return response;
          },
          liveness: createSourceScanLiveness(),
          log: () => undefined,
          now: Date.now,
        },
      );

      expect(verdict).toMatchObject({ outcome: 'incomplete', reason: 'scan_failed', bytes: 0 });
      expect(signals.map((signal) => signal.aborted)).toEqual([true]);
      const reader = opened[0]?.body?.getReader();
      await expect(reader?.read()).rejects.toThrow();
    } finally {
      await source.close();
    }
  });

  it('does not begin a live scan for a source chunk that arrives after the scan is over', async () => {
    const hangUp = createServer((socket) => socket.destroy());
    await new Promise<void>((resolve) => hangUp.listen(0, '127.0.0.1', resolve));
    const { port } = hangUp.address() as AddressInfo;
    const liveness = createSourceScanLiveness();
    const bytes = randomBytes(1024);
    const body = new ReadableStream<Uint8Array>({
      start: (controller) => {
        setTimeout(() => {
          controller.enqueue(bytes);
          controller.close();
        }, 300);
      },
    });

    try {
      const verdict = await runSourceScan(
        {
          jobId: 'late-chunk:1',
          sourceUrl: new URL('https://storage.test-bucket.example/chat-attachments/staging/late'),
          byteCount: bytes.length,
          etag: '"late"',
          mimeType: 'application/octet-stream',
          deadlineMs: 30_000,
        },
        {
          clamd: { host: '127.0.0.1', port },
          fetchSource: async () => new Response(body, { headers: { etag: '"late"' } }),
          liveness,
          log: () => undefined,
          now: Date.now,
        },
      );

      expect(verdict).toMatchObject({ outcome: 'incomplete', reason: 'scan_failed', bytes: 0 });
      await new Promise((resolve) => setTimeout(resolve, 700));
      expect(liveness.ask().live).toBe(false);
      expect(liveness.observe({ scanning: false, signatures: null }).scanning).toBe(false);
    } finally {
      await new Promise<void>((resolve) => hangUp.close(() => resolve()));
    }
  });
});
