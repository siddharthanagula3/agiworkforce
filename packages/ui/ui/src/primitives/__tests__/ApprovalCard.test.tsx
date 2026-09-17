import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ApprovalCard } from '../ApprovalCard';

const REQUESTS = [{ id: 'call-1', name: 'create_issue', detail: '{"title":"Ship"}' }];

describe('ApprovalCard', () => {
  it('names the decision and lists what is being asked', () => {
    render(
      <ApprovalCard
        title="Waiting for your approval"
        requests={REQUESTS}
        approveLabel="Approve"
        denyLabel="Deny"
        onApprove={vi.fn()}
        onDeny={vi.fn()}
        meta="asked just now"
      />,
    );

    expect(screen.getByRole('group', { name: 'Waiting for your approval' })).toBeTruthy();
    expect(screen.getByText('create_issue')).toBeTruthy();
    expect(screen.getByText('{"title":"Ship"}')).toBeTruthy();
    expect(screen.getByText('asked just now')).toBeTruthy();
  });

  it('routes approve and deny to their own handlers', () => {
    const onApprove = vi.fn();
    const onDeny = vi.fn();
    render(
      <ApprovalCard
        title="Approval"
        requests={REQUESTS}
        approveLabel="Approve"
        denyLabel="Deny"
        onApprove={onApprove}
        onDeny={onDeny}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    fireEvent.click(screen.getByRole('button', { name: 'Deny' }));
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onDeny).toHaveBeenCalledTimes(1);
  });

  it('disables both decisions while one is being sent, keeping the button names', () => {
    render(
      <ApprovalCard
        title="Approval"
        requests={REQUESTS}
        approveLabel="Approve"
        denyLabel="Deny"
        onApprove={vi.fn()}
        onDeny={vi.fn()}
        pending
      />,
    );

    expect(screen.getByRole('button', { name: 'Approve' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Deny' })).toHaveProperty('disabled', true);
  });
});
