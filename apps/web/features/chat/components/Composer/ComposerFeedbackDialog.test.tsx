import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ComposerFeedbackDialog } from './ComposerFeedbackDialog';

const feedbackMocks = vi.hoisted(() => ({
  getCsrfToken: vi.fn(async () => 'csrf-feedback'),
}));

vi.mock('@/lib/client/csrf', () => ({
  getCsrfToken: feedbackMocks.getCsrfToken,
}));

describe('ComposerFeedbackDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 })),
    );
  });

  it('submits real web feedback without attaching conversation content', async () => {
    render(<ComposerFeedbackDialog conversationId="conversation-7" />);

    fireEvent.click(screen.getByRole('button', { name: 'Feedback' }));
    fireEvent.click(screen.getByRole('button', { name: 'Something is broken' }));
    fireEvent.change(screen.getByLabelText('Details'), {
      target: { value: 'The artifact preview did not refresh.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));

    await waitFor(() => expect(screen.getByText(/your feedback was sent/i)).toBeDefined());
    expect(feedbackMocks.getCsrfToken).toHaveBeenCalledTimes(1);

    const [, request] = vi.mocked(fetch).mock.calls[0] ?? [];
    const body = JSON.parse(String(request?.body)) as {
      subject: string;
      message: string;
      metadata: Record<string, string>;
    };
    expect(body.subject).toContain('Something is broken');
    expect(body.message).toBe('The artifact preview did not refresh.');
    expect(body.metadata).toMatchObject({
      source: 'web',
      conversation_id: 'conversation-7',
    });
    expect(JSON.stringify(body)).not.toContain('prompt');
  });

  it('shows a retryable error when the server rejects feedback', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { message: 'Feedback is unavailable.' } }), {
            status: 503,
          }),
      ),
    );
    render(<ComposerFeedbackDialog />);

    fireEvent.click(screen.getByRole('button', { name: 'Feedback' }));
    fireEvent.change(screen.getByLabelText('Details'), { target: { value: 'Hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('unavailable'));
    expect(screen.getByRole('button', { name: 'Send feedback' })).not.toBeDisabled();
  });
});
