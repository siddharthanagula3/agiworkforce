import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WebSocketRateLimiter,
  WS_BLACKLIST_DURATION_MS,
  WS_BLACKLIST_THRESHOLD,
  WS_CONNECTION_LIMIT,
  WS_MESSAGE_LIMIT,
  WS_RATE_LIMIT_WINDOW_MS,
} from '../../src/middleware/rateLimit.js';

let limiter: WebSocketRateLimiter;
beforeEach(() => {
  vi.useFakeTimers();
  limiter = new WebSocketRateLimiter();
});
afterEach(() => {
  limiter.shutdown();
  vi.useRealTimers();
});

describe('WebSocket offender retention', () => {
  it('releases idle connection and message offenders after the penalty period', () => {
    for (let index = 0; index <= WS_CONNECTION_LIMIT; index++)
      limiter.checkConnection('idle-connection');
    for (let index = 0; index <= WS_MESSAGE_LIMIT; index++) limiter.checkMessage('idle-message');
    expect(limiter.getStats().topOffenders).toHaveLength(2);
    vi.advanceTimersByTime(WS_BLACKLIST_DURATION_MS + WS_RATE_LIMIT_WINDOW_MS * 3);
    expect(limiter.getStats()).toEqual({
      activeConnections: 0,
      activeMessages: 0,
      blacklistedIps: 0,
      topOffenders: [],
    });
  });

  it('does not carry an expired blacklist into the next connection budget', () => {
    for (let index = 0; index < WS_CONNECTION_LIMIT + WS_BLACKLIST_THRESHOLD; index++) {
      limiter.checkConnection('returning-client');
    }
    expect(limiter.isBlacklisted('returning-client').blacklisted).toBe(true);
    vi.setSystemTime(Date.now() + WS_BLACKLIST_DURATION_MS + WS_RATE_LIMIT_WINDOW_MS);
    for (let index = 0; index < WS_CONNECTION_LIMIT; index++) {
      expect(limiter.checkConnection('returning-client').allowed).toBe(true);
    }
    expect(limiter.checkConnection('returning-client').allowed).toBe(false);
    expect(limiter.isBlacklisted('returning-client').blacklisted).toBe(false);
  });

  it('keeps a current blacklist enforced throughout its configured duration', () => {
    for (let index = 0; index < WS_CONNECTION_LIMIT + WS_BLACKLIST_THRESHOLD; index++) {
      limiter.checkConnection('active-offender');
    }
    vi.advanceTimersByTime(WS_BLACKLIST_DURATION_MS - 1);
    expect(limiter.checkConnection('active-offender').allowed).toBe(false);
    expect(limiter.isBlacklisted('active-offender').blacklisted).toBe(true);
  });
});
