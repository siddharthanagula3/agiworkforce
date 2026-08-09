import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enableMapSet } from 'immer';

const { resolveAgentApproval, respondToolConfirmation } = vi.hoisted(() => ({
  resolveAgentApproval: vi.fn().mockResolvedValue(undefined),
  respondToolConfirmation: vi.fn().mockResolvedValue(undefined),
}));

// Mock only the two native command wrappers. `services/approvalResolution`,
// `hooks/useApprovalActions` and `stores/chat/toolStore` all run for real so
// this exercises the actual routing the sidecar depends on.
vi.mock('../../../api/agent', () => ({
  resolveApproval: resolveAgentApproval,
}));

vi.mock('../../../api/toolConfirmation', () => ({
  respondToolConfirmation,
}));

import { ExecutionSidecarApprovals } from '../ExecutionSidecarApprovals';
import { useToolStore, type ApprovalRequest } from '../../../stores/chat/toolStore';

enableMapSet();

function pendingApproval(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    id: 'action-42',
    type: 'terminal_command',
    description: 'Run rm -rf ./build',
    riskLevel: 'high',
    details: {},
    status: 'pending',
    createdAt: new Date(),
    actionId: 'action-42',
    ...overrides,
  };
}

describe('ExecutionSidecarApprovals', () => {
  beforeEach(() => {
    resolveAgentApproval.mockClear();
    resolveAgentApproval.mockResolvedValue(undefined);
    respondToolConfirmation.mockClear();
    useToolStore.setState({ pendingApprovals: [pendingApproval()], actionLog: [] });
  });

  it('resumes the suspended run by resolving the native approval channel', async () => {
    render(<ExecutionSidecarApprovals />);

    fireEvent.click(screen.getByRole('button', { name: /Approve/ }));

    await waitFor(() => {
      expect(resolveAgentApproval).toHaveBeenCalledWith('action-42', 'approve', {
        reason: undefined,
        trust: false,
      });
    });
    await waitFor(() => {
      expect(useToolStore.getState().pendingApprovals).toHaveLength(0);
    });
  });

  it('sends a denial to the backend instead of only clearing the local queue', async () => {
    render(<ExecutionSidecarApprovals />);

    fireEvent.click(screen.getByRole('button', { name: /Deny/ }));

    await waitFor(() => {
      expect(resolveAgentApproval).toHaveBeenCalledWith(
        'action-42',
        'reject',
        expect.objectContaining({ trust: false }),
      );
    });
  });

  it('keeps the request pending and surfaces the error when the native call fails', async () => {
    resolveAgentApproval.mockRejectedValueOnce(new Error('Approval action-42 not pending'));

    render(<ExecutionSidecarApprovals />);

    fireEvent.click(screen.getByRole('button', { name: /Approve/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Approval action-42 not pending');
    expect(useToolStore.getState().pendingApprovals).toHaveLength(1);
  });
});
