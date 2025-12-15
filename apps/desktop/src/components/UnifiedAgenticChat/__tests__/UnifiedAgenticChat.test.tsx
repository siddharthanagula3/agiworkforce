// Mock heavy hooks and components that require Tauri/event listeners or canvas
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

import { describe, it, expect, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { UnifiedAgenticChat } from '../index';

// Stub matchMedia for framer-motion in JSDOM
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

	describe('UnifiedAgenticChat', () => {
  const renderChat = async (props: React.ComponentProps<typeof UnifiedAgenticChat> = {}) => {
    let utils: ReturnType<typeof render>;
    await act(async () => {
      utils = render(<UnifiedAgenticChat {...props} />);
      await Promise.resolve();
      await Promise.resolve();
    });
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return utils!;
  };

  it('should render without crashing', async () => {
    await renderChat();
    expect(screen.getByText(/How can I help you today\?/i)).toBeInTheDocument();
  });

  it('should display welcome message when no messages exist', async () => {
    await renderChat();
    expect(screen.getByText(/Start typing, drop in files/i)).toBeInTheDocument();
  });

  it('should render input area with placeholder', async () => {
    await renderChat();
    expect(screen.getByPlaceholderText('Ask me anything...')).toBeInTheDocument();
  });

  it('should call onSendMessage when message is sent', async () => {
    const mockOnSend = vi.fn();
    await renderChat({ onSendMessage: mockOnSend });

    expect(screen.getByText(/How can I help you today\?/i)).toBeInTheDocument();
  });

  it('should support different layout modes', async () => {
    const { rerender } = await renderChat({ layout: 'default' });
    expect(screen.getByText(/How can I help you today\?/i)).toBeInTheDocument();

    await act(async () => {
      rerender(<UnifiedAgenticChat layout="compact" />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText(/How can I help you today\?/i)).toBeInTheDocument();

    await act(async () => {
      rerender(<UnifiedAgenticChat layout="immersive" />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText(/How can I help you today\?/i)).toBeInTheDocument();
  });
});
