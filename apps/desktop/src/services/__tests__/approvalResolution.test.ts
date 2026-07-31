import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  approveOperation,
  recordTrustedAction,
  rejectOperation,
  resolveAgentApproval,
  respondToolConfirmation,
} = vi.hoisted(() => ({
  approveOperation: vi.fn(),
  recordTrustedAction: vi.fn(),
  rejectOperation: vi.fn(),
  resolveAgentApproval: vi.fn().mockResolvedValue(undefined),
  respondToolConfirmation: vi.fn().mockResolvedValue({ allowedDirectories: null }),
}));

vi.mock('../../api/agent', () => ({
  resolveApproval: resolveAgentApproval,
}));

vi.mock('../../api/toolConfirmation', () => ({
  respondToolConfirmation,
}));

vi.mock('../../stores/chat/toolStore', () => ({
  useToolStore: {
    getState: () => ({
      approveOperation,
      recordTrustedAction,
      rejectOperation,
    }),
  },
}));

import { resolveApprovalRequest } from '../approvalResolution';
import type { ApprovalRequest } from '../../stores/chat/toolStore';

const baseApproval: ApprovalRequest = {
  id: 'approval-1',
  type: 'mcp_tool',
  description: 'Write a file',
  riskLevel: 'medium',
  details: { toolName: 'write_file' },
  status: 'pending',
  createdAt: new Date('2026-07-30T12:00:00.000Z'),
};

describe('approvalResolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveAgentApproval.mockResolvedValue(undefined);
    respondToolConfirmation.mockResolvedValue({ allowedDirectories: null });
  });

  it('uses the native tool-confirmation channel before clearing MCP approvals', async () => {
    await resolveApprovalRequest(baseApproval, 'approve');

    expect(respondToolConfirmation).toHaveBeenCalledWith(
      'approval-1',
      true,
      false,
      undefined,
      false,
      'write_file',
    );
    expect(approveOperation).toHaveBeenCalledWith('approval-1');
    expect(resolveAgentApproval).not.toHaveBeenCalled();
  });

  it('uses the agent approval channel and records an explicitly trusted action', async () => {
    const approval: ApprovalRequest = {
      ...baseApproval,
      type: 'terminal_command',
      workflowHash: 'workflow-hash',
      actionSignature: 'action-signature',
    };

    await resolveApprovalRequest(approval, 'approve', { trust: true });

    expect(resolveAgentApproval).toHaveBeenCalledWith('approval-1', 'approve', {
      reason: undefined,
      trust: true,
    });
    expect(approveOperation).toHaveBeenCalledWith('approval-1');
    expect(recordTrustedAction).toHaveBeenCalledWith('workflow-hash', 'action-signature');
  });

  it('keeps local state pending when the native resolver fails', async () => {
    respondToolConfirmation.mockRejectedValueOnce(new Error('native channel unavailable'));

    await expect(
      resolveApprovalRequest(baseApproval, 'reject', { reason: 'Denied remotely' }),
    ).rejects.toThrow('native channel unavailable');

    expect(rejectOperation).not.toHaveBeenCalled();
  });
});
