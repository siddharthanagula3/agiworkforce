import { isUnreadFlagKey } from './config-schema';
import { FLAG_OFF_VARIANT, type FlagDefinition } from './flag-definition';
import { readFeatureFlagConfig, staleAfterMs, type FeatureFlagConfig } from './flag-config';

export type StaleFlagReason =
  'expired' | 'fully_rolled_out' | 'killed_and_forgotten' | 'no_declared_reader';

export interface StaleFlag {
  key: string;
  reason: StaleFlagReason;
  ageDays: number;
  updatedAt: string;
  expiresAt: string | null;
  killSwitch: boolean;
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
  if (isUnreadFlagKey(definition.key)) return 'no_declared_reader';
  if (definition.killSwitch) return 'killed_and_forgotten';
  if (definition.rules.length === 0 && definition.defaultVariant !== FLAG_OFF_VARIANT) {
    return 'fully_rolled_out';
  }
  return null;
}

// A flag is stale when it has stopped deciding anything: its window closed, it
// serves one answer to everyone, no reader spells it, or it is a forgotten kill.
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
      killSwitch: definition.killSwitch,
    });
  }
  return stale;
}

// Which stale flags a cleanup run may archive without a human deciding. An
// engaged kill switch is never in it: archiving one re-enables what it held off.
export function archivableStaleFlags(
  stale: readonly StaleFlag[],
  config: FeatureFlagConfig = readFeatureFlagConfig(),
): StaleFlag[] {
  return stale.filter((flag) => !flag.killSwitch).slice(0, config.staleCleanupBatch);
}
