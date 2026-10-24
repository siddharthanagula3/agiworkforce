import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { enableMapSet } from 'immer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApprovalRequest } from '@/stores/chat/toolStore';
import { useToolStore } from '@/stores/chat/toolStore';
import { McpToolConfirmationPrompt } from '../McpToolConfirmationPrompt';

const approvalActionsMock = vi.hoisted(() => ({
  resolveApproval: vi.fn(),
}));

enableMapSet();

vi.mock('@/hooks/useApprovalActions', () => ({
  useApprovalActions: () => ({
    resolveApproval: approvalActionsMock.resolveApproval,
  }),
}));

function toolApproval(): ApprovalRequest {
  return {
    id: 'mcp-tool:request-1',
    type: 'mcp_tool',
    description: 'Run a filesystem search across the workspace',
    riskLevel: 'high',
    details: {
      tool: 'search_files',
      toolName: 'search_files',
      arguments: { pattern: '*.env' },
    },
    status: 'pending',
    timeoutSeconds: 120,
    createdAt: new Date('2026-08-15T12:00:00.000Z'),
  };
}

function stubPlatform(platform: string): void {
  Object.defineProperty(globalThis.navigator, 'platform', {
    value: platform,
    configurable: true,
  });
}

const originalPlatform = globalThis.navigator.platform;

describe('UI-76 MCP tool confirmation keyboard decisions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    approvalActionsMock.resolveApproval.mockResolvedValue(undefined);
    useToolStore.getState().resetOnLogout();
    useToolStore.setState({ pendingApprovals: [toolApproval()] });
  });

  afterEach(() => {
    cleanup();
    stubPlatform(originalPlatform);
  });

  it('approves on the advertised primary+Enter chord', async () => {
    stubPlatform('MacIntel');
    const user = userEvent.setup();
    render(<McpToolConfirmationPrompt />);

    await user.keyboard('{Meta>}{Enter}{/Meta}');

    await waitFor(() => {
      expect(approvalActionsMock.resolveApproval).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'mcp-tool:request-1' }),
        'approve',
        { reason: undefined },
      );
    });
  });

  it('denies on Escape through the dialog key handler', async () => {
    stubPlatform('MacIntel');
    const user = userEvent.setup();
    render(<McpToolConfirmationPrompt />);

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(approvalActionsMock.resolveApproval).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'mcp-tool:request-1' }),
        'reject',
        { reason: 'Denied by user' },
      );
    });
    expect(approvalActionsMock.resolveApproval).toHaveBeenCalledTimes(1);
  });

  it('advertises only chords it implements, using the platform primary modifier', async () => {
    stubPlatform('MacIntel');
    render(<McpToolConfirmationPrompt />);

    expect(screen.getByRole('button', { name: 'Deny' })).toHaveTextContent('Escape');
    expect(screen.getByRole('button', { name: 'Approve' })).toHaveTextContent('Cmd+Enter');
  });

  it('advertises Ctrl+Enter off macOS', async () => {
    stubPlatform('Win32');
    render(<McpToolConfirmationPrompt />);

    expect(screen.getByRole('button', { name: 'Approve' })).toHaveTextContent('Ctrl+Enter');
  });

  it('approves on Ctrl+Enter off macOS', async () => {
    stubPlatform('Win32');
    const user = userEvent.setup();
    render(<McpToolConfirmationPrompt />);

    await user.keyboard('{Control>}{Enter}{/Control}');

    await waitFor(() => {
      expect(approvalActionsMock.resolveApproval).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'mcp-tool:request-1' }),
        'approve',
        { reason: undefined },
      );
    });
  });
});
