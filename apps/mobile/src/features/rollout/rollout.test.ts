jest.mock('expo-updates', () => ({ channel: 'production' }));
jest.mock('@/services/api', () => ({ api: { get: jest.fn() } }));

import * as Updates from 'expo-updates';
import { api } from '@/services/api';
import {
  refreshRolloutRings,
  releaseChannel,
  rolloutRingFlagKey,
  useRolloutStore,
} from './rollout';

const mockedUpdates = Updates as unknown as { channel: string | null };
const mockedGet = api.get as unknown as jest.Mock;

function meResponse(featureFlags: Record<string, boolean>) {
  return {
    id: 'user_1',
    email: null,
    name: 'QA user',
    avatar_url: null,
    created_at: null,
    updated_at: 0,
    plan: { tier: 'pro', display_name: 'Pro', status: 'active', current_period_end: null },
    feature_flags: { advanced_model_access: true, ...featureFlags },
    routing_preferences: {},
  };
}

beforeEach(() => {
  mockedUpdates.channel = 'production';
  mockedGet.mockReset();
  useRolloutStore.getState().clear();
});

test('a build channel maps to the release channel the ring keys use', () => {
  mockedUpdates.channel = 'production';
  expect(releaseChannel()).toBe('stable');
  mockedUpdates.channel = 'beta';
  expect(releaseChannel()).toBe('beta');
  mockedUpdates.channel = 'preview';
  expect(releaseChannel()).toBe('nightly');
  mockedUpdates.channel = 'something-else';
  expect(releaseChannel()).toBeNull();
  mockedUpdates.channel = null;
  expect(releaseChannel()).toBeNull();
});

test('the ring key matches the key the server writes', () => {
  expect(rolloutRingFlagKey('stable', 'voice_mode')).toBe('rollout.mobile.stable.voice_mode');
  expect(rolloutRingFlagKey('beta', 'voice_mode')).toBe('rollout.mobile.beta.voice_mode');
});

test('only the rings open for this build channel are reported open', async () => {
  mockedGet.mockResolvedValue(
    meResponse({
      'rollout.mobile.stable.voice_mode': true,
      'rollout.mobile.stable.held_back': false,
      'rollout.mobile.beta.voice_mode': true,
      'rollout.desktop.stable.voice_mode': true,
      'capability.work': true,
    }),
  );

  await refreshRolloutRings();

  expect(useRolloutStore.getState().openRings).toEqual({ voice_mode: true });
});

test('a beta build reads its own channel and not the stable rings', async () => {
  mockedUpdates.channel = 'beta';
  mockedGet.mockResolvedValue(
    meResponse({
      'rollout.mobile.stable.voice_mode': true,
      'rollout.mobile.beta.plan_mode': true,
    }),
  );

  await refreshRolloutRings();

  expect(useRolloutStore.getState().openRings).toEqual({ plan_mode: true });
});

test('an unreachable server never widens a rollout and keeps the last answer', async () => {
  mockedGet.mockResolvedValue(meResponse({ 'rollout.mobile.stable.voice_mode': true }));
  await refreshRolloutRings();
  expect(useRolloutStore.getState().openRings).toEqual({ voice_mode: true });

  mockedGet.mockRejectedValue(new Error('offline'));
  await refreshRolloutRings();
  expect(useRolloutStore.getState().openRings).toEqual({ voice_mode: true });
});

test('a build whose channel is unrecognised is never handed a staged change', async () => {
  mockedUpdates.channel = 'something-else';
  await refreshRolloutRings();
  expect(mockedGet).not.toHaveBeenCalled();
  expect(useRolloutStore.getState().openRings).toEqual({});
});
