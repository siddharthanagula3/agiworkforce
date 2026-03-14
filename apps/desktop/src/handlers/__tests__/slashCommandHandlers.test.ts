import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.fn();

vi.mock('../../lib/tauri-mock', () => ({
  invoke: invokeMock,
  listen: vi.fn(),
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
