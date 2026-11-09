import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  readResource: vi.fn(),
  getPrompt: vi.fn(),
}));

vi.mock('@/lib/prompts/prompt-registry', () => ({
  resolvePromptText: () => 'UNTRUSTED_CONTEXT_RULES',
}));

vi.mock('@/lib/user-connector-tools', () => ({
  withUserConnectorMcpHandle: async (
    _userId: string,
    connectorId: string,
    operation: (connection: unknown) => Promise<unknown>,
  ) =>
    operation({
      connectorId,
      handle: {
        catalog: { prompts: [{ name: 'brief' }] },
        readResource: mocks.readResource,
        getPrompt: mocks.getPrompt,
      },
    }),
}));

import { loadSelectedMcpContext, McpContextError } from './mcp-context-service';

function resources(...uris: string[]) {
  return { resources: uris.map((uri) => ({ connectorId: 'notion', uri })) };
}

function textBody(marker: string, length: number): string {
  return marker + 'x'.repeat(length - marker.length);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('loadSelectedMcpContext', () => {
  it('labels and includes a short text resource with no incompleteness notice', async () => {
    mocks.readResource.mockResolvedValue({ contents: [{ text: 'quarterly plan' }] });

    const context = await loadSelectedMcpContext('user-1', resources('notion://plan'));

    expect(context).toContain('UNTRUSTED_CONTEXT_RULES');
    expect(context).toContain('MCP resource notion notion://plan');
    expect(context).toContain('quarterly plan');
    expect(context).not.toContain('incomplete');
  });

  it('refuses a selected resource that returns only binary content', async () => {
    mocks.readResource.mockResolvedValue({
      contents: [{ blob: 'aGVsbG8=', mimeType: 'image/png' }],
    });

    await expect(loadSelectedMcpContext('user-1', resources('notion://image'))).rejects.toThrow(
      McpContextError,
    );
    await expect(loadSelectedMcpContext('user-1', resources('notion://image'))).rejects.toThrow(
      'notion://image has no text content',
    );
  });

  it('refuses a selected prompt that returns no text', async () => {
    mocks.getPrompt.mockResolvedValue({ messages: [{ role: 'user', content: { type: 'image' } }] });

    await expect(
      loadSelectedMcpContext('user-1', {
        prompt: { connectorId: 'notion', name: 'brief' },
      }),
    ).rejects.toThrow('returned no text to attach');
  });

  it('says so, naming the resource, when one resource is shortened', async () => {
    mocks.readResource.mockResolvedValue({ contents: [{ text: textBody('LONG', 40_000) }] });

    const context = await loadSelectedMcpContext('user-1', resources('notion://long'));

    expect(context).toContain('shortened to the first 32000 of 40000 characters');
    expect(context).toContain('Shortened to fit the per-item limit: notion://long');
    expect(context).toContain('Tell the user');
  });

  it('names every resource it leaves out when the selection exceeds the total budget', async () => {
    mocks.readResource.mockImplementation(async (uri: string) => ({
      contents: [{ text: textBody(`MARK-${uri.split('//')[1]}-`, 32_000) }],
    }));

    const context = await loadSelectedMcpContext(
      'user-1',
      resources('notion://a', 'notion://b', 'notion://c', 'notion://d'),
    );

    expect(context).toContain('MARK-a-');
    expect(context).toContain('MARK-b-');
    expect(context).not.toContain('MARK-d-');
    expect(context).toContain('Left out to fit the total limit:');
    expect(context).toMatch(/Left out to fit the total limit:[^\n]*notion:\/\/d/);
    expect(context).not.toMatch(/Left out to fit the total limit:[^\n]*notion:\/\/a/);
  });
});
