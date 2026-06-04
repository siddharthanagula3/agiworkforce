import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useMcpStore } from '../../../stores/mcpStore';
import { MCPToolsSettings } from '../MCPToolsSettings';

vi.mock('@/features/mcp/MCPConfigEditor', () => ({
  default: () => <div>MCP config editor</div>,
}));

vi.mock('@/features/mcp/MCPCredentialManager', () => ({
  default: () => <div>MCP credential manager</div>,
}));

vi.mock('@/features/mcp/MCPConnectionStatus', () => ({
  default: () => <div>MCP connection status</div>,
}));

vi.mock('@/features/mcp/MCPServerCard', () => ({
  default: () => <div>MCP server card</div>,
}));

vi.mock('@/features/mcp/MCPToolBrowser', () => ({
  default: () => <div>MCP tool browser</div>,
}));

describe('MCPToolsSettings', () => {
  const initialize = vi.fn().mockResolvedValue(undefined);
  const refreshServers = vi.fn().mockResolvedValue(undefined);
  const refreshTools = vi.fn().mockResolvedValue(undefined);
  const refreshRuntimeTelemetry = vi.fn().mockResolvedValue(undefined);
  const refreshConfigLocation = vi.fn().mockResolvedValue(undefined);
  const searchTools = vi.fn().mockResolvedValue(undefined);
  const setSearchQuery = vi.fn();
  const clearError = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useMcpStore.setState({
      servers: [],
      tools: [],
      configLocation: {
        source: 'global',
        path: '/Users/test/.agiworkforce/mcp.json',
        projectFolder: null,
        exists: false,
      },
      isInitialized: true,
      isLoading: false,
      error: null,
      searchQuery: '',
      initialize,
      refreshServers,
      refreshTools,
      refreshRuntimeTelemetry,
      refreshConfigLocation,
      searchTools,
      setSearchQuery,
      clearError,
    });
  });

  it('renders MCP Tools subtabs and clear empty states without crashing', async () => {
    await act(async () => {
      render(<MCPToolsSettings />);
    });

    expect(screen.getByText('MCP Tools')).toBeInTheDocument();
    expect(screen.getByText('No MCP servers configured.')).toBeInTheDocument();
    expect(screen.getByText('MCP connection status')).toBeInTheDocument();

    expect(screen.getByRole('tab', { name: /Tools/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Credentials/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Config/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(refreshConfigLocation).toHaveBeenCalled();
    });
  });
});
