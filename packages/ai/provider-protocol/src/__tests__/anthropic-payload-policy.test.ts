/**
 * Golden tests for Anthropic payload policy.
 *
 * Pins:
 *   - resolveAnthropicPayloadPolicy outputs (cacheControl shape, serviceTier)
 *   - applyAnthropicPayloadPolicyToParams attaches cache_control to the
 *     system prompt and the last user turn
 *   - the cache boundary marker, when present in the system text, splits
 *     the prompt into stable+dynamic blocks
 */

import { describe, expect, it } from 'vitest';

import {
  applyAnthropicPayloadPolicyToParams,
  resolveAnthropicPayloadPolicy,
} from '../anthropic-payload-policy';
import { SYSTEM_PROMPT_CACHE_BOUNDARY } from '../system-prompt-cache-boundary';

describe('resolveAnthropicPayloadPolicy', () => {
  it('returns no cacheControl when enableCacheControl is unset/false', () => {
    const policy = resolveAnthropicPayloadPolicy({
      api: 'anthropic-messages',
      provider: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
    });
    expect(policy.cacheControl).toBeUndefined();
  });

  it('returns ephemeral cacheControl when enableCacheControl is true on api.anthropic.com', () => {
    const policy = resolveAnthropicPayloadPolicy({
      api: 'anthropic-messages',
      provider: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      enableCacheControl: true,
    });
    expect(policy.cacheControl?.type).toBe('ephemeral');
  });

  it('honors explicit cacheRetention: long for 1h TTL on api.anthropic.com', () => {
    const policy = resolveAnthropicPayloadPolicy({
      api: 'anthropic-messages',
      provider: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      enableCacheControl: true,
      cacheRetention: 'long',
    });
    expect(policy.cacheControl?.ttl).toBe('1h');
  });

  it('cacheRetention: none disables cacheControl even when enable is true', () => {
    const policy = resolveAnthropicPayloadPolicy({
      api: 'anthropic-messages',
      provider: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      enableCacheControl: true,
      cacheRetention: 'none',
    });
    expect(policy.cacheControl).toBeUndefined();
  });

  it('passes serviceTier through to the policy', () => {
    const policy = resolveAnthropicPayloadPolicy({
      api: 'anthropic-messages',
      provider: 'anthropic',
      serviceTier: 'standard_only',
    });
    expect(policy.serviceTier).toBe('standard_only');
  });
});

describe('applyAnthropicPayloadPolicyToParams', () => {
  it('attaches service_tier to the params when allowsServiceTier=true', () => {
    const params: Record<string, unknown> = { messages: [] };
    applyAnthropicPayloadPolicyToParams(params, {
      allowsServiceTier: true,
      cacheControl: undefined,
      serviceTier: 'auto',
    });
    expect(params['service_tier']).toBe('auto');
  });

  it('does NOT overwrite service_tier the caller already supplied', () => {
    const params: Record<string, unknown> = { service_tier: 'standard_only', messages: [] };
    applyAnthropicPayloadPolicyToParams(params, {
      allowsServiceTier: true,
      cacheControl: undefined,
      serviceTier: 'auto',
    });
    expect(params['service_tier']).toBe('standard_only');
  });

  it('attaches cache_control to a string-content last user turn (wraps as TextBlock)', () => {
    const params: Record<string, unknown> = {
      messages: [{ role: 'user', content: 'hello' }],
    };
    applyAnthropicPayloadPolicyToParams(params, {
      allowsServiceTier: false,
      cacheControl: { type: 'ephemeral' },
      serviceTier: undefined,
    });
    // The string content should be coerced to a [TextBlock] with cache_control on it.
    const msgs = params['messages'] as Array<{ content: unknown }>;
    expect(Array.isArray(msgs[0]?.content)).toBe(true);
    const block = (msgs[0]?.content as Array<Record<string, unknown>>)[0];
    expect(block?.['type']).toBe('text');
    expect(block?.['text']).toBe('hello');
    expect(block?.['cache_control']).toEqual({ type: 'ephemeral' });
  });

  it('attaches cache_control to the LAST block of a content-array last user turn', () => {
    const params: Record<string, unknown> = {
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'hi' },
            { type: 'text', text: 'world' },
          ],
        },
      ],
    };
    applyAnthropicPayloadPolicyToParams(params, {
      allowsServiceTier: false,
      cacheControl: { type: 'ephemeral' },
      serviceTier: undefined,
    });
    const msgs = params['messages'] as Array<{ content: Array<Record<string, unknown>> }>;
    expect(msgs[0]?.content[0]?.['cache_control']).toBeUndefined();
    expect(msgs[0]?.content[1]?.['cache_control']).toEqual({ type: 'ephemeral' });
  });

  it('splits a system prompt with a cache boundary into stable + dynamic blocks', () => {
    const params: Record<string, unknown> = {
      system: [
        {
          type: 'text',
          text: `cache-stable preamble${SYSTEM_PROMPT_CACHE_BOUNDARY}user-specific addendum`,
        },
      ],
      messages: [{ role: 'user', content: 'q' }],
    };
    applyAnthropicPayloadPolicyToParams(params, {
      allowsServiceTier: false,
      cacheControl: { type: 'ephemeral' },
      serviceTier: undefined,
    });
    const system = params['system'] as Array<Record<string, unknown>>;
    expect(system).toHaveLength(2);
    expect(system[0]?.['text']).toBe('cache-stable preamble');
    expect(system[0]?.['cache_control']).toEqual({ type: 'ephemeral' });
    expect(system[1]?.['text']).toBe('user-specific addendum');
    expect(system[1]?.['cache_control']).toBeUndefined();
  });

  it('strips the boundary marker when cache_control is disabled', () => {
    const params: Record<string, unknown> = {
      system: [
        {
          type: 'text',
          text: `cache-stable${SYSTEM_PROMPT_CACHE_BOUNDARY}dynamic`,
        },
      ],
      messages: [],
    };
    applyAnthropicPayloadPolicyToParams(params, {
      allowsServiceTier: false,
      cacheControl: undefined,
      serviceTier: undefined,
    });
    const system = params['system'] as Array<Record<string, unknown>>;
    expect(system[0]?.['text']).toBe('cache-stable\ndynamic');
    expect(system[0]?.['cache_control']).toBeUndefined();
  });
});
