import { RELEASE_CHANNELS } from './channels.mjs';

export const ROLLOUT_FLAG_PREFIX = 'rollout.';

const ID_PATTERN = /^[a-z][a-z0-9_]*$/;

/**
 * The same key shape apps/web/lib/feature-flags/rollout-rings.ts writes, so a
 * pipeline can name the ring it is about to widen without a running web app.
 */
export function rolloutRingFlagKey({ surface, channel, id }) {
  if (!RELEASE_CHANNELS.includes(channel)) {
    throw new Error(`${channel} is not a release channel`);
  }
  if (!ID_PATTERN.test(id)) throw new Error(`ring id ${id} must be lower_snake_case`);
  return `${ROLLOUT_FLAG_PREFIX}${surface}.${channel}.${id}`;
}

export function parseRolloutRingFlagKey(key) {
  if (!key.startsWith(ROLLOUT_FLAG_PREFIX)) return null;
  const [surface, channel, ...rest] = key.slice(ROLLOUT_FLAG_PREFIX.length).split('.');
  const id = rest.join('.');
  if (!surface || !channel || !id) return null;
  if (!RELEASE_CHANNELS.includes(channel)) return null;
  if (!ID_PATTERN.test(id)) return null;
  return { surface, channel, id };
}

/**
 * A release that has not been approved by the store it ships through may not be
 * described as reaching anyone. The release pipelines call this before they
 * announce a channel, so the claim and the approval cannot diverge.
 */
export function storeReleaseBlockers({ surface, channel, storeApproval, percentage }) {
  if (percentage <= 0) return [];
  if (storeApproval === 'approved') return [];
  return [
    `${surface} ${channel} would claim ${percentage}% reach while the store submission is ` +
      `${storeApproval ?? 'unrecorded'}`,
  ];
}
