/**
 * Zhipu-specific quirks: the `max_tokens` field override and GLM's
 * thinking-mode toggle. See the module docstring in `../index.ts` for why
 * these can't be left to the shared `detectOpenAICompletionsCompat` default.
 */

import { describe, expect, it } from 'vitest';
import { detectOpenAICompletionsCompat } from '@agiworkforce/provider-protocol';
import { translateChatRequest } from '@agiworkforce/providers-openai';

import { applyZhipuThinkingMode } from '../index';

describe('zhipu compat detection baseline (documents why the override exists)', () => {
  it('open.bigmodel.cn is NOT in the shared bundled hostname table, so the unpatched default is max_completion_tokens', () => {
    const detected = detectOpenAICompletionsCompat({
      provider: 'zhipu',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      id: 'glm-5.2',
    });
    // If this ever flips to 'max_tokens' because the shared table learned
    // about bigmodel.cn, the adapter's explicit override remains correct
    // (still forces 'max_tokens') — this assertion just documents the
    // current gap that makes the override necessary.
    expect(detected.defaults.maxTokensField).toBe('max_completion_tokens');
  });
});

describe('zhipu max_tokens override (as applied in stream())', () => {
  it('translateChatRequest emits max_tokens when the compat override is applied', () => {
    const detected = detectOpenAICompletionsCompat({
      provider: 'zhipu',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      id: 'glm-5.2',
    });
    const params = translateChatRequest(
      {
        model: 'glm-5.2',
        messages: [{ role: 'user', content: 'hi' }],
        maxOutputTokens: 256,
      },
      { compat: { ...detected.defaults, maxTokensField: 'max_tokens' }, provider: 'zhipu' },
    );
    expect(params.max_tokens).toBe(256);
    expect(params.max_completion_tokens).toBeUndefined();
  });
});

describe('applyZhipuThinkingMode', () => {
  it('sets thinking: { type: "enabled" } when the request enables thinking', () => {
    const params: Record<string, unknown> = { model: 'glm-5.2' };
    applyZhipuThinkingMode(params, { type: 'enabled', budgetTokens: 4000 });
    expect(params['thinking']).toEqual({ type: 'enabled' });
  });

  it('sets thinking: { type: "disabled" } when the request disables thinking', () => {
    const params: Record<string, unknown> = { model: 'glm-5.2' };
    applyZhipuThinkingMode(params, { type: 'disabled' });
    expect(params['thinking']).toEqual({ type: 'disabled' });
  });

  it('leaves params untouched when no thinking config is present', () => {
    const params: Record<string, unknown> = { model: 'glm-5.2' };
    applyZhipuThinkingMode(params, undefined);
    expect(params['thinking']).toBeUndefined();
  });
});
