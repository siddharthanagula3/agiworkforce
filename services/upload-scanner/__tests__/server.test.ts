import { randomBytes } from 'node:crypto';
import { request } from 'node:http';
import { connect, type AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';

import type { ClamdAddress } from '../src/clamd.ts';
import { SIGNATURE_MAX_AGE_MS, createScannerServer, type ScannerOptions } from '../src/server.ts';
import {
  EICAR,
  EICAR_SIGNATURE,
  startFakeClamd,
  type FakeClamd,
  type FakeClamdBehaviour,
} from './fake-clamd.ts';

const TOKEN = randomBytes(32).toString('hex');
const PREVIOUS_TOKEN = randomBytes(32).toString('hex');
const SIGNATURES_PUBLISHED_AT = Date.parse('2026-09-28T04:00:00Z');
const HOUR_MS = 60 * 60 * 1000;

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()?.();
});

async function fakeClamd(behaviour?: FakeClamdBehaviour): Promise<FakeClamd> {
  const clamd = await startFakeClamd(behaviour);
  cleanups.push(clamd.close);
  return clamd;
}

async function stoppedClamd(): Promise<ClamdAddress> {
  const clamd = await startFakeClamd();
  await clamd.close();
  return clamd.address;
}

async function listen(clamd: ClamdAddress, options: Partial<ScannerOptions> = {}): Promise<string> {
  const server = createScannerServer({ tokens: [TOKEN], clamd, ...options });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(
    () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  );
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

function rawStatusLine(port: number, request: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let received = '';
    const socket = connect(port, '127.0.0.1', () => socket.write(request));
    socket.on('data', (data) => {
      received += data.toString('latin1');
    });
    socket.on('error', reject);
    socket.on('close', () => resolve(received.split('\r\n', 1)[0] ?? ''));
  });
}

function scanInParts(
  url: string,
  parts: Buffer[],
  pauseMs: number,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const upload = request(
      `${url}/scan`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(parts.reduce((total, part) => total + part.length, 0)),
        },
      },
      (response) => {
        let text = '';
        response.on('data', (chunk: Buffer) => {
          text += chunk.toString('utf8');
        });
        response.on('end', () =>
          resolve({ status: response.statusCode ?? 0, body: JSON.parse(text) }),
        );
      },
    );
    upload.on('error', reject);
    const [first, ...rest] = parts;
    if (first) upload.write(first);
    setTimeout(() => {
      for (const part of rest) upload.write(part);
      upload.end();
    }, pauseMs);
  });
}

function scan(url: string, body: Uint8Array, token: string | null = TOKEN): Promise<Response> {
  return fetch(`${url}/scan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body,
  });
}

describe('POST /scan', () => {
  it('answers safe for a clean file after streaming every byte to clamd', async () => {
    const clamd = await fakeClamd();
    const url = await listen(clamd.address);
    const bytes = randomBytes(300_000);

    const response = await scan(url, bytes);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ safe: true });
    expect(clamd.scanned).toEqual([bytes]);
  });

  it('answers not safe for the EICAR test file', async () => {
    expect(EICAR).toHaveLength(68);
    const clamd = await fakeClamd();
    const url = await listen(clamd.address);

    const response = await scan(url, Buffer.from(EICAR, 'latin1'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      safe: false,
      detail: `ClamAV detected ${EICAR_SIGNATURE}`,
    });
  });

  it('tells the web when a file was refused for being password protected', async () => {
    const clamd = await fakeClamd({ answer: () => 'stream: Heuristics.Encrypted.PDF FOUND' });
    const url = await listen(clamd.address);

    const response = await scan(url, randomBytes(64));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      safe: false,
      detail: 'ClamAV detected Heuristics.Encrypted.PDF',
      reason: 'encrypted',
    });
  });

  it('fails closed when clamd answers before the stream ends', async () => {
    const clamd = await fakeClamd({ refuseStream: 'stream: OK' });
    const url = await listen(clamd.address);

    const response = await scanInParts(url, [randomBytes(1024), randomBytes(1024)], 200);

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ safe: false });
  });

  it('answers not safe for a file clamd could not scan to the end', async () => {
    const clamd = await fakeClamd({
      answer: () => 'stream: Heuristics.Limits.Exceeded.MaxRecursion FOUND',
    });
    const url = await listen(clamd.address);

    const response = await scan(url, randomBytes(64));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      safe: false,
      detail: 'ClamAV detected Heuristics.Limits.Exceeded.MaxRecursion',
    });
  });

  it('refuses a request without the bearer token and never reaches clamd', async () => {
    const clamd = await fakeClamd();
    const url = await listen(clamd.address);

    const response = await scan(url, Buffer.from(EICAR, 'latin1'), null);

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ safe: false });
    expect(clamd.connections()).toBe(0);
  });

  it('refuses a request with the wrong token', async () => {
    const clamd = await fakeClamd();
    const url = await listen(clamd.address);

    const response = await scan(url, randomBytes(16), randomBytes(32).toString('hex'));

    expect(response.status).toBe(401);
    expect(clamd.connections()).toBe(0);
  });

  it('accepts the previous token while it is being rotated out', async () => {
    const clamd = await fakeClamd();
    const url = await listen(clamd.address, { tokens: [TOKEN, PREVIOUS_TOKEN] });

    const response = await scan(url, randomBytes(16), PREVIOUS_TOKEN);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ safe: true });
  });

  it('scans an upload at the size limit and refuses one byte more without scanning it', async () => {
    const clamd = await fakeClamd();
    const url = await listen(clamd.address, { maxBytes: 1024 });

    const atLimit = await scan(url, randomBytes(1024));
    expect(atLimit.status).toBe(200);
    expect(clamd.connections()).toBe(1);

    const oversize = await scan(url, randomBytes(1025));
    expect(oversize.status).toBe(413);
    expect(await oversize.json()).toMatchObject({ safe: false });
    expect(clamd.connections()).toBe(1);
  });

  it('refuses a body whose length is not declared up front', async () => {
    const clamd = await fakeClamd();
    const url = await listen(clamd.address);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(randomBytes(16));
        controller.close();
      },
    });

    const response = await fetch(`${url}/scan`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}` },
      body,
      duplex: 'half',
    } as RequestInit);

    expect(response.status).toBe(411);
    expect(clamd.connections()).toBe(0);
  });

  it('fails closed when clamd is not running', async () => {
    const url = await listen(await stoppedClamd());

    const response = await scan(url, randomBytes(16));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ safe: false });
  });

  it('fails closed when clamd reports an error instead of a verdict', async () => {
    const clamd = await fakeClamd({ answer: () => 'INSTREAM size limit exceeded. ERROR' });
    const url = await listen(clamd.address);

    const response = await scan(url, randomBytes(16));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ safe: false });
  });

  it('fails closed and still answers when clamd drops the stream partway', async () => {
    const clamd = await fakeClamd({ refuseStream: 'INSTREAM size limit exceeded. ERROR' });
    const url = await listen(clamd.address);

    const response = await scan(url, randomBytes(4 * 1024 * 1024));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ safe: false });
  });

  it('fails closed when clamd does not answer before the deadline', async () => {
    const clamd = await fakeClamd({ answer: () => null });
    const url = await listen(clamd.address, { scanDeadlineMs: 200 });

    const response = await scan(url, randomBytes(16));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ safe: false });
  });

  it('answers not found for any other route', async () => {
    const clamd = await fakeClamd();
    const url = await listen(clamd.address);

    const response = await fetch(`${url}/scan`);

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ safe: false });
  });

  it('keeps serving after a request target that is not a valid URL', async () => {
    const clamd = await fakeClamd();
    const url = await listen(clamd.address);

    const statusLine = await rawStatusLine(
      Number(new URL(url).port),
      'GET http://[ HTTP/1.1\r\nHost: scanner\r\nConnection: close\r\n\r\n',
    );

    expect(statusLine).toBe('HTTP/1.1 404 Not Found');
    expect((await fetch(`${url}/health`)).status).toBe(200);
  });
});

describe('GET /health', () => {
  it('reports the engine, signature version and signature age from clamd', async () => {
    const clamd = await fakeClamd();
    const url = await listen(clamd.address, { now: () => SIGNATURES_PUBLISHED_AT + 6 * HOUR_MS });

    const response = await fetch(`${url}/health`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    const anonymous = await fetch(`${url}/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'ok',
      engine: '1.4.6',
      signatures: { version: 27790, publishedAt: '2026-09-28T04:00:00.000Z', ageHours: 6 },
    });
    expect(await anonymous.json()).toEqual({ status: 'ok' });
  });

  it('keeps serving on stale signatures and reports them as stale', async () => {
    const clamd = await fakeClamd();
    const url = await listen(clamd.address, {
      now: () => SIGNATURES_PUBLISHED_AT + SIGNATURE_MAX_AGE_MS + HOUR_MS,
    });

    const health = await fetch(`${url}/health`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    const scan = await fetch(`${url}/scan`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}` },
      body: randomBytes(16),
    });

    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ status: 'stale', signatures: { ageHours: 169 } });
    expect(scan.status).toBe(200);
    expect(await scan.json()).toEqual({ safe: true });
  });

  it('turns unhealthy when clamd is not running', async () => {
    const url = await listen(await stoppedClamd());

    const response = await fetch(`${url}/health`);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unavailable' });
  });

  it('turns unhealthy when clamd has no signature database loaded', async () => {
    const clamd = await fakeClamd({ version: 'ClamAV 1.4.6' });
    const url = await listen(clamd.address);

    const response = await fetch(`${url}/health`);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unavailable' });
  });
});

describe('GET /health/signatures', () => {
  it('passes while the signatures are fresh', async () => {
    const clamd = await fakeClamd();
    const url = await listen(clamd.address, { now: () => SIGNATURES_PUBLISHED_AT + HOUR_MS });

    const response = await fetch(`${url}/health/signatures`);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'ok' });
  });

  it('fails once the signatures are older than ClamAV warns about', async () => {
    const clamd = await fakeClamd();
    const url = await listen(clamd.address, {
      now: () => SIGNATURES_PUBLISHED_AT + SIGNATURE_MAX_AGE_MS + HOUR_MS,
    });

    const response = await fetch(`${url}/health/signatures`);

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ status: 'stale' });
  });

  it('fails when clamd is not running', async () => {
    const url = await listen(await stoppedClamd());

    const response = await fetch(`${url}/health/signatures`);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unavailable' });
  });
});
