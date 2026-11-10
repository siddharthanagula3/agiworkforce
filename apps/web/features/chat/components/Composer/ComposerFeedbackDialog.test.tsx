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

  describe('a screenshot attached to the report', () => {
    const attachAndSend = async (receipt: Record<string, unknown>) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(JSON.stringify(receipt), { status: 200 })),
      );
      const { container } = render(<ComposerFeedbackDialog />);
      fireEvent.click(screen.getByRole('button', { name: 'Feedback' }));
      const input = container.ownerDocument.querySelector('input[type="file"]') as HTMLInputElement;
      fireEvent.change(input, {
        target: { files: [new File(['png'], 'shot.png', { type: 'image/png' })] },
      });
      await screen.findByAltText('Screenshot attached to this feedback');
      fireEvent.change(screen.getByLabelText('Details'), { target: { value: 'Layout broke.' } });
      fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));
      await waitFor(() => expect(screen.getByText(/your feedback was sent/i)).toBeDefined());
    };

    it('says so when the server could not store the screenshot', async () => {
      await attachAndSend({ success: true, screenshot_stored: false });

      expect(
        screen.getByText(/screenshot could not be stored and was not attached/i),
      ).toBeDefined();
    });

    it('stays quiet when the screenshot was stored', async () => {
      await attachAndSend({ success: true, screenshot_stored: true });

      expect(screen.queryByText(/could not be stored/i)).toBeNull();
    });
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

  it('freezes the draft while the report is sending and releases it when sending fails', async () => {
    let settle!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            settle = resolve;
          }),
      ),
    );
    render(<ComposerFeedbackDialog />);

    fireEvent.click(screen.getByRole('button', { name: 'Feedback' }));
    fireEvent.change(screen.getByLabelText('Details'), { target: { value: 'First part' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText('Details')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Something is broken' })).toBeDisabled();

    settle(new Response(JSON.stringify({ error: 'Nope' }), { status: 500 }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Nope'));
    expect(screen.getByLabelText('Details')).toBeEnabled();
    expect(screen.getByLabelText('Details')).toHaveValue('First part');
  });

  it('keeps text typed after the sent snapshot when that report is accepted', async () => {
    let settle!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            settle = resolve;
          }),
      ),
    );
    render(<ComposerFeedbackDialog />);

    fireEvent.click(screen.getByRole('button', { name: 'Feedback' }));
    fireEvent.change(screen.getByLabelText('Details'), { target: { value: 'First part' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText('Details'), {
      target: { value: 'First part and more' },
    });
    settle(new Response(JSON.stringify({ success: true }), { status: 200 }));

    await waitFor(() => expect(screen.getByText(/your feedback was sent/i)).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    fireEvent.click(screen.getByRole('button', { name: 'Feedback' }));
    expect(screen.getByLabelText('Details')).toHaveValue('First part and more');
  });

  it('submits a refusal report with bounded identifiers and no conversation content', async () => {
    render(
      <ComposerFeedbackDialog
        variant="safety-appeal"
        conversationId="conversation-9"
        messageId="assistant-4"
        finishReason="content_filter"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Report issue' }));
    expect(screen.getByRole('heading', { name: 'Report an incorrect refusal' })).toBeDefined();
    expect(screen.queryByText('Feedback type')).toBeNull();

    fireEvent.change(screen.getByLabelText('Details'), {
      target: { value: 'This was a benign request about defensive security.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit report' }));

    await waitFor(() => expect(screen.getByText(/your report was recorded/i)).toBeDefined());

    const [, request] = vi.mocked(fetch).mock.calls[0] ?? [];
    const body = JSON.parse(String(request?.body)) as {
      subject: string;
      message: string;
      metadata: Record<string, string>;
    };
    expect(body.subject).toContain('Incorrect safety refusal');
    expect(body.metadata).toMatchObject({
      source: 'web',
      feedback_context: 'safety_refusal',
      conversation_id: 'conversation-9',
      message_id: 'assistant-4',
      finish_reason: 'content_filter',
    });
    expect(body.metadata).not.toHaveProperty('prompt');
    expect(body.metadata).not.toHaveProperty('response');
    expect(body.metadata).not.toHaveProperty('conversation_content');
  });
});
