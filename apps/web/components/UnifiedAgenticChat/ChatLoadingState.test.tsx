import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatLoadingState } from './ChatLoadingState';

// framer-motion renders as a plain div in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, className, ...rest }: React.HTMLAttributes<HTMLDivElement>) => (
      <div className={className} {...rest}>
        {children}
      </div>
    ),
  },
}));

describe('ChatLoadingState', () => {
  it('renders children when isLoading is false', () => {
    render(
      <ChatLoadingState isLoading={false}>
        <div data-testid="test-content">Test Content</div>
      </ChatLoadingState>,
    );
    expect(screen.getByTestId('test-content')).toBeDefined();
    expect(screen.getByText('Test Content')).toBeDefined();
  });

  it('shows skeleton loaders when isLoading is true', () => {
    const { container } = render(
      <ChatLoadingState isLoading={true}>
        <div data-testid="test-content">Test Content</div>
      </ChatLoadingState>,
    );
    // Should show skeleton elements, not children
    expect(screen.queryByTestId('test-content')).toBeNull();
    // Should have skeleton loaders
    const skeletonElements = container.querySelectorAll('[class*="bg-gray-200"]');
    expect(skeletonElements.length).toBeGreaterThan(0);
  });

  it('displays default loading message', () => {
    render(
      <ChatLoadingState isLoading={true}>
        <div>Test Content</div>
      </ChatLoadingState>,
    );
    expect(screen.getByText('Waiting for response...')).toBeDefined();
  });

  it('displays custom loading message when provided', () => {
    render(
      <ChatLoadingState isLoading={true} message="Custom loading...">
        <div>Test Content</div>
      </ChatLoadingState>,
    );
    expect(screen.getByText('Custom loading...')).toBeDefined();
  });

  it('hides loading message when not loading', () => {
    render(
      <ChatLoadingState isLoading={false} message="Custom loading...">
        <div data-testid="test-content">Test Content</div>
      </ChatLoadingState>,
    );
    expect(screen.queryByText('Custom loading...')).toBeNull();
    expect(screen.getByTestId('test-content')).toBeDefined();
  });

  it('transitions between loading and loaded states', () => {
    const { rerender } = render(
      <ChatLoadingState isLoading={true}>
        <div data-testid="test-content">Test Content</div>
      </ChatLoadingState>,
    );

    // Should show skeletons initially
    expect(screen.queryByTestId('test-content')).toBeNull();

    // Switch to not loading
    rerender(
      <ChatLoadingState isLoading={false}>
        <div data-testid="test-content">Test Content</div>
      </ChatLoadingState>,
    );

    // Should show children now
    expect(screen.getByTestId('test-content')).toBeDefined();
  });

  it('renders multiple skeleton loaders', () => {
    const { container } = render(
      <ChatLoadingState isLoading={true}>
        <div>Test Content</div>
      </ChatLoadingState>,
    );
    // Should have at least 3 skeleton message bubbles
    const flexContainers = container.querySelectorAll('[class*="flex"]');
    expect(flexContainers.length).toBeGreaterThanOrEqual(3);
  });

  it('hides skeletons and message when not loading', () => {
    const { container } = render(
      <ChatLoadingState isLoading={false}>
        <div data-testid="test-content">Test Content</div>
      </ChatLoadingState>,
    );
    // Should not have visible loading elements
    const loadingText = screen.queryByText('Waiting for response...');
    expect(loadingText).toBeNull();
  });
});
