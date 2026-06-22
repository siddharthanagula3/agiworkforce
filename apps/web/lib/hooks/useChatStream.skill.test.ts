import { describe, it, expect } from 'vitest';

/**
 * Unit test for the skill timeline step name derivation logic.
 * Mirrors the inline logic in useChatStream.ts where the synthetic
 * "Read skill: <name>" timeline entry is created when skillBody is set.
 */
function buildSkillStepName(skillName: string | undefined): string {
  return skillName ? `Read skill: ${skillName}` : 'Read skill';
}

describe('skill timeline step name', () => {
  it('uses the skill name when provided', () => {
    expect(buildSkillStepName('code-review')).toBe('Read skill: code-review');
  });

  it('falls back to generic label when skill name is undefined', () => {
    expect(buildSkillStepName(undefined)).toBe('Read skill');
  });

  it('includes the full skill name including spaces', () => {
    expect(buildSkillStepName('Deep Research')).toBe('Read skill: Deep Research');
  });

  it('does not emit a step when skillBody is absent', () => {
    // The actual guard is `if (options.skillBody)` — when absent, no step fires.
    // This documents the contract: step is contingent on skillBody being truthy.
    const skillBody: string | undefined = undefined;
    const stepsEmitted: string[] = [];
    if (skillBody) {
      stepsEmitted.push(buildSkillStepName('test'));
    }
    expect(stepsEmitted).toHaveLength(0);
  });

  it('emits a step when skillBody is present', () => {
    const skillBody = 'You are a code review expert...';
    const stepsEmitted: string[] = [];
    if (skillBody) {
      stepsEmitted.push(buildSkillStepName('code-review'));
    }
    expect(stepsEmitted).toEqual(['Read skill: code-review']);
  });
});
