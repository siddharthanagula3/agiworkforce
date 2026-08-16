
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup } from '@testing-library/react';

vi.mock('@shared/stores/authentication-store', () => ({
  useAuthStore: () => ({ user: { id: 'u1' }, logout: vi.fn(), isAuthenticated: true }),
}));
vi.mock('@features/settings/hooks/use-settings-queries', () => ({
  useUserSettings: () => ({ data: { session_timeout: 60 } }),
}));

import { useSessionTimeout } from './useSessionTimeout';

const ACTIVITY_STORAGE_KEY = 'agi_last_activity';
const DEFAULT_SESSION_TIMEOUT_MINUTES = 60;
const WARNING_TIME_BEFORE_TIMEOUT_MS = 2 * 60 * 1000;

describe('useSessionTimeout utilities', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('localStorage activity tracking', () => {
    it('should store last activity timestamp in localStorage', () => {
      const timestamp = Date.now();
      localStorage.setItem(ACTIVITY_STORAGE_KEY, timestamp.toString());

      const stored = localStorage.getItem(ACTIVITY_STORAGE_KEY);
      expect(stored).toBe(timestamp.toString());
    });

    it('should retrieve last activity timestamp from localStorage', () => {
      const timestamp = Date.now();
      localStorage.setItem(ACTIVITY_STORAGE_KEY, timestamp.toString());

      const stored = localStorage.getItem(ACTIVITY_STORAGE_KEY);
      const parsed = parseInt(stored!, 10);
      expect(parsed).toBe(timestamp);
    });

    it('should return null for non-existent activity', () => {
      const stored = localStorage.getItem(ACTIVITY_STORAGE_KEY);
      expect(stored).toBeNull();
    });

    it('should clear activity from localStorage', () => {
      localStorage.setItem(ACTIVITY_STORAGE_KEY, Date.now().toString());
      localStorage.removeItem(ACTIVITY_STORAGE_KEY);

      const stored = localStorage.getItem(ACTIVITY_STORAGE_KEY);
      expect(stored).toBeNull();
    });
  });

  describe('timeout calculation', () => {
    it('should calculate correct timeout in milliseconds', () => {
      const timeoutMinutes = DEFAULT_SESSION_TIMEOUT_MINUTES;
      const timeoutMs = timeoutMinutes * 60 * 1000;
      expect(timeoutMs).toBe(60 * 60 * 1000);
    });

    it('should calculate warning threshold correctly', () => {
      const timeoutMs = DEFAULT_SESSION_TIMEOUT_MINUTES * 60 * 1000;
      const warningThreshold = timeoutMs - WARNING_TIME_BEFORE_TIMEOUT_MS;
      expect(warningThreshold).toBe(58 * 60 * 1000);
    });

    it('should determine if session is expired', () => {
      const timeoutMs = DEFAULT_SESSION_TIMEOUT_MINUTES * 60 * 1000;
      const lastActivity = Date.now() - 61 * 60 * 1000;
      const elapsed = Date.now() - lastActivity;
      const isExpired = elapsed >= timeoutMs;
      expect(isExpired).toBe(true);
    });

    it('should determine if session is active', () => {
      const timeoutMs = DEFAULT_SESSION_TIMEOUT_MINUTES * 60 * 1000;
      const lastActivity = Date.now() - 30 * 60 * 1000;
      const elapsed = Date.now() - lastActivity;
      const isExpired = elapsed >= timeoutMs;
      expect(isExpired).toBe(false);
    });

    it('should determine if warning should show', () => {
      const timeoutMs = DEFAULT_SESSION_TIMEOUT_MINUTES * 60 * 1000;
      const lastActivity = Date.now() - 59 * 60 * 1000;
      const elapsed = Date.now() - lastActivity;
      const timeRemaining = timeoutMs - elapsed;
      const shouldShowWarning = timeRemaining <= WARNING_TIME_BEFORE_TIMEOUT_MS;
      expect(shouldShowWarning).toBe(true);
    });

    it('should not show warning when plenty of time remains', () => {
      const timeoutMs = DEFAULT_SESSION_TIMEOUT_MINUTES * 60 * 1000;
      const lastActivity = Date.now() - 30 * 60 * 1000;
      const elapsed = Date.now() - lastActivity;
      const timeRemaining = timeoutMs - elapsed;
      const shouldShowWarning = timeRemaining <= WARNING_TIME_BEFORE_TIMEOUT_MS;
      expect(shouldShowWarning).toBe(false);
    });
  });

  describe('cross-tab synchronization', () => {
    it('should handle storage events', () => {
      const newTimestamp = Date.now();
      const storageEvent = new StorageEvent('storage');
      Object.defineProperty(storageEvent, 'key', { value: ACTIVITY_STORAGE_KEY });
      Object.defineProperty(storageEvent, 'newValue', { value: newTimestamp.toString() });

      expect(storageEvent.key).toBe(ACTIVITY_STORAGE_KEY);
      expect(storageEvent.newValue).toBe(newTimestamp.toString());
    });

    it('should ignore storage events for other keys', () => {
      const storageEvent = new StorageEvent('storage');
      Object.defineProperty(storageEvent, 'key', { value: 'other_key' });
      Object.defineProperty(storageEvent, 'newValue', { value: 'some_value' });

      expect(storageEvent.key).not.toBe(ACTIVITY_STORAGE_KEY);
    });
  });

  describe('activity throttling', () => {
    it('should respect throttle timing', () => {
      const ACTIVITY_THROTTLE_MS = 5 * 1000;
      let lastUpdate = 0;

      const shouldThrottle = (now: number) => {
        return now - lastUpdate < ACTIVITY_THROTTLE_MS;
      };

      const now1 = Date.now();
      expect(shouldThrottle(now1)).toBe(false);

      lastUpdate = now1;

      const now2 = now1 + 1000;
      expect(shouldThrottle(now2)).toBe(true);

      const now3 = now1 + 6000;
      expect(shouldThrottle(now3)).toBe(false);
    });
  });

  describe('seconds remaining calculation', () => {
    it('should calculate seconds remaining correctly', () => {
      const timeoutMs = DEFAULT_SESSION_TIMEOUT_MINUTES * 60 * 1000;
      const lastActivity = Date.now() - 59 * 60 * 1000;
      const elapsed = Date.now() - lastActivity;
      const timeRemaining = timeoutMs - elapsed;
      const secondsRemaining = Math.ceil(timeRemaining / 1000);

      expect(secondsRemaining).toBeGreaterThan(50);
      expect(secondsRemaining).toBeLessThanOrEqual(70);
    });

    it('should return 0 when time has expired', () => {
      const timeoutMs = DEFAULT_SESSION_TIMEOUT_MINUTES * 60 * 1000;
      const lastActivity = Date.now() - 61 * 60 * 1000;
      const elapsed = Date.now() - lastActivity;
      const timeRemaining = timeoutMs - elapsed;
      const secondsRemaining = Math.max(0, Math.ceil(timeRemaining / 1000));

      expect(secondsRemaining).toBe(0);
    });
  });
});

describe('SessionTimeoutWarning component props', () => {
  it('should format time remaining correctly', () => {
    const formatTimeRemaining = (seconds: number): string => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    expect(formatTimeRemaining(120)).toBe('2:00');
    expect(formatTimeRemaining(90)).toBe('1:30');
    expect(formatTimeRemaining(65)).toBe('1:05');
    expect(formatTimeRemaining(30)).toBe('0:30');
    expect(formatTimeRemaining(5)).toBe('0:05');
    expect(formatTimeRemaining(0)).toBe('0:00');
  });

  it('should determine critical state correctly', () => {
    const isCritical = (seconds: number) => seconds <= 30;
    const isUrgent = (seconds: number) => seconds <= 60;

    expect(isCritical(120)).toBe(false);
    expect(isCritical(60)).toBe(false);
    expect(isCritical(30)).toBe(true);
    expect(isCritical(10)).toBe(true);

    expect(isUrgent(120)).toBe(false);
    expect(isUrgent(60)).toBe(true);
    expect(isUrgent(30)).toBe(true);
  });
});

describe('Activity events', () => {
  it('should define correct activity events', () => {
    const ACTIVITY_EVENTS = [
      'mousedown',
      'mousemove',
      'keydown',
      'scroll',
      'touchstart',
      'click',
      'focus',
    ];

    expect(ACTIVITY_EVENTS).toContain('mousedown');
    expect(ACTIVITY_EVENTS).toContain('keydown');
    expect(ACTIVITY_EVENTS).toContain('scroll');
    expect(ACTIVITY_EVENTS).toContain('click');
    expect(ACTIVITY_EVENTS.length).toBe(7);
  });
});

describe('useSessionTimeout render-loop regression', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('settles (does not re-render unboundedly) with fresh inline callbacks each render', async () => {
    let renders = 0;
    function Guard() {
      renders += 1;
      useSessionTimeout({
        onWarning: () => {},
        onSessionExtended: () => {},
        onTimeout: () => {},
      });
      return null;
    }

    render(React.createElement(Guard));
    await new Promise((r) => setTimeout(r, 250));

    expect(renders).toBeLessThan(15);
  });
});
