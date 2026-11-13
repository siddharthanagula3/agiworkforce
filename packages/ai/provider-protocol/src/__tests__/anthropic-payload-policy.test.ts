import { describe, expect, it } from 'vitest';

import {
  applyAnthropicPayloadPolicyToParams,
  planAnthropicCacheBreakpoints,
  resolveAnthropicPayloadPolicy,
} from '../anthropic-payload-policy';
import { SYSTEM_PROMPT_CACHE_BOUNDARY } from '../system-prompt-cache-boundary';
import { formatTurnContext } from '../turn-context';

const TOOLS = [{ name: 'browser_read_page', input_schema: { type: 'object' } }];

function breakpointTtls(params: Record<string, unknown>): string[] {
  const ttls: string[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    const cacheControl = record['cache_control'] as { ttl?: string } | undefined;
    if (cacheControl) ttls.push(cacheControl.ttl ?? '5m');
    Object.entries(record)
      .filter(([key]) => key !== 'cache_control')
      .forEach(([, child]) => visit(child));
  };
  visit(params['tools']);
  visit(params['system']);
  visit(params['messages']);
  return ttls;
}

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
      tools: TOOLS,
      messages: [{ role: 'user', content: 'hello' }],
    };
    applyAnthropicPayloadPolicyToParams(params, {
      allowsServiceTier: false,
      cacheControl: { type: 'ephemeral' },
      serviceTier: undefined,
    });
    const msgs = params['messages'] as Array<{ content: unknown }>;
    expect(Array.isArray(msgs[0]?.content)).toBe(true);
    const block = (msgs[0]?.content as Array<Record<string, unknown>>)[0];
    expect(block?.['type']).toBe('text');
    expect(block?.['text']).toBe('hello');
    expect(block?.['cache_control']).toEqual({ type: 'ephemeral' });
  });

  it('attaches cache_control to the LAST block of a content-array last user turn', () => {
    const params: Record<string, unknown> = {
      tools: TOOLS,
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
    expect(system[0]?.['text']).toBe('cache-stable\n\ndynamic');
    expect(system[0]?.['cache_control']).toBeUndefined();
  });

  it('writes the conversation breakpoint for five minutes when per-turn system text precedes it', () => {
    const params: Record<string, unknown> = {
      system: [{ type: 'text', text: `stable${SYSTEM_PROMPT_CACHE_BOUNDARY}time 16:33` }],
      tools: TOOLS,
      messages: [{ role: 'user', content: 'q' }],
    };
    applyAnthropicPayloadPolicyToParams(params, {
      allowsServiceTier: false,
      cacheControl: { type: 'ephemeral', ttl: '1h' },
      serviceTier: undefined,
    });
    const system = params['system'] as Array<Record<string, unknown>>;
    const messages = params['messages'] as Array<{ content: Array<Record<string, unknown>> }>;
    expect(system[0]?.['cache_control']).toEqual({ type: 'ephemeral', ttl: '1h' });
    expect(messages[0]?.content[0]?.['cache_control']).toEqual({ type: 'ephemeral' });
  });

  it('puts the conversation breakpoint ahead of turn context in the same message', () => {
    const params: Record<string, unknown> = {
      tools: TOOLS,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'what time is it?' },
            { type: 'text', text: formatTurnContext('The current UTC date and time is X.') },
          ],
        },
      ],
    };
    applyAnthropicPayloadPolicyToParams(params, {
      allowsServiceTier: false,
      cacheControl: { type: 'ephemeral' },
      serviceTier: undefined,
    });
    const content = (params['messages'] as Array<{ content: Array<Record<string, unknown>> }>)[0]!
      .content;
    expect(content[0]?.['cache_control']).toEqual({ type: 'ephemeral' });
    expect(content[1]?.['cache_control']).toBeUndefined();
  });

  it('puts the conversation breakpoint on the tool result before a turn-context message', () => {
    const params: Record<string, unknown> = {
      tools: TOOLS,
      messages: [
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] },
        { role: 'user', content: formatTurnContext('The current UTC date and time is X.') },
      ],
    };
    applyAnthropicPayloadPolicyToParams(params, {
      allowsServiceTier: false,
      cacheControl: { type: 'ephemeral' },
      serviceTier: undefined,
    });
    const messages = params['messages'] as Array<{ content: unknown }>;
    expect((messages[0]!.content as Array<Record<string, unknown>>)[0]?.['cache_control']).toEqual({
      type: 'ephemeral',
    });
    expect(typeof messages[1]!.content).toBe('string');
  });

  it('holds the hour-long write for the system prefix and writes the conversation for five minutes', () => {
    const params: Record<string, unknown> = {
      system: [{ type: 'text', text: 'stable only' }],
      tools: TOOLS,
      messages: [
        { role: 'user', content: 'summarize this page' },
        {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 't1', name: 'browser_read_page', input: {} }],
        },
        {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 't1', content: 'page text' }],
        },
      ],
    };
    applyAnthropicPayloadPolicyToParams(params, {
      allowsServiceTier: false,
      cacheControl: { type: 'ephemeral', ttl: '1h' },
      serviceTier: undefined,
    });
    const system = params['system'] as Array<Record<string, unknown>>;
    const messages = params['messages'] as Array<{ content: Array<Record<string, unknown>> }>;
    expect(system[0]?.['cache_control']).toEqual({ type: 'ephemeral', ttl: '1h' });
    expect(messages[2]?.content[0]?.['cache_control']).toEqual({ type: 'ephemeral' });
    expect(breakpointTtls(params)).toEqual(['1h', '5m']);
  });

  it('writes no conversation entry for a one-shot request that has no tools and no reply to continue', () => {
    const params: Record<string, unknown> = {
      system: [{ type: 'text', text: 'You are a coding assistant.' }],
      messages: [{ role: 'user', content: 'Fix the issues in this function.' }],
    };
    applyAnthropicPayloadPolicyToParams(params, {
      allowsServiceTier: false,
      cacheControl: { type: 'ephemeral' },
      serviceTier: undefined,
    });
    const messages = params['messages'] as Array<{ content: unknown }>;
    expect(messages[0]?.content).toBe('Fix the issues in this function.');
    expect(breakpointTtls(params)).toEqual(['5m']);
  });

  it('keeps the conversation entry for a tool-less turn that continues an exchange', () => {
    const params: Record<string, unknown> = {
      system: [{ type: 'text', text: 'stable' }],
      messages: [
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'reply' },
        { role: 'user', content: 'second' },
      ],
    };
    applyAnthropicPayloadPolicyToParams(params, {
      allowsServiceTier: false,
      cacheControl: { type: 'ephemeral' },
      serviceTier: undefined,
    });
    const messages = params['messages'] as Array<{ content: Array<Record<string, unknown>> }>;
    expect(messages[2]?.content[0]?.['cache_control']).toEqual({ type: 'ephemeral' });
  });
});

describe('planAnthropicCacheBreakpoints', () => {
  it('plans nothing when the turn may not be cached', () => {
    expect(
      planAnthropicCacheBreakpoints(
        { cacheControl: undefined },
        { hasTools: true, hasAssistantTurn: true },
      ),
    ).toEqual({ system: undefined, conversation: undefined });
  });

  it('never gives the conversation entry the hour-long TTL', () => {
    expect(
      planAnthropicCacheBreakpoints(
        { cacheControl: { type: 'ephemeral', ttl: '1h' } },
        { hasTools: true, hasAssistantTurn: false },
      ),
    ).toEqual({
      system: { type: 'ephemeral', ttl: '1h' },
      conversation: { type: 'ephemeral' },
    });
  });
});
