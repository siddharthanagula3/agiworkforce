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

  it('blocks a skill turn recorded before the skill was named', () => {
    // The block exists so the skill's body text never lands in message
    // metadata. A turn from before the name was recorded still cannot be
    // reproduced, so it still refuses.
    const decision = getRegenerateReplayDecision({
      userMetadata: { sendReplay: { hasSkillInstruction: true } },
    });

    expect(decision.ok).toBe(false);
    expect(decision.ok ? '' : decision.message).toMatch(/skill-guided/i);
  });

  it('regenerates a skill turn that names its skill, keeping the skill', () => {
    // The name is enough: the send path identifies a skill by skill_name. A
    // failed skill turn used to offer only "re-send the prompt", which loses
    // the turn and asks the user to retype it.
    const decision = getRegenerateReplayDecision({
      userMetadata: {
        sendReplay: { hasSkillInstruction: true, skillName: 'literature-review' },
      },
    });

    expect(decision.ok).toBe(true);
    expect(decision.ok ? decision.replay?.skillName : null).toBe('literature-review');
    expect(replayToSendOptions(decision.ok ? decision.replay : undefined).skillName).toBe(
      'literature-review',
    );
  });

  it('carries no skill name for a turn that used none', () => {
    const decision = getRegenerateReplayDecision({
      userMetadata: { sendReplay: { webSearchEnabled: true } },
    });

    expect(decision.ok).toBe(true);
    expect(
      replayToSendOptions(decision.ok ? decision.replay : undefined).skillName,
    ).toBeUndefined();
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
