import { describe, expect, it } from 'vitest';
import { getRegenerateReplayDecision, replayToSendOptions } from './regenerateReplay';

describe('regenerate replay decisions', () => {
  it('preserves safe replay options for new turns', () => {
    const decision = getRegenerateReplayDecision({
      userMetadata: {
        sendReplay: {
          webSearchEnabled: true,
          thinkingEnabled: false,
          styleMode: 'concise',
        },
      },
    });

    expect(decision).toEqual({
      ok: true,
      replay: {
        webSearchEnabled: true,
        thinkingEnabled: false,
        styleMode: 'concise',
      },
    });
    expect(decision.ok && replayToSendOptions(decision.replay)).toEqual({
      webSearch: true,
      thinkingEnabled: false,
      codeExecution: undefined,
      styleMode: 'concise',
    });
  });

  it('blocks skill-guided turns without persisting raw skill body text', () => {
    const decision = getRegenerateReplayDecision({
      userMetadata: { sendReplay: { hasSkillInstruction: true } },
    });

    expect(decision.ok).toBe(false);
    expect(decision.ok ? '' : decision.message).toMatch(/skill-guided/i);
  });

  it('blocks older tool-assisted turns that lack replay metadata', () => {
    const decision = getRegenerateReplayDecision({
      assistantMetadata: {
        tools: [{ name: 'web_search', status: 'completed' }],
      },
    });

    expect(decision.ok).toBe(false);
    expect(decision.ok ? '' : decision.message).toMatch(/older tool-assisted/i);
  });

  it('allows legacy plain turns without replay metadata', () => {
    expect(getRegenerateReplayDecision({})).toEqual({ ok: true });
  });
});
