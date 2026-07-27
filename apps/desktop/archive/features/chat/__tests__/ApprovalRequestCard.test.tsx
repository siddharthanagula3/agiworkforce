import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const resolveApproval = vi.fn();

vi.mock('../../../hooks/useApprovalActions', () => ({
  useApprovalActions: () => ({
    resolveApproval,
  }),
}));

vi.mock('../Visualizations/CodeBlock', () => ({
  CodeBlock: ({ code }: { code: string }) => <pre>{code}</pre>,
}));

import { ApprovalRequestCard } from '../Cards/ApprovalRequestCard';

describe('ApprovalRequestCard', () => {
  it('auto-rejects timed out approvals inline', async () => {
    render(
      <ApprovalRequestCard
        approval={{
          id: 'approval-timeout-1',
          type: 'terminal_command',
          description: 'Run npm install',
          riskLevel: 'medium',
          details: { command: 'npm install' },
          status: 'pending',
          createdAt: new Date(Date.now() - 10_000),
          timeoutSeconds: 1,
        }}
      />,
    );

    await waitFor(() => {
      expect(resolveApproval).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'approval-timeout-1' }),
        'reject',
        { reason: 'Approval request timed out' },
      );
    });
  });
});
