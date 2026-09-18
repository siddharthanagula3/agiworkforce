import * as Updates from 'expo-updates';
import { create } from 'zustand';
import { parseMeResponse } from '@agiworkforce/cloud-contracts';
import { api } from '@/services/api';

/**
 * The server names a staged rollout `rollout.<surface>.<channel>.<id>`, so this
 * build derives the key the same way rather than keeping a second list that can
 * drift from apps/web/lib/feature-flags/rollout-rings.ts.
 */
const ROLLOUT_FLAG_PREFIX = 'rollout.';
const MOBILE_SURFACE = 'mobile';

export type ReleaseChannel = 'stable' | 'beta' | 'nightly';

const CHANNEL_BY_EAS_CHANNEL: Readonly<Record<string, ReleaseChannel>> = {
  production: 'stable',
  beta: 'beta',
  preview: 'nightly',
  development: 'nightly',
};

export function rolloutRingFlagKey(channel: ReleaseChannel, id: string): string {
  return `${ROLLOUT_FLAG_PREFIX}${MOBILE_SURFACE}.${channel}.${id}`;
}

/**
 * The channel this binary was built for. An unrecognised channel resolves to
 * none, which matches no ring key: an unidentifiable build is never handed a
 * staged change, rather than being guessed into somebody else's ring.
 */
export function releaseChannel(): ReleaseChannel | null {
  const channel = Updates.channel;
  if (typeof channel !== 'string' || channel === '') return null;
  return CHANNEL_BY_EAS_CHANNEL[channel] ?? null;
}

interface RolloutState {
  openRings: Readonly<Record<string, boolean>>;
  loadedAt: string | null;
  refresh: () => Promise<void>;
  clear: () => void;
}

/**
 * Which staged rollouts this install is inside. An absent answer is not
 * membership: a ring stays closed until the server says this device is in it,
 * so an unreachable server can never widen a rollout and a failed refresh keeps
 * the last answer rather than dropping people mid-release.
 */
export const useRolloutStore = create<RolloutState>((set) => ({
  openRings: {},
  loadedAt: null,
  refresh: async () => {
    const channel = releaseChannel();
    if (channel === null) return;
    try {
      const parsed = parseMeResponse(await api.get<unknown>('/api/me?surface=mobile'));
      const openRings: Record<string, boolean> = {};
      const prefix = `${ROLLOUT_FLAG_PREFIX}${MOBILE_SURFACE}.${channel}.`;
      for (const [key, enabled] of Object.entries(parsed.feature_flags)) {
        if (key.startsWith(prefix) && enabled === true) openRings[key.slice(prefix.length)] = true;
      }
      set({ openRings, loadedAt: new Date().toISOString() });
    } catch (error) {
      console.warn('[rollout] refresh failed (keeping the last answer):', error);
    }
  },
  clear: () => set({ openRings: {}, loadedAt: null }),
}));

export function refreshRolloutRings(): Promise<void> {
  return useRolloutStore.getState().refresh();
}

export function useRolloutRing(id: string): boolean {
  return useRolloutStore((state) => state.openRings[id] === true);
}
