import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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
  const actual = await importOriginal<typeof import('@agiworkforce/unified-chat')>();
  return {
    ...actual,
    MarkdownRenderer: ({ content }: { content: string }) => <div>{content}</div>,
  };
});

import { MessageBubble } from '../MessageBubble';

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
