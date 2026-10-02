import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IME_PROCESSING_KEY_CODE } from '@agiworkforce/unified-chat/ime-composition';
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
import { useResponseRatingDraftStore } from '../../../stores/response-rating-draft-store';
import {
  RESPONSE_RATING_RATE_LIMITED,
  RESPONSE_RATING_REMOVE_FAILED,
  RESPONSE_RATING_SEND_FAILED,
  RESPONSE_RATING_SHARING_NOTE,
} from '../ResponseRatingDetails';

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
  useResponseRatingDraftStore.setState({ drafts: new Map() });
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

  it('says when too much feedback was sent recently, instead of asking for a retry', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });
    render(<MessageBubble message={assistantMessage()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Good response' }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith(RESPONSE_RATING_RATE_LIMITED));
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

  it('records a changed vote against the same answer, and keeps it when the form is closed', async () => {
    render(<MessageBubble message={assistantMessage()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Good response' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole('button', { name: 'Bad response' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await userEvent.click(screen.getByRole('button', { name: 'Close feedback form' }));

    const first = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    const second = JSON.parse(String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body));
    expect(first.metadata).toMatchObject({ rating: 'up', message_id: 'msg-1' });
    expect(second.metadata).toMatchObject({ rating: 'down', message_id: 'msg-1' });
    expect(second.metadata).not.toHaveProperty('feedback_id');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'Bad response' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('removes the stored rating when the same verdict is clicked again', async () => {
    render(<MessageBubble message={assistantMessage()} />);

    const down = screen.getByRole('button', { name: 'Bad response' });
    await userEvent.click(down);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await userEvent.click(down);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('/api/feedback?message_id=msg-1');
    expect(init.method).toBe('DELETE');
    expect(init.headers).toMatchObject({ 'x-csrf-token': 'test-token' });
    expect(down).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('form', { name: 'Tell us more' })).toBeNull();
  });

  it('removes a rating given before the page was reloaded', async () => {
    const onReact = vi.fn();
    render(
      <MessageBubble
        message={{ ...assistantMessage(), metadata: { reaction: 'thumbsDown' as const } }}
        onReact={onReact}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Bad response' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/feedback?message_id=msg-1');
    expect(init.method).toBe('DELETE');
    expect(onReact).toHaveBeenCalledWith('msg-1', null);
  });

  it('sends a removal only after the vote it takes back', async () => {
    const vote = pendingResponse();
    render(<MessageBubble message={assistantMessage()} />);

    const up = screen.getByRole('button', { name: 'Good response' });
    await userEvent.click(up);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await userEvent.click(up);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vote.settle(true);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[1].method).toBe('DELETE');
  });

  it('puts the rating back and says so when it could not be removed', async () => {
    const onReact = vi.fn();
    render(<MessageBubble message={assistantMessage()} onReact={onReact} />);

    const up = screen.getByRole('button', { name: 'Good response' });
    await userEvent.click(up);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    await userEvent.click(up);

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith(RESPONSE_RATING_REMOVE_FAILED),
    );
    expect(up).toHaveAttribute('aria-pressed', 'true');
    expect(onReact.mock.calls).toEqual([
      ['msg-1', 'up'],
      ['msg-1', null],
      ['msg-1', 'up'],
    ]);
  });

  it('takes a vote the server refused back off the saved reaction', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    const onReact = vi.fn();
    render(<MessageBubble message={assistantMessage()} onReact={onReact} />);

    await userEvent.click(screen.getByRole('button', { name: 'Good response' }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    expect(onReact.mock.calls).toEqual([
      ['msg-1', 'up'],
      ['msg-1', null],
    ]);
  });
});

interface RatingBody {
  subject: string;
  message: string;
  metadata: {
    rating: string;
    message_id: string;
    reason?: string;
    comment?: string;
  };
}

function sentBody(call: number): RatingBody {
  const [, init] = fetchMock.mock.calls[call] as [string, RequestInit];
  return JSON.parse(String(init.body)) as RatingBody;
}

// jsdom keeps focus on a button that becomes disabled (and ignores blur() on it);
// browsers apply the HTML focus fixup rule and move focus to the body, which is
// what lost the user's place. A removed anchor puts jsdom in the same state.
function applyFocusFixupRule(): MutationObserver {
  const observer = new MutationObserver(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLButtonElement) || !active.disabled) return;
    const anchor = document.createElement('span');
    anchor.tabIndex = -1;
    document.body.append(anchor);
    anchor.focus();
    anchor.remove();
  });
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ['disabled'],
    subtree: true,
  });
  return observer;
}

function pendingResponse(): { settle: (ok: boolean) => void } {
  let settle!: (ok: boolean) => void;
  fetchMock.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        settle = (ok) => resolve({ ok, status: ok ? 200 : 500, json: async () => ({}) });
      }),
  );
  return {
    settle: (ok) => settle(ok),
  };
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
    expect(sentBody(0).metadata).toMatchObject({ rating: 'down', message_id: 'msg-1' });
    expect(sentBody(1).metadata).toMatchObject({
      rating: 'down',
      message_id: 'msg-1',
      reason: 'inaccurate',
      comment: 'The date is a year off.',
    });
    await waitFor(() => expect(screen.queryByRole('form', { name: 'Tell us more' })).toBeNull());
    expect(toastMock.success).toHaveBeenCalled();
  });

  it('keeps the vote when its details are stored after the bare vote failed', async () => {
    const vote = pendingResponse();
    const onReact = vi.fn();
    render(<MessageBubble message={assistantMessage()} onReact={onReact} />);

    await userEvent.click(screen.getByRole('button', { name: 'Bad response' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const form = screen.getByRole('form', { name: 'Tell us more' });
    await userEvent.click(within(form).getByRole('button', { name: 'Other' }));
    await userEvent.click(within(form).getByRole('button', { name: 'Submit' }));
    vote.settle(false);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('form', { name: 'Tell us more' })).toBeNull());
    expect(screen.getByRole('button', { name: 'Bad response' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(onReact.mock.calls).toEqual([['msg-1', 'down']]);
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it('takes the vote back, keeping what was written, when the vote and its details are both refused', async () => {
    const vote = pendingResponse();
    const details = pendingResponse();
    const onReact = vi.fn();
    render(<MessageBubble message={assistantMessage()} onReact={onReact} />);

    const down = screen.getByRole('button', { name: 'Bad response' });
    await userEvent.click(down);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const form = screen.getByRole('form', { name: 'Tell us more' });
    await userEvent.click(within(form).getByRole('button', { name: 'Other' }));
    await userEvent.click(within(form).getByRole('button', { name: 'Submit' }));
    vote.settle(false);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    details.settle(false);

    expect(await within(form).findByRole('alert')).toHaveTextContent(RESPONSE_RATING_SEND_FAILED);
    expect(within(form).getByRole('button', { name: 'Other' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(down).toHaveAttribute('aria-pressed', 'false');
    expect(onReact.mock.calls).toEqual([
      ['msg-1', 'down'],
      ['msg-1', null],
    ]);
    expect(toastMock.error).not.toHaveBeenCalled();

    await userEvent.click(within(form).getByRole('button', { name: 'Close feedback form' }));

    expect(down).toHaveAttribute('aria-pressed', 'false');
  });

  it('keeps a rating off when it was removed while its details were sending', async () => {
    const onReact = vi.fn();
    render(<MessageBubble message={assistantMessage()} onReact={onReact} />);

    const down = screen.getByRole('button', { name: 'Bad response' });
    await userEvent.click(down);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const form = screen.getByRole('form', { name: 'Tell us more' });
    await userEvent.click(within(form).getByRole('button', { name: 'Other' }));
    const details = pendingResponse();
    await userEvent.click(within(form).getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await userEvent.click(down);
    details.settle(true);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    await new Promise((resolve) => setTimeout(resolve, 50));
    const [url, init] = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(init.method).toBe('DELETE');
    expect(url).toBe('/api/feedback?message_id=msg-1');
    expect(down).toHaveAttribute('aria-pressed', 'false');
    expect(onReact.mock.calls).toEqual([
      ['msg-1', 'down'],
      ['msg-1', null],
    ]);
  });

  it('puts back the rating its details stored when removing it fails', async () => {
    const vote = pendingResponse();
    const details = pendingResponse();
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    const onReact = vi.fn();
    render(<MessageBubble message={assistantMessage()} onReact={onReact} />);

    const down = screen.getByRole('button', { name: 'Bad response' });
    await userEvent.click(down);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const form = screen.getByRole('form', { name: 'Tell us more' });
    await userEvent.click(within(form).getByRole('button', { name: 'Other' }));
    await userEvent.click(within(form).getByRole('button', { name: 'Submit' }));
    await userEvent.click(down);
    vote.settle(false);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    details.settle(true);

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith(RESPONSE_RATING_REMOVE_FAILED),
    );
    expect((fetchMock.mock.calls[2] as [string, RequestInit])[1].method).toBe('DELETE');
    expect(down).toHaveAttribute('aria-pressed', 'true');
    expect(onReact.mock.calls).toEqual([
      ['msg-1', 'down'],
      ['msg-1', null],
      ['msg-1', 'down'],
    ]);
  });

  it('sends a vote and its details in the order they were given', async () => {
    const vote = pendingResponse();
    render(<MessageBubble message={assistantMessage()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Bad response' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const form = screen.getByRole('form', { name: 'Tell us more' });
    await userEvent.click(within(form).getByRole('button', { name: 'Incomplete response' }));
    await userEvent.click(within(form).getByRole('button', { name: 'Submit' }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vote.settle(true);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(sentBody(1).metadata).toMatchObject({ rating: 'down', reason: 'incomplete' });
  });

  it('keeps an unsent reason and comment when the answer scrolls out of view and back', async () => {
    const onReact = vi.fn();
    const { unmount } = render(<MessageBubble message={assistantMessage()} onReact={onReact} />);
    await userEvent.click(screen.getByRole('button', { name: 'Bad response' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const form = screen.getByRole('form', { name: 'Tell us more' });
    await userEvent.click(within(form).getByRole('button', { name: 'Incomplete response' }));
    await userEvent.type(
      within(form).getByRole('textbox', { name: 'Details (optional)' }),
      'It stopped at step 3.',
    );

    unmount();
    render(
      <MessageBubble
        message={{ ...assistantMessage(), metadata: { reaction: 'thumbsDown' as const } }}
        onReact={onReact}
      />,
    );

    const restored = screen.getByRole('form', { name: 'Tell us more' });
    expect(within(restored).getByRole('button', { name: 'Incomplete response' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(restored).getByRole('textbox', { name: 'Details (optional)' })).toHaveValue(
      'It stopped at step 3.',
    );
    expect(restored).not.toContainElement(document.activeElement as HTMLElement);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not bring back a form that was closed', async () => {
    const { unmount } = render(<MessageBubble message={assistantMessage()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Bad response' }));
    await userEvent.type(
      within(screen.getByRole('form', { name: 'Tell us more' })).getByRole('textbox', {
        name: 'Details (optional)',
      }),
      'Never mind.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Close feedback form' }));

    unmount();
    render(<MessageBubble message={assistantMessage()} />);

    expect(screen.queryByRole('form', { name: 'Tell us more' })).toBeNull();
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

  it.each([
    ['Chrome marks the key as composing', { isComposing: true }],
    ['Safari sends the IME key code', { keyCode: IME_PROCESSING_KEY_CODE }],
  ])(
    'keeps the form and what was written when Escape only cancels an IME conversion (%s)',
    async (_, composition) => {
      render(<MessageBubble message={assistantMessage()} />);

      await userEvent.click(screen.getByRole('button', { name: 'Bad response' }));
      const form = screen.getByRole('form', { name: 'Tell us more' });
      await userEvent.click(within(form).getByRole('button', { name: 'Incomplete response' }));
      const details = within(form).getByRole('textbox', { name: 'Details (optional)' });
      await userEvent.type(details, 'The total is wrong');

      fireEvent.keyDown(details, { key: 'Escape', ...composition });

      expect(screen.getByRole('form', { name: 'Tell us more' })).toBe(form);
      expect(useResponseRatingDraftStore.getState().drafts.get('msg-1')).toEqual({
        reason: 'incomplete',
        comment: 'The total is wrong',
      });
    },
  );

  it('hands focus back to the thumbs-down button after the details are sent', async () => {
    const focusFixup = applyFocusFixupRule();
    try {
      render(<MessageBubble message={assistantMessage()} />);
      await userEvent.click(screen.getByRole('button', { name: 'Bad response' }));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      const form = screen.getByRole('form', { name: 'Tell us more' });
      await userEvent.click(within(form).getByRole('button', { name: 'Other' }));
      const submit = within(form).getByRole('button', { name: 'Submit' });
      const details = pendingResponse();

      submit.focus();
      await userEvent.keyboard('{Enter}');
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

      expect(submit).toHaveFocus();
      expect(submit).toHaveAttribute('aria-disabled', 'true');
      details.settle(true);
      await waitFor(() => expect(screen.queryByRole('form', { name: 'Tell us more' })).toBeNull());
      expect(screen.getByRole('button', { name: 'Bad response' })).toHaveFocus();
    } finally {
      focusFixup.disconnect();
    }
  });

  it('keeps focus on Submit when the details could not be sent', async () => {
    const focusFixup = applyFocusFixupRule();
    try {
      render(<MessageBubble message={assistantMessage()} />);
      await userEvent.click(screen.getByRole('button', { name: 'Bad response' }));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      const form = screen.getByRole('form', { name: 'Tell us more' });
      await userEvent.click(within(form).getByRole('button', { name: 'Other' }));
      const submit = within(form).getByRole('button', { name: 'Submit' });
      const details = pendingResponse();

      submit.focus();
      await userEvent.keyboard('{Enter}');
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      details.settle(false);

      expect(await within(form).findByRole('alert')).toBeInTheDocument();
      expect(submit).toHaveFocus();
    } finally {
      focusFixup.disconnect();
    }
  });

  it('hands focus back to the thumbs-down button when the vote it opened with is refused', async () => {
    const vote = pendingResponse();
    render(<MessageBubble message={assistantMessage()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Bad response' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const form = screen.getByRole('form', { name: 'Tell us more' });
    expect(within(form).getByRole('button', { name: 'Not factually correct' })).toHaveFocus();

    vote.settle(false);

    await waitFor(() => expect(screen.queryByRole('form', { name: 'Tell us more' })).toBeNull());
    const down = screen.getByRole('button', { name: 'Bad response' });
    expect(down).toHaveFocus();
    expect(down).toHaveAttribute('aria-pressed', 'false');
    expect(toastMock.error).toHaveBeenCalledWith(RESPONSE_RATING_SEND_FAILED);
  });

  it('keeps a started reason and comment, and says why, when the vote they complete is refused', async () => {
    const vote = pendingResponse();
    const onReact = vi.fn();
    render(<MessageBubble message={assistantMessage()} onReact={onReact} />);

    const down = screen.getByRole('button', { name: 'Bad response' });
    await userEvent.click(down);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const form = screen.getByRole('form', { name: 'Tell us more' });
    await userEvent.click(within(form).getByRole('button', { name: 'Incomplete response' }));
    const details = within(form).getByRole('textbox', { name: 'Details (optional)' });
    await userEvent.type(details, 'It stopped at step 3.');

    vote.settle(false);

    expect(await within(form).findByRole('alert')).toHaveTextContent(RESPONSE_RATING_SEND_FAILED);
    expect(details).toHaveValue('It stopped at step 3.');
    expect(details).toHaveFocus();
    expect(down).toHaveAttribute('aria-pressed', 'false');
    expect(toastMock.error).not.toHaveBeenCalled();

    await userEvent.click(within(form).getByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(screen.queryByRole('form', { name: 'Tell us more' })).toBeNull());
    expect(sentBody(1).metadata).toMatchObject({
      rating: 'down',
      reason: 'incomplete',
      comment: 'It stopped at step 3.',
    });
    expect(down).toHaveAttribute('aria-pressed', 'true');
    expect(down).toHaveFocus();
    expect(onReact.mock.calls).toEqual([
      ['msg-1', 'down'],
      ['msg-1', null],
      ['msg-1', 'down'],
    ]);
  });

  it('sends a refused vote again from the thumbs-down button, keeping what was written', async () => {
    const vote = pendingResponse();
    render(<MessageBubble message={assistantMessage()} />);

    const down = screen.getByRole('button', { name: 'Bad response' });
    await userEvent.click(down);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const form = screen.getByRole('form', { name: 'Tell us more' });
    const details = within(form).getByRole('textbox', { name: 'Details (optional)' });
    await userEvent.type(details, 'Too short.');
    vote.settle(false);
    await within(form).findByRole('alert');

    await userEvent.click(down);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(sentBody(1).metadata).toMatchObject({ rating: 'down', message_id: 'msg-1' });
    expect(sentBody(1).metadata).not.toHaveProperty('comment');
    expect(within(form).queryByRole('alert')).toBeNull();
    expect(details).toHaveValue('Too short.');
    await waitFor(() => expect(down).toHaveAttribute('aria-pressed', 'true'));
  });

  it('sets the comment box in 16px type on touch screens, so iOS does not zoom into it', async () => {
    render(<MessageBubble message={assistantMessage()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Bad response' }));

    expect(screen.getByRole('textbox', { name: 'Details (optional)' })).toHaveClass(
      'pointer-coarse:text-base',
    );
  });

  it('keeps the close button a 44px target on a touch screen at any width', async () => {
    render(<MessageBubble message={assistantMessage()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Bad response' }));

    expect(screen.getByRole('button', { name: 'Close feedback form' })).toHaveClass(
      'pointer-coarse:h-11',
      'pointer-coarse:w-11',
    );
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
    expect(screen.getByRole('button', { name: 'Bad response' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('says when the details hit the hourly feedback limit', async () => {
    render(<MessageBubble message={assistantMessage()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Bad response' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) });
    const form = screen.getByRole('form', { name: 'Tell us more' });
    await userEvent.click(within(form).getByRole('button', { name: 'Other' }));
    await userEvent.click(within(form).getByRole('button', { name: 'Submit' }));

    expect(await within(form).findByRole('alert')).toHaveTextContent(RESPONSE_RATING_RATE_LIMITED);
  });
});
