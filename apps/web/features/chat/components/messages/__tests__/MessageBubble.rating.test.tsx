import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
type ScanModule0 = typeof import('@agiworkforce/unified-chat');

vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal()),
  addCsrfHeaders: vi.fn(async (base?: Record<string, string>) => ({
    ...base,
    'x-csrf-token': 'test-token',
  })),
}));

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

vi.mock('@agiworkforce/unified-chat', async (importOriginal) => {
  const actual = await importOriginal<ScanModule0>();
  return {
    ...actual,
    MarkdownRenderer: ({ content }: { content: string }) => <div>{content}</div>,
  };
});

import { MessageBubble } from '../MessageBubble';
import { RESPONSE_RATING_SHARING_NOTE } from '../ResponseRatingDetails';

const fetchMock = vi.fn();

function assistantMessage() {
  return {
    id: 'msg-1',
    role: 'assistant' as const,
    content: 'Here is an answer.',
    timestamp: new Date('2026-08-21T00:00:00.000Z'),
    sessionId: 'conv-1',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
  vi.stubGlobal('fetch', fetchMock);
});

// Every comparable product puts a rating on each assistant answer. This app had
// none: the only routes out were a composer-level dialog and a refusal appeal,
// neither of which says an ordinary answer was good or bad.
describe('rating an assistant response', () => {
  it('offers both verdicts on an assistant message', () => {
    render(<MessageBubble message={assistantMessage()} />);

    expect(screen.getByRole('button', { name: 'Good response' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bad response' })).toBeInTheDocument();
  });

  // A second, independently built pair of thumbs used to render beside this one
  // whenever the host wired `onReact`, so an answer showed four thumb icons and
  // recorded two unrelated verdicts.
  it('offers exactly one verdict pair when the host also persists a reaction', () => {
    render(<MessageBubble message={assistantMessage()} onReact={vi.fn()} />);

    expect(screen.getAllByRole('button', { name: 'Good response' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Bad response' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Rate as good response' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Rate as poor response' })).toBeNull();
  });

  it('reports the verdict to the host reaction sink as well as the feedback sink', async () => {
    const onReact = vi.fn();
    render(<MessageBubble message={assistantMessage()} onReact={onReact} />);

    await userEvent.click(screen.getByRole('button', { name: 'Good response' }));

    expect(onReact).toHaveBeenCalledWith('msg-1', 'up');
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });

  it('does not offer to rate the user their own message', () => {
    render(<MessageBubble message={{ ...assistantMessage(), role: 'user' }} />);

    expect(screen.queryByRole('button', { name: 'Good response' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Bad response' })).toBeNull();
  });

  it('sends the verdict attributed to the message it rates', async () => {
    render(<MessageBubble message={assistantMessage()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Bad response' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/feedback');
    const body = JSON.parse(String(init.body)) as {
      metadata: { rating: string; message_id: string; feedback_context: string };
    };
    expect(body.metadata.feedback_context).toBe('response_rating');
    expect(body.metadata.rating).toBe('down');
    expect(body.metadata.message_id).toBe('msg-1');
    expect(init.headers).toMatchObject({ 'x-csrf-token': 'test-token' });
  });

  it('shows the recorded verdict to assistive technology, not just by colour', async () => {
    render(<MessageBubble message={assistantMessage()} />);

    const up = screen.getByRole('button', { name: 'Good response' });
    expect(up).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(up);

    await waitFor(() => expect(up).toHaveAttribute('aria-pressed', 'true'));
  });

  it('does not keep the button lit when the server never took the vote', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    render(<MessageBubble message={assistantMessage()} />);

    const up = screen.getByRole('button', { name: 'Good response' });
    await userEvent.click(up);

    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    expect(up).toHaveAttribute('aria-pressed', 'false');
  });

  it('toggles the rating off when the same verdict is clicked again', async () => {
    const onReact = vi.fn();
    render(<MessageBubble message={assistantMessage()} onReact={onReact} />);

    const up = screen.getByRole('button', { name: 'Good response' });
    await userEvent.click(up);
    await waitFor(() => expect(up).toHaveAttribute('aria-pressed', 'true'));
    expect(onReact).toHaveBeenNthCalledWith(1, 'msg-1', 'up');

    await userEvent.click(up);
    await waitFor(() => expect(up).toHaveAttribute('aria-pressed', 'false'));
    expect(onReact).toHaveBeenNthCalledWith(2, 'msg-1', null);
  });

  it('does not send a second vote for the same message', async () => {
    render(<MessageBubble message={assistantMessage()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Good response' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole('button', { name: 'Bad response' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

interface RatingBody {
  subject: string;
  message: string;
  metadata: {
    rating: string;
    message_id: string;
    feedback_id: string;
    reason?: string;
    comment?: string;
  };
}

function sentBody(call: number): RatingBody {
  const [, init] = fetchMock.mock.calls[call] as [string, RequestInit];
  return JSON.parse(String(init.body)) as RatingBody;
}

describe('telling us why an answer was bad', () => {
  it('does not send the answer text with a rating', async () => {
    render(<MessageBubble message={assistantMessage()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Good response' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.stringify(sentBody(0))).not.toContain('Here is an answer.');
  });

  it('asks for an optional reason and comment after a thumbs-down, not after a thumbs-up', async () => {
    render(<MessageBubble message={assistantMessage()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Good response' }));
    expect(screen.queryByRole('form', { name: 'Tell us more' })).toBeNull();

    render(<MessageBubble message={{ ...assistantMessage(), id: 'msg-2' }} />);
    await userEvent.click(screen.getAllByRole('button', { name: 'Bad response' })[1]!);

    const form = screen.getByRole('form', { name: 'Tell us more' });
    expect(within(form).getByRole('button', { name: 'Not factually correct' })).toBeVisible();
    expect(within(form).getByRole('textbox', { name: 'Details (optional)' })).toBeVisible();
    expect(within(form).getByText(RESPONSE_RATING_SHARING_NOTE)).toBeVisible();
  });

  it('names everything the rating is stored with, in the note under the form', async () => {
    render(<MessageBubble message={assistantMessage()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Bad response' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const sent = sentBody(0).metadata as unknown as Record<string, unknown>;
    const note = within(screen.getByRole('form', { name: 'Tell us more' })).getByText(
      RESPONSE_RATING_SHARING_NOTE,
    ).textContent;
    expect(sent['conversation_id']).toBe('conv-1');
    expect(sent['message_id']).toBe('msg-1');
    expect(sent['user_agent']).toEqual(expect.any(String));
    expect(note).toContain('your account');
    expect(note).toContain('this chat and response IDs');
    expect(note).toContain('your browser and device details');
    expect(note).toContain('The response text is not attached.');
  });

  it('sends the reason and the comment with the rating it completes', async () => {
    render(<MessageBubble message={assistantMessage()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Bad response' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const form = screen.getByRole('form', { name: 'Tell us more' });
    await userEvent.click(within(form).getByRole('button', { name: 'Not factually correct' }));
    await userEvent.type(
      within(form).getByRole('textbox', { name: 'Details (optional)' }),
      'The date is a year off.',
    );
    await userEvent.click(within(form).getByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const vote = sentBody(0);
    const details = sentBody(1);
    expect(details.metadata).toMatchObject({
      rating: 'down',
      message_id: 'msg-1',
      reason: 'inaccurate',
      comment: 'The date is a year off.',
      feedback_id: vote.metadata.feedback_id,
    });
    await waitFor(() => expect(screen.queryByRole('form', { name: 'Tell us more' })).toBeNull());
    expect(toastMock.success).toHaveBeenCalled();
  });

  it('keeps the rating when the form is closed without a reason', async () => {
    render(<MessageBubble message={assistantMessage()} />);

    const down = screen.getByRole('button', { name: 'Bad response' });
    await userEvent.click(down);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole('button', { name: 'Close feedback form' }));

    expect(screen.queryByRole('form', { name: 'Tell us more' })).toBeNull();
    expect(down).toHaveAttribute('aria-pressed', 'true');
    expect(sentBody(0).metadata.rating).toBe('down');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape and hands focus back to the thumbs-down button', async () => {
    render(<MessageBubble message={assistantMessage()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Bad response' }));
    const form = screen.getByRole('form', { name: 'Tell us more' });
    expect(within(form).getByRole('button', { name: 'Not factually correct' })).toHaveFocus();

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('form', { name: 'Tell us more' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Bad response' })).toHaveFocus();
  });

  it('waits for a reason or a comment before it can be sent', async () => {
    render(<MessageBubble message={assistantMessage()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Bad response' }));

    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
  });

  it('keeps the form and says so when the details could not be sent', async () => {
    render(<MessageBubble message={assistantMessage()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Bad response' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    const form = screen.getByRole('form', { name: 'Tell us more' });
    await userEvent.click(within(form).getByRole('button', { name: 'Other' }));
    await userEvent.click(within(form).getByRole('button', { name: 'Submit' }));

    expect(await within(form).findByRole('alert')).toHaveTextContent(
      'Could not send that. Please try again.',
    );
    expect(screen.getByRole('form', { name: 'Tell us more' })).toBeInTheDocument();
  });
});
