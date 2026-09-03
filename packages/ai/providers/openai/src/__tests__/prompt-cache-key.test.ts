import { describe, expect, it } from 'vitest';
import type { ChatRequest } from '@agiworkforce/types';
import { detectOpenAICompletionsCompat } from '@agiworkforce/provider-protocol';

import { translateChatRequest, derivePromptCacheKey } from '../translate';
import { translateChatRequestToResponses } from '../translate-responses';
import { OPENAI_DEFAULT_MODEL_ID } from './model-fixtures';

const compat = detectOpenAICompletionsCompat({
  id: OPENAI_DEFAULT_MODEL_ID,
  provider: 'openai',
  baseUrl: 'https://api.openai.com/v1',
}).defaults;

function reqWithSystem(system: string, userText: string): ChatRequest {
  return {
    model: OPENAI_DEFAULT_MODEL_ID,
    system,
    messages: [{ role: 'user', content: userText }],
  };
}

describe('derivePromptCacheKey', () => {
  it('is identical for two requests sharing a system prefix', () => {
    const a = derivePromptCacheKey(reqWithSystem('You are a helpful agent.', 'first question'));
    const b = derivePromptCacheKey(reqWithSystem('You are a helpful agent.', 'second question'));

    expect(a).toBeDefined();
    expect(a).toBe(b);
  });

  it('differs across different system prefixes', () => {
    const a = derivePromptCacheKey(reqWithSystem('You are a helpful agent.', 'hi'));
    const b = derivePromptCacheKey(reqWithSystem('You are a pirate.', 'hi'));

    expect(a).not.toBe(b);
  });

  it('is absent when no system prefix exists', () => {
    const req: ChatRequest = {
      model: OPENAI_DEFAULT_MODEL_ID,
      messages: [{ role: 'user', content: 'hi' }],
    };

    expect(derivePromptCacheKey(req)).toBeUndefined();
  });

  it('derives from leading system-role messages when req.system is unset', () => {
    const req: ChatRequest = {
      model: OPENAI_DEFAULT_MODEL_ID,
      messages: [
        { role: 'system', content: 'You are a helpful agent.' },
        { role: 'user', content: 'hi' },
      ],
    };

    expect(derivePromptCacheKey(req)).toBeDefined();
  });

  it('ignores a system-role message that is not leading', () => {
    const req: ChatRequest = {
      model: OPENAI_DEFAULT_MODEL_ID,
      messages: [
        { role: 'user', content: 'hi' },
        { role: 'system', content: 'late system text' },
      ],
    };

    expect(derivePromptCacheKey(req)).toBeUndefined();
  });
});

describe('translateChatRequest prompt_cache_key', () => {
  it('sets an identical prompt_cache_key for requests sharing a system prefix', () => {
    const a = translateChatRequest(reqWithSystem('You are a helpful agent.', 'q1'), {
      compat,
      provider: 'openai',
    });
    const b = translateChatRequest(reqWithSystem('You are a helpful agent.', 'q2'), {
      compat,
      provider: 'openai',
    });

    expect(a.prompt_cache_key).toBeDefined();
    expect(a.prompt_cache_key).toBe(b.prompt_cache_key);
  });

  it('omits prompt_cache_key when there is no system prefix', () => {
    const req: ChatRequest = {
      model: OPENAI_DEFAULT_MODEL_ID,
      messages: [{ role: 'user', content: 'hi' }],
    };
    const out = translateChatRequest(req, { compat, provider: 'openai' });

    expect(out.prompt_cache_key).toBeUndefined();
  });
});

describe('translateChatRequestToResponses prompt_cache_key', () => {
  it('sets an identical prompt_cache_key for requests sharing a system prefix', () => {
    const a = translateChatRequestToResponses(reqWithSystem('You are a helpful agent.', 'q1'), {
      compat,
    });
    const b = translateChatRequestToResponses(reqWithSystem('You are a helpful agent.', 'q2'), {
      compat,
    });

    expect(a.prompt_cache_key).toBeDefined();
    expect(a.prompt_cache_key).toBe(b.prompt_cache_key);
  });

  it('matches the Chat Completions key for the same request so both APIs shard alike', () => {
    const req = reqWithSystem('You are a helpful agent.', 'q1');
    const chat = translateChatRequest(req, { compat, provider: 'openai' });
    const responses = translateChatRequestToResponses(req, { compat });

    expect(responses.prompt_cache_key).toBe(chat.prompt_cache_key);
  });

  it('omits prompt_cache_key when there is no system prefix', () => {
    const req: ChatRequest = {
      model: OPENAI_DEFAULT_MODEL_ID,
      messages: [{ role: 'user', content: 'hi' }],
    };
    const out = translateChatRequestToResponses(req, { compat });

    expect(out.prompt_cache_key).toBeUndefined();
  });
});
