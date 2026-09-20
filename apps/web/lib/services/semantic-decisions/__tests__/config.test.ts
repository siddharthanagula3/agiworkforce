import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { decisionCost, readDecisionTransportConfig } from '../config';

const COMPLETE = {
  TYPESAFE_API_KEY: 'key',
  TYPESAFE_BASE_URL: 'https://api.typesafe.ai',
  TYPESAFE_MODEL: 'pinned-version',
  TYPESAFE_INPUT_MICROUSD_PER_MTOK: '42000',
} as unknown as NodeJS.ProcessEnv;

describe('decision transport configuration', () => {
  it('reads a complete configuration', () => {
    expect(readDecisionTransportConfig(COMPLETE)).toEqual({
      configured: true,
      config: {
        apiKey: 'key',
        baseUrl: 'https://api.typesafe.ai',
        model: 'pinned-version',
        inputMicrousdPerMtok: 42000,
      },
    });
  });

  it.each(Object.keys(COMPLETE))('is unconfigured without %s', (key) => {
    expect(readDecisionTransportConfig({ ...COMPLETE, [key]: '   ' })).toEqual({
      configured: false,
      reason: 'unset',
    });
  });

  it('is unconfigured with no environment at all', () => {
    expect(readDecisionTransportConfig({} as unknown as NodeJS.ProcessEnv)).toEqual({
      configured: false,
      reason: 'unset',
    });
  });

  it.each([
    'https://evil.example.com',
    'http://api.typesafe.ai',
    'https://api.typesafe.ai.evil.example.com',
    'not-a-url',
  ])('refuses a base URL naming %s rather than dialling it', (baseUrl) => {
    expect(readDecisionTransportConfig({ ...COMPLETE, TYPESAFE_BASE_URL: baseUrl })).toMatchObject({
      configured: false,
      reason: 'invalid_base_url',
    });
  });

  it.each(['-1', 'free', 'Infinity'])('refuses an unusable price %s', (price) => {
    expect(
      readDecisionTransportConfig({ ...COMPLETE, TYPESAFE_INPUT_MICROUSD_PER_MTOK: price }),
    ).toMatchObject({ configured: false });
  });

  it('never throws on a malformed environment', () => {
    expect(() =>
      readDecisionTransportConfig({ ...COMPLETE, TYPESAFE_BASE_URL: '://' }),
    ).not.toThrow();
  });
});

describe('what one evaluation cost', () => {
  const config = {
    apiKey: 'key',
    baseUrl: 'https://api.typesafe.ai',
    model: 'pinned-version',
    inputMicrousdPerMtok: 42_000,
  };

  it('prices input tokens at the configured rate', () => {
    expect(decisionCost(1_000_000, config)).toEqual({ microusd: 42_000, cents: 5 });
  });

  it('rounds a sub-cent call up, so a run of them is never free', () => {
    expect(decisionCost(500, config).cents).toBe(1);
  });

  it('treats a missing or negative token count as nothing spent', () => {
    expect(decisionCost(-5, config)).toEqual({ microusd: 0, cents: 0 });
    expect(decisionCost(Number.NaN, config)).toEqual({ microusd: 0, cents: 0 });
  });
});
