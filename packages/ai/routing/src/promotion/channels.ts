import { LIFECYCLE_STAGES, type LifecycleStage } from '@agiworkforce/model-registry';

/**
 * Release channels, expressed in the registry's lifecycle vocabulary.
 *
 * A channel is not a second vocabulary beside `LIFECYCLE_STAGES`: it is the
 * serving consequence of the stage a model already carries, so a channel can
 * never claim something the catalog has not recorded.
 */

export const RELEASE_CHANNELS = ['internal', 'canary', 'stable'] as const;

export type ReleaseChannel = (typeof RELEASE_CHANNELS)[number];

const CHANNEL_STAGE_NAMES: Readonly<Record<ReleaseChannel, readonly string[]>> = {
  internal: ['shadow'],
  canary: ['canary'],
  stable: ['promoted', 'observed'],
};

const KNOWN_STAGES: ReadonlySet<string> = new Set(LIFECYCLE_STAGES);

export function isReleaseChannel(value: unknown): value is ReleaseChannel {
  return typeof value === 'string' && (RELEASE_CHANNELS as readonly string[]).includes(value);
}

export function channelRank(channel: ReleaseChannel): number {
  return RELEASE_CHANNELS.indexOf(channel);
}

/**
 * A rename in the registry's lifecycle would otherwise leave a channel matching
 * nothing at all, silently.
 */
export function channelVocabularyDrift(): string[] {
  return Object.entries(CHANNEL_STAGE_NAMES).flatMap(([channel, stages]) =>
    stages
      .filter((stage) => !KNOWN_STAGES.has(stage))
      .map(
        (stage) => `channel ${channel} names lifecycle stage ${stage}, which the registry dropped`,
      ),
  );
}

export function lifecycleStagesForChannel(channel: ReleaseChannel): readonly LifecycleStage[] {
  return CHANNEL_STAGE_NAMES[channel].filter((stage): stage is LifecycleStage =>
    KNOWN_STAGES.has(stage),
  );
}

export function channelForLifecycleStage(stage: string): ReleaseChannel | null {
  for (const channel of RELEASE_CHANNELS) {
    if (CHANNEL_STAGE_NAMES[channel].includes(stage)) return channel;
  }
  return null;
}

/**
 * Forward is one channel at a time; backward is a rollback and is always open.
 * Skipping internal or canary would promote something no traffic has seen.
 */
export function channelTransitionRejection(
  from: ReleaseChannel,
  to: ReleaseChannel,
): string | null {
  const delta = channelRank(to) - channelRank(from);
  if (delta <= 1) return null;
  return `cannot advance from ${from} to ${to}; the next channel is ${RELEASE_CHANNELS[channelRank(from) + 1]}`;
}
