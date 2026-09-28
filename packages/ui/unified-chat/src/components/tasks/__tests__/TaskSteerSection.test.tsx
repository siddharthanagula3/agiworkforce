import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CloudAgentRun, CloudAgentRunSteer } from '@agiworkforce/cloud-contracts';
import { TaskSteerSection } from '../TaskSteerSection';

afterEach(cleanup);

const steer: CloudAgentRunSteer = {
  id: '0190a000-0000-7000-8000-0000000000bb',
  text: 'Also cover the third quarter',
  queuedAt: '2026-08-02T12:03:00.000Z',
};

function runIn(state: CloudAgentRun['state']): CloudAgentRun {
  return {
    id: '0190a000-0000-7000-8000-0000000000dd',
    userId: 'user-1',
    requestId: 'request-1',
    conversationId: 'conversation-1',
    originSurface: 'web',
    workMode: 'agiwork',
    state,
    provider: 'openai',
    model: 'fixture-task-model',
    lastEventSequence: 0,
    cancellationRequestedAt: null,
    completedAt: null,
    createdAt: '2026-08-02T12:00:00.000Z',
    updatedAt: '2026-08-02T12:05:00.000Z',
    pendingSteers: [steer],
  };
}

describe('TaskSteerSection', () => {
  it('shows a message a working task has not read yet as queued, with nothing to resend', () => {
    render(<TaskSteerSection run={runIn('running')} onSteer={vi.fn()} onSendAsMessage={vi.fn()} />);

    expect(screen.getByText('Queued. The agent reads it at its next step.')).toBeTruthy();
    expect(screen.queryByTestId('task-steer-send-new')).toBeNull();
  });

  it('marks a message a finished task never read and sends it as a new message on click', async () => {
    const onSendAsMessage = vi.fn(async () => undefined);
    render(<TaskSteerSection run={runIn('ready_for_review')} onSendAsMessage={onSendAsMessage} />);

    expect(screen.getByText('Not read before the task finished')).toBeTruthy();
    expect(onSendAsMessage).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('task-steer-send-new'));

    await waitFor(() => expect(onSendAsMessage).toHaveBeenCalledWith(steer));
  });

  it('offers no resend when the host cannot send a new message', () => {
    render(<TaskSteerSection run={runIn('failed')} />);

    expect(screen.getByText('Not read before the task finished')).toBeTruthy();
    expect(screen.queryByTestId('task-steer-send-new')).toBeNull();
  });

  it('says when the resend did not go through', async () => {
    const onSendAsMessage = vi.fn(async () => {
      throw new Error('network down');
    });
    render(<TaskSteerSection run={runIn('completed')} onSendAsMessage={onSendAsMessage} />);

    fireEvent.click(screen.getByTestId('task-steer-send-new'));

    expect(await screen.findByRole('alert')).toBeTruthy();
  });
});
