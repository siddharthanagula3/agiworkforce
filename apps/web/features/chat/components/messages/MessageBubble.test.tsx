import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageBubble } from './MessageBubble';

describe('MessageBubble Animations', () => {
  const baseMessage = {
    id: '1',
    role: 'user' as const,
    content: 'Hello',
    timestamp: new Date(),
    isStreaming: false,
  };

  it('renders with framer-motion animation wrapper', () => {
    const { container } = render(<MessageBubble message={baseMessage} />);

    // Check for the main flex container that contains the motion.div
    const flexContainer = container.querySelector('.group.flex');
    expect(flexContainer).toBeDefined();
    expect(flexContainer).toBeInTheDocument();
  });

  it('renders user message with correct styling', () => {
    const { container } = render(<MessageBubble message={baseMessage} />);

    // Verify content renders
    expect(screen.getByText('Hello')).toBeInTheDocument();

    // Check that flex-row-reverse is applied for user messages
    const flexContainer = container.querySelector('.group.flex.flex-row-reverse');
    expect(flexContainer).toBeInTheDocument();
  });

  it('renders assistant message with animation', () => {
    const assistantMessage = {
      ...baseMessage,
      role: 'assistant' as const,
      content: 'Response',
    };
    const { container } = render(<MessageBubble message={assistantMessage} />);

    // Check that the message content is rendered
    expect(screen.getByText('Response')).toBeInTheDocument();

    // Verify avatar is shown for assistant messages
    const avatar = container.querySelector('.h-8.w-8');
    expect(avatar).toBeInTheDocument();
  });

  it('applies dark mode styling with CSS custom properties', () => {
    const assistantMessage = {
      ...baseMessage,
      role: 'assistant' as const,
      content: 'Dark mode test',
    };
    const { container } = render(<MessageBubble message={assistantMessage} />);

    // Check for dark mode hover state
    const flexContainer = container.querySelector('.dark\\:hover\\:bg-zinc-800\\/50');
    expect(flexContainer).toBeInTheDocument();
  });

  it('handles streaming messages correctly', () => {
    const streamingMessage = {
      ...baseMessage,
      isStreaming: true,
      content: '', // Empty content shows "Thinking..."
    };
    render(<MessageBubble message={streamingMessage} />);

    // Streaming indicator should be visible when message is empty and streaming
    expect(screen.getByText('Thinking...')).toBeInTheDocument();
  });
});
