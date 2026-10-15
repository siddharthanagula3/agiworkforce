import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useComputerUseStore } from '../../../stores/computerUseStore';
import { CloudVoiceActionDialog } from '../CloudVoiceActionDialog';
import { ComputerUseControlStatus } from '../ComputerUseControlStatus';

const stopComputerUse = vi.fn().mockResolvedValue(undefined);
const handBack = vi.fn().mockResolvedValue(undefined);

describe('ComputerUseControlStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useComputerUseStore.setState({
      isExecutingOpa: false,
      pausedConfirmation: null,
      takenOver: false,
      stopComputerUse,
      handBack,
    });
  });

  afterEach(cleanup);

  it('shows nothing while desktop control is idle and the agent holds the screen', () => {
    const { container } = render(<ComputerUseControlStatus />);
    expect(container).toBeEmptyDOMElement();
  });

  it('offers Stop for as long as desktop control is running', () => {
    useComputerUseStore.setState({ isExecutingOpa: true });
    render(<ComputerUseControlStatus />);

    expect(screen.getByRole('status')).toHaveTextContent('AGI is controlling this computer');
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(stopComputerUse).toHaveBeenCalledTimes(1);
  });

  it('keeps saying who holds the screen after a stop, until it is handed back', () => {
    useComputerUseStore.setState({ takenOver: true });
    render(<ComputerUseControlStatus />);

    expect(screen.getByRole('status')).toHaveTextContent('Screen control is yours');
    fireEvent.click(screen.getByRole('button', { name: 'Hand back' }));
    expect(handBack).toHaveBeenCalledTimes(1);
  });

  it('is what the closed action dialog leaves on screen', () => {
    useComputerUseStore.setState({ takenOver: true });
    render(
      <CloudVoiceActionDialog
        action={null}
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

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hand back' })).toBeInTheDocument();
  });

  it('hands the screen back before it runs a new action the user approved', async () => {
    useComputerUseStore.setState({ takenOver: true });
    handBack.mockImplementationOnce(async () => {
      useComputerUseStore.setState({ takenOver: false });
    });
    const onApprove = vi.fn();
    render(
      <CloudVoiceActionDialog
        action="Open Notes."
        error={null}
        isExecuting={false}
        isStopping={false}
        isRecovery={false}
        requiresComputerUseConsent={false}
        onApprove={onApprove}
        onUseAsText={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Hand back control and run' }));
    await vi.waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1));
    expect(handBack).toHaveBeenCalledTimes(1);
  });

  it('does not run the action when the screen could not be handed back', async () => {
    useComputerUseStore.setState({ takenOver: true });
    const onApprove = vi.fn();
    render(
      <CloudVoiceActionDialog
        action="Open Notes."
        error={null}
        isExecuting={false}
        isStopping={false}
        isRecovery={false}
        requiresComputerUseConsent={false}
        onApprove={onApprove}
        onUseAsText={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Hand back control and run' }));
    await vi.waitFor(() => expect(handBack).toHaveBeenCalledTimes(1));
    expect(onApprove).not.toHaveBeenCalled();
  });
});
