import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LUNA_QA_MATH_EXPRESSIONS, LUNA_QA_MATH_MARKDOWN } from '@/test/fixtures/luna-math';
import { MessageBubble } from './MessageBubble';

const writeText = vi.fn<(text: string) => Promise<void>>();

function message(isStreaming = false) {
  return {
    id: 'luna-math',
    role: 'assistant' as const,
    content: LUNA_QA_MATH_MARKDOWN,
    timestamp: new Date('2026-10-30T15:42:50.833Z'),
    isStreaming,
  };
}

function expectMathMarkup(container: HTMLElement) {
  expect(container.querySelectorAll('.message-text .katex')).toHaveLength(6);
  expect(container.querySelectorAll('.message-text .katex-display')).toHaveLength(4);
  expect(container.querySelectorAll('.katex-html[aria-hidden="true"]')).toHaveLength(6);
  expect(container.querySelector('.katex-error')).toBeNull();
  for (const math of container.querySelectorAll('.katex-html')) {
    expect(math.querySelectorAll('[style]').length).toBeGreaterThan(0);
  }
  expect(
    Array.from(container.querySelectorAll('annotation[encoding="application/x-tex"]')).map(
      (element) => element.textContent?.trim(),
    ),
  ).toEqual(LUNA_QA_MATH_EXPRESSIONS);
}

beforeEach(() => {
  writeText.mockReset();
  writeText.mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
});

describe('MessageBubble math from the supplied QA response', () => {
  it('preserves geometry attributes through streaming, completion, source Copy and reopening', async () => {
    const { container, rerender, unmount } = render(<MessageBubble message={message(true)} />);
    await waitFor(() => expectMathMarkup(container));

    rerender(<MessageBubble message={message()} />);
    await waitFor(() => expectMathMarkup(container));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy message' }));
    });
    expect(writeText).toHaveBeenCalledWith(LUNA_QA_MATH_MARKDOWN);
    unmount();

    const reopened = render(<MessageBubble message={message()} />);
    await waitFor(() => expectMathMarkup(reopened.container));
  });
});
