import { describe, expect, it } from 'vitest';
import type { ChatRequest } from '@agiworkforce/types';
import {
  detectOpenAICompletionsCompat,
  SYSTEM_PROMPT_CACHE_BOUNDARY,
} from '@agiworkforce/provider-protocol';

import { translateChatRequest, derivePromptCacheKey } from '../translate';
import { translateChatRequestToResponses } from '../translate-responses';
import { OPENAI_DEFAULT_MODEL_ID } from './model-fixtures';

const compat = detectOpenAICompletionsCompat({
  id: OPENAI_DEFAULT_MODEL_ID,
  provider: 'openai',
  baseUrl: 'https://api.openai.com/v1',
}).defaults;

const TENANT: ChatRequest['promptCache'] = {
  organizationId: 'org_alpha',
  userId: 'user_alpha',
};

function reqWithSystem(system: string, userText: string): ChatRequest {
  return {
    model: OPENAI_DEFAULT_MODEL_ID,
    system,
    messages: [{ role: 'user', content: userText }],
    promptCache: TENANT,
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
      promptCache: TENANT,
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
      promptCache: TENANT,
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
      promptCache: TENANT,
    };

    expect(derivePromptCacheKey(req)).toBeUndefined();
  });
});

describe('derivePromptCacheKey tenant scope', () => {
  function scoped(scope: ChatRequest['promptCache']): ChatRequest {
    return {
      model: OPENAI_DEFAULT_MODEL_ID,
      system: 'You are a helpful agent.',
      messages: [{ role: 'user', content: 'identical text in both tenants' }],
      ...(scope ? { promptCache: scope } : {}),
    };
  }

  it('never shares a key between two organizations sending the same prompt', () => {
    const alpha = derivePromptCacheKey(scoped({ organizationId: 'org_alpha' }));
    const beta = derivePromptCacheKey(scoped({ organizationId: 'org_beta' }));

    expect(alpha).toBeDefined();
    expect(beta).toBeDefined();
    expect(alpha).not.toBe(beta);
  });

  it('never shares a key between two users of one organization', () => {
    const one = derivePromptCacheKey(scoped({ organizationId: 'org_alpha', userId: 'user_one' }));
    const two = derivePromptCacheKey(scoped({ organizationId: 'org_alpha', userId: 'user_two' }));

    expect(one).not.toBe(two);
  });

  it('cannot be forged by an identifier that impersonates the field delimiter', () => {
    const forged = derivePromptCacheKey(scoped({ organizationId: 'org_alpha|user:10:user_two' }));
    const real = derivePromptCacheKey(scoped({ organizationId: 'org_alpha', userId: 'user_two' }));

    expect(forged).not.toBe(real);
  });

  it('emits no key at all when the caller named no tenant', () => {
    expect(derivePromptCacheKey(scoped(undefined))).toBeUndefined();
  });

  it('separates workspaces of one organization', () => {
    const one = derivePromptCacheKey(
      scoped({ organizationId: 'org_alpha', workspaceId: 'ws_one' }),
    );
    const two = derivePromptCacheKey(
      scoped({ organizationId: 'org_alpha', workspaceId: 'ws_two' }),
    );

    expect(one).not.toBe(two);
  });

  it('separates two prompt manifest versions of one tenant', () => {
    const one = derivePromptCacheKey(scoped({ organizationId: 'org_alpha', promptVersion: '1' }));
    const two = derivePromptCacheKey(scoped({ organizationId: 'org_alpha', promptVersion: '2' }));

    expect(one).not.toBe(two);
  });

  it('separates two toolsets of one tenant on the same prompt', () => {
    const base = scoped({ organizationId: 'org_alpha' });
    const withTool = derivePromptCacheKey({
      ...base,
      tools: [{ name: 'web_search', description: 'search', inputSchema: {} }],
    });
    const withOther = derivePromptCacheKey({
      ...base,
      tools: [{ name: 'code_exec', description: 'run', inputSchema: {} }],
    });

    expect(withTool).toBeDefined();
    expect(withTool).not.toBe(withOther);
    expect(withTool).not.toBe(derivePromptCacheKey(base));
  });

  it('is unchanged by the order the same tools arrive in', () => {
    const base = scoped({ organizationId: 'org_alpha' });
    const tools = [
      { name: 'web_search', description: 'search', inputSchema: {} },
      { name: 'code_exec', description: 'run', inputSchema: {} },
    ];

    expect(derivePromptCacheKey({ ...base, tools })).toBe(
      derivePromptCacheKey({ ...base, tools: [...tools].reverse() }),
    );
  });
});

describe('derivePromptCacheKey privacy classes', () => {
  function classed(privacyClass: 'temporary' | 'zero_retention'): ChatRequest {
    return {
      model: OPENAI_DEFAULT_MODEL_ID,
      system: 'You are a helpful agent.',
      messages: [{ role: 'user', content: 'hi' }],
      promptCache: { organizationId: 'org_alpha', userId: 'user_alpha', privacyClass },
    };
  }

  it('emits no key for a Temporary Chat', () => {
    expect(derivePromptCacheKey(classed('temporary'))).toBeUndefined();
    expect(
      translateChatRequest(classed('temporary'), { compat, provider: 'openai' }).prompt_cache_key,
    ).toBeUndefined();
  });

  it('emits no key for a zero-retention turn', () => {
    expect(derivePromptCacheKey(classed('zero_retention'))).toBeUndefined();
  });

  it('emits no key when the route itself carries the zero-retention requirement', () => {
    const req: ChatRequest = {
      model: OPENAI_DEFAULT_MODEL_ID,
      system: 'You are a helpful agent.',
      messages: [{ role: 'user', content: 'hi' }],
      promptCache: { organizationId: 'org_alpha' },
      zeroDataRetentionOnly: true,
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
      promptCache: TENANT,
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
      promptCache: TENANT,
    };
    const out = translateChatRequestToResponses(req, { compat });

    expect(out.prompt_cache_key).toBeUndefined();
  });
});

describe('cache boundary marker never reaches the wire', () => {
  function reqWithBoundary(dynamicSuffix: string, userText: string): ChatRequest {
    return reqWithSystem(
      `stable preamble${SYSTEM_PROMPT_CACHE_BOUNDARY}${dynamicSuffix}`,
      userText,
    );
  }

  it('strips the marker from the Chat Completions system message', () => {
    const out = translateChatRequest(reqWithBoundary('turn 1 dynamic content', 'q'), {
      compat,
      provider: 'openai',
    });
    const system = out.messages.find((m) => m.role === 'system' || m.role === 'developer');
    expect(system?.content).not.toContain(SYSTEM_PROMPT_CACHE_BOUNDARY);
    expect(system?.content).toBe('stable preamble\n\nturn 1 dynamic content');
  });

  it('strips the marker from the Responses instructions field', () => {
    const out = translateChatRequestToResponses(reqWithBoundary('turn 1 dynamic content', 'q'), {
      compat,
    });
    expect(out.instructions).not.toContain(SYSTEM_PROMPT_CACHE_BOUNDARY);
    expect(out.instructions).toBe('stable preamble\n\nturn 1 dynamic content');
  });

  it('derives an identical prompt_cache_key across turns even as the dynamic suffix changes', () => {
    const a = translateChatRequest(reqWithBoundary('turn 1: 09:00, skill A', 'q1'), {
      compat,
      provider: 'openai',
    });
    const b = translateChatRequest(reqWithBoundary('turn 2: 09:41, skill B, memory C', 'q2'), {
      compat,
      provider: 'openai',
    });

    expect(a.prompt_cache_key).toBeDefined();
    expect(a.prompt_cache_key).toBe(b.prompt_cache_key);
  });

  it('hashes the whole prefix when the caller sent no boundary at all', () => {
    const withBoundary = derivePromptCacheKey(
      reqWithSystem(`same preamble${SYSTEM_PROMPT_CACHE_BOUNDARY}dynamic`, 'q'),
    );
    const withoutBoundary = derivePromptCacheKey(reqWithSystem('same preamble', 'q'));
    expect(withBoundary).toBeDefined();
    expect(withoutBoundary).toBeDefined();
    expect(withBoundary).toBe(withoutBoundary);
  });
});
