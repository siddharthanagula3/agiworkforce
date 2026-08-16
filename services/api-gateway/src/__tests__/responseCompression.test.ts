import { afterAll, describe, expect, it } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { brotliDecompressSync, gunzipSync, gzipSync } from 'node:zlib';

import {
  COMPRESSION_THRESHOLD_BYTES,
  isAlreadyEncoded,
  isStreamingResponse,
  responseCompression,
} from '../middleware/responseCompression';

// supertest decompresses transparently, which is exactly what must NOT happen
// when the measurement under test is "how many bytes crossed the wire". node's
// own http client leaves the body encoded, so these read the real transfer size.
interface RawResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
}

const servers: http.Server[] = [];

function serve(register: (app: express.Express) => void): Promise<number> {
  const app = express();
  app.use(responseCompression());
  register(app);
  const server = http.createServer(app);
  servers.push(server);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port));
  });
}

function get(port: number, path: string, acceptEncoding: string): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path, headers: { 'accept-encoding': acceptEncoding } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks),
          }),
        );
      },
    );
    req.on('error', reject);
    req.end();
  });
}

afterAll(() => {
  for (const server of servers) server.close();
});

const bigPayload = {
  items: Array.from({ length: 400 }, (_, index) => ({
    id: `model-${index}`,
    label: 'a repetitive label that compresses well',
    index,
  })),
};

const jsonRoute = (app: express.Express) => app.get('/big', (_req, res) => res.json(bigPayload));

describe('gateway response compression', () => {
  it('drops the transfer size and still parses back to the same value', async () => {
    const port = await serve(jsonRoute);

    const identity = await get(port, '/big', 'identity');
    const gzip = await get(port, '/big', 'gzip');

    expect(identity.headers['content-encoding']).toBeUndefined();
    expect(gzip.headers['content-encoding']).toBe('gzip');
    expect(gzip.body.length).toBeLessThan(identity.body.length / 4);
    expect(JSON.parse(gunzipSync(gzip.body).toString('utf8'))).toEqual(bigPayload);
    expect(JSON.parse(identity.body.toString('utf8'))).toEqual(bigPayload);
  });

  it('serves brotli when the client offers it', async () => {
    const port = await serve(jsonRoute);

    const res = await get(port, '/big', 'br');

    expect(res.headers['content-encoding']).toBe('br');
    expect(JSON.parse(brotliDecompressSync(res.body).toString('utf8'))).toEqual(bigPayload);
  });

  it('honours a client that asks for no encoding', async () => {
    const port = await serve(jsonRoute);

    const res = await get(port, '/big', 'identity');

    expect(res.headers['content-encoding']).toBeUndefined();
    expect(JSON.parse(res.body.toString('utf8'))).toEqual(bigPayload);
  });

  it('advertises Vary: Accept-Encoding so a shared cache cannot cross the wires', async () => {
    const port = await serve(jsonRoute);

    const res = await get(port, '/big', 'gzip');

    expect(String(res.headers['vary'] ?? '')).toContain('Accept-Encoding');
  });

  it('leaves a body under the threshold alone', async () => {
    const port = await serve((app) => app.get('/small', (_req, res) => res.json({ ok: true })));

    const res = await get(port, '/small', 'gzip, br');

    expect(res.headers['content-encoding']).toBeUndefined();
    expect(JSON.parse(res.body.toString('utf8'))).toEqual({ ok: true });
  });

  it('never compresses an event stream, however large', async () => {
    const port = await serve((app) =>
      app.get('/stream', (_req, res) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.write(`data: ${'x'.repeat(COMPRESSION_THRESHOLD_BYTES * 4)}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      }),
    );

    const res = await get(port, '/stream', 'gzip, br');

    expect(res.headers['content-encoding']).toBeUndefined();
    expect(res.body.toString('utf8')).toContain('data: [DONE]');
  });

  it('does not re-encode a body that already carries an encoding', async () => {
    const port = await serve((app) =>
      app.get('/preencoded', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Encoding', 'gzip');
        res.end(gzipSync(Buffer.from(JSON.stringify(bigPayload), 'utf8')));
      }),
    );

    const res = await get(port, '/preencoded', 'gzip, br');

    expect(res.headers['content-encoding']).toBe('gzip');
    // One layer, not two: a single gunzip yields the object.
    expect(JSON.parse(gunzipSync(res.body).toString('utf8'))).toEqual(bigPayload);
  });

  it('leaves an already-compressed media type alone even above the threshold', async () => {
    const jpeg = Buffer.alloc(COMPRESSION_THRESHOLD_BYTES * 8, 7);
    const port = await serve((app) =>
      app.get('/photo.jpg', (_req, res) => {
        res.setHeader('Content-Type', 'image/jpeg');
        res.end(jpeg);
      }),
    );

    const res = await get(port, '/photo.jpg', 'gzip, br');

    expect(res.headers['content-encoding']).toBeUndefined();
    expect(res.body.length).toBe(jpeg.length);
  });
});

describe('compression predicates', () => {
  const fakeRes = (headers: Record<string, string>) =>
    ({ getHeader: (name: string) => headers[name] }) as unknown as Parameters<
      typeof isStreamingResponse
    >[0];

  it('detects an event stream through charset parameters', () => {
    expect(
      isStreamingResponse(fakeRes({ 'Content-Type': 'text/event-stream; charset=utf-8' })),
    ).toBe(true);
    expect(isStreamingResponse(fakeRes({ 'Content-Type': 'application/json' }))).toBe(false);
  });

  it('treats a missing or identity encoding as not yet encoded', () => {
    expect(isAlreadyEncoded(fakeRes({}))).toBe(false);
    expect(isAlreadyEncoded(fakeRes({ 'Content-Encoding': 'identity' }))).toBe(false);
    expect(isAlreadyEncoded(fakeRes({ 'Content-Encoding': 'gzip' }))).toBe(true);
  });
});
