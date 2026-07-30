import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { enableMapSet } from 'immer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApprovalRequest } from '@/stores/chat/toolStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useToolStore } from '@/stores/chat/toolStore';
import { FolderAccessConsentDialog } from '../FolderAccessConsentDialog';
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

function folderApproval(
  overrides: Partial<ApprovalRequest> = {},
  argumentOverrides: Record<string, unknown> = {},
): ApprovalRequest {
  return {
    id: 'folder-access:request-1',
    type: 'mcp_tool',
    description: 'Allow file read to access new folders',
    riskLevel: 'high',
    details: {
      tool: 'Folder Access',
      toolName: 'folder_access',
      arguments: {
        requesting_tool: 'file_read',
        paths: ['/Users/sid/Projects/notes.txt', '/Users/sid/Research/paper.pdf'],
        directories: ['/Users/sid/Projects', '/Users/sid/Research'],
        capabilities: ['read', 'modify', 'execute'],
        ...argumentOverrides,
      },
    },
    status: 'pending',
    timeoutSeconds: 120,
    createdAt: new Date('2026-07-30T12:00:00.000Z'),
    ...overrides,
  };
}

describe('GAP-002 folder access consent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    approvalActionsMock.resolveApproval.mockResolvedValue({ allowedDirectories: null });
    useSettingsStore.setState({ allowedDirectories: [] });
    useToolStore.getState().resetOnLogout();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows exact resolved paths and capabilities with safe defaults', async () => {
    const user = userEvent.setup();
    const approval = folderApproval();
    render(<FolderAccessConsentDialog approval={approval} pendingCount={2} />);

    expect(screen.getByText('/Users/sid/Projects/notes.txt')).toBeInTheDocument();
    expect(screen.getByText('/Users/sid/Research/paper.pdf')).toBeInTheDocument();
    expect(screen.getByText('/Users/sid/Projects')).toBeInTheDocument();
    expect(screen.getByText('/Users/sid/Research')).toBeInTheDocument();
    expect(screen.getByText('Read files')).toBeInTheDocument();
    expect(screen.getByText('Modify files')).toBeInTheDocument();
    expect(screen.getByText('Run commands')).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    expect(screen.getByText('1 of 2 requests awaiting a decision')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(approvalActionsMock.resolveApproval).toHaveBeenCalledWith(approval, 'reject', {
      trust: false,
      reason: 'Folder access cancelled by user',
    });
  });

  it('mirrors only the native-confirmed persistent folders into Settings', async () => {
    const user = userEvent.setup();
    const approval = folderApproval({}, { capabilities: ['modify'] });
    approvalActionsMock.resolveApproval.mockResolvedValue({
      allowedDirectories: ['/Users/sid/Projects', '/Users/sid/Research'],
    });
    render(<FolderAccessConsentDialog approval={approval} pendingCount={1} />);

    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Allow' }));

    expect(approvalActionsMock.resolveApproval).toHaveBeenCalledWith(approval, 'approve', {
      trust: true,
      reason: undefined,
    });
    await waitFor(() => {
      expect(useSettingsStore.getState().allowedDirectories).toEqual([
        '/Users/sid/Projects',
        '/Users/sid/Research',
      ]);
    });
  });

  it('keeps the tool blocked and the dialog visible when native persistence fails', async () => {
    const user = userEvent.setup();
    approvalActionsMock.resolveApproval.mockRejectedValue(new Error('settings.json is read-only'));
    render(<FolderAccessConsentDialog approval={folderApproval()} pendingCount={1} />);

    await user.click(screen.getByRole('button', { name: 'Allow' }));

    expect(await screen.findByText(/The tool remains blocked/)).toHaveTextContent(
      'settings.json is read-only',
    );
    expect(screen.getByTestId('folder-access-consent-dialog')).toBeInTheDocument();
    expect(useSettingsStore.getState().allowedDirectories).toEqual([]);
  });

  it('routes native folder requests to the specialized mounted prompt', () => {
    const approval = folderApproval();
    act(() => {
      useToolStore.getState().addApprovalRequest({
        id: approval.id,
        type: approval.type,
        description: approval.description,
        riskLevel: approval.riskLevel,
        details: approval.details,
        timeoutSeconds: approval.timeoutSeconds,
      });
    });

    render(<McpToolConfirmationPrompt />);

    expect(screen.getByTestId('folder-access-consent-dialog')).toBeInTheDocument();
    expect(screen.queryByTestId('mcp-tool-confirmation-prompt')).not.toBeInTheDocument();
  });
});
