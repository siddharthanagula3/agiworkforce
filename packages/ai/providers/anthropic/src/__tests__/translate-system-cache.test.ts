import { describe, expect, it } from 'vitest';
import type { ChatRequest } from '@agiworkforce/types';
import {
  applyAnthropicPayloadPolicyToParams,
  resolveAnthropicPayloadPolicy,
  SYSTEM_PROMPT_CACHE_BOUNDARY,
} from '@agiworkforce/provider-protocol';
import { translateChatRequest } from '../translate';
import { ANTHROPIC_PREMIUM_MODEL_ID } from './model-fixtures';

function baseReq(overrides: Partial<ChatRequest> = {}): ChatRequest {
  return {
    model: ANTHROPIC_PREMIUM_MODEL_ID,
    messages: [{ role: 'user', content: 'hi' }],
    ...overrides,
  };
}

describe('translateChatRequest · system field shape', () => {
  it('wraps a string req.system (the web path shape) into a text block array instead of passing a bare string', () => {
    const out = translateChatRequest(baseReq({ system: 'stable preamble text' }));
    expect(Array.isArray(out.system)).toBe(true);
    expect(out.system).toEqual([{ type: 'text', text: 'stable preamble text' }]);
  });

  it('wraps system-role ProviderMessages into the same array shape when req.system is not set', () => {
    const out = translateChatRequest(
      baseReq({
        messages: [
          { role: 'system', content: 'from a provider message' },
          { role: 'user', content: 'hi' },
        ],
      }),
    );
    expect(out.system).toEqual([{ type: 'text', text: 'from a provider message' }]);
  });

  it('omits system entirely for an empty string, matching the prior no-system behavior', () => {
    const out = translateChatRequest(baseReq({ system: '' }));
    expect(out.system).toBeUndefined();
  });
});

describe('web path Anthropic cache breakpoint (fix 9)', () => {
  it('lands cache_control on the stable half of a boundary-marked system string built by the web path', () => {
    const webPathSystem = `stable capability preamble${SYSTEM_PROMPT_CACHE_BOUNDARY}dynamic timestamp + skills`;
    const translated = translateChatRequest(baseReq({ system: webPathSystem }));

    const policy = resolveAnthropicPayloadPolicy({
      api: 'anthropic-messages',
      provider: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      enableCacheControl: true,
    });
    const payload = translated as unknown as Record<string, unknown>;
    applyAnthropicPayloadPolicyToParams(payload, policy);

    const system = payload['system'] as Array<Record<string, unknown>>;
    expect(system).toHaveLength(2);
    expect(system[0]?.['text']).toBe('stable capability preamble');
    expect(system[0]?.['cache_control']).toEqual({ type: 'ephemeral' });
    expect(system[1]?.['text']).toBe('dynamic timestamp + skills');
    expect(system[1]?.['cache_control']).toBeUndefined();
  });

  it('honors the 1h TTL policy on the stable block once the array-only decorator can run', () => {
    const webPathSystem = `stable${SYSTEM_PROMPT_CACHE_BOUNDARY}dynamic`;
    const translated = translateChatRequest(baseReq({ system: webPathSystem }));

    const policy = resolveAnthropicPayloadPolicy({
      api: 'anthropic-messages',
      provider: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      enableCacheControl: true,
      cacheRetention: 'long',
    });
    const payload = translated as unknown as Record<string, unknown>;
    applyAnthropicPayloadPolicyToParams(payload, policy);

    const system = payload['system'] as Array<Record<string, unknown>>;
    expect(system[0]?.['cache_control']).toEqual({ type: 'ephemeral', ttl: '1h' });
  });

  it('still caches the whole system block when the web path sent no boundary at all', () => {
    const translated = translateChatRequest(baseReq({ system: 'no boundary here' }));

    const policy = resolveAnthropicPayloadPolicy({
      api: 'anthropic-messages',
      provider: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      enableCacheControl: true,
    });
    const payload = translated as unknown as Record<string, unknown>;
    applyAnthropicPayloadPolicyToParams(payload, policy);

    const system = payload['system'] as Array<Record<string, unknown>>;
    expect(system).toHaveLength(1);
    expect(system[0]?.['text']).toBe('no boundary here');
    expect(system[0]?.['cache_control']).toEqual({ type: 'ephemeral' });
  });
});
