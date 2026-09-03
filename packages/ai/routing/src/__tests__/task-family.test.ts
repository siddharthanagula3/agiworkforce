import { describe, expect, it } from 'vitest';

import {
  classifyTaskFamily,
  isTaskFamily,
  LONG_CONTEXT_TOKEN_THRESHOLD,
  SIMPLE_CHAT_MAX_CHARS,
  TASK_FAMILIES,
  TASK_FAMILY_INTENDED_TASK_TYPES,
  type TaskFamily,
} from '../task-family';

describe('classifyTaskFamily · every family', () => {
  const positives: ReadonlyArray<[TaskFamily, Parameters<typeof classifyTaskFamily>[0]]> = [
    ['deep_research', { researchMode: true }],
    ['agentic_work', { workMode: 'agiwork' }],
    ['document_authoring', { officeCreation: true }],
    ['code_execution', { codeExecution: true }],
    ['web_grounded_answer', { webSearch: true }],
    [
      'screen_automation',
      { attachments: [{ mime: 'image/png', type: 'screenshot' }], declaredToolCount: 2 },
    ],
    ['vision', { attachments: [{ mime: 'image/png', type: 'image' }] }],
    ['long_context', { estimatedInputTokens: LONG_CONTEXT_TOKEN_THRESHOLD + 1 }],
    ['caller_tool_loop', { declaredToolCount: 1 }],
    ['extended_thinking', { thinkingMode: true }],
    ['simple_chat', { messageCharCount: SIMPLE_CHAT_MAX_CHARS - 1 }],
    ['general_chat', { messageCharCount: SIMPLE_CHAT_MAX_CHARS }],
  ];

  it.each(positives)('resolves %s', (expected, signals) => {
    expect(classifyTaskFamily(signals).family).toBe(expected);
  });

  it('covers all twelve declared families', () => {
    expect(new Set(positives.map(([family]) => family))).toEqual(new Set(TASK_FAMILIES));
  });

  it('emits a distinct reason code per family', () => {
    const codes = positives.map(([, signals]) => classifyTaskFamily(signals).reasonCode);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('classifyTaskFamily · ambiguous fall-through', () => {
  it('declines when no signal is present at all', () => {
    expect(classifyTaskFamily({})).toEqual({
      family: null,
      reasonCode: 'ambiguous_no_signals',
    });
  });

  it('declines when the residual branch has no length signal', () => {
    expect(classifyTaskFamily({ priorTurnCount: 4 })).toEqual({
      family: null,
      reasonCode: 'ambiguous_unknown_length',
    });
  });

  it('treats an absent length as unknown rather than short', () => {
    expect(classifyTaskFamily({ estimatedInputTokens: 100 }).family).toBeNull();
  });

  it('does not treat explicitly-negative toggles as decisive', () => {
    expect(
      classifyTaskFamily({
        researchMode: false,
        webSearch: false,
        codeExecution: false,
        officeCreation: false,
        thinkingMode: false,
      }).family,
    ).toBeNull();
  });

  it('does not treat empty collections as signals', () => {
    expect(classifyTaskFamily({ attachments: [], declaredToolCount: 0 }).family).toBeNull();
  });

  it('records the surface without branching on it', () => {
    expect(classifyTaskFamily({ runtimeProfileId: 'web/cloud-chat' })).toEqual({
      family: null,
      reasonCode: 'ambiguous_unknown_length',
    });
  });
});

describe('classifyTaskFamily · priority order', () => {
  it('research outranks agiwork, office creation, and code execution', () => {
    expect(
      classifyTaskFamily({
        researchMode: true,
        workMode: 'agiwork',
        officeCreation: true,
        codeExecution: true,
      }).family,
    ).toBe('deep_research');
  });

  it('agiwork outranks office creation and code execution', () => {
    expect(
      classifyTaskFamily({ workMode: 'agiwork', officeCreation: true, codeExecution: true }).family,
    ).toBe('agentic_work');
  });

  it('office creation outranks code execution', () => {
    expect(classifyTaskFamily({ officeCreation: true, codeExecution: true }).family).toBe(
      'document_authoring',
    );
  });

  it('code execution outranks the web toggles', () => {
    expect(classifyTaskFamily({ codeExecution: true, webSearch: true }).family).toBe(
      'code_execution',
    );
  });

  it('explicit tool toggles outrank attachments', () => {
    expect(
      classifyTaskFamily({
        webFetch: true,
        attachments: [{ mime: 'image/png', type: 'screenshot' }],
        declaredToolCount: 3,
      }).family,
    ).toBe('web_grounded_answer');
  });

  it('a bare screenshot without a tool surface is vision, not automation', () => {
    expect(
      classifyTaskFamily({ attachments: [{ mime: 'image/png', type: 'screenshot' }] }).family,
    ).toBe('vision');
  });

  it('attachments outrank the token budget', () => {
    expect(
      classifyTaskFamily({
        attachments: [{ mime: 'video/mp4', type: 'video' }],
        estimatedInputTokens: 400_000,
      }).family,
    ).toBe('vision');
  });

  it('the token budget outranks a caller tool surface', () => {
    expect(
      classifyTaskFamily({
        estimatedInputTokens: LONG_CONTEXT_TOKEN_THRESHOLD + 1,
        declaredToolCount: 5,
      }).family,
    ).toBe('long_context');
  });

  it('a caller tool surface outranks extended thinking', () => {
    expect(classifyTaskFamily({ toolChoiceForced: true, thinkingMode: true }).family).toBe(
      'caller_tool_loop',
    );
  });

  it('extended thinking outranks the residual length branch', () => {
    expect(classifyTaskFamily({ thinkingMode: true, messageCharCount: 3 }).family).toBe(
      'extended_thinking',
    );
  });
});

describe('classifyTaskFamily · boundaries', () => {
  it('is strict at the long-context threshold, exactly like classifyTaskLocally', () => {
    expect(
      classifyTaskFamily({
        estimatedInputTokens: LONG_CONTEXT_TOKEN_THRESHOLD,
        messageCharCount: 10,
      }).family,
    ).toBe('simple_chat');
    expect(
      classifyTaskFamily({
        estimatedInputTokens: LONG_CONTEXT_TOKEN_THRESHOLD + 1,
        messageCharCount: 10,
      }).family,
    ).toBe('long_context');
  });

  it('is exclusive at the simple-chat character boundary', () => {
    expect(classifyTaskFamily({ messageCharCount: SIMPLE_CHAT_MAX_CHARS - 1 }).family).toBe(
      'simple_chat',
    );
    expect(classifyTaskFamily({ messageCharCount: SIMPLE_CHAT_MAX_CHARS }).family).toBe(
      'general_chat',
    );
  });

  it('treats a zero-length message as short rather than unknown', () => {
    expect(classifyTaskFamily({ messageCharCount: 0 }).family).toBe('simple_chat');
  });

  it('is pure, the same input always yields the same output', () => {
    const signals = { declaredToolCount: 2, messageCharCount: 300, priorTurnCount: 7 };
    const first = classifyTaskFamily(signals);
    for (let index = 0; index < 5; index += 1) {
      expect(classifyTaskFamily(signals)).toEqual(first);
    }
  });

  it('does not mutate its input', () => {
    const signals = { researchMode: true, attachments: [{ mime: 'image/png' }] };
    const snapshot = structuredClone(signals);
    classifyTaskFamily(signals);
    expect(signals).toEqual(snapshot);
  });
});

describe('isTaskFamily', () => {
  it('accepts every declared family', () => {
    for (const family of TASK_FAMILIES) expect(isTaskFamily(family)).toBe(true);
  });

  it('rejects anything else', () => {
    for (const value of ['', 'coding', 'SIMPLE_CHAT', null, undefined, 7, {}]) {
      expect(isTaskFamily(value)).toBe(false);
    }
  });
});

describe('TASK_FAMILY_INTENDED_TASK_TYPES', () => {
  it('declares an intended narrowing for every family', () => {
    for (const family of TASK_FAMILIES) {
      expect(TASK_FAMILY_INTENDED_TASK_TYPES[family].length).toBeGreaterThan(0);
    }
  });
});
