import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ToolApprovalRequest } from '@agiworkforce/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CloudVoiceActionDialog } from '../CloudVoiceActionDialog';

const PAUSED_ACTION = 'Close the unsaved document.';

function approval(overrides: Partial<ToolApprovalRequest> = {}): ToolApprovalRequest {
  return {
    requestId: 'req-9',
    callId: 'session-9',
    tool: 'computer_use_hotkey',
    actionClass: 'execute',
    arguments: { key: 'f4', modifiers: ['alt'] },
    reason: 'user_requires_approval',
    riskLevel: 'high',
    reversible: false,
    unattended: false,
    rememberable: true,
    ...overrides,
  };
}

function renderPaused(
  overrides: {
    approval?: ToolApprovalRequest | null;
    isPaused?: boolean;
    isResolvingConfirmation?: boolean;
    onApproveStep?: (rememberForSession: boolean) => void;
    onDenyStep?: () => void;
  } = {},
) {
  const onApproveStep = overrides.onApproveStep ?? vi.fn();
  const onDenyStep = overrides.onDenyStep ?? vi.fn();

  render(
    <CloudVoiceActionDialog
      action={PAUSED_ACTION}
      approval={overrides.approval === undefined ? approval() : overrides.approval}
      isPaused={overrides.isPaused ?? true}
      isResolvingConfirmation={overrides.isResolvingConfirmation ?? false}
      error={null}
      isExecuting={true}
      isStopping={false}
      isRecovery={false}
      requiresComputerUseConsent={false}
      onApprove={vi.fn()}
      onUseAsText={vi.fn()}
      onCancel={vi.fn()}
      onApproveStep={onApproveStep}
      onDenyStep={onDenyStep}
    />,
  );

  return { onApproveStep, onDenyStep };
}

describe('CloudVoiceActionDialog paused step', () => {
  afterEach(cleanup);

  it('asks about the paused step with the harness verdict and both answers', () => {
    renderPaused();

    expect(screen.getByRole('dialog', { name: 'Confirm this step' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('computer_use_hotkey');
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Deny' })).toBeEnabled();
  });

  it('replaces the whole-action controls so one decision has one pair of answers', () => {
    renderPaused();

    expect(screen.queryByRole('button', { name: 'Run this action' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Use as text' })).not.toBeInTheDocument();
  });

  it('answers with no standing grant unless the user asks for one', () => {
    const { onApproveStep } = renderPaused();

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    expect(onApproveStep).toHaveBeenCalledWith(false);
  });

  it('carries the session-scoped grant when the user ticks it', () => {
    const { onApproveStep } = renderPaused();

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    expect(onApproveStep).toHaveBeenCalledWith(true);
  });

  it('offers no standing grant for a tool that must ask every time', () => {
    const { onApproveStep } = renderPaused({ approval: approval({ rememberable: false }) });

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(onApproveStep).toHaveBeenCalledWith(false);
  });

  it('reports a denial as its own answer rather than a cancelled task', () => {
    const { onDenyStep } = renderPaused();

    fireEvent.click(screen.getByRole('button', { name: 'Deny' }));

    expect(onDenyStep).toHaveBeenCalledTimes(1);
  });

  it('stops accepting a second answer while the first is in flight', () => {
    renderPaused({ isResolvingConfirmation: true });

    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Deny' })).toBeDisabled();
  });

  it('stays on screen for a pause that arrived with no action text of its own', () => {
    render(
      <CloudVoiceActionDialog
        action={null}
        approval={approval()}
        isPaused
        error={null}
        isExecuting={true}
        isStopping={false}
        isRecovery={false}
        requiresComputerUseConsent={false}
        onApprove={vi.fn()}
        onUseAsText={vi.fn()}
        onCancel={vi.fn()}
        onApproveStep={vi.fn()}
        onDenyStep={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Confirm this step' })).toBeInTheDocument();
  });
});
