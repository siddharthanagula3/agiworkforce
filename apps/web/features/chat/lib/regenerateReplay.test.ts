import { describe, expect, it } from 'vitest';
import { getRegenerateReplayDecision, replayToSendOptions } from './regenerateReplay';

describe('regenerate replay decisions', () => {
  it('preserves safe replay options for new turns', () => {
    const decision = getRegenerateReplayDecision({
      userMetadata: {
        sendReplay: {
          webSearchEnabled: true,
          thinkingEnabled: false,
          officeCreationEnabled: true,
          workMode: 'agiwork',
          styleMode: 'concise',
        },
      },
    });

    expect(decision).toEqual({
      ok: true,
      replay: {
        webSearchEnabled: true,
        thinkingEnabled: false,
        officeCreationEnabled: true,
        workMode: 'agiwork',
        styleMode: 'concise',
      },
    });
    expect(decision.ok && replayToSendOptions(decision.replay)).toEqual({
      webSearch: true,
      thinkingEnabled: false,
      codeExecution: undefined,
      officeCreation: true,
      workMode: 'agiwork',
      styleMode: 'concise',
    });
  });

  it('restores AGI Work for legacy managed turns that predate work-mode replay metadata', () => {
    const decision = getRegenerateReplayDecision({
      assistantMetadata: {
        agentActivity: { status: 'completed' },
        cloudAgentRun: { runId: 'run-1' },
      },
    });

    expect(decision).toEqual({
      ok: true,
      replay: { workMode: 'agiwork' },
    });
    expect(decision.ok && replayToSendOptions(decision.replay)).toMatchObject({
      workMode: 'agiwork',
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
