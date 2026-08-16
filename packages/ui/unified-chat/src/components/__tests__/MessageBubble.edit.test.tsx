/**
 * DESK-202: the user turn's edit affordance.
 *
 * The E2E suite drove `data-testid="message-item"`, a per-message edit control
 * and `textarea[data-editing="true"]` for months while none of the three
 * existed in any source file. These cover the built behaviour, including the
 * cases where the control must NOT appear.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageBubble } from '../MessageBubble';
import type { ChatMessage } from '../../lib/types';

const userMessage: ChatMessage = {
  id: 'u1',
  role: 'user',
  content: 'original question',
  createdAt: '2026-08-16T12:00:00.000Z',
};

describe('MessageBubble edit affordance', () => {
  it('marks both roles as message items so a feed can address them', () => {
    const { container: userContainer } = render(<MessageBubble message={userMessage} />);
    expect(userContainer.querySelector('[data-testid="message-item"]')).not.toBeNull();

    const { container: assistantContainer } = render(
      <MessageBubble message={{ ...userMessage, id: 'a1', role: 'assistant' }} />,
    );
    expect(assistantContainer.querySelector('[data-testid="message-item"]')).not.toBeNull();
  });

  it('renders no edit control when the host wired no commit handler', () => {
    render(<MessageBubble message={userMessage} />);
    expect(screen.queryByRole('button', { name: /edit message/i })).toBeNull();
  });

  it('never offers to edit an assistant turn, even with a handler wired', () => {
    // Rewriting a reply would let the transcript claim the model said something
    // it never said. Copy stays available; Edit does not appear.
    render(
      <MessageBubble message={{ ...userMessage, id: 'a1', role: 'assistant' }} onEdit={vi.fn()} />,
    );
    expect(screen.queryByRole('button', { name: /edit message/i })).toBeNull();
  });

  it('commits the edited body to the host handler', async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    render(<MessageBubble message={userMessage} onEdit={onEdit} />);

    await user.click(screen.getByRole('button', { name: /edit message/i }));
    const textarea = screen.getByRole('textbox', { name: /edit message/i });
    expect(textarea.getAttribute('data-editing')).toBe('true');
    expect((textarea as HTMLTextAreaElement).value).toBe('original question');

    await user.clear(textarea);
    await user.type(textarea, 'rewritten question');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(onEdit).toHaveBeenCalledWith('u1', 'rewritten question');
  });

  it('cancel restores the stored text and commits nothing', async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    render(<MessageBubble message={userMessage} onEdit={onEdit} />);

    await user.click(screen.getByRole('button', { name: /edit message/i }));
    await user.clear(screen.getByRole('textbox', { name: /edit message/i }));
    await user.type(screen.getByRole('textbox', { name: /edit message/i }), 'abandoned draft');
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.getByText('original question')).toBeTruthy();
  });

  it('an unchanged body is a no-op, not a resend', async () => {
    // editAndResend deletes the exchange and re-runs the turn, so committing an
    // identical body would burn a request and discard a good answer.
    const onEdit = vi.fn();
    const user = userEvent.setup();
    render(<MessageBubble message={userMessage} onEdit={onEdit} />);

    await user.click(screen.getByRole('button', { name: /edit message/i }));
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(onEdit).not.toHaveBeenCalled();
  });

  it('an emptied body is treated as a cancel', async () => {
    // Blanking the turn would leave a reply with no question above it.
    const onEdit = vi.fn();
    const user = userEvent.setup();
    render(<MessageBubble message={userMessage} onEdit={onEdit} />);

    await user.click(screen.getByRole('button', { name: /edit message/i }));
    await user.clear(screen.getByRole('textbox', { name: /edit message/i }));
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.getByText('original question')).toBeTruthy();
  });

  it('Escape abandons the edit', async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    render(<MessageBubble message={userMessage} onEdit={onEdit} />);

    await user.click(screen.getByRole('button', { name: /edit message/i }));
    await user.type(screen.getByRole('textbox', { name: /edit message/i }), ' more');
    await user.keyboard('{Escape}');

    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.getByText('original question')).toBeTruthy();
  });
});
