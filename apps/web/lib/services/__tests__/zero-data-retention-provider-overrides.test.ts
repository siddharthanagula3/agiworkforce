import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { resolveZeroDataRetentionProviderOverrides } =
  await import('../zero-data-retention-provider-overrides');

const ENV_KEYS = ['AGI_OPENAI_ZDR_AGREEMENT', 'AGI_ANTHROPIC_ZDR_AGREEMENT'];

describe('resolveZeroDataRetentionProviderOverrides', () => {
  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it('returns an empty set when neither flag is set', () => {
    expect(resolveZeroDataRetentionProviderOverrides()).toEqual(new Set());
  });

  it('includes openai when its agreement flag is set', () => {
    process.env['AGI_OPENAI_ZDR_AGREEMENT'] = '1';
    expect(resolveZeroDataRetentionProviderOverrides()).toEqual(new Set(['openai']));
  });

  it('includes anthropic when its agreement flag is set to true', () => {
    process.env['AGI_ANTHROPIC_ZDR_AGREEMENT'] = 'true';
    expect(resolveZeroDataRetentionProviderOverrides()).toEqual(new Set(['anthropic']));
  });

  it('includes both when both flags are set', () => {
    process.env['AGI_OPENAI_ZDR_AGREEMENT'] = 'on';
    process.env['AGI_ANTHROPIC_ZDR_AGREEMENT'] = '1';
    expect(resolveZeroDataRetentionProviderOverrides()).toEqual(new Set(['openai', 'anthropic']));
  });

  it('treats an unrecognized value as unset', () => {
    process.env['AGI_OPENAI_ZDR_AGREEMENT'] = 'maybe';
    expect(resolveZeroDataRetentionProviderOverrides()).toEqual(new Set());
  });
});

const { buildPromptCachePlan } = await import('@agiworkforce/types');

/**
 * An agreed-with provider is one this deployment may DISPATCH a zero-retention
 * turn to. It is not permission to leave a cached prefix behind on it, which
 * the cache plan refuses whoever serves the turn.
 */
describe('a zero-retention turn is never cached, whatever the overrides say', () => {
  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });

  const REQUEST = {
    model: 'gpt-5.6-sol',
    system: 'stable preamble',
    messages: [{ role: 'user' as const, content: 'hi' }],
    promptCache: { organizationId: 'org_alpha', userId: 'user_alpha' },
  };

  it('withholds the cache key and every breakpoint from the turn', () => {
    process.env['AGI_OPENAI_ZDR_AGREEMENT'] = '1';
    const plan = buildPromptCachePlan(
      { ...REQUEST, zeroDataRetentionOnly: true },
      { stablePrefix: 'stable preamble' },
    );

    expect(plan).toMatchObject({
      cacheable: false,
      privacyClass: 'zero_retention',
      skipReason: 'zero_data_retention',
      retention: 'none',
      maxBreakpoints: 0,
    });
    expect(plan.keyMaterial).toBeUndefined();
  });

  it('still caches the same turn once the retention requirement is lifted', () => {
    const plan = buildPromptCachePlan(REQUEST, { stablePrefix: 'stable preamble' });

    expect(plan.cacheable).toBe(true);
    expect(plan.keyMaterial).toBeDefined();
  });
});
