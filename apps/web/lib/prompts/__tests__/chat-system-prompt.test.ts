import { describe, expect, it } from 'vitest';

import {
  CHAT_SYSTEM_PROMPT_ID,
  CHAT_SYSTEM_PROMPT_PINNED_VERSION,
  CHAT_SYSTEM_PROMPT_VERSIONS,
  chatSystemPromptSection,
  chatSystemPromptSections,
  serializeChatSystemPrompt,
} from '../chat-system-prompt';
import { INSTRUCTION_LAYERS, describeInstructionLayer } from '../instruction-precedence';
import { PROMPT_MANIFEST } from '../prompt-manifest';
import { resolvePrompt } from '../prompt-registry';

describe('the chat system prompt template', () => {
  it('is the manifest entry the chat route resolves', () => {
    const entry = PROMPT_MANIFEST[CHAT_SYSTEM_PROMPT_ID];
    expect(entry.pinnedVersion).toBe(CHAT_SYSTEM_PROMPT_PINNED_VERSION);
    expect(entry.versions.map((version) => version.version)).toEqual(
      CHAT_SYSTEM_PROMPT_VERSIONS.map((version) => version.version),
    );
    for (const version of CHAT_SYSTEM_PROMPT_VERSIONS) {
      const manifestVersion = entry.versions.find(
        (candidate) => candidate.version === version.version,
      );
      expect(manifestVersion?.text).toBe(serializeChatSystemPrompt(version.sections));
    }
  });

  it('serialises a version deterministically, whatever order the keys were authored in', () => {
    const sections = chatSystemPromptSections(1);
    const shuffled = Object.fromEntries(Object.entries(sections).reverse());
    expect(serializeChatSystemPrompt(shuffled)).toBe(serializeChatSystemPrompt(sections));
  });

  it('fills placeholders and leaves an unknown section empty', () => {
    const sections = chatSystemPromptSections(1);
    expect(chatSystemPromptSection(sections, 'time_utc', { utc: '2026-07-25T12:00:00.000Z' })).toBe(
      'The current UTC date and time is 2026-07-25T12:00:00.000Z. ',
    );
    expect(chatSystemPromptSection(sections, 'no_such_section')).toBe('');
  });

  it('refuses a version it does not hold', () => {
    expect(() => chatSystemPromptSections(9999)).toThrow('9999');
  });

  it('rolls back by moving the pin: the pinned version has no precedence clause, v2 does', () => {
    expect(chatSystemPromptSection(chatSystemPromptSections(1), 'instruction_precedence')).toBe('');
    expect(
      chatSystemPromptSection(chatSystemPromptSections(2), 'instruction_precedence').length,
    ).toBeGreaterThan(0);

    expect(resolvePrompt(CHAT_SYSTEM_PROMPT_ID).version).toBe(CHAT_SYSTEM_PROMPT_PINNED_VERSION);
    expect(
      resolvePrompt(CHAT_SYSTEM_PROMPT_ID, { variants: { [CHAT_SYSTEM_PROMPT_ID]: 2 } }).version,
    ).toBe(2);
  });

  it('states the instruction hierarchy in the order the code declares it', () => {
    const clause = chatSystemPromptSection(chatSystemPromptSections(2), 'instruction_precedence');
    const positions = INSTRUCTION_LAYERS.map((layer) =>
      clause.indexOf(describeInstructionLayer(layer)),
    );

    for (const [index, position] of positions.entries()) {
      expect(position, `${INSTRUCTION_LAYERS[index]} is not named in the clause`).toBeGreaterThan(
        -1,
      );
      if (index > 0) expect(position).toBeGreaterThan(positions[index - 1]!);
    }
  });
});
