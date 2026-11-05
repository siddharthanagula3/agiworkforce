import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { NextResponse } from 'next/server';

import { withErrorHandler } from '../error-handler';
import { payloadCeilingBytes } from '../payload-ceiling';
import { readJsonBody } from '../read-json-body';

const SCIM_PATH = '/api/scim/v2/Users';

function chunkedRequest(totalBytes: number, chunkBytes = 64 * 1024): Request {
  let sent = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= totalBytes) {
        controller.close();
        return;
      }
      const size = Math.min(chunkBytes, totalBytes - sent);
      sent += size;
      controller.enqueue(new Uint8Array(size).fill(0x61));
    },
  });

  return new Request(`http://localhost${SCIM_PATH}`, {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json' },
    // @ts-expect-error duplex is required for a streamed request body in Node
    duplex: 'half',
  });
}

function jsonRequest(payload: unknown): Request {
  return new Request(`http://localhost${SCIM_PATH}`, {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json' },
  });
}

describe('payload ceiling for bodies that declare no length', () => {
  it('preserves 413 and cancellation through the JSON helper before downstream effects', async () => {
    const ceiling = payloadCeilingBytes(SCIM_PATH);
    const cancel = vi.fn();
    const downstream = vi.fn();
    let produced = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (produced >= ceiling * 8) {
          controller.close();
          return;
        }
        produced += 64 * 1024;
        controller.enqueue(new Uint8Array(64 * 1024).fill(0x61));
      },
      cancel,
    });
    const request = new Request(`http://localhost${SCIM_PATH}`, {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json' },
      // @ts-expect-error duplex is required for a streamed request body in Node
      duplex: 'half',
    });
    const handler = withErrorHandler(async (incoming: Request) => {
      const parsed = await readJsonBody(incoming);
      downstream(parsed);
      return NextResponse.json({ ok: true });
    });

    const response = await handler(request);

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'PAYLOAD_TOO_LARGE' },
    });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(produced).toBeLessThan(ceiling * 4);
    expect(downstream).not.toHaveBeenCalled();
  });

  it('allows valid JSON through the helper below the ceiling', async () => {
    const downstream = vi.fn();
    const handler = withErrorHandler(async (incoming: Request) => {
      const parsed = await readJsonBody(incoming);
      downstream(parsed);
      return NextResponse.json(parsed);
    });

    const response = await handler(jsonRequest({ name: 'ada' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ name: 'ada' });
    expect(downstream).toHaveBeenCalledWith({ name: 'ada' });
  });

  it('keeps malformed JSON below the ceiling as 400 before downstream effects', async () => {
    const downstream = vi.fn();
    const handler = withErrorHandler(async (incoming: Request) => {
      downstream(await readJsonBody(incoming));
      return NextResponse.json({ ok: true });
    });

    const response = await handler(chunkedRequest(1024));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' },
    });
    expect(downstream).not.toHaveBeenCalled();
  });

  it('refuses a chunked body that runs past the route ceiling while it is being read', async () => {
    const handler = withErrorHandler(async (request: Request) => {
      await request.text();
      return NextResponse.json({ ok: true });
    });

    const overCeiling = payloadCeilingBytes(SCIM_PATH) + 64 * 1024;
    const response = await handler(chunkedRequest(overCeiling));

    expect(response.status).toBe(413);
  });

  it('stops reading instead of buffering the whole oversized body', async () => {
    let produced = 0;
    const ceiling = payloadCeilingBytes(SCIM_PATH);
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (produced >= ceiling * 8) {
          controller.close();
          return;
        }
        produced += 64 * 1024;
        controller.enqueue(new Uint8Array(64 * 1024).fill(0x61));
      },
    });
    const request = new Request(`http://localhost${SCIM_PATH}`, {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json' },
      // @ts-expect-error duplex is required for a streamed request body in Node
      duplex: 'half',
    });

    const handler = withErrorHandler(async (incoming: Request) => {
      await incoming.text();
      return NextResponse.json({ ok: true });
    });

    expect((await handler(request)).status).toBe(413);
    expect(produced).toBeLessThan(ceiling * 4);
  });

  it('lets a chunked body under the ceiling through untouched', async () => {
    const handler = withErrorHandler(async (request: Request) => {
      const text = await request.text();
      return NextResponse.json({ length: text.length });
    });

    const response = await handler(chunkedRequest(4 * 1024));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ length: 4 * 1024 });
  });

  it('still parses a normal JSON body through the metered reader', async () => {
    const handler = withErrorHandler(async (request: Request) => {
      const body = (await request.json()) as { name: string };
      return NextResponse.json({ name: body.name });
    });

    const response = await handler(jsonRequest({ name: 'ada' }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ name: 'ada' });
  });
});
