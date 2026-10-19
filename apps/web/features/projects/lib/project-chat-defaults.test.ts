import { describe, expect, it } from 'vitest';

import {
  composerTogglesFromProjectDefaults,
  sameProjectChatDefaults,
} from './project-chat-defaults';

describe('composerTogglesFromProjectDefaults', () => {
  it('switches on only the tools the project asked for', () => {
    expect(
      composerTogglesFromProjectDefaults({
        codeExecution: true,
        research: false,
        skillName: 'brand-voice',
      }),
    ).toEqual({ codeExecutionEnabled: true, selectedSkillName: 'brand-voice' });
  });

  it('leaves the composer alone when the project sets nothing', () => {
    expect(composerTogglesFromProjectDefaults({})).toBeNull();
    expect(
      composerTogglesFromProjectDefaults({ codeExecution: false, skillName: null }),
    ).toBeNull();
    expect(composerTogglesFromProjectDefaults(undefined)).toBeNull();
  });
});

describe('sameProjectChatDefaults', () => {
  it('treats an absent key and its off value as the same setting', () => {
    expect(sameProjectChatDefaults({}, { codeExecution: false, skillName: null })).toBe(true);
    expect(sameProjectChatDefaults({}, { research: true })).toBe(false);
  });
});
