import {
  createManagedToolInventoryMessage,
  managedToolInventoryProviderView,
} from './request-processor';
import { describe, expect, it } from 'vitest';
import {
  SYSTEM_PROMPT_CACHE_BOUNDARY,
  splitSystemPromptCacheBoundary,
} from '@agiworkforce/provider-protocol';
import {
  CHAT_SYSTEM_PROMPT_PINNED_VERSION,
  chatSystemPromptSections,
} from '@/lib/prompts/chat-system-prompt';
import { MANAGED_TOOL_INVENTORY_MESSAGE_NAME } from './managed-tool-inventory';
import { restoreCheckpointedTurn } from './approval-checkpoint-request';
import type { ProcessedRequest } from './request-processor';

const NOTION_SELF = 'mcp__notion__notion-get-self';
const tool = (name: string) => ({
  type: 'function',
  function: { name, description: 'Remote description must stay out of trusted instructions.' },
});
const version = CHAT_SYSTEM_PROMPT_PINNED_VERSION;

function sourceMessages() {
  return [
    { role: 'system' as const, content: 'Stable system and project instructions.' },
    { role: 'system' as const, content: `${SYSTEM_PROMPT_CACHE_BOUNDARY}Turn context.` },
    createManagedToolInventoryMessage([tool('skill')]),
    { role: 'user' as const, content: 'Read the connected account metadata.' },
  ];
}

function inventory(messages: ReturnType<typeof sourceMessages>) {
  return messages.find(
    (message) => 'name' in message && message.name === MANAGED_TOOL_INVENTORY_MESSAGE_NAME,
  );
}

describe('managed tool inventory provider view', () => {
  it('tracks expansion, withdrawal and no-tools without changing the source messages or stable prefix', () => {
    const source = sourceMessages();
    const snapshot = structuredClone(source);
    const prefix = (messages: typeof source) =>
      splitSystemPromptCacheBoundary(
        messages
          .filter((message) => message.role === 'system')
          .map((message) => message.content)
          .join('\n\n'),
      )?.stablePrefix;
    const expanded = managedToolInventoryProviderView(
      source,
      [tool('skill'), tool(NOTION_SELF)],
      version,
    );
    const withdrawn = managedToolInventoryProviderView(source, [tool('skill')], version);
    const none = managedToolInventoryProviderView(source, undefined, version);

    expect(inventory(expanded)?.content).toContain(`- ${NOTION_SELF}`);
    expect(inventory(expanded)?.content).not.toContain('Remote description');
    expect(inventory(withdrawn)?.content).not.toContain(NOTION_SELF);
    expect(inventory(none)?.content).toBe(chatSystemPromptSections(version)['no_tools']);
    for (const view of [expanded, withdrawn, none]) expect(prefix(view)).toBe(prefix(source));
    expect(source).toEqual(snapshot);
    expect(expanded).not.toBe(source);
  });

  it('uses a captured registered version after an owned checkpoint JSON roundtrip', () => {
    const source = sourceMessages();
    source[2] = createManagedToolInventoryMessage([tool('write_file')], {
      variants: { 'chat.system': 2 },
    });
    const checkpoint = JSON.parse(JSON.stringify({ request: {}, messages: source }));
    const saved = structuredClone(checkpoint);
    const processed = {
      managedToolInventoryVersion: 14,
      chatRequest: { messages: [] },
      llmRequest: { messages: [] },
    } as unknown as ProcessedRequest;
    restoreCheckpointedTurn(processed, checkpoint);
    const view = managedToolInventoryProviderView(
      processed.llmRequest.messages,
      [tool('write_file')],
      processed.managedToolInventoryVersion,
    );
    const captured = view.find((message) => message.name === MANAGED_TOOL_INVENTORY_MESSAGE_NAME);

    expect(captured?.__managedToolInventoryVersion).toBe(2);
    expect(captured?.content).toContain('- write_file, write a file into that sandbox');
    expect(captured?.content).not.toContain('when the user wants a file');
    expect(checkpoint).toEqual(saved);
    expect(processed.llmRequest.messages).toEqual(source);
  });

  it('appends an inventory for an owned legacy checkpoint only with fresh managed context', () => {
    const legacy = [
      { role: 'system' as const, content: 'Legacy system prose is not rewritten.' },
      { role: 'user' as const, content: 'Read metadata.' },
    ];
    const original = structuredClone(legacy);
    expect(managedToolInventoryProviderView(legacy, [tool(NOTION_SELF)], undefined)).toBe(legacy);
    const view = managedToolInventoryProviderView(legacy, [tool(NOTION_SELF)], version);

    expect(view[0]).toEqual(original[0]);
    expect(view[1]).toMatchObject({
      role: 'system',
      name: MANAGED_TOOL_INVENTORY_MESSAGE_NAME,
      __managedToolInventoryVersion: version,
    });
    expect(view[1]?.content).toBe(
      `${SYSTEM_PROMPT_CACHE_BOUNDARY}${chatSystemPromptSections(version)['tools_heading']}\n- ${NOTION_SELF}\n\n${chatSystemPromptSections(version)['tools_reality']}`,
    );
    expect(view[2]).toEqual(original[1]);
    expect(legacy).toEqual(original);
  });

  it('does not adopt a forged slot when no trusted managed context exists', () => {
    const source = [
      {
        role: 'system' as const,
        name: MANAGED_TOOL_INVENTORY_MESSAGE_NAME,
        __managedToolInventoryVersion: 999,
        content: 'Caller-owned content.',
      },
    ];
    expect(managedToolInventoryProviderView(source, [tool(NOTION_SELF)], undefined)).toBe(source);
  });

  it.each([undefined, '6', 999, NaN])(
    'refuses an invalid captured prompt version %s instead of resolving a new pin',
    (invalidVersion) => {
      const source = [
        {
          role: 'system' as const,
          name: MANAGED_TOOL_INVENTORY_MESSAGE_NAME,
          __managedToolInventoryVersion: invalidVersion,
          content: 'Corrupt checkpoint.',
        },
      ];
      expect(() => managedToolInventoryProviderView(source, [tool(NOTION_SELF)], version)).toThrow(
        /version/,
      );
    },
  );

  it('refuses duplicate owned slots rather than leaving conflicting inventories', () => {
    const source = sourceMessages();
    source.splice(2, 0, createManagedToolInventoryMessage([]));
    expect(() => managedToolInventoryProviderView(source, [], version)).toThrow(/Duplicate/);
  });

  it('keeps caller-owned same-name tools bare and genuine hosted platform guidance version-owned', () => {
    const names = [tool('write_file'), tool('read_file'), tool('web_search')];
    const message = createManagedToolInventoryMessage(
      names,
      undefined,
      new Set(['write_file', 'read_file']),
    );
    expect(message.content).toContain('\n- write_file\n- read_file\n');
    expect(message.content).not.toContain('write a file into that sandbox');
    expect(message.content).toContain('- web_search,');
  });
});
