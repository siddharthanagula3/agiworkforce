import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LocalApprovalCard } from './LocalApprovalCard';
import type { LocalApproval } from '../local-code';

const approval = {
  type: 'approval-requested',
  threadId: 'thread-1',
  turnId: 'turn-1',
  requestId: 'ask-1',
  kind: 'Exec',
  summary: 'Run the build',
  detail: '',
  command: 'pnpm build',
  riskLevel: 'high',
  reversible: false,
} as LocalApproval;

function renderCard(waiting = 0) {
  const onDecide = vi.fn(async () => {});
  render(
    <div>
      <textarea aria-label="Composer" />
      <LocalApprovalCard
        approval={approval}
        folder="/work"
        waiting={waiting}
        allDecisions
        onDecide={onDecide}
      />
    </div>,
  );
  return onDecide;
}

describe('LocalApprovalCard keyboard', () => {
  it('labels Deny with its key and no allow action with one', () => {
    renderCard();

    expect(screen.getByRole('button', { name: 'Deny (Esc)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Allow once' })).toBeInTheDocument();
  });

  it('denies on Escape when it is the only pending approval', () => {
    const onDecide = renderCard();

    fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(onDecide).toHaveBeenCalledWith(approval, 'deny');
  });

  it('never allows on Enter', () => {
    const onDecide = renderCard();

    fireEvent.keyDown(screen.getByTestId('local-approval'), { key: 'Enter' });

    expect(onDecide).not.toHaveBeenCalled();
  });

  it('leaves Escape in the composer alone', () => {
    const onDecide = renderCard();

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Composer' }), { key: 'Escape' });

    expect(onDecide).not.toHaveBeenCalled();
  });

  it('ignores Escape elsewhere on the page while more approvals wait', () => {
    const onDecide = renderCard(2);

    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onDecide).not.toHaveBeenCalled();

    fireEvent.keyDown(screen.getByRole('button', { name: 'Allow once' }), { key: 'Escape' });
    expect(onDecide).toHaveBeenCalledWith(approval, 'deny');
  });
});
