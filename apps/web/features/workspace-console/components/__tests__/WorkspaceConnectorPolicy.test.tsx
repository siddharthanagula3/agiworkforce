import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockUseConnectorPolicy, mockMutate } = vi.hoisted(() => ({
  mockUseConnectorPolicy: vi.fn(),
  mockMutate: vi.fn(),
}));

vi.mock('../../hooks/use-connector-policy', () => ({
  useConnectorPolicy: mockUseConnectorPolicy,
  useUpdateConnectorPolicy: () => ({
    mutate: mockMutate,
    isPending: false,
    isError: false,
    error: null,
  }),
}));

import { WorkspaceConnectorPolicy } from '../WorkspaceConnectorPolicy';

function policy(overrides: Record<string, unknown> = {}, canManagePolicy = true) {
  mockUseConnectorPolicy.mockReturnValue({
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    data: {
      organizationId: 'org-1',
      configured: true,
      canManagePolicy,
      currentUserRole: canManagePolicy ? 'admin' : 'member',
      catalog: [],
      policy: {
        allowedConnectors: [],
        blockedConnectors: [],
        allowCustomConnectors: true,
        allowedPlugins: [],
        blockedPlugins: ['shadow-sync'],
        allowedMcpHosts: [],
        updatedAt: null,
        ...overrides,
      },
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('WorkspaceConnectorPolicy plugin and MCP host lists', () => {
  it('saves an approved plugin, a moved block and an approved host in one policy', () => {
    policy();
    render(<WorkspaceConnectorPolicy />);

    const save = screen.getByRole('button', { name: 'Save policy' });
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Plugin key'), { target: { value: 'Acme-Review' } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    fireEvent.change(screen.getByLabelText('Plugin key'), { target: { value: 'shadow-sync' } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    fireEvent.change(screen.getByLabelText('MCP server host'), {
      target: { value: '*.corp.example' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Approve host' }));

    expect(
      within(screen.getByRole('list', { name: 'Approved plugins' })).getByText('acme-review'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Blocked plugins' })).not.toBeInTheDocument();

    fireEvent.click(save);
    expect(mockMutate).toHaveBeenCalledWith({
      allowedConnectors: [],
      blockedConnectors: [],
      allowCustomConnectors: true,
      allowedPlugins: ['acme-review', 'shadow-sync'],
      blockedPlugins: [],
      allowedMcpHosts: ['*.corp.example'],
    });
  });

  it('will not add a malformed host or plugin key', () => {
    policy();
    render(<WorkspaceConnectorPolicy />);

    fireEvent.change(screen.getByLabelText('MCP server host'), {
      target: { value: 'https://mcp.example.com/sse' },
    });
    expect(screen.getByRole('button', { name: 'Approve host' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Plugin key'), { target: { value: 'not valid!' } });
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Block' })).toBeDisabled();
  });

  it('removes a listed entry and shows members the lists without letting them edit', () => {
    policy({ allowedMcpHosts: ['mcp.corp.example'] });
    const { unmount } = render(<WorkspaceConnectorPolicy />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove mcp.corp.example from approved hosts' }),
    );
    expect(screen.getByText('No host restriction.')).toBeInTheDocument();
    unmount();

    policy({ allowedMcpHosts: ['mcp.corp.example'] }, false);
    render(<WorkspaceConnectorPolicy />);
    expect(
      screen.getByRole('button', { name: 'Remove mcp.corp.example from approved hosts' }),
    ).toBeDisabled();
    expect(screen.getByLabelText('Plugin key')).toBeDisabled();
  });
});
