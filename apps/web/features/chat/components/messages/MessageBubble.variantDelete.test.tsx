import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageBubble } from './MessageBubble';
import type { VariantInfo } from '@/features/chat/lib/messageThread';

vi.mock('@agiworkforce/unified-chat', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agiworkforce/unified-chat')>();
  return {
    ...actual,
    MarkdownContent: ({ content }: { content: string }) => (
      <span data-testid="markdown-content">{content}</span>
    ),
  };
});

const DELETE_VARIANT = /delete this response and what follows/i;

function assistantMessage(id = 'a2') {
  return {
    id,
    role: 'assistant' as const,
    content: 'the second answer',
    timestamp: new Date('2026-09-01T12:00:00Z'),
    isStreaming: false,
  };
}

function variantInfo(overrides: Partial<VariantInfo> = {}): VariantInfo {
  return { index: 1, total: 3, previousId: 'a1', nextId: 'a3', ...overrides };
}

function renderBubble(props: Partial<Parameters<typeof MessageBubble>[0]> = {}): {
  onDeleteVariant: ReturnType<typeof vi.fn>;
} {
  const onDeleteVariant = vi.fn();
  render(
    <MessageBubble
      message={assistantMessage()}
      variantInfo={variantInfo()}
      onSelectVariant={vi.fn()}
      onDeleteVariant={onDeleteVariant}
      countVariantFollowers={() => 0}
      {...props}
    />,
  );
  return { onDeleteVariant };
}

async function openMenu(): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  await user.click(screen.getByLabelText('More message actions'));
  return user;
}

describe('MessageBubble, deleting one response among its siblings', () => {
  it('offers the action on a response that has siblings', async () => {
    renderBubble();
    await openMenu();

    expect(screen.getByRole('menuitem', { name: DELETE_VARIANT })).toBeInTheDocument();
  });

  it('does not offer it on a response that is the only answer', async () => {
    renderBubble({
      variantInfo: variantInfo({ index: 0, total: 1, previousId: null, nextId: null }),
    });
    await openMenu();

    expect(screen.queryByRole('menuitem', { name: DELETE_VARIANT })).not.toBeInTheDocument();
  });

  it('does not offer it on a conversation with no variants at all', async () => {
    renderBubble({ variantInfo: undefined });
    await openMenu();

    expect(screen.queryByRole('menuitem', { name: DELETE_VARIANT })).not.toBeInTheDocument();
  });

  it('does not offer it on the reader own message', async () => {
    renderBubble({ message: { ...assistantMessage('u2'), role: 'user' } });
    await openMenu();

    expect(screen.queryByRole('menuitem', { name: DELETE_VARIANT })).not.toBeInTheDocument();
  });

  /**
   * A surface that cannot count what goes with the response would confirm a
   * promise it has not checked, so it gets no action rather than a vague one.
   */
  it('does not offer it without the counter the confirm copy needs', async () => {
    renderBubble({ countVariantFollowers: undefined });
    await openMenu();

    expect(screen.queryByRole('menuitem', { name: DELETE_VARIANT })).not.toBeInTheDocument();
  });

  it('deletes nothing until the confirmation is answered', async () => {
    const { onDeleteVariant } = renderBubble({ countVariantFollowers: () => 4 });
    const user = await openMenu();

    await user.click(screen.getByRole('menuitem', { name: DELETE_VARIANT }));

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(onDeleteVariant).not.toHaveBeenCalled();
  });

  it('names how much goes with the response and what survives', async () => {
    renderBubble({ countVariantFollowers: () => 4 });
    const user = await openMenu();

    await user.click(screen.getByRole('menuitem', { name: DELETE_VARIANT }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('This response and the 4 messages that follow it are deleted');
    expect(dialog).toHaveTextContent('The other 2 answers to this message stay');
    expect(dialog).toHaveTextContent('This cannot be undone.');
  });

  it('deletes the response once the reader confirms', async () => {
    const { onDeleteVariant } = renderBubble();
    const user = await openMenu();

    await user.click(screen.getByRole('menuitem', { name: DELETE_VARIANT }));
    await user.click(await screen.findByRole('button', { name: 'Delete response' }));

    expect(onDeleteVariant).toHaveBeenCalledWith('a2');
  });

  it('deletes nothing when the reader backs out', async () => {
    const { onDeleteVariant } = renderBubble();
    const user = await openMenu();

    await user.click(screen.getByRole('menuitem', { name: DELETE_VARIANT }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(onDeleteVariant).not.toHaveBeenCalled();
  });

  it('leaves the plain single-message delete where it was', async () => {
    const onDelete = vi.fn();
    renderBubble({ onDelete });
    await openMenu();

    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: DELETE_VARIANT })).toBeInTheDocument();
  });
});
