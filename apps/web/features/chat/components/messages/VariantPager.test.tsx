import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageBubble } from './MessageBubble';
import { VariantPager } from './VariantPager';

// The dynamically-imported markdown renderer resolves async through
// next/dynamic; the inline stub keeps these assertions about the action row.
vi.mock('@agiworkforce/unified-chat', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agiworkforce/unified-chat')>();
  return {
    ...actual,
    MarkdownContent: ({ content }: { content: string }) => (
      <span data-testid="markdown-content">{content}</span>
    ),
  };
});

/**
 * The row's own minimum, from messageActionRow. A pager button below it would
 * be the BranchNavigator mistake (16px chevrons) repeated in a row where every
 * neighbour is 44px on touch.
 */
const TOUCH_TARGET_CLASS = 'h-11';
const POINTER_TARGET_CLASS = 'sm:h-8';

function renderPager(overrides: Partial<Parameters<typeof VariantPager>[0]> = {}) {
  const onPrevious = vi.fn();
  const onNext = vi.fn();
  render(
    <VariantPager index={1} total={3} onPrevious={onPrevious} onNext={onNext} {...overrides} />,
  );
  return { onPrevious, onNext };
}

function makeMessage(overrides: Partial<Parameters<typeof MessageBubble>[0]['message']> = {}) {
  return {
    id: 'msg-1',
    role: 'assistant' as const,
    content: 'Paris.',
    timestamp: new Date('2026-09-01T12:00:00Z'),
    isStreaming: false,
    ...overrides,
  };
}

describe('VariantPager', () => {
  it('renders nothing for a message with no siblings', () => {
    render(<VariantPager index={0} total={1} onPrevious={vi.fn()} onNext={vi.fn()} />);

    expect(screen.queryByTestId('variant-pager')).not.toBeInTheDocument();
  });

  it('shows the one-based position and the total', () => {
    renderPager();

    expect(screen.getByTestId('variant-pager')).toHaveTextContent('2/3');
  });

  it('announces the position as a sentence rather than two characters and a slash', () => {
    renderPager();

    expect(screen.getByRole('status')).toHaveTextContent('Response 2 of 3');
  });

  it('names both directions for a screen reader', () => {
    renderPager();

    expect(screen.getByLabelText('Previous response')).toBeInTheDocument();
    expect(screen.getByLabelText('Next response')).toBeInTheDocument();
  });

  it('gives both controls a target the action row already meets', () => {
    renderPager();

    for (const label of ['Previous response', 'Next response']) {
      const button = screen.getByLabelText(label);
      expect(button.className).toContain(TOUCH_TARGET_CLASS);
      expect(button.className).toContain(POINTER_TARGET_CLASS);
    }
  });

  it('pages in both directions', async () => {
    const user = userEvent.setup();
    const { onPrevious, onNext } = renderPager();

    await user.click(screen.getByLabelText('Previous response'));
    await user.click(screen.getByLabelText('Next response'));

    expect(onPrevious).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('offers no way off either end of the group', () => {
    const { rerender } = render(
      <VariantPager index={0} total={2} onPrevious={vi.fn()} onNext={vi.fn()} />,
    );
    expect(screen.getByLabelText('Previous response')).toBeDisabled();
    expect(screen.getByLabelText('Next response')).toBeEnabled();

    rerender(<VariantPager index={1} total={2} onPrevious={vi.fn()} onNext={vi.fn()} />);
    expect(screen.getByLabelText('Previous response')).toBeEnabled();
    expect(screen.getByLabelText('Next response')).toBeDisabled();
  });

  /** Edge decision 1: stop the stream first, then page. */
  it('disables both controls while the conversation streams', () => {
    renderPager({ index: 1, total: 3, disabled: true });

    expect(screen.getByLabelText('Previous response')).toBeDisabled();
    expect(screen.getByLabelText('Next response')).toBeDisabled();
  });
});

describe('MessageBubble variant pager', () => {
  it('stays out of the action row for a message with one answer', () => {
    render(
      <MessageBubble
        message={makeMessage()}
        variantInfo={{ index: 0, total: 1, previousId: null, nextId: null }}
        onSelectVariant={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('variant-pager')).not.toBeInTheDocument();
  });

  it('renders in the action row once the question has two answers', () => {
    render(
      <MessageBubble
        message={makeMessage()}
        variantInfo={{ index: 1, total: 2, previousId: 'answer-1', nextId: null }}
        onSelectVariant={vi.fn()}
      />,
    );

    expect(screen.getByTestId('variant-pager')).toHaveTextContent('2/2');
  });

  it('names the sibling the reader asked for, leaving the leaf to the page', async () => {
    const user = userEvent.setup();
    const onSelectVariant = vi.fn();
    render(
      <MessageBubble
        message={makeMessage()}
        variantInfo={{ index: 1, total: 2, previousId: 'answer-1', nextId: null }}
        onSelectVariant={onSelectVariant}
      />,
    );

    await user.click(screen.getByLabelText('Previous response'));

    expect(onSelectVariant).toHaveBeenCalledWith('answer-1');
  });

  it('pages a user message the same way it pages an answer', () => {
    render(
      <MessageBubble
        message={makeMessage({ id: 'user-1', role: 'user', content: 'ask again' })}
        variantInfo={{ index: 0, total: 2, previousId: null, nextId: 'user-1b' }}
        onSelectVariant={vi.fn()}
      />,
    );

    expect(screen.getByTestId('variant-pager')).toHaveTextContent('1/2');
  });

  it('renders no pager when the surface cannot page', () => {
    render(
      <MessageBubble
        message={makeMessage()}
        variantInfo={{ index: 1, total: 2, previousId: 'answer-1', nextId: null }}
      />,
    );

    expect(screen.queryByTestId('variant-pager')).not.toBeInTheDocument();
  });

  /**
   * BUG-27/BUG-28 class: the comparator decides whether an update reaches the
   * bubble at all, and a regenerate changes the pager without changing a
   * single field of the message it renders.
   */
  it('re-renders when a regenerate turns one answer into two', () => {
    // Everything else is held identical, message included, so the only prop
    // that could carry this update is the one under test.
    const onSelectVariant = vi.fn();
    const message = makeMessage();
    const { rerender } = render(
      <MessageBubble
        message={message}
        variantInfo={{ index: 0, total: 1, previousId: null, nextId: null }}
        onSelectVariant={onSelectVariant}
      />,
    );
    expect(screen.queryByTestId('variant-pager')).not.toBeInTheDocument();

    rerender(
      <MessageBubble
        message={message}
        variantInfo={{ index: 0, total: 2, previousId: null, nextId: 'answer-2' }}
        onSelectVariant={onSelectVariant}
      />,
    );

    expect(screen.getByTestId('variant-pager')).toHaveTextContent('1/2');
  });

  it('re-renders when the conversation starts streaming', () => {
    const onSelectVariant = vi.fn();
    const message = makeMessage();
    const variantInfo = { index: 0, total: 2, previousId: null, nextId: 'answer-2' };
    const { rerender } = render(
      <MessageBubble
        message={message}
        variantInfo={variantInfo}
        onSelectVariant={onSelectVariant}
        isConversationStreaming={false}
      />,
    );
    expect(screen.getByLabelText('Next response')).toBeEnabled();

    rerender(
      <MessageBubble
        message={message}
        variantInfo={variantInfo}
        onSelectVariant={onSelectVariant}
        isConversationStreaming
      />,
    );

    expect(screen.getByLabelText('Next response')).toBeDisabled();
  });
});
