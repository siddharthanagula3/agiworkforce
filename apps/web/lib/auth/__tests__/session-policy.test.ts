import { afterEach, describe, expect, it } from 'vitest';

import {
  hasOutlivedAbsoluteLifetime,
  hasOutlivedIdleLifetime,
  sessionAbsoluteDeadline,
  sessionAbsoluteLifetimeMs,
  sessionLifetimeExceeded,
  SESSION_ABSOLUTE_LIFETIME_HOURS_ENV,
  SESSION_LIFETIME_AUDIT_SOURCE,
} from '../session-policy';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const NOW = Date.parse('2026-09-20T12:00:00.000Z');

afterEach(() => {
  delete process.env[SESSION_ABSOLUTE_LIFETIME_HOURS_ENV];
});

describe('how long a sign-in may last', () => {
  it('caps a session at thirty days when nothing is configured', () => {
    expect(sessionAbsoluteLifetimeMs()).toBe(30 * DAY_MS);
  });

  it('takes a shorter cap from the environment', () => {
    process.env[SESSION_ABSOLUTE_LIFETIME_HOURS_ENV] = '12';
    expect(sessionAbsoluteLifetimeMs()).toBe(12 * HOUR_MS);
  });

  it('refuses a cap that is not a positive number rather than removing the cap', () => {
    for (const value of ['0', '-4', 'soon', '', '   ', 'NaN', 'Infinity', '-Infinity', '1e-400']) {
      process.env[SESSION_ABSOLUTE_LIFETIME_HOURS_ENV] = value;
      expect(sessionAbsoluteLifetimeMs(), `${value} removed the cap`).toBe(30 * DAY_MS);
    }
  });

  it.each(['5e301', '1e308', String(Number.MAX_VALUE)])(
    'falls back when finite hours %s overflow in milliseconds',
    (value) => {
      process.env[SESSION_ABSOLUTE_LIFETIME_HOURS_ENV] = value;
      expect(sessionAbsoluteLifetimeMs()).toBe(30 * DAY_MS);
      expect(sessionAbsoluteDeadline(NOW)).toBe(NOW + 30 * DAY_MS);
      expect(hasOutlivedAbsoluteLifetime(NOW, NOW + 30 * DAY_MS - 1)).toBe(false);
      expect(hasOutlivedAbsoluteLifetime(NOW, NOW + 30 * DAY_MS)).toBe(true);
      expect(sessionAbsoluteDeadline(null)).toBeNull();
      expect(hasOutlivedAbsoluteLifetime(null, NOW)).toBe(false);
    },
  );

  it.each([
    ['  12  ', 12],
    ['0.5', 0.5],
    ['1e-7', 1e-7],
    ['0x10', 16],
    ['1.44e3', 1440],
    ['4e301', 4e301],
  ] as const)('preserves a positive finite converted lifetime for %s', (value, hours) => {
    process.env[SESSION_ABSOLUTE_LIFETIME_HOURS_ENV] = value;
    const lifetimeMs = sessionAbsoluteLifetimeMs();
    expect(lifetimeMs).toBe(hours * HOUR_MS);
    expect(Number.isFinite(lifetimeMs)).toBe(true);
    expect(lifetimeMs).toBeGreaterThan(0);
  });

  it('has no deadline for a session whose start the provider did not report', () => {
    expect(sessionAbsoluteDeadline(null)).toBeNull();
    expect(hasOutlivedAbsoluteLifetime(null, NOW)).toBe(false);
  });

  it('ends a session exactly on its deadline, not a millisecond later', () => {
    const createdAt = NOW - 30 * DAY_MS;
    expect(hasOutlivedAbsoluteLifetime(createdAt, NOW)).toBe(true);
    expect(hasOutlivedAbsoluteLifetime(createdAt + 1, NOW)).toBe(false);
  });
});

describe('the one verdict both bounds are asked through', () => {
  it('says nothing about a session inside both bounds', () => {
    expect(
      sessionLifetimeExceeded({ createdAt: NOW - DAY_MS, expireAt: NOW + DAY_MS }, NOW),
    ).toBeNull();
  });

  it('names the absolute cap for a session older than policy allows', () => {
    expect(
      sessionLifetimeExceeded({ createdAt: NOW - 400 * DAY_MS, expireAt: NOW + DAY_MS }, NOW),
    ).toBe('absolute');
  });

  it("names the idle bound for a session past the provider's own expiry", () => {
    expect(sessionLifetimeExceeded({ createdAt: NOW - DAY_MS, expireAt: NOW - 1 }, NOW)).toBe(
      'idle',
    );
    expect(hasOutlivedIdleLifetime(null, NOW)).toBe(false);
  });

  it('prefers the bound that names the product policy when both have passed', () => {
    expect(sessionLifetimeExceeded({ createdAt: NOW - 400 * DAY_MS, expireAt: NOW - 1 }, NOW)).toBe(
      'absolute',
    );
  });

  it('gives every bound a distinct audit source', () => {
    const sources = Object.values(SESSION_LIFETIME_AUDIT_SOURCE);
    expect(new Set(sources).size).toBe(sources.length);
    for (const source of sources) expect(source).toMatch(/^[a-z_]+$/);
  });
});
