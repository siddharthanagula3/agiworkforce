import { describe, it, expect } from 'vitest';
import {
  resolveCacheRetention,
  isGooglePromptCacheEligible,
  buildAnthropicCacheControl,
  retentionToAnthropicTtl,
} from '../cache-retention';

describe('isGooglePromptCacheEligible', () => {
  it('returns true for catalog Gemini models that declare caching', () => {
    // Eligibility is catalog-driven (capabilities.caching / cached_input), not an
    // id-prefix heuristic — these models are present in models.json with caching.
    expect(isGooglePromptCacheEligible('google', 'gemini-3.1-pro-preview')).toBe(true);
    expect(isGooglePromptCacheEligible('google', 'gemini-3.1-flash-lite')).toBe(true);
    expect(isGooglePromptCacheEligible('google', 'gemini-3.5-flash')).toBe(true);
  });

  it('returns false for Google model ids not in the catalog (no prefix heuristic)', () => {
    // Eligibility is catalog-driven, not an id-prefix heuristic: a Google id that
    // is absent from models.json is not eligible until added to models.curation.json.
    expect(isGooglePromptCacheEligible('google', 'gemini-not-in-catalog-test')).toBe(false);
    expect(isGooglePromptCacheEligible('google', 'some-unknown-google-model')).toBe(false);
  });

  it('returns false for non-google providers even with gemini model id', () => {
    expect(isGooglePromptCacheEligible('openrouter', 'gemini-3.1-pro-preview')).toBe(false);
  });
});

describe('resolveCacheRetention', () => {
  // --- Anthropic direct ---
  it('defaults to short for anthropic direct', () => {
    expect(resolveCacheRetention(undefined, 'anthropic')).toBe('short');
  });

  it('defaults to short for anthropic direct with model id', () => {
    expect(resolveCacheRetention(undefined, 'anthropic', 'claude-sonnet-4-6')).toBe('short');
  });

  it('honors explicit cacheRetention long for anthropic', () => {
    expect(resolveCacheRetention({ cacheRetention: 'long' }, 'anthropic')).toBe('long');
  });

  it('honors explicit cacheRetention none for anthropic', () => {
    expect(resolveCacheRetention({ cacheRetention: 'none' }, 'anthropic')).toBe('none');
  });

  it('maps legacy cacheControlTtl 5m to short for anthropic', () => {
    expect(resolveCacheRetention({ cacheControlTtl: '5m' }, 'anthropic')).toBe('short');
  });

  it('maps legacy cacheControlTtl 1h to long for anthropic', () => {
    expect(resolveCacheRetention({ cacheControlTtl: '1h' }, 'anthropic')).toBe('long');
  });

  // --- OpenRouter + Anthropic-routed models ---
  it('defaults to short for openrouter + anthropic/ model', () => {
    expect(resolveCacheRetention(undefined, 'openrouter', 'anthropic/claude-opus-4-8')).toBe(
      'short',
    );
  });

  it('returns undefined for openrouter + non-anthropic model', () => {
    expect(
      resolveCacheRetention(undefined, 'openrouter', 'meta-llama/llama-3.3-70b-instruct:free'),
    ).toBeUndefined();
  });

  it('returns undefined for openrouter + google model', () => {
    expect(resolveCacheRetention(undefined, 'openrouter', 'google/gemini-3-pro')).toBeUndefined();
  });

  it('honors explicit cacheRetention for openrouter + anthropic/ model', () => {
    expect(
      resolveCacheRetention({ cacheRetention: 'long' }, 'openrouter', 'anthropic/claude-opus-4-8'),
    ).toBe('long');
  });

  // --- OpenAI ---
  it('returns undefined for openai (auto-prefix caching, no TTL knob)', () => {
    expect(resolveCacheRetention(undefined, 'openai', 'gpt-5.5')).toBeUndefined();
  });

  it('returns undefined for openai even with explicit cacheRetention', () => {
    // OpenAI does not support explicit cache markers; param is ignored.
    expect(resolveCacheRetention({ cacheRetention: 'long' }, 'openai', 'gpt-5.5')).toBeUndefined();
  });

  // --- Google ---
  it('returns undefined for google without explicit config (no auto-default)', () => {
    expect(resolveCacheRetention(undefined, 'google', 'gemini-3.1-pro-preview')).toBeUndefined();
  });

  it('passes explicit cacheRetention for a cache-eligible google model', () => {
    expect(resolveCacheRetention({ cacheRetention: 'long' }, 'google', 'gemini-3.5-flash')).toBe(
      'long',
    );
  });

  it('maps legacy cacheControlTtl for google gemini-3.x', () => {
    expect(
      resolveCacheRetention({ cacheControlTtl: '5m' }, 'google', 'gemini-3.1-pro-preview'),
    ).toBe('short');
  });

  it('returns undefined for google non-eligible model (older gemini)', () => {
    expect(
      resolveCacheRetention({ cacheRetention: 'long' }, 'google', 'gemini-1.5-pro'),
    ).toBeUndefined();
  });

  // --- Others ---
  it('returns undefined for deepseek', () => {
    expect(resolveCacheRetention(undefined, 'deepseek', 'deepseek-v4-flash')).toBeUndefined();
  });

  it('returns undefined for groq', () => {
    expect(resolveCacheRetention(undefined, 'groq', 'llama-3.3-70b-versatile')).toBeUndefined();
  });
});

describe('retentionToAnthropicTtl', () => {
  it('maps short to 5m', () => {
    expect(retentionToAnthropicTtl('short')).toBe('5m');
  });

  it('maps long to 1h', () => {
    expect(retentionToAnthropicTtl('long')).toBe('1h');
  });

  it('maps none to undefined', () => {
    expect(retentionToAnthropicTtl('none')).toBeUndefined();
  });
});

describe('buildAnthropicCacheControl', () => {
  it('returns { type: ephemeral } for short (default Anthropic cache, no explicit ttl)', () => {
    expect(buildAnthropicCacheControl('short')).toEqual({ type: 'ephemeral' });
  });

  it('returns { type: ephemeral, ttl: 1h } for long', () => {
    expect(buildAnthropicCacheControl('long')).toEqual({ type: 'ephemeral', ttl: '1h' });
  });

  it('returns null for none', () => {
    expect(buildAnthropicCacheControl('none')).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(buildAnthropicCacheControl(undefined)).toBeNull();
  });
});
