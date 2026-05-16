import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../api/analytics', () => ({
  featureFlagGetAll: vi.fn().mockResolvedValue({}),
}));

vi.mock('../analytics', () => ({
  analytics: {
    track: vi.fn(),
  },
}));

import { FeatureFlagsService, FeatureFlagName } from '../featureFlags';

describe('FeatureFlagsService', () => {
  let service: FeatureFlagsService;

  beforeEach(() => {
    localStorage.clear();
    service = new FeatureFlagsService();
  });

  describe('DESKTOP_CHAT_V3 flag', () => {
    it('is registered with a default-OFF rollout', () => {
      const flag = service.getFlag(FeatureFlagName.DESKTOP_CHAT_V3);
      expect(flag).toBeDefined();
      expect(flag?.rolloutPercentage).toBe(0);
      expect(flag?.enabledForAll).toBeUndefined();
    });

    it('is not enabled by default for an arbitrary user', () => {
      service.setUserProperties({ userId: 'user-not-in-rollout' });
      expect(service.isEnabled(FeatureFlagName.DESKTOP_CHAT_V3)).toBe(false);
    });

    it('respects a local override', () => {
      service.setLocalOverride(FeatureFlagName.DESKTOP_CHAT_V3, true);
      expect(service.isEnabled(FeatureFlagName.DESKTOP_CHAT_V3)).toBe(true);

      service.clearLocalOverride(FeatureFlagName.DESKTOP_CHAT_V3);
      expect(service.isEnabled(FeatureFlagName.DESKTOP_CHAT_V3)).toBe(false);
    });
  });

  describe('subscribe', () => {
    it('notifies listeners when an override is set or cleared', () => {
      const listener = vi.fn();
      const unsubscribe = service.subscribe(listener);

      service.setLocalOverride(FeatureFlagName.DESKTOP_CHAT_V3, true);
      expect(listener).toHaveBeenCalledTimes(1);

      service.clearLocalOverride(FeatureFlagName.DESKTOP_CHAT_V3);
      expect(listener).toHaveBeenCalledTimes(2);

      unsubscribe();
      service.setLocalOverride(FeatureFlagName.DESKTOP_CHAT_V3, true);
      expect(listener).toHaveBeenCalledTimes(2);
    });
  });
});
