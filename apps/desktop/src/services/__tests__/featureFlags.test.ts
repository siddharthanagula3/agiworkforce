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
    it('is registered as enabledForAll (default-on)', () => {
      const flag = service.getFlag(FeatureFlagName.DESKTOP_CHAT_V3);
      expect(flag).toBeDefined();
      expect(flag?.enabledForAll).toBe(true);
      expect(flag?.rolloutPercentage).toBeUndefined();
    });

    it('is enabled by default for any user', () => {
      service.setUserProperties({ userId: 'user-abc' });
      expect(service.isEnabled(FeatureFlagName.DESKTOP_CHAT_V3)).toBe(true);
    });

    it('is enabled even without a userId set', () => {
      expect(service.isEnabled(FeatureFlagName.DESKTOP_CHAT_V3)).toBe(true);
    });

    it('respects a local override kill-switch (override=false disables v3)', () => {
      expect(service.isEnabled(FeatureFlagName.DESKTOP_CHAT_V3)).toBe(true);

      service.setLocalOverride(FeatureFlagName.DESKTOP_CHAT_V3, false);
      expect(service.isEnabled(FeatureFlagName.DESKTOP_CHAT_V3)).toBe(false);

      service.clearLocalOverride(FeatureFlagName.DESKTOP_CHAT_V3);
      expect(service.isEnabled(FeatureFlagName.DESKTOP_CHAT_V3)).toBe(true);
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
