import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageBubble } from '../MessageBubble';
import type { ChatMessage } from '../../lib/types';

const reply: ChatMessage = {
  id: 'a1',
  role: 'assistant',
  content: 'The answer is 42.',
  model: 'model-a',
  createdAt: '2026-10-10T12:00:00.000Z',
};

const MODELS = [
  { id: 'model-a', name: 'Model A' },
  { id: 'model-b', name: 'Model B' },
];

describe('MessageBubble action slots', () => {
  it('shows no branch, read-aloud or model menu when the host supplies none', () => {
    render(<MessageBubble message={reply} onRetry={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Copy message' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Retry' }).getAttribute('aria-haspopup')).toBeNull();
    expect(screen.queryByRole('button', { name: /branch conversation/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /read message aloud/i })).toBeNull();
  });

  it('keeps the model menu hidden when the host can regenerate but offers no models', () => {
    render(
      <MessageBubble
        message={reply}
        onRetry={vi.fn()}
        actionSlots={{ onRegenerateWithModel: vi.fn(), regenerateModelOptions: [] }}
      />,
    );

    expect(screen.getByRole('button', { name: 'Retry' }).getAttribute('aria-haspopup')).toBeNull();
  });

  it('branches from this reply through the host handler', async () => {
    const onBranch = vi.fn();
    const user = userEvent.setup();
    render(<MessageBubble message={reply} actionSlots={{ onBranch }} />);

    await user.click(screen.getByRole('button', { name: 'Branch conversation from here' }));

    expect(onBranch).toHaveBeenCalledWith('a1');
  });

  it('disables branch while that branch is being created', () => {
    render(
      <MessageBubble
        message={reply}
        actionSlots={{ onBranch: vi.fn(), branchingMessageId: 'a1' }}
      />,
    );

    expect(
      (screen.getByRole('button', { name: 'Creating branch…' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('reads aloud and turns into Stop while this reply is being spoken', async () => {
    const onReadAloud = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<MessageBubble message={reply} actionSlots={{ onReadAloud }} />);

    await user.click(screen.getByRole('button', { name: 'Read message aloud' }));
    expect(onReadAloud).toHaveBeenCalledWith('a1', 'The answer is 42.');

    rerender(
      <MessageBubble message={reply} actionSlots={{ onReadAloud, readingAloudMessageId: 'a1' }} />,
    );
    expect(
      screen.getByRole('button', { name: 'Stop reading message' }).getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('regenerates with another model from the retry menu', async () => {
    const onRetry = vi.fn();
    const onRegenerateWithModel = vi.fn();
    const user = userEvent.setup();
    render(
      <MessageBubble
        message={reply}
        onRetry={onRetry}
        actionSlots={{ onRegenerateWithModel, regenerateModelOptions: MODELS }}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Model B' }));

    expect(onRegenerateWithModel).toHaveBeenCalledWith('a1', 'model-b');
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('offers no regenerate menu without a retry handler, even with models', () => {
    render(
      <MessageBubble
        message={reply}
        actionSlots={{ onRegenerateWithModel: vi.fn(), regenerateModelOptions: MODELS }}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('shows no thumbs or pager unless the host supplies them', () => {
    render(<MessageBubble message={reply} />);

    expect(screen.queryByRole('button', { name: 'Thumbs up' })).toBeNull();
    expect(screen.queryByTestId('variant-pager')).toBeNull();
  });

  it('reports a rating, and its withdrawal, to the host', async () => {
    const onFeedback = vi.fn();
    const user = userEvent.setup();
    render(<MessageBubble message={reply} actionSlots={{ onFeedback }} />);

    await user.click(screen.getByRole('button', { name: 'Thumbs up' }));
    await user.click(screen.getByRole('button', { name: 'Thumbs up' }));

    expect(onFeedback.mock.calls).toEqual([
      ['a1', 'up'],
      ['a1', null],
    ]);
  });

  it('shows the rating the host stored', () => {
    render(
      <MessageBubble
        message={reply}
        actionSlots={{ onFeedback: vi.fn(), feedbackByMessageId: { a1: 'down' } }}
      />,
    );

    expect(screen.getByRole('button', { name: 'Thumbs down' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('pages between sibling conversations through the host', async () => {
    const onPrevious = vi.fn();
    const onNext = vi.fn();
    const user = userEvent.setup();
    render(
      <MessageBubble
        message={reply}
        actionSlots={{
          getVariantPager: (id) =>
            id === 'a1' ? { index: 1, total: 3, onPrevious, onNext } : null,
        }}
      />,
    );

    expect(screen.getByTestId('variant-pager').textContent).toContain('2/3');
    await user.click(screen.getByRole('button', { name: 'Previous conversation' }));
    await user.click(screen.getByRole('button', { name: 'Next conversation' }));

    expect(onPrevious).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('renders no pager for a message with a single conversation', () => {
    render(
      <MessageBubble
        message={reply}
        actionSlots={{
          getVariantPager: () => ({ index: 0, total: 1, onPrevious: vi.fn(), onNext: vi.fn() }),
        }}
      />,
    );

    expect(screen.queryByTestId('variant-pager')).toBeNull();
  });
});
