import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useMcpStore } from '../../../stores/mcpStore';
import MCPWorkspace from '../MCPWorkspace';

vi.mock('../MCPServerCard', () => ({
  default: () => <div>MCP server card</div>,
}));

vi.mock('../MCPToolBrowser', () => ({
  default: () => <div>MCP tool browser</div>,
}));

vi.mock('../MCPCredentialManager', () => ({
  default: () => <div>MCP credential manager</div>,
}));

vi.mock('../MCPConfigEditor', () => ({
  default: () => <div>MCP config editor</div>,
}));

vi.mock('../MCPBundleBrowser', () => ({
  MCPBundleBrowser: ({ onConfigureServer }: { onConfigureServer?: () => void }) => (
    <div>
      <span>Bundle browser mounted</span>
      <button type="button" onClick={onConfigureServer}>
        Configure installed server
      </button>
    </div>
  ),
}));

describe('MCPWorkspace', () => {
  beforeEach(() => {
    useMcpStore.setState({
      servers: [],
      tools: [],
      isInitialized: true,
      isLoading: false,
      error: null,
      searchQuery: '',
      initialize: vi.fn().mockResolvedValue(undefined),
      refreshServers: vi.fn().mockResolvedValue(undefined),
      refreshTools: vi.fn().mockResolvedValue(undefined),
      refreshRuntimeTelemetry: vi.fn().mockResolvedValue(undefined),
      searchTools: vi.fn().mockResolvedValue(undefined),
      setSearchQuery: vi.fn(),
      clearError: vi.fn(),
    });
  });

  it('opens the bundle registry and routes completed installs to Configuration', async () => {
    const user = userEvent.setup();
    render(<MCPWorkspace />);

    const bundleRegistryTab = screen.getByRole('tab', { name: 'Bundle Registry' });
    await user.click(bundleRegistryTab);
    expect(bundleRegistryTab).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('Bundle browser mounted')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Configure installed server' }));

    expect(screen.getByRole('tab', { name: 'Configuration' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByText('MCP config editor')).toBeInTheDocument();
  });
});
