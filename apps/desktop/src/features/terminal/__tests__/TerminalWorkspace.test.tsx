import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockInvoke = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

vi.mock('../../../lib/tauri-mock', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
  listen: vi.fn().mockResolvedValue(() => {}),
}));

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
    info: vi.fn(),
  },
}));

vi.mock('../Terminal', () => ({
  Terminal: ({ sessionId }: { sessionId: string }) => <div data-testid="terminal">{sessionId}</div>,
}));

vi.mock('../TerminalAIAssistant', () => ({
  TerminalAIAssistant: () => null,
}));

import { useTerminalStore } from '../../../stores/terminalStore';
import { TerminalWorkspace } from '../TerminalWorkspace';

const ZSH = { name: 'Zsh', path: '/bin/zsh', available: true, shell_type: 'zsh' };

function createCalls(): unknown[][] {
  return mockInvoke.mock.calls.filter(([command]) => command === 'terminal_create_session');
}

describe('TerminalWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTerminalStore.getState().reset();
  });

  it('opens the first terminal once and shows it', async () => {
    mockInvoke.mockImplementation((command: string) => {
      if (command === 'terminal_detect_shells') return Promise.resolve([ZSH]);
      if (command === 'terminal_create_session') return Promise.resolve('session-1');
      return Promise.resolve(undefined);
    });

    render(<TerminalWorkspace />);

    expect(await screen.findByTestId('terminal')).toHaveTextContent('session-1');
    expect(createCalls()).toHaveLength(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says why no terminal opened, asks once, and claims nothing', async () => {
    const declined = 'You declined this a moment ago. Try again in 30 seconds.';
    mockInvoke.mockImplementation((command: string) => {
      if (command === 'terminal_detect_shells') return Promise.resolve([ZSH]);
      if (command === 'terminal_create_session') return Promise.reject(declined);
      return Promise.resolve(undefined);
    });

    render(<TerminalWorkspace />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      `No terminal was opened. ${declined}`,
    );
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /New Terminal/ })[0]).toBeEnabled(),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(createCalls()).toHaveLength(1);
    expect(mockToastSuccess).not.toHaveBeenCalled();
    expect(screen.queryByTestId('terminal')).not.toBeInTheDocument();
    expect(useTerminalStore.getState().sessions).toHaveLength(0);
  });

  it('shows a capability refusal as the host wrote it', async () => {
    const off = 'Terminal is turned off in Settings, Capabilities. Turn it on there first.';
    mockInvoke.mockImplementation((command: string) => {
      if (command === 'terminal_detect_shells') return Promise.resolve([ZSH]);
      if (command === 'terminal_create_session') return Promise.reject(off);
      return Promise.resolve(undefined);
    });

    render(<TerminalWorkspace />);

    expect(await screen.findByRole('alert')).toHaveTextContent(off);
  });
});
