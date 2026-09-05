import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageBubble } from './MessageBubble';

vi.mock('@agiworkforce/unified-chat', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agiworkforce/unified-chat')>();
  return {
    ...actual,
    MarkdownContent: ({ content }: { content: string }) => (
      <span data-testid="markdown-content">{content}</span>
    ),
  };
});

const SENT_AT = new Date('2024-05-04T15:37:00Z');

function message(role: 'user' | 'assistant') {
  return {
    id: `msg-${role}`,
    role,
    content: 'Hello',
    timestamp: SENT_AT,
    isStreaming: false,
  };
}

describe('MessageBubble timestamp (CLR-03)', () => {
  it.each(['assistant', 'user'] as const)(
    'keeps the time a %s message was sent under More, not in the action row',
    async (role) => {
      const user = userEvent.setup();
      render(<MessageBubble message={message(role)} />);

      expect(screen.queryByTestId('message-timestamp')).toBeNull();
      await user.click(screen.getByLabelText('More message actions'));

      const stamp = screen.getByTestId('message-timestamp');
      expect(stamp.tagName).toBe('TIME');
      expect(stamp.getAttribute('dateTime')).toBe(SENT_AT.toISOString());
      expect(stamp.getAttribute('title')).toBe(SENT_AT.toLocaleString());
      expect(stamp.textContent).toBe(
        SENT_AT.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      );
    },
  );

  it('offers no timestamp while the response is still streaming', () => {
    render(<MessageBubble message={{ ...message('assistant'), isStreaming: true }} />);

    expect(screen.queryByLabelText('More message actions')).toBeNull();
    expect(screen.queryByTestId('message-timestamp')).toBeNull();
  });
});
