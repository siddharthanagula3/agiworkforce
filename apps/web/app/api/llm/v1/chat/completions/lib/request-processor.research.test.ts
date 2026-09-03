import { describe, it, expect } from 'vitest';
import { requireProviderDefaultModel } from '@agiworkforce/types';
import {
  applyResearchMode,
  researchModeAllowed,
  ChatCompletionRequestSchema,
  RESEARCH_SYSTEM_PROMPT,
} from './request-processor';
import type { ChatCompletionRequest } from './request-processor';
import { RESEARCH_MIN_CONTEXT_WINDOW } from '@/features/chat/lib/research-capability-gate';

const CHAT_MODEL = requireProviderDefaultModel('anthropic');

function makeRequest(
  messages: ChatCompletionRequest['messages'],
  extra: Partial<ChatCompletionRequest> = {},
): ChatCompletionRequest {
  return {
    model: CHAT_MODEL,
    messages,
    ...extra,
  } as ChatCompletionRequest;
}

describe('applyResearchMode', () => {
  it('forces web_search to true', () => {
    const req = makeRequest([{ role: 'user', content: 'research climate change' }]);
    applyResearchMode(req);
    expect(req.web_search).toBe(true);
  });

  it('prepends a system message when no system message exists', () => {
    const req = makeRequest([{ role: 'user', content: 'research climate change' }]);
    applyResearchMode(req);
    expect(req.messages[0]?.role).toBe('system');
    expect(req.messages[0]?.content).toBe(RESEARCH_SYSTEM_PROMPT);
    expect(req.messages[1]?.role).toBe('user');
  });

  it('prefixes the existing system message rather than inserting a new one', () => {
    const existingSystem = 'You are a helpful assistant.';
    const req = makeRequest([
      { role: 'system', content: existingSystem },
      { role: 'user', content: 'research AI trends' },
    ]);
    applyResearchMode(req);
    expect(req.messages.length).toBe(2);
    expect(req.messages[0]?.role).toBe('system');
    expect(typeof req.messages[0]?.content).toBe('string');
    const content = req.messages[0]!.content as string;
    expect(content.startsWith(RESEARCH_SYSTEM_PROMPT)).toBe(true);
    expect(content).toContain(existingSystem);
  });

  it('does not modify user messages', () => {
    const userContent = 'research quantum computing';
    const req = makeRequest([{ role: 'user', content: userContent }]);
    applyResearchMode(req);
    const lastMsg = req.messages[req.messages.length - 1];
    expect(lastMsg?.role).toBe('user');
    expect(lastMsg?.content).toBe(userContent);
  });

  it('overwrites a false web_search with true', () => {
    const req = makeRequest([{ role: 'user', content: 'research topic' }], {
      web_search: false,
    });
    applyResearchMode(req);
    expect(req.web_search).toBe(true);
  });

  it('RESEARCH_SYSTEM_PROMPT contains no em-dashes', () => {
    expect(RESEARCH_SYSTEM_PROMPT).not.toContain(', ');
  });

  it('RESEARCH_SYSTEM_PROMPT mentions inline citations', () => {
    expect(RESEARCH_SYSTEM_PROMPT).toContain('[1]');
    expect(RESEARCH_SYSTEM_PROMPT).toContain('Sources list');
  });
});

describe('researchModeAllowed gates on the capability it names', () => {
  const asked = { research: true } as ChatCompletionRequest;

  it('grants research to a model that declares research', () => {
    expect(researchModeAllowed(asked, { research: true, search: false })).toBe(true);
  });

  it('refuses a model that declares search but not research', () => {
    expect(researchModeAllowed(asked, { research: false, search: true })).toBe(false);
  });

  it('refuses when the caller did not ask', () => {
    expect(
      researchModeAllowed({ research: false } as ChatCompletionRequest, { research: true }),
    ).toBe(false);
  });

  it('refuses when the model has no capability metadata', () => {
    expect(researchModeAllowed(asked, undefined)).toBe(false);
  });

  it('grants a tool-capable model whose context window meets the threshold', () => {
    expect(
      researchModeAllowed(asked, { research: false, tools: true }, RESEARCH_MIN_CONTEXT_WINDOW),
    ).toBe(true);
  });

  it('refuses a tool-capable model below the context window threshold', () => {
    expect(
      researchModeAllowed(asked, { research: false, tools: true }, RESEARCH_MIN_CONTEXT_WINDOW - 1),
    ).toBe(false);
  });
});

describe('research_resume.approved_steps', () => {
  it('accepts the plan a user approved so the run can skip planning', () => {
    const parsed = ChatCompletionRequestSchema.parse({
      model: CHAT_MODEL,
      messages: [{ role: 'user', content: 'research the topic' }],
      research: true,
      research_resume: {
        sources: [],
        steps: [],
        approved_steps: [
          { id: 'plan-1', type: 'search', description: 'alpha query', status: 'pending' },
        ],
      },
    });

    expect(parsed.research_resume?.approved_steps).toEqual([
      { id: 'plan-1', type: 'search', description: 'alpha query', status: 'pending' },
    ]);
  });

  it('rejects an approved step with no description to search for', () => {
    expect(() =>
      ChatCompletionRequestSchema.parse({
        model: CHAT_MODEL,
        messages: [{ role: 'user', content: 'research the topic' }],
        research: true,
        research_resume: {
          approved_steps: [{ id: 'plan-1', type: 'search', description: '  ', status: 'pending' }],
        },
      }),
    ).toThrow();
  });
});
