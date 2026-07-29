import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CloudVoiceActionDialog } from '../CloudVoiceActionDialog';

describe('CloudVoiceActionDialog', () => {
  afterEach(cleanup);

  it('does not run a classified desktop action until the user explicitly approves it', () => {
    const onApprove = vi.fn();
    render(
      <CloudVoiceActionDialog
        action="Open Notes and create a launch checklist."
        error={null}
        isExecuting={false}
        requiresComputerUseConsent={true}
        onApprove={onApprove}
        onUseAsText={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Review voice action' })).toBeInTheDocument();
    expect(onApprove).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Enable desktop control and run' }));
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it('allows a misclassified action to be returned to the composer as text', () => {
    const onUseAsText = vi.fn();
    render(
      <CloudVoiceActionDialog
        action="Draft a note about the launch."
        error={null}
        isExecuting={false}
        requiresComputerUseConsent={false}
        onApprove={vi.fn()}
        onUseAsText={onUseAsText}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Use as text' }));
    expect(onUseAsText).toHaveBeenCalledTimes(1);
  });
});
