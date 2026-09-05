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
        isStopping={false}
        isRecovery={false}
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
        isStopping={false}
        isRecovery={false}
        requiresComputerUseConsent={false}
        onApprove={vi.fn()}
        onUseAsText={onUseAsText}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Use as text' }));
    expect(onUseAsText).toHaveBeenCalledTimes(1);
  });

  it('keeps an enabled Stop affordance while the native action is executing', () => {
    const onCancel = vi.fn();
    render(
      <CloudVoiceActionDialog
        action="Open Notes and create a launch checklist."
        error={null}
        isExecuting={true}
        isStopping={false}
        isRecovery={false}
        requiresComputerUseConsent={false}
        onApprove={vi.fn()}
        onUseAsText={vi.fn()}
        onCancel={onCancel}
      />,
    );

    const stop = screen.getByRole('button', { name: 'Stop' });
    expect(stop).toBeEnabled();
    fireEvent.click(stop);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('shows an honest disabled stopping state while native Stop is pending', () => {
    render(
      <CloudVoiceActionDialog
        action="Open Notes and create a launch checklist."
        error={null}
        isExecuting={true}
        isStopping={true}
        isRecovery={false}
        requiresComputerUseConsent={false}
        onApprove={vi.fn()}
        onUseAsText={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Stopping…' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Waiting for desktop control to stop…' }),
    ).toBeDisabled();
  });

  it('uses account-safe shutdown copy instead of an approval ceremony during recovery', () => {
    render(
      <CloudVoiceActionDialog
        action="A previous desktop-control action still needs to be confirmed stopped."
        error="Native desktop control did not acknowledge cancellation."
        isExecuting={true}
        isStopping={false}
        isRecovery={true}
        requiresComputerUseConsent={false}
        onApprove={vi.fn()}
        onUseAsText={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('dialog', { name: 'Stop previous desktop action' }),
    ).toBeInTheDocument();
    const retryStop = screen.getByRole('button', { name: 'Retry Stop' });
    expect(retryStop).toBeEnabled();
    expect(retryStop).toHaveFocus();
    expect(
      screen.getByRole('button', { name: 'Retry stopping previous desktop action' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Use as text' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Nothing runs until you approve/)).not.toBeInTheDocument();
    expect(
      screen.getByText(/does not reveal the previous account's instruction/),
    ).toBeInTheDocument();
  });

  it('renders the error banner from the shared destructive token, not a fixed colour', () => {
    render(
      <CloudVoiceActionDialog
        action="Open Notes and create a launch checklist."
        error="Desktop control could not complete this action."
        isExecuting={false}
        isStopping={false}
        isRecovery={false}
        requiresComputerUseConsent={false}
        onApprove={vi.fn()}
        onUseAsText={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Desktop control could not complete this action.');
    expect(alert.className).toContain('var(--chat-destructive)');
    expect(alert.className).toContain('var(--chat-destructive-text)');
    expect(alert.className).not.toMatch(/red-\d/);
  });
});
