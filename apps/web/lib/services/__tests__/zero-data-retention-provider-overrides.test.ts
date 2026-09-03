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
