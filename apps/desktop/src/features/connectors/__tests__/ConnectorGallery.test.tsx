import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectorGallery } from '../ConnectorGallery';
import { useConnectorsStore } from '../../../stores/connectorsStore';
import { McpClient } from '@/api/mcp';
import { TooltipProvider } from '@/ui/Tooltip';

vi.mock('@/api/mcp', () => ({
  McpClient: {
    listConnectedProviders: vi.fn(),
    listServers: vi.fn(),
    getConfig: vi.fn(),
    updateConfig: vi.fn(),
    connect: vi.fn(),
    listTools: vi.fn(),
    oauthStatus: vi.fn(),
    oauthRefresh: vi.fn(),
    oauthStartRaw: vi.fn(),
    oauthCallbackRaw: vi.fn(),
    connectConnector: vi.fn(),
    saveApiKey: vi.fn(),
    oauthDisconnectRaw: vi.fn(),
  },
}));

function resetConnectorsStore() {
  useConnectorsStore.setState({
    connectedIds: [],
    loading: {},
    error: {},
    pendingOAuth: {},
    oauthStartedAt: {},
    _oauthTimers: {},
    // CON-25: `connectorPermissions` was removed from this store — it had zero
    // readers, and real enforcement lives behind the connector_permission_*
    // Tauri commands.
  });
}

describe('ConnectorGallery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetConnectorsStore();
    vi.mocked(McpClient.listConnectedProviders).mockResolvedValue([]);
    vi.mocked(McpClient.listServers).mockResolvedValue([]);
    vi.mocked(McpClient.getConfig).mockResolvedValue({ mcpServers: {} });
    vi.mocked(McpClient.listTools).mockResolvedValue([]);
    vi.mocked(McpClient.oauthStatus).mockResolvedValue({
      connected: true,
      userInfo: null,
      expiresAt: null,
    });
  });

  it('shows saved custom servers as disconnected and connects only after an explicit click', async () => {
    vi.mocked(McpClient.listServers).mockResolvedValue([
      {
        name: 'custom-acme-mcp',
        enabled: true,
        connected: false,
        tool_count: 0,
        command: '',
      },
    ]);
    vi.mocked(McpClient.getConfig).mockResolvedValue({
      mcpServers: {
        'custom-acme-mcp': {
          command: '',
          args: [],
          env: {},
          enabled: true,
          transport: { type: 'http', url: 'https://mcp.example.com/sse' },
        },
      },
    });
    vi.mocked(McpClient.connect).mockResolvedValue('Connected');

    render(
      <TooltipProvider>
        <ConnectorGallery />
      </TooltipProvider>,
    );

    expect(await screen.findByText('Saved MCP servers')).toBeInTheDocument();
    expect(screen.getByText('Saved · Disconnected')).toBeInTheDocument();
    expect(screen.getByText('https://mcp.example.com/sse')).toBeInTheDocument();
    expect(McpClient.connect).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Connect Acme MCP' }));
    expect(McpClient.connect).toHaveBeenCalledWith('custom-acme-mcp');
  });

  it('keeps a denied custom connection readable and disconnected', async () => {
    vi.mocked(McpClient.listServers).mockResolvedValue([
      {
        name: 'custom-acme-mcp',
        enabled: true,
        connected: false,
        tool_count: 0,
        command: '',
      },
    ]);
    vi.mocked(McpClient.getConfig).mockResolvedValue({
      mcpServers: {
        'custom-acme-mcp': {
          command: '',
          args: [],
          env: {},
          enabled: true,
          transport: { type: 'http', url: 'https://mcp.example.com/sse' },
        },
      },
    });
    vi.mocked(McpClient.connect).mockRejectedValue(
      new Error(
        "Failed to connect to MCP server 'custom-acme-mcp': MCP command 'mcp_connect_server' failed: MCP server connection cancelled",
      ),
    );

    render(
      <TooltipProvider>
        <ConnectorGallery />
      </TooltipProvider>,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Connect Acme MCP' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Connection cancelled. The server remains saved and disconnected.',
    );
    expect(screen.getByText('Acme MCP')).toBeInTheDocument();
    expect(screen.getByText('Saved · Disconnected')).toBeInTheDocument();
    expect(screen.queryByText(/mcp_connect_server/)).not.toBeInTheDocument();
  });

  it('renders connectors inside Settings without Directory or Customize copy', async () => {
    render(
      <TooltipProvider>
        <ConnectorGallery />
      </TooltipProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Connectors')).toBeInTheDocument();
    });

    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.getByText('Available to connect')).toBeInTheDocument();
    expect(screen.queryByText(/Directory/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Customize/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Featured/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('connector-mark-gmail')).toHaveAttribute(
      'data-brand-source',
      'image',
    );
    expect(screen.getByTestId('connector-mark-gmail')).not.toHaveTextContent('\u{1F4E7}');
  });

  it('falls back to a bundled brand mark instead of emoji artwork', async () => {
    render(
      <TooltipProvider>
        <ConnectorGallery />
      </TooltipProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('connector-mark-figma')).toBeInTheDocument();
    });

    const figmaMark = screen.getByTestId('connector-mark-figma');
    const officialImage = figmaMark.querySelector('img');
    expect(officialImage).toBeTruthy();

    fireEvent.error(officialImage as HTMLImageElement);

    await waitFor(() => {
      expect(figmaMark).toHaveAttribute('data-brand-source', 'brand');
    });
    expect(within(figmaMark).getByRole('img', { name: /figma logo/i })).toBeInTheDocument();
    expect(figmaMark).not.toHaveTextContent('\u{1F3A8}');
  });

  it('shows connected connectors from the MCP store with a real configure path', async () => {
    vi.mocked(McpClient.listConnectedProviders).mockResolvedValue(['gmail']);

    render(
      <TooltipProvider>
        <ConnectorGallery />
      </TooltipProvider>,
    );

    await waitFor(() => {
      expect(screen.getAllByText('Gmail').length).toBeGreaterThan(0);
      expect(screen.getByText('1 active')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: /configure/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /back to connectors/i })).toBeInTheDocument();
      expect(screen.getByText(/no live tool schema available/i)).toBeInTheDocument();
    });
  });

  it('wires real MCP tool discovery into the per-tool permission view (DESKTOP-MCP-DOTFILE-CONFIG-FAKE-SUCCESS-01)', async () => {
    vi.mocked(McpClient.listConnectedProviders).mockResolvedValue(['gmail']);
    // Server name follows the `connector-<id>` convention used by
    // get_connector_mcp_mapping (apps/desktop-tauri sys/commands/mcp_oauth.rs)
    // when a connector is actually activated.
    vi.mocked(McpClient.listTools).mockResolvedValue([
      {
        id: 'mcp__connector-gmail__search_emails__',
        name: 'search_emails',
        description: 'Search the inbox',
        server: 'connector-gmail',
        parameters: [],
      },
      {
        id: 'mcp__connector-gmail__delete_email__',
        name: 'delete_email',
        description: 'Delete an email',
        server: 'connector-gmail',
        parameters: [],
      },
      {
        id: 'mcp__other-server__unrelated_tool__',
        name: 'unrelated_tool',
        description: 'Belongs to a different server',
        server: 'other-server',
        parameters: [],
      },
    ]);

    render(
      <TooltipProvider>
        <ConnectorGallery />
      </TooltipProvider>,
    );

    await waitFor(() => {
      expect(screen.getAllByText('Gmail').length).toBeGreaterThan(0);
    });

    await userEvent.click(screen.getByRole('button', { name: /configure/i }));

    await waitFor(() => {
      expect(screen.getByText('search_emails')).toBeInTheDocument();
      expect(screen.getByText('delete_email')).toBeInTheDocument();
    });

    // Tools from an unrelated server must not leak into this connector's view.
    expect(screen.queryByText('unrelated_tool')).not.toBeInTheDocument();
    expect(screen.queryByText(/no live tool schema available/i)).not.toBeInTheDocument();

    // The destructive tool (name contains "delete") defaults to Blocked;
    // the non-destructive one defaults to Needs approval.
    expect(
      screen.getByRole('combobox', { name: /permission for delete_email/i }),
    ).toHaveTextContent(/blocked/i);
    expect(
      screen.getByRole('combobox', { name: /permission for search_emails/i }),
    ).toHaveTextContent(/needs approval/i);
  });
});
