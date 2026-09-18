import { FLAG_OFF_VARIANT, type FlagDefinition } from './flag-definition';
import { readFeatureFlagConfig, staleAfterMs, type FeatureFlagConfig } from './flag-config';

export type StaleFlagReason = 'expired' | 'fully_rolled_out' | 'killed_and_forgotten';

export interface StaleFlag {
  key: string;
  reason: StaleFlagReason;
  ageDays: number;
  updatedAt: string;
  expiresAt: string | null;
}

const DAY_MS = 86_400_000;

function ageDays(updatedAt: string, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - Date.parse(updatedAt)) / DAY_MS));
}

function reasonFor(
  definition: FlagDefinition,
  nowMs: number,
  thresholdMs: number,
): StaleFlagReason | null {
  if (definition.expiresAt !== null && Date.parse(definition.expiresAt) <= nowMs) return 'expired';
  const idleMs = nowMs - Date.parse(definition.updatedAt);
  if (idleMs < thresholdMs) return null;
  if (definition.killSwitch) return 'killed_and_forgotten';
  if (definition.rules.length === 0 && definition.defaultVariant !== FLAG_OFF_VARIANT) {
    return 'fully_rolled_out';
  }
  return null;
}

/**
 * A flag is stale when it has stopped deciding anything: its window closed, it
 * has served one answer to everyone for longer than the configured window, or
 * it has been holding a capability off long enough that the code behind it
 * should go rather than the switch stay.
 */
export function findStaleFlags(
  definitions: readonly FlagDefinition[],
  nowMs: number = Date.now(),
  config: FeatureFlagConfig = readFeatureFlagConfig(),
): StaleFlag[] {
  const thresholdMs = staleAfterMs(config);
  const stale: StaleFlag[] = [];
  for (const definition of definitions) {
    if (definition.archivedAt !== null) continue;
    const reason = reasonFor(definition, nowMs, thresholdMs);
    if (!reason) continue;
    stale.push({
      key: definition.key,
      reason,
      ageDays: ageDays(definition.updatedAt, nowMs),
      updatedAt: definition.updatedAt,
      expiresAt: definition.expiresAt,
    });
  }
  return stale;
}

/**
 * Which stale flags a cleanup run may archive without a human deciding. A kill
 * switch is never in it: archiving one silently re-enables whatever it was
 * holding off.
 */
export function archivableStaleFlags(
  stale: readonly StaleFlag[],
  config: FeatureFlagConfig = readFeatureFlagConfig(),
): StaleFlag[] {
  return stale
    .filter((flag) => flag.reason !== 'killed_and_forgotten')
    .slice(0, config.staleCleanupBatch);
}
