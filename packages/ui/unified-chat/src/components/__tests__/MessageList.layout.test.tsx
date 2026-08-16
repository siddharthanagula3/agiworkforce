import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MessageList } from '../MessageList';
import { useChatStore } from '../../stores/chatStore';
import type { ChatMessage } from '../../lib/types';

function seed(messages: ChatMessage[], isStreaming = false) {
  useChatStore.setState({ messagesByConversation: { c1: messages }, isStreaming } as never);
}

const user: ChatMessage = {
  id: 'u1',
  role: 'user',
  content: 'hello there',
  createdAt: '2026-05-06T12:00:00.000Z',
};
const asst1: ChatMessage = {
  id: 'a1',
  role: 'assistant',
  content: 'first answer',
  createdAt: '2026-05-06T12:00:10.000Z',
};
const asst2: ChatMessage = {
  id: 'a2',
  role: 'assistant',
  content: 'second answer',
  createdAt: '2026-05-06T12:01:00.000Z',
};

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  useChatStore.setState({ messagesByConversation: {}, isStreaming: false } as never);
});

afterEach(() => cleanup());

describe('MessageList web-parity layout', () => {
  it('centres each message row in a max-w-3xl reading column', () => {
    seed([user, asst1]);
    const { container } = render(<MessageList conversationId="c1" showProvenanceFooter={false} />);

    const rows = container.querySelectorAll('[data-message-row]');
    expect(rows.length).toBe(2);
    for (const row of Array.from(rows)) {
      const column = row.querySelector('.max-w-3xl.mx-auto, .mx-auto.max-w-3xl');
      expect(column).not.toBeNull();
    }
  });

  it('renders a flat feed with no per-role row striping', () => {
    seed([user, asst1]);
    const { container } = render(<MessageList conversationId="c1" showProvenanceFooter={false} />);
    const rows = container.querySelectorAll('[data-message-row]');
    for (const row of Array.from(rows)) {
      const cls = row.getAttribute('class') ?? '';
      expect(cls).not.toMatch(/\bbg-/);
    }
  });

  it('shows the Copy action below EVERY completed assistant message', () => {
    seed([user, asst1, asst2]);
    const { container } = render(<MessageList conversationId="c1" showProvenanceFooter={false} />);
    const assistantRows = container.querySelectorAll('[data-message-row="assistant"]');
    expect(assistantRows.length).toBe(2);
    for (const row of Array.from(assistantRows)) {
      const copyBtns = row.querySelectorAll('button[aria-label="Copy message"]');
      expect(copyBtns.length).toBe(1);
    }
  });

  it('omits Retry and Thumbs when no handlers are wired (no dead controls)', () => {
    seed([asst1]);
    render(<MessageList conversationId="c1" showProvenanceFooter={false} />);
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /thumbs up/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /thumbs down/i })).toBeNull();
  });

  it('does not render an action row on a still-streaming assistant message', () => {
    seed([{ ...asst1, isStreaming: true }], true);
    render(<MessageList conversationId="c1" showProvenanceFooter={false} />);
    expect(screen.queryByRole('button', { name: /copy message/i })).toBeNull();
  });

  it('renders a user turn as a right-aligned bubble without a timestamp', () => {
    seed([user]);
    const { container } = render(<MessageList conversationId="c1" showProvenanceFooter={false} />);
    const userRow = container.querySelector('[data-message-row="user"]');
    expect(userRow).not.toBeNull();
    expect(userRow!.querySelector('.justify-end')).not.toBeNull();
    expect(userRow!.textContent).not.toMatch(/\d{1,2}:\d{2}\s?(AM|PM)/i);
  });
});
