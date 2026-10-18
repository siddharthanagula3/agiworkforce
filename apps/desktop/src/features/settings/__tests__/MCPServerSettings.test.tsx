import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MCPServerSettings } from '../MCPServerSettings';
import { McpClient } from '@/api/mcp';
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
    vi.restoreAllMocks();
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

  it('copies the snippet with the token the native confirm reveals, not the redacted one', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    vi.spyOn(McpClient, 'revealRuntimeServerToken').mockResolvedValue('full-token-value');

    render(<MCPServerSettings />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy MCP client config snippet' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    const snippet = writeText.mock.calls[0]?.[0] as string;
    expect(snippet).toContain('Bearer full-token-value');
    expect(snippet).not.toContain('********mock');
  });

  it('copies nothing and says why when the reveal is declined', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    vi.spyOn(McpClient, 'revealRuntimeServerToken').mockRejectedValue(
      new Error('The token was not revealed.'),
    );

    render(<MCPServerSettings />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy MCP client config snippet' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The token was not revealed.');
    expect(writeText).not.toHaveBeenCalled();
  });
});
