import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageBubbleSkeleton } from './MessageBubbleSkeleton';
import { ChatLoadingState } from './ChatLoadingState';

describe('MessageBubbleSkeleton', () => {
  it('renders with accessible role and aria attributes', () => {
    render(<MessageBubbleSkeleton />);

    const el = screen.getByRole('status');
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute('aria-label', 'Loading message');
    expect(el).toHaveAttribute('aria-busy', 'true');
  });

  it('includes a screen-reader-only text for assistive technology', () => {
    render(<MessageBubbleSkeleton />);
    expect(screen.getByText('Loading message...')).toBeInTheDocument();
  });

  // Rendered messages carry no avatar and no name/timestamp header, so a
  // skeleton that draws them shifts the layout the moment real content lands.
  it('draws no avatar, because a rendered message has none', () => {
    const { container } = render(<MessageBubbleSkeleton />);
    expect(container.querySelector('.rounded-full')).not.toBeInTheDocument();
  });

  it('draws only the body lines it is standing in for', () => {
    const { container } = render(<MessageBubbleSkeleton lines={2} />);
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2);
  });

  it('occupies the same column as .message-inner', () => {
    const { container } = render(<MessageBubbleSkeleton />);
    const column = container.querySelector('.mx-auto.flex.max-w-3xl');
    expect(column).toBeInTheDocument();
    expect(column).toHaveClass('px-4');
  });

  it('applies flex-row-reverse for user messages', () => {
    const { container } = render(<MessageBubbleSkeleton isUser />);
    const inner = container.querySelector('.flex-row-reverse');
    expect(inner).toBeInTheDocument();
  });

  it('does NOT apply flex-row-reverse for assistant messages', () => {
    const { container } = render(<MessageBubbleSkeleton isUser={false} />);
    expect(container.querySelector('.flex-row-reverse')).not.toBeInTheDocument();
  });

  it('renders a rounded bubble shape for user messages', () => {
    const { container } = render(<MessageBubbleSkeleton isUser lines={1} />);
    const bubble = container.querySelector('.rounded-2xl');
    expect(bubble).toBeInTheDocument();
  });

  it('renders the correct number of text lines for assistant messages', () => {
    const { container } = render(<MessageBubbleSkeleton isUser={false} lines={3} />);
    const proseLine = container.querySelector('.space-y-3');
    expect(proseLine).toBeInTheDocument();
    const lines = proseLine!.querySelectorAll('[aria-hidden="true"]');
    expect(lines).toHaveLength(3);
  });

  it('defaults to 2 lines for assistant messages', () => {
    const { container } = render(<MessageBubbleSkeleton isUser={false} />);
    const proseLine = container.querySelector('.space-y-3');
    expect(proseLine).toBeInTheDocument();
    const lines = proseLine!.querySelectorAll('[aria-hidden="true"]');
    expect(lines).toHaveLength(2);
  });

  it('applies animate-pulse class by default', () => {
    const { container } = render(<MessageBubbleSkeleton />);
    const animated = container.querySelector('.animate-pulse');
    expect(animated).toBeInTheDocument();
  });

  it('suppresses animation when animation="none"', () => {
    const { container } = render(<MessageBubbleSkeleton animation="none" />);
    expect(container.querySelector('.animate-pulse')).not.toBeInTheDocument();
  });

  it('forwards custom className to the wrapper', () => {
    const { container } = render(<MessageBubbleSkeleton className="test-custom-class" />);
    expect(container.querySelector('.test-custom-class')).toBeInTheDocument();
  });
});

describe('ChatLoadingState', () => {
  it('renders with accessible aria-label and aria-live', () => {
    render(<ChatLoadingState />);
    const wrapper = screen.getByLabelText('Loading conversation history');
    expect(wrapper).toBeInTheDocument();
    expect(wrapper).toHaveAttribute('aria-live', 'polite');
  });

  it('renders the default number of skeleton bubbles (4)', () => {
    render(<ChatLoadingState />);
    const statuses = screen.getAllByRole('status');
    expect(statuses).toHaveLength(4);
  });

  it('renders the requested number of skeletons', () => {
    render(<ChatLoadingState count={5} />);
    const statuses = screen.getAllByRole('status');
    expect(statuses).toHaveLength(5);
  });

  it('renders at least one user-aligned (flex-row-reverse) skeleton', () => {
    const { container } = render(<ChatLoadingState count={4} />);
    const userBubbles = container.querySelectorAll('.flex-row-reverse');
    expect(userBubbles.length).toBeGreaterThanOrEqual(1);
  });

  it('renders at least one assistant-aligned skeleton', () => {
    const { container } = render(<ChatLoadingState count={4} />);
    const allMessages = container.querySelectorAll('.mx-auto.flex.max-w-3xl');
    const assistantMessages = Array.from(allMessages).filter(
      (el) => !el.classList.contains('flex-row-reverse'),
    );
    expect(assistantMessages.length).toBeGreaterThanOrEqual(1);
  });

  it('alternates user (index % 2 === 0) and assistant (index % 2 === 1) messages', () => {
    const { container } = render(<ChatLoadingState count={4} />);
    const allMessages = container.querySelectorAll('.mx-auto.flex.max-w-3xl');
    expect(allMessages[0]!.classList.contains('flex-row-reverse')).toBe(true);
    expect(allMessages[1]!.classList.contains('flex-row-reverse')).toBe(false);
    expect(allMessages[2]!.classList.contains('flex-row-reverse')).toBe(true);
    expect(allMessages[3]!.classList.contains('flex-row-reverse')).toBe(false);
  });

  it('renders 0 skeletons when count=0', () => {
    render(<ChatLoadingState count={0} />);
    const statuses = screen.queryAllByRole('status');
    expect(statuses).toHaveLength(0);
  });

  it('forwards animation prop to child skeletons', () => {
    const { container } = render(<ChatLoadingState count={2} animation="none" />);
    expect(container.querySelector('.animate-pulse')).not.toBeInTheDocument();
  });

  it('forwards custom className to the wrapper', () => {
    const { container } = render(<ChatLoadingState className="custom-loading-wrapper" />);
    expect(container.querySelector('.custom-loading-wrapper')).toBeInTheDocument();
  });

  it('includes a flex-1 spacer to push content toward the bottom', () => {
    const { container } = render(<ChatLoadingState />);
    const spacer = container.querySelector('.flex-1');
    expect(spacer).toBeInTheDocument();
  });

  it('each skeleton bubble contains a screen-reader label', () => {
    render(<ChatLoadingState count={3} />);
    const labels = screen.getAllByText('Loading message...');
    expect(labels).toHaveLength(3);
  });
});
