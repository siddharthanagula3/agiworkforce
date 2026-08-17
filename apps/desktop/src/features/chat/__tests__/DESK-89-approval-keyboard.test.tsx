import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { enableMapSet } from 'immer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

function setPlatform(platform: string): void {
  Object.defineProperty(globalThis.navigator, 'platform', {
    value: platform,
    configurable: true,
  });
}

function addPendingToolApproval(id: string): void {
  act(() => {
    useToolStore.getState().addApprovalRequest({
      id,
      type: 'mcp_tool',
      description: 'Delete /tmp/report.txt',
      riskLevel: 'high',
      details: {
        tool: 'Delete file',
        toolName: 'mcp__filesystem__delete_file',
        arguments: { path: '/tmp/report.txt' },
      },
      timeoutSeconds: 120,
    });
  });
}

describe('DESK-89 tool approval keyboard decisions', () => {
  const originalPlatform = globalThis.navigator.platform;

  beforeEach(() => {
    vi.clearAllMocks();
    approvalActionsMock.resolveApproval.mockResolvedValue(undefined);
    useToolStore.getState().resetOnLogout();
  });

  afterEach(() => {
    cleanup();
    setPlatform(originalPlatform);
  });

  it('approves the pending tool on the advertised macOS chord', async () => {
    setPlatform('MacIntel');
    addPendingToolApproval('desk-89-mac');
    render(<McpToolConfirmationPrompt />);

    expect(screen.getByText('Cmd+Enter')).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('button', { name: 'Approve' }), {
      key: 'Enter',
      metaKey: true,
    });

    await waitFor(() => {
      expect(approvalActionsMock.resolveApproval).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'desk-89-mac' }),
        'approve',
        { reason: undefined },
      );
    });
  });

  it('approves the pending tool on the advertised Windows chord', async () => {
    setPlatform('Win32');
    addPendingToolApproval('desk-89-win');
    render(<McpToolConfirmationPrompt />);

    expect(screen.getByText('Ctrl+Enter')).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('button', { name: 'Approve' }), {
      key: 'Enter',
      ctrlKey: true,
    });

    await waitFor(() => {
      expect(approvalActionsMock.resolveApproval).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'desk-89-win' }),
        'approve',
        { reason: undefined },
      );
    });
  });

  it('leaves the tool blocked on a bare Enter so a focused Deny stays the safe default', async () => {
    setPlatform('MacIntel');
    addPendingToolApproval('desk-89-bare-enter');
    render(<McpToolConfirmationPrompt />);

    fireEvent.keyDown(screen.getByRole('button', { name: 'Approve' }), { key: 'Enter' });

    await Promise.resolve();
    expect(approvalActionsMock.resolveApproval).not.toHaveBeenCalled();
    expect(screen.getByTestId('mcp-tool-confirmation-prompt')).toBeInTheDocument();
  });

  it('denies the pending tool on Escape raised inside the dialog', async () => {
    setPlatform('MacIntel');
    addPendingToolApproval('desk-89-escape');
    render(<McpToolConfirmationPrompt />);

    fireEvent.keyDown(screen.getByRole('button', { name: 'Approve' }), { key: 'Escape' });

    await waitFor(() => {
      expect(approvalActionsMock.resolveApproval).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'desk-89-escape' }),
        'reject',
        { reason: 'Denied by user' },
      );
    });
  });
});
