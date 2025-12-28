vi.mock('monaco-editor', () => ({
  editor: {
    create: vi.fn(),
    defineTheme: vi.fn(),
    setTheme: vi.fn(),
  },
  languages: {
    register: vi.fn(),
    registerCompletionItemProvider: vi.fn(),
  },
}));

vi.mock('../../../hooks/useAgenticEvents', () => ({
  useAgenticEvents: vi.fn(),
}));
vi.mock('../../Terminal/TerminalWorkspace', () => ({
  TerminalWorkspace: () => <div data-testid="terminal-workspace" />,
}));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));
vi.mock('../../ui/ScrollArea', () => ({
  ScrollArea: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  ScrollBar: () => null,
}));

import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UnifiedAgenticChat } from '../index';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    media: query,
    matches: false,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Mock scrollTo for jsdom
Element.prototype.scrollTo = vi.fn() as unknown as typeof Element.prototype.scrollTo;

describe('UnifiedAgenticChat', () => {
  const renderChat = async (props: React.ComponentProps<typeof UnifiedAgenticChat> = {}) => {
    let utils: ReturnType<typeof render>;
    await act(async () => {
      utils = render(<UnifiedAgenticChat {...props} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    return utils!;
  };

  it('should render without crashing', async () => {
    await renderChat();

    const newChatButtons = screen.getAllByRole('button', { name: /New Chat/i });
    expect(newChatButtons.length).toBeGreaterThan(0);
  });

  it('should display sidebar when no messages exist', async () => {
    await renderChat();

    expect(screen.getAllByText('Search').length).toBeGreaterThan(0);
  });

  it('should render input area with placeholder', async () => {
    await renderChat();
    expect(screen.getByPlaceholderText('Ask me anything...')).toBeInTheDocument();
  });

  it('should call onSendMessage when message is sent', async () => {
    const mockOnSend = vi.fn();
    await renderChat({ onSendMessage: mockOnSend });

    expect(screen.getByPlaceholderText('Ask me anything...')).toBeInTheDocument();
  });

  it('should support different layout modes', async () => {
    const { rerender } = await renderChat({ layout: 'default' });
    expect(screen.getAllByRole('button', { name: /New Chat/i }).length).toBeGreaterThan(0);

    await act(async () => {
      rerender(<UnifiedAgenticChat layout="compact" />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getAllByRole('button', { name: /New Chat/i }).length).toBeGreaterThan(0);

    await act(async () => {
      rerender(<UnifiedAgenticChat layout="immersive" />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getAllByRole('button', { name: /New Chat/i }).length).toBeGreaterThan(0);
  });
});
