import { describe, expect, it } from 'vitest';

import { assembleChatSystemPrompt } from '../chat-system-prompt-assembly';
import { CHAT_SYSTEM_PROMPT_PINNED_VERSION, chatSystemPromptSections } from '../chat-system-prompt';
import { promptReleaseChannel } from '../prompt-release';

const markers = { html: '<!-- @artifact -->', react: '// @artifact', mermaid: '%% @artifact' };

describe('chat system output contracts', () => {
  it('keeps the released pin while staging new rendering guidance internally', () => {
    expect(CHAT_SYSTEM_PROMPT_PINNED_VERSION).toBe(6);
    expect(promptReleaseChannel('chat.system', 6)).toBe('stable');
    expect(promptReleaseChannel('chat.system', 15)).toBe('internal');
  });

  it('assembles the current text, component and artifact syntax for supported surfaces', () => {
    const { body } = assembleChatSystemPrompt(
      chatSystemPromptSections(15),
      {
        toolNames: ['generate_image', 'web_search'],
        artifactMarkers: markers,
        richInlineBlocks: true,
      },
      { utc: '2026-10-30T12:00:00Z' },
    );
    for (const language of [
      'chart',
      'mermaid',
      'card',
      'cards',
      'stats',
      'form',
      'carousel',
      'gallery',
      'timeline',
      'status',
      'checklist',
      'details',
      'actions',
      'citation',
      'map',
    ]) {
      expect(body).toContain(`${language}:`);
    }
    expect(body).toContain('seven separate prompt blocks');
    expect(body).toContain('By default Submit validates and displays the values locally.');
    expect(body).toContain('one complete artifact');
    expect(body).toContain('never a reason to generate an image or search the web');
  });

  it('withholds rich inline control syntax on surfaces that do not advertise it', () => {
    const { body } = assembleChatSystemPrompt(
      chatSystemPromptSections(15),
      {
        toolNames: [],
        artifactMarkers: markers,
        richInlineBlocks: false,
      },
      { utc: '2026-10-30T12:00:00Z' },
    );
    expect(body).toContain('does not advertise rich inline controls');
    expect(body).not.toContain('- form:');
    expect(body).not.toContain('- carousel:');
  });

  it('leaves published version assembly unchanged when a surface advertises no rich controls', () => {
    for (const version of [6, 14]) {
      const state = { toolNames: ['web_search'], artifactMarkers: markers };
      const clock = { utc: '2026-10-30T12:00:00Z' };
      expect(
        assembleChatSystemPrompt(
          chatSystemPromptSections(version),
          { ...state, richInlineBlocks: false },
          clock,
        ),
      ).toEqual(assembleChatSystemPrompt(chatSystemPromptSections(version), state, clock));
    }
  });
});
