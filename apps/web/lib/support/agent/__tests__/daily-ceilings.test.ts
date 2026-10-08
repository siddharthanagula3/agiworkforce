import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/key-value', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/key-value')>()),
  getKeyValueRateLimiter: () => null,
}));

import { checkRateLimit, rateLimitConfigs } from '@/lib/rate-limit';

const DAILY_KEYS = [
  'support-agent-anon-day',
  'support-agent-user-day',
  'support-agent-global-day',
] as const;

function request(): NextRequest {
  return new NextRequest('https://agiworkforce.com/api/support/ask', { method: 'POST' });
}

async function spend(key: (typeof DAILY_KEYS)[number], identifier: string, calls: number) {
  let admitted = 0;
  for (let index = 0; index < calls; index += 1) {
    const info = await checkRateLimit(request(), key, identifier);
    if (info.success) admitted += 1;
  }
  return admitted;
}

describe('support assistant daily ceilings', () => {
  it('are configuration beside the hourly limits, a day long, and fail closed', () => {
    expect(rateLimitConfigs['support-agent-anon-day']).toEqual({
      limit: 25,
      window: '1 d',
      failClosed: true,
    });
    expect(rateLimitConfigs['support-agent-user-day']).toEqual({
      limit: 100,
      window: '1 d',
      failClosed: true,
    });
    expect(rateLimitConfigs['support-agent-global-day']).toEqual({
      limit: 3000,
      window: '1 d',
      failClosed: true,
    });
  });

  it('sit above what the hourly limit allows in an hour and under a full day of it', () => {
    const hourlyAnon = rateLimitConfigs['support-agent-anon'].limit;
    const hourlyUser = rateLimitConfigs['support-agent-user'].limit;

    expect(rateLimitConfigs['support-agent-anon-day'].limit).toBeGreaterThan(hourlyAnon);
    expect(rateLimitConfigs['support-agent-anon-day'].limit).toBeLessThan(hourlyAnon * 24);
    expect(rateLimitConfigs['support-agent-user-day'].limit).toBeGreaterThan(hourlyUser);
    expect(rateLimitConfigs['support-agent-user-day'].limit).toBeLessThan(hourlyUser * 24);
    expect(rateLimitConfigs['support-agent-global-day'].limit).toBeGreaterThan(
      rateLimitConfigs['support-agent-user-day'].limit,
    );
  });

  it.each(DAILY_KEYS)('%s admits exactly its limit and refuses the next call', async (key) => {
    const { limit } = rateLimitConfigs[key];
    const identifier = `test:${key}`;

    expect(await spend(key, identifier, limit)).toBe(limit);

    const next = await checkRateLimit(request(), key, identifier);
    expect(next.success).toBe(false);
    expect(next.remaining).toBe(0);
    const secondsToReset = (next.reset - Date.now()) / 1000;
    expect(secondsToReset).toBeGreaterThan(23 * 60 * 60);
    expect(secondsToReset).toBeLessThanOrEqual(24 * 60 * 60);
  });

  it('counts one asker apart from another', async () => {
    const { limit } = rateLimitConfigs['support-agent-anon-day'];
    await spend('support-agent-anon-day', 'ip:198.51.100.1', limit);

    const sameAddress = await checkRateLimit(
      request(),
      'support-agent-anon-day',
      'ip:198.51.100.1',
    );
    const otherAddress = await checkRateLimit(
      request(),
      'support-agent-anon-day',
      'ip:198.51.100.2',
    );

    expect(sameAddress.success).toBe(false);
    expect(otherAddress.success).toBe(true);
  });
});
