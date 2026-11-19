import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SOURCE_SCAN_DEFAULTS, type SourceScanLimits } from '../src/config.ts';
import { watchClamd } from '../src/daemons.ts';
import {
  clamdProbe,
  createScannerServer,
  livenessProbe,
  type ScannerOptions,
} from '../src/server.ts';
import { createSourceScanLiveness } from '../src/source-scan.ts';
import {
  EICAR,
  EICAR_SIGNATURE,
  startFakeClamd,
  type FakeClamd,
  type FakeClamdBehaviour,
} from './fake-clamd.ts';
import { SOURCE_HOST, startFakeSource, type FakeSource } from './fake-source.ts';

const TOKEN = randomBytes(32).toString('hex');
const SIGNATURES_PUBLISHED_AT = Date.parse('2026-09-28T04:00:00Z');
const HOUR_MS = 60 * 60 * 1000;
const FAST_RATE = 1_000_000_000_000;

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()?.();
});

function isEicar(payload: Buffer): boolean {
  return payload.toString('latin1') === EICAR;
}

function answerByMarker(payload: Buffer): string | null {
  const text = payload.toString('latin1');
  if (text === EICAR) return `stream: ${EICAR_SIGNATURE} FOUND`;
  if (text.startsWith('ENCRYPTED')) return 'stream: Heuristics.Encrypted.Zip FOUND';
  if (text.startsWith('LIMITS')) return 'stream: Heuristics.Limits.Exceeded.MaxScanSize FOUND';
  if (text.startsWith('HOLD')) return null;
  return 'stream: OK';
}

interface Harness {
  url: string;
  clamd: FakeClamd;
  source: FakeSource;
  behaviour: FakeClamdBehaviour;
  logs: string[];
  probe: () => Promise<{ scanning: boolean }>;
  rawProbe: () => Promise<{ scanning: boolean }>;
}

interface HarnessOptions {
  behaviour?: FakeClamdBehaviour;
  limits?: Partial<SourceScanLimits>;
  scanner?: Partial<ScannerOptions>;
  ownProbe?: boolean;
  healthDeadlineMs?: number;
  healthCacheMs?: number;
}

async function listen(options: ScannerOptions): Promise<string> {
  const server = createScannerServer(options);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(
    () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  );
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function harness(options: HarnessOptions = {}): Promise<Harness> {
  const behaviour = options.behaviour ?? { answer: answerByMarker };
  const clamd = await startFakeClamd(behaviour);
  cleanups.push(clamd.close);
  const source = await startFakeSource();
  cleanups.push(source.close);
  const logs: string[] = [];
  const started = Date.now();
  const now = () => SIGNATURES_PUBLISHED_AT + HOUR_MS + (Date.now() - started);
  const liveness = createSourceScanLiveness();
  const healthDeadlineMs = options.healthDeadlineMs ?? 300;
  const healthCacheMs = options.healthCacheMs ?? 100;
  const rawProbe = clamdProbe(clamd.address, healthDeadlineMs, healthCacheMs);
  const url = await listen({
    tokens: [TOKEN],
    clamd: clamd.address,
    now,
    startedAt: now() - 2 * HOUR_MS,
    liveness,
    ...(options.ownProbe ? { healthDeadlineMs, healthCacheMs } : { probe: rawProbe }),
    fetchSource: source.fetchSource,
    sourceScans: { ...SOURCE_SCAN_DEFAULTS, hosts: [SOURCE_HOST], ...options.limits },
    log: (level, event, fields = {}) => {
      logs.push(JSON.stringify({ level, event, ...fields }));
    },
    ...options.scanner,
  });
  return {
    url,
    clamd,
    source,
    behaviour,
    logs,
    probe: livenessProbe(rawProbe, liveness),
    rawProbe,
  };
}

interface Answer {
  httpStatus: number;
  retryAfter: string | null;
  body: Record<string, unknown>;
}

async function answer(response: Response): Promise<Answer> {
  return {
    httpStatus: response.status,
    retryAfter: response.headers.get('retry-after'),
    body: (await response.json()) as Record<string, unknown>,
  };
}

function headers(token: string | null = TOKEN): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function submit(h: Harness, body: unknown, token: string | null = TOKEN): Promise<Answer> {
  return answer(
    await fetch(`${h.url}/v2/scans`, {
      method: 'POST',
      headers: { ...headers(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

async function poll(h: Harness, id: string, token: string | null = TOKEN): Promise<Answer> {
  return answer(
    await fetch(`${h.url}/v2/scans/${encodeURIComponent(id)}`, { headers: headers(token) }),
  );
}

async function capability(h: Harness, token: string | null = TOKEN): Promise<Answer> {
  return answer(await fetch(`${h.url}/v2/capability`, { headers: headers(token) }));
}

async function healthStatus(url: string, token: string | null = null): Promise<Answer> {
  return answer(await fetch(`${url}/health`, { headers: headers(token) }));
}

async function settled(h: Harness, id: string, timeout = 5000): Promise<Answer> {
  let last: Answer | undefined;
  await vi.waitFor(
    async () => {
      last = await poll(h, id);
      expect(last.body['status']).toBe('done');
    },
    { timeout, interval: 50 },
  );
  return last as Answer;
}

let jobCounter = 0;

function job(
  h: Harness,
  bytes: Buffer,
  overrides: Record<string, unknown> = {},
  object: { mode?: 'serve' | 'redirect' | 'expired' | 'drop' | 'slow'; etag?: string } = {},
): Record<string, unknown> {
  jobCounter += 1;
  const path = `/chat-attachments/staging/object-${jobCounter}`;
  const etag = h.source.put(path, { bytes, ...object });
  return {
    jobId: `9b7f5c1e-${jobCounter.toString().padStart(4, '0')}-4c1e-9a7f-2b8e5d4c3a10:1`,
    sourceUrl: h.source.urlFor(path),
    byteCount: bytes.length,
    etag,
    mimeType: 'application/octet-stream',
    ...overrides,
  };
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function streamed(clamd: FakeClamd, bytes: Buffer): boolean {
  return clamd.scanned.some((payload) => payload.equals(bytes));
}

async function scanned(h: Harness, bytes: Buffer, overrides = {}, object = {}) {
  const body = job(h, bytes, overrides, object);
  const accepted = await submit(h, body);
  expect(accepted.httpStatus).toBe(202);
  return { body, accepted, done: await settled(h, String(body['jobId'])) };
}

describe('POST /v2/scans', () => {
  it('scans a clean file in one pass and reports the SHA-256, bytes and ETag it read', async () => {
    const h = await harness();
    const bytes = randomBytes(300_000);

    const { body, accepted, done } = await scanned(h, bytes);

    expect(accepted.body).toEqual({ scanId: body['jobId'], deadlineMs: 30_058 });
    expect(done.body['deadlineMs']).toBe(30_058);
    expect(done.body['verdict']).toEqual({
      jobId: body['jobId'],
      outcome: 'clean',
      sha256: sha256(bytes),
      bytes: bytes.length,
      etag: body['etag'],
      ms: expect.any(Number),
    });
    expect(streamed(h.clamd, bytes)).toBe(true);
    expect(h.source.fetchCalls).toHaveLength(1);
    expect(h.source.fetchCalls[0]?.init).toMatchObject({
      method: 'GET',
      redirect: 'error',
      headers: { 'If-Match': body['etag'] },
    });
    expect(h.source.requests[0]?.headers['if-match']).toBe(body['etag']);
  });

  it('answers infected for the EICAR test file', async () => {
    const h = await harness();

    const { done } = await scanned(h, Buffer.from(EICAR, 'latin1'));

    expect(done.body['verdict']).toMatchObject({ outcome: 'infected' });
    expect(done.body['verdict']).not.toHaveProperty('reason');
  });

  it('names encrypted and limits_exceeded detections', async () => {
    const h = await harness();

    const encrypted = await scanned(h, Buffer.from('ENCRYPTED archive'));
    const limits = await scanned(h, Buffer.from('LIMITS archive'));

    expect(encrypted.done.body['verdict']).toMatchObject({
      outcome: 'infected',
      reason: 'encrypted',
    });
    expect(limits.done.body['verdict']).toMatchObject({
      outcome: 'infected',
      reason: 'limits_exceeded',
    });
  });

  it('refuses a PDF with active content as active_pdf and scans the same bytes as clean otherwise', async () => {
    const h = await harness();
    const bytes = Buffer.from(
      '%PDF-1.7\n1 0 obj << /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >>',
    );

    const pdf = await scanned(h, bytes, { mimeType: 'application/pdf' });
    const text = await scanned(h, bytes, { mimeType: 'text/plain' });

    expect(pdf.done.body['verdict']).toMatchObject({ outcome: 'infected', reason: 'active_pdf' });
    expect(text.done.body['verdict']).toMatchObject({ outcome: 'clean' });
  });

  it('reads past PDF stream bodies and still finds a token outside them', async () => {
    const h = await harness();
    const stream = (after: string) =>
      Buffer.from(
        `%PDF-1.7\n1 0 obj\n<< /Length 24 >>\nstream\n/JS (app.alert(1)) /Launch\nendstream\nendobj\n${after}%%EOF\n`,
        'latin1',
      );

    const inside = await scanned(h, stream(''), { mimeType: 'application/pdf' });
    const outside = await scanned(h, stream('2 0 obj << /S /JavaScript >>\n'), {
      mimeType: 'application/pdf',
    });

    expect(inside.done.body['verdict']).toMatchObject({ outcome: 'clean' });
    expect(outside.done.body['verdict']).toMatchObject({
      outcome: 'infected',
      reason: 'active_pdf',
    });
  });

  it('fails closed when clamd answers before the stream ends', async () => {
    const h = await harness({ behaviour: { refuseStream: 'stream: OK' } });

    const { done } = await scanned(h, randomBytes(256 * 1024), {}, { mode: 'slow' });

    expect(done.body['verdict']).toMatchObject({ outcome: 'incomplete', reason: 'scan_failed' });
  });

  it('gives size_mismatch when the source holds more or fewer bytes than declared', async () => {
    const h = await harness();
    const bytes = randomBytes(4096);

    const longer = await scanned(h, bytes, { byteCount: 4000 });
    const shorter = await scanned(h, bytes, { byteCount: 5000 });

    expect(longer.done.body['verdict']).toMatchObject({
      outcome: 'infected',
      reason: 'size_mismatch',
    });
    expect(shorter.done.body['verdict']).toMatchObject({
      outcome: 'infected',
      reason: 'size_mismatch',
      bytes: 4096,
    });
    expect(streamed(h.clamd, bytes)).toBe(false);
  });

  it('never follows a redirect: the target is not requested and the scan is source_unavailable', async () => {
    const h = await harness();

    const { done } = await scanned(h, randomBytes(64), {}, { mode: 'redirect' });

    expect(done.body['verdict']).toMatchObject({
      outcome: 'incomplete',
      reason: 'source_unavailable',
    });
    expect(
      h.source.requests.map((request) => request.path).some((path) => path.endsWith('-moved')),
    ).toBe(false);
    expect(h.clamd.connections()).toBe(0);
  });

  it('refuses a disallowed host, an IP literal and a non-https URL before any fetch', async () => {
    const h = await harness();
    const base = job(h, randomBytes(64));

    for (const sourceUrl of [
      'https://other-bucket.example/chat-attachments/staging/x',
      'https://127.0.0.1/chat-attachments/staging/x',
      'https://[::1]/chat-attachments/staging/x',
      `http://${SOURCE_HOST}/chat-attachments/staging/x`,
    ]) {
      const refused = await submit(h, { ...base, sourceUrl });
      expect(refused).toMatchObject({ httpStatus: 400, body: { reason: 'source_not_allowed' } });
    }
    expect(h.source.fetchCalls).toHaveLength(0);
    expect(h.clamd.connections()).toBe(0);
  });

  it('refuses a byteCount over MAX_SOURCE_SCAN_BYTES before any fetch', async () => {
    const h = await harness({ limits: { maxBytes: 1024 } });

    const atLimit = await submit(h, job(h, randomBytes(1024)));
    const over = await submit(h, job(h, randomBytes(1025)));

    expect(atLimit.httpStatus).toBe(202);
    expect(over).toMatchObject({ httpStatus: 413, body: { reason: 'too_large' } });
    await vi.waitFor(() => expect(h.source.fetchCalls).toHaveLength(1));
  });

  it('refuses a malformed request', async () => {
    const h = await harness();
    const base = job(h, randomBytes(64));

    for (const body of [
      { ...base, jobId: 'no-attempt' },
      { ...base, byteCount: -1 },
      { ...base, etag: 'line\nbreak' },
      { ...base, mimeType: 7 },
      [],
    ]) {
      expect(await submit(h, body)).toMatchObject({
        httpStatus: 400,
        body: { reason: 'invalid_request' },
      });
    }
    expect(h.source.fetchCalls).toHaveLength(0);
  });

  it('carries the deadline the formula gives for the byteCount in the 202 and every poll answer', async () => {
    const h = await harness({ limits: { baseMs: 20_000, minBytesPerSec: 1000 } });
    const held = job(h, Buffer.from(`HOLD${'x'.repeat(996)}`));
    const queued = job(h, randomBytes(2000));

    const first = await submit(h, held);
    const second = await submit(h, queued);
    await vi.waitFor(() => expect(h.clamd.scanned).toHaveLength(1));

    expect(first.body).toEqual({ scanId: held['jobId'], deadlineMs: 21_000 });
    expect(second.body).toEqual({ scanId: queued['jobId'], deadlineMs: 22_000 });
    expect((await poll(h, String(held['jobId']))).body).toEqual({
      status: 'scanning',
      deadlineMs: 21_000,
    });
    expect((await poll(h, String(queued['jobId']))).body).toEqual({
      status: 'queued',
      deadlineMs: 22_000,
    });
  });

  it('answers 429 queue_full when SCAN_QUEUE_MAX jobs wait', async () => {
    const h = await harness({ limits: { queueMax: 1 } });

    await submit(h, job(h, Buffer.from('HOLD one')));
    await submit(h, job(h, Buffer.from('HOLD two')));
    const full = await submit(h, job(h, Buffer.from('three')));

    expect(full).toEqual({ httpStatus: 429, retryAfter: '60', body: { reason: 'queue_full' } });
  });

  it('answers 429 source_budget with Retry-After when the hourly budget is spent', async () => {
    const h = await harness({ limits: { bytesPerHour: 1500 } });

    expect((await submit(h, job(h, randomBytes(1000)))).httpStatus).toBe(202);
    const spent = await submit(h, job(h, randomBytes(1000)));

    expect(spent).toMatchObject({ httpStatus: 429, body: { reason: 'source_budget' } });
    expect(Number(spent.retryAfter)).toBeGreaterThanOrEqual(60);
  });

  it('admits nothing yet on a scanner that has just started', async () => {
    const h = await harness({
      limits: { bytesPerHour: 1_000_000 },
      scanner: { startedAt: SIGNATURES_PUBLISHED_AT + HOUR_MS },
    });

    const fresh = await submit(h, job(h, randomBytes(1000)));

    expect(fresh).toMatchObject({ httpStatus: 429, body: { reason: 'source_budget' } });
    expect(Number(fresh.retryAfter)).toBeGreaterThanOrEqual(60);
  });

  it('gives source_unavailable for an expired URL and source_changed for a 412', async () => {
    const h = await harness();

    const expired = await scanned(h, randomBytes(64), {}, { mode: 'expired' });
    const changed = await scanned(h, randomBytes(64), { etag: '"an-older-version"' });

    expect(expired.done.body['verdict']).toMatchObject({
      outcome: 'incomplete',
      reason: 'source_unavailable',
    });
    expect(changed.done.body['verdict']).toMatchObject({
      outcome: 'incomplete',
      reason: 'source_changed',
    });
    expect(h.clamd.connections()).toBe(0);
  });

  it('gives source_unavailable when the source drops the connection partway', async () => {
    const h = await harness();

    const { done } = await scanned(h, randomBytes(512 * 1024), {}, { mode: 'drop' });

    expect(done.body['verdict']).toMatchObject({
      outcome: 'incomplete',
      reason: 'source_unavailable',
    });
  });

  it('returns the same scan for a repeated jobId and fetches the source once', async () => {
    const h = await harness();
    const body = job(h, randomBytes(64));

    const first = await submit(h, body);
    const repeat = await submit(h, body);
    await settled(h, String(body['jobId']));
    const afterDone = await submit(h, body);

    expect(repeat).toEqual(first);
    expect(afterDone).toEqual(first);
    expect(h.source.fetchCalls).toHaveLength(1);
  });

  it('gives incomplete deadline when clamd has not answered by the per-scan deadline', async () => {
    const h = await harness({ limits: { baseMs: 300, minBytesPerSec: FAST_RATE } });

    const { accepted, done } = await scanned(h, Buffer.from('HOLD forever'));

    expect(accepted.body['deadlineMs']).toBe(301);
    expect(done.body['verdict']).toMatchObject({ outcome: 'incomplete', reason: 'deadline' });
  });

  it('answers unknown for a job it does not hold, as after a restart', async () => {
    const before = await harness();
    const after = await harness();
    const body = job(before, randomBytes(64));
    await submit(before, body);

    expect(await poll(after, String(body['jobId']))).toEqual({
      httpStatus: 200,
      retryAfter: null,
      body: { status: 'unknown' },
    });
  });

  it('requires the bearer token on every protocol 2 route', async () => {
    const h = await harness();
    const body = job(h, randomBytes(64));

    for (const refused of [
      await submit(h, body, null),
      await submit(h, body, randomBytes(32).toString('hex')),
      await poll(h, String(body['jobId']), null),
      await capability(h, null),
    ]) {
      expect(refused).toMatchObject({ httpStatus: 401, body: { reason: 'unauthorized' } });
    }
    expect(h.source.fetchCalls).toHaveLength(0);
  });

  it('reports its capability without calling clamd', async () => {
    const h = await harness({ limits: { maxBytes: 4096 } });

    expect(await capability(h)).toEqual({
      httpStatus: 200,
      retryAfter: null,
      body: { protocol: 2, maxSourceScanBytes: 4096, queueDepth: 0, running: 0 },
    });
    expect(h.clamd.connections()).toBe(0);
  });

  it('promises no more than the hourly budget admits in one scan', async () => {
    const h = await harness({ limits: { maxBytes: 4096, bytesPerHour: 1000 } });

    expect((await capability(h)).body['maxSourceScanBytes']).toBe(1000);
    const small = await submit(h, job(h, randomBytes(1000)));
    const over = await submit(h, job(h, randomBytes(1001)));
    expect(small.httpStatus).toBe(202);
    expect(over).toMatchObject({ httpStatus: 413, body: { reason: 'too_large' } });
  });

  it('offers no protocol 2 route while no source host is configured', async () => {
    const clamd = await startFakeClamd();
    cleanups.push(clamd.close);
    const url = await listen({ tokens: [TOKEN], clamd: clamd.address });

    for (const path of ['/v2/capability', '/v2/scans/a:1']) {
      const response = await fetch(`${url}${path}`, { headers: headers() });
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ safe: false, detail: 'Not found' });
    }
  });

  it('a held v2 scan does not slow 20 legacy scans', async () => {
    const h = await harness();
    await submit(h, job(h, Buffer.from('HOLD the source scan')));
    await vi.waitFor(() => expect(h.clamd.scanned).toHaveLength(1));

    const legacy = await Promise.all(
      Array.from({ length: 20 }, async () => {
        const started = Date.now();
        const response = await fetch(`${h.url}/scan`, {
          method: 'POST',
          headers: { ...headers(), 'Content-Type': 'application/octet-stream' },
          body: randomBytes(64 * 1024),
        });
        return { status: response.status, body: await response.json(), ms: Date.now() - started };
      }),
    );

    for (const scan of legacy) {
      expect(scan.status).toBe(200);
      expect(scan.body).toEqual({ safe: true });
      expect(scan.ms).toBeLessThan(3000);
    }
  });
});

describe('liveness while a source scan is live', () => {
  it('fake clamd accepts the whole stream and holds the reply past the watchdog limit while the EICAR probe and VERSION hang: /health 200 throughout and no watchdog exit', async () => {
    const h = await harness({ limits: { baseMs: 9000, minBytesPerSec: FAST_RATE } });
    expect((await healthStatus(h.url)).httpStatus).toBe(200);
    const exited = vi.fn();
    const watchdog = watchClamd(async () => (await h.probe()).scanning, exited, 200, 2000);
    cleanups.push(() => watchdog.stop());
    const bytes = randomBytes(64 * 1024);

    h.behaviour.replyAfterMs = 6000;
    h.behaviour.versionReply = 'hang';
    const body = job(h, bytes);
    await submit(h, body);
    await vi.waitFor(() => expect(streamed(h.clamd, bytes)).toBe(true));

    const statuses: number[] = [];
    let state = 'scanning';
    while (state !== 'done') {
      const status = (await healthStatus(h.url)).httpStatus;
      state = String((await poll(h, String(body['jobId']))).body['status']);
      if (state !== 'done') statuses.push(status);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    watchdog.stop();

    expect(statuses.length).toBeGreaterThan(5);
    expect(new Set(statuses)).toEqual(new Set([200]));
    expect(exited).not.toHaveBeenCalled();
    expect((await poll(h, String(body['jobId']))).body['verdict']).toMatchObject({
      outcome: 'clean',
    });
  }, 20_000);

  it('the same scan reaching its deadline with no reply: the next /health is 503 and the watchdog fires after its limit, as today', async () => {
    const h = await harness({ limits: { baseMs: 9000, minBytesPerSec: FAST_RATE } });
    expect((await healthStatus(h.url)).httpStatus).toBe(200);
    const exited = vi.fn();
    const watchdog = watchClamd(async () => (await h.probe()).scanning, exited, 200, 2000);
    cleanups.push(() => watchdog.stop());

    h.behaviour.replyAfterMs = 30_000;
    h.behaviour.versionReply = 'hang';
    const body = job(h, randomBytes(64 * 1024));
    await submit(h, body);
    const done = await settled(h, String(body['jobId']), 12_000);
    const deadlineAt = Date.now();

    expect(done.body['verdict']).toMatchObject({ outcome: 'incomplete', reason: 'deadline' });
    expect(exited).not.toHaveBeenCalled();
    expect((await healthStatus(h.url)).httpStatus).toBe(503);
    await vi.waitFor(() => expect(exited).toHaveBeenCalledOnce(), { timeout: 5000, interval: 50 });
    expect(Date.now() - deadlineAt).toBeGreaterThanOrEqual(1500);
  }, 25_000);

  it('a source scan started after such a deadline gets no exemption until a probe succeeds', async () => {
    let probesAnswer = true;
    const behaviour: FakeClamdBehaviour = {
      answer: (payload) => (isEicar(payload) && !probesAnswer ? null : answerByMarker(payload)),
    };
    const h = await harness({
      behaviour,
      healthCacheMs: 0,
      limits: { baseMs: 1000, minBytesPerSec: 1000 },
    });
    expect((await healthStatus(h.url)).httpStatus).toBe(200);

    probesAnswer = false;
    behaviour.versionReply = 'hang';
    const first = job(h, Buffer.from(`HOLD${'a'.repeat(200)}`));
    await submit(h, first);
    expect((await settled(h, String(first['jobId']))).body['verdict']).toMatchObject({
      reason: 'deadline',
    });

    const laterBytes = Buffer.from(`HOLD${'b'.repeat(6000)}`);
    await submit(h, job(h, laterBytes));
    await vi.waitFor(() => expect(streamed(h.clamd, laterBytes)).toBe(true));
    expect((await healthStatus(h.url)).httpStatus).toBe(503);

    probesAnswer = true;
    delete behaviour.versionReply;
    expect((await healthStatus(h.url)).httpStatus).toBe(200);

    probesAnswer = false;
    behaviour.versionReply = 'hang';
    expect((await h.rawProbe()).scanning).toBe(false);
    expect((await healthStatus(h.url)).httpStatus).toBe(200);
  }, 15_000);

  it('after a scan clamd answered in time, the next /health is 200 although a probe taken during it timed out and is still cached', async () => {
    let probesAnswer = false;
    const behaviour: FakeClamdBehaviour = {
      answer: (payload) => (isEicar(payload) && !probesAnswer ? null : answerByMarker(payload)),
      replyAfterMs: 2000,
    };
    const h = await harness({
      behaviour,
      healthCacheMs: 60_000,
      limits: { baseMs: 9000, minBytesPerSec: FAST_RATE },
    });
    const bytes = randomBytes(64 * 1024);
    const body = job(h, bytes);
    await submit(h, body);
    await vi.waitFor(() => expect(streamed(h.clamd, bytes)).toBe(true));

    expect((await healthStatus(h.url)).httpStatus).toBe(200);
    expect((await h.rawProbe()).scanning).toBe(false);
    expect((await settled(h, String(body['jobId']))).body['verdict']).toMatchObject({
      outcome: 'clean',
    });

    probesAnswer = true;
    delete behaviour.replyAfterMs;
    expect((await healthStatus(h.url)).httpStatus).toBe(200);
  }, 15_000);

  it('a /health already waiting on a probe asked during the scan answers 200 when the scan ends first', async () => {
    const behaviour: FakeClamdBehaviour = {
      answer: (payload) => (isEicar(payload) ? null : answerByMarker(payload)),
      replyAfterMs: 400,
    };
    const h = await harness({
      behaviour,
      healthDeadlineMs: 3000,
      healthCacheMs: 60_000,
      limits: { baseMs: 9000, minBytesPerSec: FAST_RATE },
    });
    const bytes = randomBytes(64 * 1024);
    const body = job(h, bytes);
    await submit(h, body);
    await vi.waitFor(() => expect(streamed(h.clamd, bytes)).toBe(true));

    let answeredAt: number | undefined;
    const waiting = healthStatus(h.url).then((health) => {
      answeredAt = Date.now();
      return health;
    });
    await settled(h, String(body['jobId']));
    expect(answeredAt).toBeUndefined();

    expect((await waiting).httpStatus).toBe(200);
  }, 15_000);

  it('a probe that succeeded before a scan reached its deadline does not lift the withholding', async () => {
    let probesAnswer = true;
    const behaviour: FakeClamdBehaviour = {
      answer: (payload) => (isEicar(payload) && !probesAnswer ? null : answerByMarker(payload)),
    };
    const h = await harness({
      behaviour,
      healthCacheMs: 60_000,
      limits: { baseMs: 600, minBytesPerSec: FAST_RATE },
    });
    expect((await healthStatus(h.url)).httpStatus).toBe(200);

    probesAnswer = false;
    const first = job(h, Buffer.from('HOLD until the deadline'));
    await submit(h, first);
    expect((await settled(h, String(first['jobId']))).body['verdict']).toMatchObject({
      reason: 'deadline',
    });
    expect((await healthStatus(h.url)).httpStatus).toBe(503);

    const laterBytes = Buffer.from('HOLD a later scan');
    await submit(h, job(h, laterBytes));
    await vi.waitFor(() => expect(streamed(h.clamd, laterBytes)).toBe(true));
    expect((await healthStatus(h.url)).httpStatus).toBe(503);
  }, 15_000);

  it('a signature read that times out during a source scan uses the last good value', async () => {
    const h = await harness({
      ownProbe: true,
      healthCacheMs: 0,
      limits: { baseMs: 5000, minBytesPerSec: FAST_RATE },
    });
    expect((await healthStatus(h.url, TOKEN)).httpStatus).toBe(200);

    const bytes = Buffer.from('HOLD while signatures hang');
    await submit(h, job(h, bytes));
    await vi.waitFor(() => expect(streamed(h.clamd, bytes)).toBe(true));
    h.behaviour.versionReply = 'hang';

    expect(await healthStatus(h.url, TOKEN)).toMatchObject({
      httpStatus: 200,
      body: {
        status: 'ok',
        signatures: { version: 27790, publishedAt: '2026-09-28T04:00:00.000Z' },
      },
    });
  });

  it('outside a source scan a failed signature read answers 503 as today', async () => {
    const h = await harness({ ownProbe: true, healthCacheMs: 0 });
    expect((await healthStatus(h.url)).httpStatus).toBe(200);

    h.behaviour.versionReply = 'hang';

    expect(await healthStatus(h.url)).toEqual({
      httpStatus: 503,
      retryAfter: null,
      body: { status: 'unavailable' },
    });
  });
});

describe('logging', () => {
  it('no log line contains the source URL, its path or its query', async () => {
    const h = await harness();
    const query = 'X-Amz-Signature=QUERYMARKER0001';
    const clean = job(h, randomBytes(64));
    const cleanUrl = new URL(String(clean['sourceUrl']));
    cleanUrl.search = query;
    clean['sourceUrl'] = cleanUrl.toString();
    await submit(h, clean);
    await settled(h, String(clean['jobId']));

    const failing = await harness({
      scanner: {
        fetchSource: (url) => Promise.reject(new TypeError(`fetch failed for ${url}`)),
      },
    });
    const failed = job(failing, randomBytes(64), {
      sourceUrl: `https://${SOURCE_HOST}/chat-attachments/staging/PATHMARKER0001?${query}`,
    });
    await submit(failing, failed);
    expect((await settled(failing, String(failed['jobId']))).body['verdict']).toMatchObject({
      reason: 'source_unavailable',
    });
    await submit(failing, {
      ...failed,
      jobId: 'refused-job:1',
      sourceUrl: `https://not-allowed.example/PATHMARKER0001?${query}`,
    });

    const lines = [...h.logs, ...failing.logs];
    expect(lines.length).toBeGreaterThanOrEqual(4);
    expect(lines.some((line) => line.includes(String(failed['jobId'])))).toBe(true);
    expect(lines.some((line) => line.includes(SOURCE_HOST))).toBe(true);
    expect(lines.some((line) => line.includes('TypeError'))).toBe(true);
    for (const line of lines) {
      expect(line).not.toContain('QUERYMARKER');
      expect(line).not.toContain('PATHMARKER');
      expect(line).not.toContain('chat-attachments/staging');
      expect(line).not.toContain('https://');
    }
  });
});

const LITERAL_KEYS = new Set(['httpStatus', 'status', 'outcome', 'reason', 'protocol']);

function shapeOf(value: unknown, key?: string): unknown {
  if (Array.isArray(value)) return value.map((entry) => shapeOf(entry));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((name) => [name, shapeOf((value as Record<string, unknown>)[name], name)]),
    );
  }
  if (key !== undefined && LITERAL_KEYS.has(key)) return value;
  return value === null ? 'null' : typeof value;
}

describe('fixtures/protocol-2.json', () => {
  const fixture = JSON.parse(
    readFileSync(new URL('./fixtures/protocol-2.json', import.meta.url), 'utf8'),
  ) as {
    requests: { submit: Record<string, unknown> };
    answers: Record<string, Answer>;
  };

  it('pins request and deadline values that agree with the built formula', () => {
    const { submit: request } = fixture.requests;
    const accepted = fixture.answers['submitAccepted'];
    expect(request['byteCount']).toBe(500 * 1024 * 1024);
    expect(accepted?.body['deadlineMs']).toBe(130_000);
    expect(accepted?.body['scanId']).toBe(request['jobId']);
  });

  it('is produced by the server, shape for shape', async () => {
    const actual: Record<string, Answer> = {};
    const h = await harness({ limits: { queueMax: 1 } });
    const held = job(h, Buffer.from('HOLD the queue'));
    actual['submitAccepted'] = await submit(h, held);
    const waiting = job(h, randomBytes(32));
    await submit(h, waiting);
    await vi.waitFor(() => expect(h.clamd.scanned).toHaveLength(1));
    actual['pollScanning'] = await poll(h, String(held['jobId']));
    actual['pollQueued'] = await poll(h, String(waiting['jobId']));
    actual['submitQueueFull'] = await submit(h, job(h, randomBytes(32)));
    actual['capability'] = await capability(h);
    actual['pollUnknown'] = await poll(h, 'never-submitted:1');
    actual['unauthorized'] = await capability(h, null);
    actual['submitInvalid'] = await submit(h, { jobId: 'x' });
    actual['submitSourceNotAllowed'] = await submit(h, {
      ...job(h, randomBytes(32)),
      sourceUrl: 'https://not-allowed.example/x',
    });
    actual['submitTooLarge'] = await submit(h, {
      ...job(h, randomBytes(32)),
      byteCount: SOURCE_SCAN_DEFAULTS.maxBytes + 1,
    });

    const budget = await harness({ limits: { bytesPerHour: 100 } });
    await submit(budget, job(budget, randomBytes(80)));
    actual['submitSourceBudget'] = await submit(budget, job(budget, randomBytes(80)));

    const d = await harness();
    actual['pollDoneClean'] = (await scanned(d, randomBytes(64))).done;
    actual['pollDoneInfected'] = (await scanned(d, Buffer.from(EICAR, 'latin1'))).done;
    actual['pollDoneEncrypted'] = (await scanned(d, Buffer.from('ENCRYPTED'))).done;
    actual['pollDoneLimitsExceeded'] = (await scanned(d, Buffer.from('LIMITS'))).done;
    actual['pollDoneActivePdf'] = (
      await scanned(d, Buffer.from('%PDF-1.7 /Launch '), { mimeType: 'application/pdf' })
    ).done;
    actual['pollDoneSizeMismatch'] = (await scanned(d, randomBytes(64), { byteCount: 65 })).done;
    actual['pollDoneSourceUnavailable'] = (
      await scanned(d, randomBytes(64), {}, { mode: 'expired' })
    ).done;
    actual['pollDoneSourceChanged'] = (await scanned(d, randomBytes(64), { etag: '"older"' })).done;

    const late = await harness({ limits: { baseMs: 200, minBytesPerSec: FAST_RATE } });
    actual['pollDoneDeadline'] = (await scanned(late, Buffer.from('HOLD'))).done;

    const early = await harness({ behaviour: { refuseStream: 'stream: OK' } });
    actual['pollDoneScanFailed'] = (
      await scanned(early, randomBytes(4096), {}, { mode: 'slow' })
    ).done;

    expect(Object.keys(actual).sort()).toEqual(Object.keys(fixture.answers).sort());
    for (const [name, pinned] of Object.entries(fixture.answers)) {
      expect({ name, shape: shapeOf(actual[name]) }).toEqual({ name, shape: shapeOf(pinned) });
    }
  }, 15_000);
});
