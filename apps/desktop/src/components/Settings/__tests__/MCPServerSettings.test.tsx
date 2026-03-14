import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MCPServerSettings } from '../MCPServerSettings';
import { useMcpServerStore } from '@/stores/mcpServerStore';

function resetStore() {
  useMcpServerStore.setState({
    config: {
      port: 3001,
      token: '********mock',
      enabled_tools: ['agi_chat'],
      running: false,
    },
    loading: false,
    error: null,
    fetchConfig: vi.fn().mockResolvedValue(undefined),
    startServer: vi.fn().mockResolvedValue(undefined),
    stopServer: vi.fn().mockResolvedValue(undefined),
    updateConfig: vi.fn().mockResolvedValue(undefined),
  });
}

describe('MCPServerSettings', () => {
  beforeEach(() => {
    resetStore();
  });

  it('keeps the port input in sync with store config changes', () => {
    render(<MCPServerSettings />);

    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    expect(input.value).toBe('3001');

    act(() => {
      useMcpServerStore.setState((state) => ({
        config: state.config
          ? {
              ...state.config,
              port: 4100,
            }
          : null,
      }));
    });

    expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('4100');
  });

  it('renders store errors inline', () => {
    useMcpServerStore.setState({ error: 'Failed to update config' });

    render(<MCPServerSettings />);

    expect(screen.getByText('Failed to update config')).toBeInTheDocument();
  });
});
