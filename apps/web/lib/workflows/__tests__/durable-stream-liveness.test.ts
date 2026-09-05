import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { logger } from '@/lib/logger';
import {
  claimDurableStreamWithinBudget,
  claimLiveDurableStream,
  isDurableFirstEventBudgetCoolingDown,
  isDurableTransportCoolingDown,
  recordDurableTransportClaim,
  recordDurableTransportStall,
  resolveDurableFirstEventBudgetMs,
  DURABLE_FIRST_EVENT_BUDGET_ENV,
  DURABLE_STALL_COOLDOWN_MS,
  DURABLE_STREAM_OPEN_FRAME,
} from '../durable-stream-liveness';

const DEFAULT_BUDGET_MS = 2_000;
const TINY_BUDGET_MS = 20;
const OUTLIVES_BUDGET_MS = 200;
const CONFIGURED_BUDGET_MS = 750;

const enc = new TextEncoder();

function neverEmits(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({ start() {} });
}

function emitsAfter(
  delayMs: number,
  frame: string,
): {
  stream: ReadableStream<Uint8Array>;
  cancelled: () => boolean;
  delivered: () => boolean;
} {
  let cancelled = false;
  let delivered = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      timer = setTimeout(() => {
        if (cancelled) return;
        delivered = true;
        controller.enqueue(enc.encode(frame));
        controller.close();
      }, delayMs);
    },
    cancel() {
      cancelled = true;
      if (timer) clearTimeout(timer);
    },
  });
  return { stream, cancelled: () => cancelled, delivered: () => delivered };
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

describe('durable first-event budget', () => {
  beforeEach(() => {
    recordDurableTransportClaim();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  afterEach(() => vi.unstubAllEnvs());

  it('defaults the budget to two seconds', () => {
    expect(resolveDurableFirstEventBudgetMs()).toBe(DEFAULT_BUDGET_MS);
  });

  it('takes a configured budget from the environment', () => {
    vi.stubEnv(DURABLE_FIRST_EVENT_BUDGET_ENV, String(CONFIGURED_BUDGET_MS));
    expect(resolveDurableFirstEventBudgetMs()).toBe(CONFIGURED_BUDGET_MS);
  });

  it('reports an unusable budget rather than silently mis-timing the turn', () => {
    vi.stubEnv(DURABLE_FIRST_EVENT_BUDGET_ENV, 'soon');
    expect(resolveDurableFirstEventBudgetMs()).toBe(DEFAULT_BUDGET_MS);
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it('abandons the durable stream once the budget is spent', async () => {
    const durable = emitsAfter(OUTLIVES_BUDGET_MS, 'data: late\n\n');
    await expect(
      claimDurableStreamWithinBudget(durable.stream, TINY_BUDGET_MS),
    ).resolves.toBeNull();
    expect(durable.cancelled()).toBe(true);
  });

  it('ignores a durable event that arrives after the budget switched the turn', async () => {
    const durable = emitsAfter(OUTLIVES_BUDGET_MS, 'data: late\n\n');
    const claimed = await claimDurableStreamWithinBudget(durable.stream, TINY_BUDGET_MS);
    expect(claimed).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, OUTLIVES_BUDGET_MS * 2));
    expect(durable.delivered()).toBe(false);
  });

  it('claims the durable stream when the first event beats the budget', async () => {
    const live = await claimDurableStreamWithinBudget(emits('data: one\n\n'), DEFAULT_BUDGET_MS);
    expect(live).not.toBeNull();
    await expect(drain(live!)).resolves.toBe('data: one\n\n');
  });

  it('leaves the stall breaker closed so an agi work run keeps the durable path', async () => {
    await claimDurableStreamWithinBudget(neverEmits(), TINY_BUDGET_MS);
    expect(isDurableTransportCoolingDown()).toBe(false);
    expect(isDurableFirstEventBudgetCoolingDown()).toBe(true);
  });

  it('spends the budget once, then bypasses the durable attempt for the cooldown', async () => {
    await claimDurableStreamWithinBudget(neverEmits(), TINY_BUDGET_MS);
    const now = Date.now();
    expect(isDurableFirstEventBudgetCoolingDown(now + DURABLE_STALL_COOLDOWN_MS - 1)).toBe(true);
    expect(isDurableFirstEventBudgetCoolingDown(now + DURABLE_STALL_COOLDOWN_MS)).toBe(false);
  });

  it('opens the budget breaker when a stall is recorded', () => {
    recordDurableTransportStall();
    expect(isDurableFirstEventBudgetCoolingDown()).toBe(true);
  });

  it('opens the budget breaker when a claim outlives the budget', async () => {
    vi.stubEnv(DURABLE_FIRST_EVENT_BUDGET_ENV, String(TINY_BUDGET_MS));
    const durable = emitsAfter(OUTLIVES_BUDGET_MS, 'data: slow\n\n');
    const live = await claimLiveDurableStream(durable.stream, OUTLIVES_BUDGET_MS * 5);
    expect(live).not.toBeNull();
    expect(isDurableTransportCoolingDown()).toBe(false);
    expect(isDurableFirstEventBudgetCoolingDown()).toBe(true);
  });

  it('closes both breakers when a claim lands inside the budget', async () => {
    recordDurableTransportStall();
    await claimDurableStreamWithinBudget(emits('data: one\n\n'), DEFAULT_BUDGET_MS);
    expect(isDurableTransportCoolingDown()).toBe(false);
    expect(isDurableFirstEventBudgetCoolingDown()).toBe(false);
  });
});
