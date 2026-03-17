import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageBubbleSkeleton } from './MessageBubbleSkeleton';
import { ChatLoadingState } from './ChatLoadingState';

// ---------------------------------------------------------------------------
// MessageBubbleSkeleton
// ---------------------------------------------------------------------------

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

  it('renders avatar skeleton', () => {
    const { container } = render(<MessageBubbleSkeleton />);
    const avatar = container.querySelector('.rounded-full');
    expect(avatar).toBeInTheDocument();
  });

  it('renders name and timestamp chips in the header row', () => {
    const { container } = render(<MessageBubbleSkeleton />);
    // The header row contains two Skeleton divs (name chip + timestamp chip)
    // Both are siblings inside the header flex container
    const skeletons = container.querySelectorAll('[aria-hidden="true"]');
    // At minimum avatar + 2 header chips + at least 1 line
    expect(skeletons.length).toBeGreaterThanOrEqual(4);
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
    // User bubble: rounded-2xl rounded-tr-sm
    const bubble = container.querySelector('.rounded-2xl.rounded-tr-sm');
    expect(bubble).toBeInTheDocument();
  });

  it('renders the correct number of text lines for assistant messages', () => {
    const { container } = render(<MessageBubbleSkeleton isUser={false} lines={3} />);
    // The prose area wraps lines in a space-y-2 div
    const proseLine = container.querySelector('.space-y-2');
    expect(proseLine).toBeInTheDocument();
    // Each line is an h-4 skeleton inside the prose block
    const lines = proseLine!.querySelectorAll('[aria-hidden="true"]');
    expect(lines).toHaveLength(3);
  });

  it('defaults to 2 lines for assistant messages', () => {
    const { container } = render(<MessageBubbleSkeleton isUser={false} />);
    const proseLine = container.querySelector('.space-y-2');
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

// ---------------------------------------------------------------------------
// ChatLoadingState
// ---------------------------------------------------------------------------

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
    // The outer mx-auto flex container without flex-row-reverse is assistant
    const allMessages = container.querySelectorAll('.mx-auto.flex.max-w-3xl');
    const assistantMessages = Array.from(allMessages).filter(
      (el) => !el.classList.contains('flex-row-reverse'),
    );
    expect(assistantMessages.length).toBeGreaterThanOrEqual(1);
  });

  it('alternates user (index % 2 === 0) and assistant (index % 2 === 1) messages', () => {
    const { container } = render(<ChatLoadingState count={4} />);
    const allMessages = container.querySelectorAll('.mx-auto.flex.max-w-3xl');
    // index 0 → user (flex-row-reverse), index 1 → assistant, etc.
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
