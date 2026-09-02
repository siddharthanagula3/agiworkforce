import { beforeEach, describe, expect, it } from 'vitest';
import {
  claimLiveDurableStream,
  isDurableTransportCoolingDown,
  recordDurableTransportClaim,
  recordDurableTransportStall,
  DURABLE_STALL_COOLDOWN_MS,
  DURABLE_STREAM_OPEN_FRAME,
} from '../durable-stream-liveness';

const enc = new TextEncoder();

function neverEmits(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({ start() {} });
}

function emits(...frames: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const f of frames) controller.enqueue(enc.encode(f));
      controller.close();
    },
  });
}

async function drain(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let out = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += dec.decode(value);
  }
  return out;
}

describe('durable stream liveness', () => {
  beforeEach(() => recordDurableTransportClaim());

  // The queue failure surfaces asynchronously AFTER start() resolves, so the
  // try/catch around the start call never fired: the transport handed back a
  // stream that produced nothing and the client spun forever.
  it('reports a stalled stream so the caller can degrade', async () => {
    await expect(claimLiveDurableStream(neverEmits(), 40)).resolves.toBeNull();
  });

  it('claims a live stream without losing its first event', async () => {
    const live = await claimLiveDurableStream(emits('data: one\n\n', 'data: two\n\n'), 500);
    expect(live).not.toBeNull();
    await expect(drain(live!)).resolves.toBe('data: one\n\ndata: two\n\n');
  });

  it('treats an immediately-closed stream as live but empty', async () => {
    const live = await claimLiveDurableStream(emits(), 500);
    expect(live).not.toBeNull();
    await expect(drain(live!)).resolves.toBe('');
  });

  it('reports a stream that errors as stalled rather than throwing', async () => {
    const boom = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error('queue operation failed'));
      },
    });
    await expect(claimLiveDurableStream(boom, 500)).resolves.toBeNull();
  });

  it('does not wait for the timeout when the first event is immediate', async () => {
    const started = Date.now();
    await claimLiveDurableStream(emits('data: fast\n\n'), 5_000);
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it('claims a stream whose only opening byte is the workflow open frame', async () => {
    const live = await claimLiveDurableStream(emits(DURABLE_STREAM_OPEN_FRAME), 500);
    expect(live).not.toBeNull();
    await expect(drain(live!)).resolves.toBe(DURABLE_STREAM_OPEN_FRAME);
  });

  it('opens the breaker on a stall so the next turn skips the probe', async () => {
    expect(isDurableTransportCoolingDown()).toBe(false);
    await claimLiveDurableStream(neverEmits(), 40);
    expect(isDurableTransportCoolingDown()).toBe(true);
  });

  it('closes the breaker once a stream is claimed', async () => {
    recordDurableTransportStall();
    await claimLiveDurableStream(emits('data: one\n\n'), 500);
    expect(isDurableTransportCoolingDown()).toBe(false);
  });

  it('reopens the transport once the cooldown elapses', () => {
    const now = Date.now();
    recordDurableTransportStall(now);
    expect(isDurableTransportCoolingDown(now + DURABLE_STALL_COOLDOWN_MS - 1)).toBe(true);
    expect(isDurableTransportCoolingDown(now + DURABLE_STALL_COOLDOWN_MS)).toBe(false);
  });
});
