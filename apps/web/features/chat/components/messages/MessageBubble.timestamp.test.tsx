import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getManagedModelPresentationLabel } from '@agiworkforce/unified-chat';
import { getModels, isModelLive } from '@agiworkforce/types';
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

const SERVED_MODEL = getModels({ requireCapabilities: { streaming: true } }).find(
  (model) => isModelLive(model) && model.modelType !== 'image' && model.modelType !== 'video',
);
if (!SERVED_MODEL) throw new Error('The canonical model catalog must expose a live chat model');
const SERVED_LABEL = getManagedModelPresentationLabel(SERVED_MODEL.id);

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

  it('names the model that answered on the turn itself, not only under More', () => {
    render(
      <MessageBubble message={{ ...message('assistant'), metadata: { model: SERVED_MODEL.id } }} />,
    );

    expect(screen.getByTestId('message-answered-by')).toHaveTextContent(SERVED_LABEL);
  });

  it('says Auto chose the model when the composer asked for Auto', () => {
    render(
      <MessageBubble
        message={{
          ...message('assistant'),
          metadata: { model: SERVED_MODEL.id, requestedModel: 'auto' },
        }}
      />,
    );

    expect(screen.getByTestId('message-answered-by')).toHaveTextContent(
      `Auto chose ${SERVED_LABEL}`,
    );
  });

  it('reveals the chip on hover or focus and keeps it on a coarse pointer', () => {
    render(
      <MessageBubble message={{ ...message('assistant'), metadata: { model: SERVED_MODEL.id } }} />,
    );

    const chip = screen.getByTestId('message-answered-by');
    expect(chip).toHaveClass('opacity-0');
    expect(chip).toHaveClass('group-hover:opacity-100');
    expect(chip).toHaveClass('group-focus-within:opacity-100');
    expect(chip).toHaveClass('pointer-coarse:opacity-100');
  });

  it('claims no model on a user turn or on an unresolved Auto turn', () => {
    const { rerender } = render(
      <MessageBubble message={{ ...message('user'), metadata: { model: SERVED_MODEL.id } }} />,
    );
    expect(screen.queryByTestId('message-answered-by')).toBeNull();

    rerender(<MessageBubble message={{ ...message('assistant'), metadata: { model: 'auto' } }} />);
    expect(screen.queryByTestId('message-answered-by')).toBeNull();
  });

  it('offers no timestamp while the response is still streaming', () => {
    render(<MessageBubble message={{ ...message('assistant'), isStreaming: true }} />);

    expect(screen.queryByLabelText('More message actions')).toBeNull();
    expect(screen.queryByTestId('message-timestamp')).toBeNull();
  });
});
