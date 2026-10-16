import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { readPluginDraftToolResult } from '@agiworkforce/cloud-contracts';
import type { CloudChatSurface } from '@/lib/free-chat-surface-policy';
import { applyPluginDraftToolCapability } from '@/app/api/llm/v1/chat/completions/lib/request-processor';
import { PLUGIN_DRAFT_CARD_SURFACES, executePluginDraftTool } from './plugin-draft-tool';

const args = {
  name: 'DOT short answers',
  description: 'Short-answer handling for DOT synthetic test questions.',
  skills: [
    {
      name: 'dot-short-answers',
      description:
        'Use when answering DOT synthetic test questions that call for a brief response.',
      instructions: 'Answer synthetic test questions in one short sentence.',
    },
  ],
};

function offeredTools(surface: CloudChatSurface): string[] {
  const request = { model: 'auto', messages: [], stream: true } as unknown as Parameters<
    typeof applyPluginDraftToolCapability
  >[0];
  applyPluginDraftToolCapability(request, {
    surface,
    toolsCapable: true,
    isTemporary: false,
    ambientToolsAllowed: true,
    pluginDraftsAllowed: true,
  });
  return (request.tools ?? []).map((tool) => tool.function.name);
}

describe('draft_plugin tool', () => {
  it('returns a result the chat card reader accepts', () => {
    const result = executePluginDraftTool(args);
    expect(result.isError).toBe(false);
    expect(readPluginDraftToolResult('draft_plugin', result.content)).toEqual({
      name: args.name,
      description: args.description,
      skills: [
        {
          name: 'dot-short-answers',
          description: args.skills[0]!.description,
          body: args.skills[0]!.instructions,
        },
      ],
    });
  });

  it('names the draft card the client draws rather than a panel', () => {
    const shown = (JSON.parse(executePluginDraftTool(args).content) as { shown: string }).shown;
    expect(shown).toMatch(/draft card/);
    expect(shown).not.toMatch(/panel/i);
  });

  it('is offered only on surfaces whose chat draws the draft card', () => {
    expect([...PLUGIN_DRAFT_CARD_SURFACES].sort()).toEqual(['desktop', 'web']);
    expect(offeredTools('web')).toContain('draft_plugin');
    expect(offeredTools('desktop')).toContain('draft_plugin');
    for (const surface of ['mobile', 'chrome', 'vscode', 'cli', 'api'] as const) {
      expect(offeredTools(surface)).not.toContain('draft_plugin');
    }
  });
});

describe('draft_plugin validation', () => {
  it('returns the issues to the model as an error and no draft for the card', () => {
    const result = executePluginDraftTool({
      ...args,
      skills: [{ ...args.skills[0]!, instructions: '' }],
    });
    expect(result.isError).toBe(true);
    expect(result.content).toMatch(
      /^draft_plugin was called with invalid arguments: skills\.0\.instructions/,
    );
    expect(readPluginDraftToolResult('draft_plugin', result.content)).toBeNull();
  });
});
