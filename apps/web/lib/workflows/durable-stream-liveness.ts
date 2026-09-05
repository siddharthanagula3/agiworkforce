import { logger } from '@/lib/logger';

export const DURABLE_FIRST_EVENT_TIMEOUT_MS = 12_000;

export const DURABLE_STALL_COOLDOWN_MS = 60_000;

export const DURABLE_STREAM_OPEN_FRAME = ': durable-open\n\n';

export const DURABLE_FIRST_EVENT_BUDGET_ENV = 'AGI_DURABLE_FIRST_EVENT_BUDGET_MS';

export const DURABLE_FIRST_EVENT_BUDGET_EVENT = 'durable_first_event_budget_exceeded';

const DEFAULT_DURABLE_FIRST_EVENT_BUDGET_MS = 2_000;
const MIN_DURABLE_FIRST_EVENT_BUDGET_MS = 1;
const NO_COOLDOWN = 0;

const FIRST_EVENT_TIMED_OUT = 'stalled' as const;

let stallCoolingDownUntilMs = NO_COOLDOWN;
let budgetCoolingDownUntilMs = NO_COOLDOWN;

export function resolveDurableFirstEventBudgetMs(): number {
  const configured = process.env[DURABLE_FIRST_EVENT_BUDGET_ENV]?.trim();
  if (!configured) return DEFAULT_DURABLE_FIRST_EVENT_BUDGET_MS;

  const budgetMs = Number(configured);
  if (!Number.isInteger(budgetMs) || budgetMs < MIN_DURABLE_FIRST_EVENT_BUDGET_MS) {
    logger.error(
      { [DURABLE_FIRST_EVENT_BUDGET_ENV]: configured },
      '[durable-stream-liveness] unrecognised first-event budget; using the default',
    );
    return DEFAULT_DURABLE_FIRST_EVENT_BUDGET_MS;
  }

  return budgetMs;
}

export function isDurableTransportCoolingDown(now: number = Date.now()): boolean {
  return now < stallCoolingDownUntilMs;
}

export function isDurableFirstEventBudgetCoolingDown(now: number = Date.now()): boolean {
  return now < budgetCoolingDownUntilMs;
}

export function recordDurableTransportStall(now: number = Date.now()): void {
  stallCoolingDownUntilMs = now + DURABLE_STALL_COOLDOWN_MS;
  budgetCoolingDownUntilMs = stallCoolingDownUntilMs;
}

export function recordDurableFirstEventBudgetOverrun(now: number = Date.now()): void {
  budgetCoolingDownUntilMs = now + DURABLE_STALL_COOLDOWN_MS;
}

export function recordDurableTransportClaim(): void {
  stallCoolingDownUntilMs = NO_COOLDOWN;
  budgetCoolingDownUntilMs = NO_COOLDOWN;
}

async function claimDurableFirstEvent(
  durable: ReadableStream<Uint8Array>,
  timeoutMs: number,
  onTimeout: () => void,
): Promise<ReadableStream<Uint8Array> | null> {
  const reader = durable.getReader();
  const startedAt = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stalled = new Promise<typeof FIRST_EVENT_TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(FIRST_EVENT_TIMED_OUT), timeoutMs);
  });

  let first: ReadableStreamReadResult<Uint8Array> | typeof FIRST_EVENT_TIMED_OUT;
  try {
    first = await Promise.race([reader.read(), stalled]);
  } catch {
    first = FIRST_EVENT_TIMED_OUT;
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (first === FIRST_EVENT_TIMED_OUT) {
    await reader.cancel().catch(() => undefined);
    onTimeout();
    return null;
  }

  recordDurableTransportClaim();
  if (Date.now() - startedAt > resolveDurableFirstEventBudgetMs()) {
    recordDurableFirstEventBudgetOverrun();
  }

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

export function claimLiveDurableStream(
  durable: ReadableStream<Uint8Array>,
  timeoutMs: number = DURABLE_FIRST_EVENT_TIMEOUT_MS,
): Promise<ReadableStream<Uint8Array> | null> {
  return claimDurableFirstEvent(durable, timeoutMs, () => recordDurableTransportStall());
}

export function claimDurableStreamWithinBudget(
  durable: ReadableStream<Uint8Array>,
  budgetMs: number = resolveDurableFirstEventBudgetMs(),
): Promise<ReadableStream<Uint8Array> | null> {
  return claimDurableFirstEvent(durable, budgetMs, () => recordDurableFirstEventBudgetOverrun());
}
