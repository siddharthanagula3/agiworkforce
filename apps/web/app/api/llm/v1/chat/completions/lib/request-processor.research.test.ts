import { describe, it, expect } from 'vitest';
import { requireProviderDefaultModel } from '@agiworkforce/types';
import { applyResearchMode, RESEARCH_SYSTEM_PROMPT } from './request-processor';
import type { ChatCompletionRequest } from './request-processor';

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
    // Should still be exactly 2 messages (no extra system inserted).
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
    expect(RESEARCH_SYSTEM_PROMPT).not.toContain('—');
  });

  it('RESEARCH_SYSTEM_PROMPT mentions inline citations', () => {
    expect(RESEARCH_SYSTEM_PROMPT).toContain('[1]');
    expect(RESEARCH_SYSTEM_PROMPT).toContain('Sources list');
  });
});
