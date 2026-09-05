import { logger } from '@/lib/logger';
import { readRedisWithinBudget, wasRedisReadAbandoned } from '@/lib/server/bounded-redis-read';
import { getKeyValueStore } from '@/lib/server/key-value';

export const DURABLE_FIRST_EVENT_TIMEOUT_MS = 12_000;

export const DURABLE_STALL_COOLDOWN_MS = 60_000;

export const DURABLE_STREAM_OPEN_FRAME = ': durable-open\n\n';

export const DURABLE_FIRST_EVENT_BUDGET_ENV = 'AGI_DURABLE_FIRST_EVENT_BUDGET_MS';

export const DURABLE_FIRST_EVENT_BUDGET_EVENT = 'durable_first_event_budget_exceeded';

const DEFAULT_DURABLE_FIRST_EVENT_BUDGET_MS = 2_000;
const MIN_DURABLE_FIRST_EVENT_BUDGET_MS = 1;
const NO_COOLDOWN = 0;
const NEVER_READ = 0;

/**
 * How long a "not cooling down" answer from the shared store is trusted before
 * this instance asks again. The breaker sits on the first-token path, so a read
 * per request would trade the latency it exists to protect; one read per second
 * per instance still propagates a stall across the fleet inside the cooldown.
 */
const BREAKER_READ_INTERVAL_MS = 1_000;

const STALL_BREAKER_KEY = 'agi-durable-breaker:transport-stall';
const BUDGET_BREAKER_KEY = 'agi-durable-breaker:first-event-budget';

const FIRST_EVENT_TIMED_OUT = 'stalled' as const;

interface Breaker {
  readonly key: string;
  coolingUntilMs: number;
  lastReadAtMs: number;
}

const stallBreaker: Breaker = {
  key: STALL_BREAKER_KEY,
  coolingUntilMs: NO_COOLDOWN,
  lastReadAtMs: NEVER_READ,
};

const budgetBreaker: Breaker = {
  key: BUDGET_BREAKER_KEY,
  coolingUntilMs: NO_COOLDOWN,
  lastReadAtMs: NEVER_READ,
};

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

function shareCooldown(breaker: Breaker, coolingUntilMs: number): void {
  const store = getKeyValueStore();
  if (!store) return;
  void store
    .set(breaker.key, coolingUntilMs, { ttlMilliseconds: DURABLE_STALL_COOLDOWN_MS })
    .catch((error: unknown) => {
      logger.warn(
        { error, breaker: breaker.key },
        '[durable-stream-liveness] cooldown was not shared; it holds on this instance only',
      );
    });
}

function clearSharedCooldown(breaker: Breaker): void {
  const store = getKeyValueStore();
  if (!store) return;
  void store.delete(breaker.key).catch((error: unknown) => {
    logger.warn(
      { error, breaker: breaker.key },
      '[durable-stream-liveness] cooldown was not cleared; it will age out',
    );
  });
}

/**
 * Reads the breaker every other instance writes to, at most once per
 * {@link BREAKER_READ_INTERVAL_MS}, so a stall or a recovery elsewhere reaches
 * this instance inside a second without putting a round trip on every turn. A
 * read that fails or outlives its budget leaves this instance's own verdict
 * standing rather than reopening a breaker it knows is open.
 */
async function isCoolingDown(breaker: Breaker, now: number): Promise<boolean> {
  const localVerdict = now < breaker.coolingUntilMs;
  if (now - breaker.lastReadAtMs < BREAKER_READ_INTERVAL_MS) return localVerdict;

  const store = getKeyValueStore();
  if (!store) return localVerdict;

  breaker.lastReadAtMs = now;
  try {
    const shared = await readRedisWithinBudget(store.get<number>(breaker.key));
    if (wasRedisReadAbandoned(shared)) return localVerdict;
    breaker.coolingUntilMs = typeof shared === 'number' ? shared : NO_COOLDOWN;
    return now < breaker.coolingUntilMs;
  } catch (error) {
    logger.warn(
      { error, breaker: breaker.key },
      '[durable-stream-liveness] shared breaker read failed; using this instance only',
    );
    return localVerdict;
  }
}

export function isDurableTransportCoolingDown(now: number = Date.now()): Promise<boolean> {
  return isCoolingDown(stallBreaker, now);
}

export function isDurableFirstEventBudgetCoolingDown(now: number = Date.now()): Promise<boolean> {
  return isCoolingDown(budgetBreaker, now);
}

function openBreaker(breaker: Breaker, now: number, coolingUntilMs: number): void {
  breaker.coolingUntilMs = coolingUntilMs;
  breaker.lastReadAtMs = now;
  shareCooldown(breaker, coolingUntilMs);
}

export function recordDurableTransportStall(now: number = Date.now()): void {
  const coolingUntilMs = now + DURABLE_STALL_COOLDOWN_MS;
  openBreaker(stallBreaker, now, coolingUntilMs);
  openBreaker(budgetBreaker, now, coolingUntilMs);
}

export function recordDurableFirstEventBudgetOverrun(now: number = Date.now()): void {
  openBreaker(budgetBreaker, now, now + DURABLE_STALL_COOLDOWN_MS);
}

export function recordDurableTransportClaim(): void {
  for (const breaker of [stallBreaker, budgetBreaker]) {
    breaker.coolingUntilMs = NO_COOLDOWN;
    breaker.lastReadAtMs = NEVER_READ;
    clearSharedCooldown(breaker);
  }
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
