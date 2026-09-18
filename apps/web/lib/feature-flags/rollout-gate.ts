import 'server-only';

import type { FlagEvaluation, FlagSubject } from './evaluate-flags';
import { evaluateFlagsForSubject } from './flag-evaluation-service';
import {
  ROLLOUT_FLAG_PREFIX,
  parseRolloutRingFlagKey,
  ringIncluded,
  type ReleaseChannel,
  type RolloutRing,
  type RolloutSurface,
} from './rollout-rings';

export interface RolloutGate {
  ringOpen: (ring: RolloutRing) => boolean;
  openRingIds: (surface: RolloutSurface, channel: ReleaseChannel) => string[];
}

function rolloutGate(evaluations: Readonly<Record<string, FlagEvaluation>>): RolloutGate {
  return {
    ringOpen: (ring) => ringIncluded(evaluations, ring),
    openRingIds: (surface, channel) =>
      Object.entries(evaluations)
        .filter(([, evaluation]) => evaluation.enabled)
        .map(([key]) => parseRolloutRingFlagKey(key))
        .filter(
          (parsed): parsed is NonNullable<typeof parsed> =>
            parsed !== null && parsed.surface === surface && parsed.channel === channel,
        )
        .map((parsed) => parsed.id),
  };
}

/**
 * The staged rollouts this one request is inside, read once. Every surface asks
 * the same question of the same flags, so widening or holding a ring moves web,
 * desktop, mobile, the CLI and the extensions together and without a release.
 */
export async function readRolloutGate(
  subject: FlagSubject,
  nowMs: number = Date.now(),
): Promise<RolloutGate> {
  return rolloutGate(
    await evaluateFlagsForSubject(subject, { keyPrefix: ROLLOUT_FLAG_PREFIX }, nowMs),
  );
}
