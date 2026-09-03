import { describe, expect, it } from 'vitest';
import type { ChatRequest } from '@agiworkforce/types';
import { SYSTEM_PROMPT_CACHE_BOUNDARY } from '@agiworkforce/provider-protocol';

import { translateChatRequest } from '../translate';

const MODEL_ID = 'llama3:latest';

function reqWithSystem(system: ChatRequest['system'], userText: string): ChatRequest {
  return {
    model: MODEL_ID,
    system,
    messages: [{ role: 'user', content: userText }],
  };
}

describe('Ollama system message never carries the cache boundary marker', () => {
  it('strips the marker from a string req.system', () => {
    const out = translateChatRequest(
      reqWithSystem(`stable preamble${SYSTEM_PROMPT_CACHE_BOUNDARY}dynamic tail`, 'hi'),
    );

    const system = out.messages.find((m) => m.role === 'system');
    expect(system?.content).not.toContain(SYSTEM_PROMPT_CACHE_BOUNDARY);
    expect(system?.content).toBe('stable preamble\ndynamic tail');
  });

  it('strips the marker from an array req.system', () => {
    const out = translateChatRequest(
      reqWithSystem([{ type: 'text', text: `stable${SYSTEM_PROMPT_CACHE_BOUNDARY}dynamic` }], 'hi'),
    );

    const system = out.messages.find((m) => m.role === 'system');
    expect(system?.content).not.toContain(SYSTEM_PROMPT_CACHE_BOUNDARY);
    expect(system?.content).toBe('stable\ndynamic');
  });
});
