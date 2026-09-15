import 'server-only';

import type { ErrorCategory } from '@agiworkforce/provider-runtime';
import { isCredentialUnfunded, resolveCredentialCooldownConfig } from '@agiworkforce/routing';
import { logger } from '@/lib/logger';
import { getKeyValueStore } from '@/lib/server/key-value';
import { getCredentialCooldownSnapshot } from '@/lib/services/free-lane/runtime-state-service';

const DEGRADED_KEY_PREFIX = 'agi-model-avail:degraded';
const DEGRADED_TTL_SECONDS = 5 * 60;
const FIELD_REASON = 'reason';
const FIELD_UNTIL_MS = 'untilMs';

export type ProviderDegradedCategory = Extract<
  ErrorCategory,
  'quota_exhausted' | 'server_overload' | 'capacity_off_switch' | 'billing_exhausted'
>;

const DEGRADED_REASON_TEXT: Readonly<Record<ProviderDegradedCategory, string>> = {
  quota_exhausted: 'This provider has hit its usage limit and is recovering.',
  server_overload: 'This provider is overloaded and recovering.',
  capacity_off_switch: 'This provider has no capacity available right now.',
  // An unfunded upstream account is an outage of exactly the same shape: every
  // request to it fails until someone acts. It reads to the customer as
  // "temporarily unavailable" rather than anything about our balance.
  billing_exhausted: 'This provider is temporarily unavailable.',
};

export interface ProviderAvailabilitySignal {
  state: 'degraded';
  reason: string;
  until: string;
}

interface MemoryMark {
  reason: string;
  untilMs: number;
}

const memoryMarks = new Map<string, MemoryMark>();

function degradedKey(providerKey: string): string {
  return `${DEGRADED_KEY_PREFIX}:${providerKey}`;
}

function degradedSignal(reason: string, untilMs: number): ProviderAvailabilitySignal {
  return { state: 'degraded', reason, until: new Date(untilMs).toISOString() };
}

function toSignal(
  reason: string,
  untilMs: number,
  nowMs: number,
): ProviderAvailabilitySignal | null {
  return untilMs <= nowMs ? null : degradedSignal(reason, untilMs);
}

export function markProviderDegraded(
  providerKey: string,
  category: ProviderDegradedCategory,
  nowMs: number = Date.now(),
): void {
  const reason = DEGRADED_REASON_TEXT[category];
  const untilMs = nowMs + DEGRADED_TTL_SECONDS * 1000;
  memoryMarks.set(providerKey, { reason, untilMs });

  const store = getKeyValueStore();
  if (!store) return;
  store
    .batch()
    .hashSet(degradedKey(providerKey), { [FIELD_REASON]: reason, [FIELD_UNTIL_MS]: untilMs })
    .expire(degradedKey(providerKey), DEGRADED_TTL_SECONDS)
    .exec()
    .catch((error: unknown) => {
      logger.warn({ error, providerKey, category }, 'provider degraded mark was not recorded');
    });
}

export async function getProviderAvailability(
  providerKey: string,
  nowMs: number = Date.now(),
): Promise<ProviderAvailabilitySignal | null> {
  const store = getKeyValueStore();
  if (store) {
    try {
      const record = await store.hashGetAll<Record<string, string | number>>(
        degradedKey(providerKey),
      );
      const untilMs = record?.[FIELD_UNTIL_MS] !== undefined ? Number(record[FIELD_UNTIL_MS]) : NaN;
      const reason = record?.[FIELD_REASON];
      if (typeof reason === 'string' && reason && Number.isFinite(untilMs)) {
        return toSignal(reason, untilMs, nowMs);
      }
      return null;
    } catch (error) {
      logger.warn({ error, providerKey }, 'provider degraded read failed');
    }
  }
  const mark = memoryMarks.get(providerKey);
  return mark ? toSignal(mark.reason, mark.untilMs, nowMs) : null;
}

export async function getProviderAvailabilityMap(
  providerKeys: readonly string[],
  nowMs: number = Date.now(),
): Promise<Readonly<Record<string, ProviderAvailabilitySignal>>> {
  const distinct = [...new Set(providerKeys)];
  const [marks, credentials] = await Promise.all([
    Promise.all(
      distinct.map(
        async (providerKey) =>
          [providerKey, await getProviderAvailability(providerKey, nowMs)] as const,
      ),
    ),
    getCredentialCooldownSnapshot(distinct, nowMs),
  ]);
  const map: Record<string, ProviderAvailabilitySignal> = {};
  for (const [providerKey, signal] of marks) {
    if (signal) map[providerKey] = signal;
  }
  // The dispatcher refuses every route on an unfunded credential for the whole
  // cooldown window; the marks above expire sooner, so without this read the
  // catalogue offers a model the next turn cannot run.
  const unfundedUntilMs = nowMs + resolveCredentialCooldownConfig().observationWindowMs;
  for (const providerKey of distinct) {
    if (map[providerKey] || !isCredentialUnfunded(credentials[providerKey])) continue;
    map[providerKey] = degradedSignal(DEGRADED_REASON_TEXT.billing_exhausted, unfundedUntilMs);
  }
  return map;
}
