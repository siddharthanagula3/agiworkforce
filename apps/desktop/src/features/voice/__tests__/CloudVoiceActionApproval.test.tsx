import { cleanup, render, screen } from '@testing-library/react';
import type { ToolApprovalRequest } from '@agiworkforce/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CloudVoiceActionDialog } from '../CloudVoiceActionDialog';

function approval(overrides: Partial<ToolApprovalRequest> = {}): ToolApprovalRequest {
  return {
    requestId: 'req-1',
    callId: 'call-1',
    tool: 'computer_use_click',
    actionClass: 'execute',
    arguments: { x: 10, y: 20 },
    reason: 'user_requires_approval',
    riskLevel: 'high',
    reversible: false,
    unattended: true,
    rememberable: false,
    ...overrides,
  };
}

function renderDialog(request: ToolApprovalRequest | null) {
  render(
    <CloudVoiceActionDialog
      action="Open Notes and create a launch checklist."
      approval={request}
      error={null}
      isExecuting={false}
      isStopping={false}
      isRecovery={false}
      requiresComputerUseConsent={false}
      onApprove={vi.fn()}
      onUseAsText={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
}

describe('CloudVoiceActionDialog approval shape', () => {
  afterEach(cleanup);

  it('reads the harness verdict from the shared approval request', () => {
    renderDialog(approval());

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('High risk');
    expect(status).toHaveTextContent('computer_use_click');
    expect(status).toHaveTextContent('This action needs your approval before it runs.');
  });

  it('names a hard block as one no approval can lift', () => {
    renderDialog(approval({ reason: 'policy_hard_block', tool: 'computer_use_type' }));

    expect(screen.getByRole('status')).toHaveTextContent(
      'This target is always blocked and no approval can unblock it.',
    );
  });

  it('stops offering to run an action the harness already refused', () => {
    renderDialog(approval({ reason: 'policy_hard_block' }));

    expect(screen.getByRole('button', { name: 'Run this action' })).toBeDisabled();
  });

  it('keeps the run control live while the harness is only asking', () => {
    renderDialog(approval({ reason: 'user_requires_approval' }));

    expect(screen.getByRole('button', { name: 'Run this action' })).toBeEnabled();
  });

  it('names an injected instruction as the reason for a refusal', () => {
    renderDialog(approval({ reason: 'lethal_trifecta', riskLevel: 'medium' }));

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Medium risk');
    expect(status).toHaveTextContent('Content on screen tried to steer this action');
  });

  it('shows no verdict panel until the harness has produced one', () => {
    renderDialog(null);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Review voice action' })).toBeInTheDocument();
  });
});
