import { describe, expect, it } from 'vitest';
import type { ChatRequest } from '@agiworkforce/types';
import { SYSTEM_PROMPT_CACHE_BOUNDARY } from '@agiworkforce/provider-protocol';

import { translateChatRequest } from '../translate';
import { GOOGLE_DEFAULT_MODEL_ID } from './model-fixtures';

function reqWithSystem(system: ChatRequest['system'], userText: string): ChatRequest {
  return {
    model: GOOGLE_DEFAULT_MODEL_ID,
    system,
    messages: [{ role: 'user', content: userText }],
  };
}

describe('Gemini system instruction never carries the cache boundary marker', () => {
  it('strips the marker from a string req.system', () => {
    const out = translateChatRequest(
      reqWithSystem(`stable preamble${SYSTEM_PROMPT_CACHE_BOUNDARY}dynamic tail`, 'q'),
    );

    const joined = (out.systemInstruction?.parts ?? []).map((p) => p.text).join('');
    expect(joined).not.toContain(SYSTEM_PROMPT_CACHE_BOUNDARY);
    expect(joined).toBe('stable preamble\n\ndynamic tail');
  });

  it('strips the marker from an array req.system', () => {
    const out = translateChatRequest(
      reqWithSystem([{ type: 'text', text: `stable${SYSTEM_PROMPT_CACHE_BOUNDARY}dynamic` }], 'q'),
    );

    const joined = (out.systemInstruction?.parts ?? []).map((p) => p.text).join('');
    expect(joined).not.toContain(SYSTEM_PROMPT_CACHE_BOUNDARY);
    expect(joined).toBe('stable\n\ndynamic');
  });

  it('strips the marker when derived from leading system-role messages', () => {
    const req: ChatRequest = {
      model: GOOGLE_DEFAULT_MODEL_ID,
      messages: [
        { role: 'system', content: `stable${SYSTEM_PROMPT_CACHE_BOUNDARY}dynamic` },
        { role: 'user', content: 'q' },
      ],
    };
    const out = translateChatRequest(req);

    const joined = (out.systemInstruction?.parts ?? []).map((p) => p.text).join('');
    expect(joined).not.toContain(SYSTEM_PROMPT_CACHE_BOUNDARY);
    expect(joined).toBe('stable\n\ndynamic');
  });
});
