import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.fn();

vi.mock('../../lib/tauri-mock', () => ({
  invoke: invokeMock,
  listen: vi.fn(),
  isTauri: false,
  isTauriContext: () => false,
}));

vi.mock('../../stores/chat/chatStore', () => ({
  useChatStore: {
    getState: () => ({
      updateInlinePanel: vi.fn(),
    }),
  },
}));

describe('executeBrowserCommand', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('uses a tab id for tab-scoped browser commands', async () => {
    invokeMock
      .mockResolvedValueOnce('browser-1')
      .mockResolvedValueOnce('tab-1')
      .mockResolvedValueOnce('Example Domain')
      .mockResolvedValueOnce('data:image/png;base64,abc123');

    const { executeBrowserCommand } = await import('../slashCommandHandlers');
    const panel = await executeBrowserCommand('https://example.com');

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'browser_launch', {
      options: { headless: false },
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'browser_open_tab', {
      url: 'https://example.com',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(3, 'browser_get_title', {
      tabId: 'tab-1',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(4, 'browser_screenshot', {
      tabId: 'tab-1',
      selector: null,
    });

    expect(panel.metadata).toMatchObject({
      status: 'success',
      browserId: 'browser-1',
      tabId: 'tab-1',
    });
  });
});

describe('executeAgentsCommand', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('pushes a background agent with the Rust IPC input object', async () => {
    invokeMock.mockResolvedValueOnce({
      agentId: 'agent-1',
      queuePosition: null,
      started: true,
    });

    const { executeAgentsCommand } = await import('../slashCommandHandlers');
    const panel = await executeAgentsCommand('push review the latest changes', {
      conversationId: 'conv-1',
      workingDirectory: '/Users/example/project',
      customInstructions: 'Use concise summaries.',
      messages: [
        {
          id: 'msg-1',
          role: 'user',
          content: 'Please inspect the repo.',
          timestamp: new Date('2026-06-04T12:00:00.000Z'),
        },
        {
          id: 'msg-2',
          role: 'assistant',
          content: 'I will inspect it.',
          timestamp: new Date('2026-06-04T12:01:00.000Z'),
        },
      ],
    });

    expect(invokeMock).toHaveBeenCalledWith('background_agent_push', {
      input: {
        conversationId: 'conv-1',
        goal: 'review the latest changes',
        workingDirectory: '/Users/example/project',
        conversationHistory: [
          {
            role: 'user',
            content: 'Please inspect the repo.',
            timestamp: '2026-06-04T12:00:00.000Z',
          },
          {
            role: 'assistant',
            content: 'I will inspect it.',
            timestamp: '2026-06-04T12:01:00.000Z',
          },
        ],
        activeMcpServers: [],
        customInstructions: 'Use concise summaries.',
        priority: null,
        timeoutSecs: null,
      },
    });
    expect(panel.metadata).toMatchObject({ status: 'success' });
    expect(panel.content.data).toMatchObject({ agentId: 'agent-1', started: true });
  });

  it('returns an error panel when push has no active conversation', async () => {
    const { executeAgentsCommand } = await import('../slashCommandHandlers');
    const panel = await executeAgentsCommand('push review the latest changes');

    expect(invokeMock).not.toHaveBeenCalled();
    expect(panel.metadata).toMatchObject({ status: 'error' });
    expect(String(panel.content.data?.['error'])).toContain('active conversation');
  });

  it('routes control subcommands to background agent commands', async () => {
    invokeMock.mockResolvedValueOnce(undefined);

    const { executeAgentsCommand } = await import('../slashCommandHandlers');
    const panel = await executeAgentsCommand('cancel agent-1');

    expect(invokeMock).toHaveBeenCalledWith('background_agent_cancel', { agentId: 'agent-1' });
    expect(panel.metadata).toMatchObject({ status: 'success' });
    expect(panel.content.data).toMatchObject({
      action: 'cancel',
      agentId: 'agent-1',
      status: 'requested',
    });
  });

  it('routes output to background_agent_get', async () => {
    invokeMock.mockResolvedValueOnce({
      id: 'agent-1',
      status: 'completed',
      summary: { description: 'Finished review' },
    });

    const { executeAgentsCommand } = await import('../slashCommandHandlers');
    const panel = await executeAgentsCommand('output agent-1');

    expect(invokeMock).toHaveBeenCalledWith('background_agent_get', { agentId: 'agent-1' });
    expect(panel.metadata).toMatchObject({ status: 'success' });
    expect(panel.content.data).toMatchObject({
      agentId: 'agent-1',
      agent: {
        id: 'agent-1',
        status: 'completed',
      },
    });
  });
});
