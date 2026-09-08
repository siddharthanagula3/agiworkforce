import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ChatMessage } from '@agiworkforce/unified-chat';
import { ChatMessageList } from '../ChatMessageList';

const MESSAGE_COLUMN_CLASSES = ['mx-auto', 'w-full', 'max-w-3xl', 'px-4'];

function turn(metadata: Record<string, unknown>, content: string): ChatMessage[] {
  return [
    {
      id: 'user-1',
      role: 'user',
      content: 'Why does the sky look blue?',
      createdAt: new Date(Date.now() - 120_000).toISOString(),
    },
    {
      id: 'assistant-1',
      role: 'assistant',
      content,
      createdAt: new Date(Date.now() - 60_000).toISOString(),
      metadata,
    },
  ] as unknown as ChatMessage[];
}

function renderTranscript(messages: ChatMessage[]) {
  return render(
    <ChatMessageList
      messages={messages}
      onRegenerate={vi.fn()}
      onContinue={vi.fn()}
      conversationId="conversation-1"
    />,
  );
}

function wrapperOf(text: string | RegExp): HTMLElement {
  const node = screen.getByText(text);
  const wrapper = node.closest('.max-w-3xl');
  if (!(wrapper instanceof HTMLElement)) throw new Error('notice is outside the message column');
  return wrapper;
}

function expectMessageColumn(wrapper: HTMLElement): void {
  for (const className of MESSAGE_COLUMN_CLASSES) {
    expect(wrapper.classList.contains(className)).toBe(true);
  }
}

describe('transcript notices share the message column', () => {
  it('aligns Continue generating to the message column', () => {
    renderTranscript(
      turn({ finishReason: 'length' }, 'Shorter wavelengths scatter more, so the sky'),
    );

    expectMessageColumn(wrapperOf(/Continue generating/i));
  });

  it('aligns the stopped-response notice to the message column', () => {
    renderTranscript(turn({ finishReason: 'stopped' }, 'Shorter wavelengths scatter more.'));

    expectMessageColumn(wrapperOf(/Response stopped\./i));
  });

  it('aligns the safety refusal notice to the message column', () => {
    renderTranscript(turn({ finishReason: 'refusal' }, ''));

    expectMessageColumn(wrapperOf(/declined to finish this response/i));
  });

  it('raises the failed-run links to a 44px target on a coarse pointer', () => {
    renderTranscript(
      turn(
        { streamError: { message: 'the upstream closed the connection' } },
        'Half an answer before the stream dropped.',
      ),
    );

    const retry = screen.getByRole('button', { name: 'Regenerate this response' });
    expect(retry.classList.contains('pointer-coarse:min-h-11')).toBe(true);
    expect(retry.classList.contains('pointer-coarse:min-w-11')).toBe(true);
    expect(retry.classList.contains('min-h-6')).toBe(true);
  });
});
