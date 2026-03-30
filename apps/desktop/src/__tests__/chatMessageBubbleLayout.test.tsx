import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageBubble } from '../../../../packages/chat/src/components/MessageBubble';

describe('MessageBubble user layout', () => {
  it('keeps the user bubble width constrained on the outer wrapper', () => {
    const { container } = render(
      <MessageBubble
        message={{
          id: 'user-1',
          role: 'user',
          content: 'hi',
          createdAt: '2026-03-28T00:00:00.000Z',
        }}
        isLast={false}
      />,
    );

    expect(container.firstElementChild).toHaveClass('max-w-[80%]');
    expect(screen.getByText('hi')).toHaveClass('w-fit');
  });
});
