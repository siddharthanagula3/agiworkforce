import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { FollowUpQueue } from '../FollowUpQueue';
import { useFollowUpStore } from '../../queue/followUps';

function renderQueue() {
  return render(
    <FollowUpQueue
      conversationId="conv-1"
      isStreaming={false}
      onEdit={vi.fn()}
      onRemove={vi.fn()}
      onSendNow={vi.fn()}
    />,
  );
}

describe('FollowUpQueue', () => {
  beforeEach(() => {
    useFollowUpStore.setState({ byConversation: {}, held: {} });
  });
  afterEach(cleanup);

  it('says a follow-up was not sent, and why, and still offers to send or edit it', () => {
    useFollowUpStore.getState().add('conv-1', {
      id: 'follow-1',
      content: 'ship it',
      state: 'queued',
      args: ['ship it'],
      heldReason: 'Select a model available for this conversation before sending.',
    });

    renderQueue();

    expect(screen.getByText('Not sent')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('Select a model available');
    expect(screen.getByText('ship it')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send now' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
  });

  it('shows a waiting follow-up as queued, with no reason line', () => {
    useFollowUpStore.getState().add('conv-1', {
      id: 'follow-1',
      content: 'ship it',
      state: 'queued',
      args: ['ship it'],
    });

    renderQueue();

    expect(screen.getByText('Queued')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
  });
});
