import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const resolveApproval = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('../../hooks/useApprovalActions', () => ({
  useApprovalActions: () => ({ resolveApproval }),
}));

import { RemoteApprovalCard } from './RemoteApprovalCard';
import type { ApprovalRequest } from '../../stores/chat/toolStore';

function approval(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    id: 'approval-1',
    type: 'mcp_tool',
    description: 'Write the release manifest',
    riskLevel: 'medium',
    details: { toolName: 'write_file' },
    status: 'pending',
    timeoutSeconds: 120,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('RemoteApprovalCard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resolveApproval.mockClear();
    resolveApproval.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses the shared native-backed resolver for approval decisions', () => {
    const request = approval();
    render(<RemoteApprovalCard approval={request} />);

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    expect(resolveApproval).toHaveBeenCalledWith(request, 'approve');
  });

  it('does not invent a second frontend auto-deny timer', () => {
    render(<RemoteApprovalCard approval={approval()} />);

    act(() => {
      vi.advanceTimersByTime(121_000);
    });

    expect(resolveApproval).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Deny' })).toBeEnabled();
  });

  it('keeps the request actionable and exposes native resolution failures', async () => {
    vi.useRealTimers();
    resolveApproval.mockRejectedValueOnce(new Error('Desktop approval channel unavailable'));
    render(<RemoteApprovalCard approval={approval({ timeoutSeconds: undefined })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Deny' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Desktop approval channel unavailable',
    );
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
  });
});
