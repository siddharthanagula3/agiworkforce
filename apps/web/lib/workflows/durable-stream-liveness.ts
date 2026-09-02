export const DURABLE_FIRST_EVENT_TIMEOUT_MS = 12_000;

export const DURABLE_STALL_COOLDOWN_MS = 60_000;

export const DURABLE_STREAM_OPEN_FRAME = ': durable-open\n\n';

let coolingDownUntilMs = 0;

export function isDurableTransportCoolingDown(now: number = Date.now()): boolean {
  return now < coolingDownUntilMs;
}

export function recordDurableTransportStall(now: number = Date.now()): void {
  coolingDownUntilMs = now + DURABLE_STALL_COOLDOWN_MS;
}

export function recordDurableTransportClaim(): void {
  coolingDownUntilMs = 0;
}

export async function claimLiveDurableStream(
  durable: ReadableStream<Uint8Array>,
  timeoutMs: number = DURABLE_FIRST_EVENT_TIMEOUT_MS,
): Promise<ReadableStream<Uint8Array> | null> {
  const reader = durable.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stalled = new Promise<'stalled'>((resolve) => {
    timer = setTimeout(() => resolve('stalled'), timeoutMs);
  });

  let first: ReadableStreamReadResult<Uint8Array> | 'stalled';
  try {
    first = await Promise.race([reader.read(), stalled]);
  } catch {
    first = 'stalled';
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (first === 'stalled') {
    await reader.cancel().catch(() => undefined);
    recordDurableTransportStall();
    return null;
  }

  recordDurableTransportClaim();
  const opening = first;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (opening.done || !opening.value) controller.close();
      else controller.enqueue(opening.value);
    },
    async pull(controller) {
      const next = await reader.read();
      if (next.done) controller.close();
      else controller.enqueue(next.value);
    },
    cancel(reason) {
      void reader.cancel(reason).catch(() => undefined);
    },
  });
}
