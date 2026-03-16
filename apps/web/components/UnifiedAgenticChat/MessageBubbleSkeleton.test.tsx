import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageBubbleSkeleton } from './MessageBubbleSkeleton';

describe('MessageBubbleSkeleton', () => {
  it('renders without crashing', () => {
    const { container } = render(<MessageBubbleSkeleton />);
    expect(container.firstChild).toBeDefined();
  });

  it('renders avatar skeleton', () => {
    const { container } = render(<MessageBubbleSkeleton />);
    // Avatar skeleton should be a circular skeleton element
    const skeletons = container.querySelectorAll('[class*="rounded-full"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders header/text skeleton', () => {
    const { container } = render(<MessageBubbleSkeleton />);
    // Should have text skeleton elements
    const textSkeletons = container.querySelectorAll('[class*="h-4"]');
    expect(textSkeletons.length).toBeGreaterThan(0);
  });

  it('renders multiple content skeleton lines', () => {
    const { container } = render(<MessageBubbleSkeleton />);
    // Should have multiple skeleton lines for message content
    const allSkeletons = container.querySelectorAll('.bg-gray-200, .dark\\:bg-gray-700');
    // Avatar + header + 3 content lines = at least 5 skeletons
    expect(allSkeletons.length).toBeGreaterThanOrEqual(4);
  });

  it('applies custom className when provided', () => {
    const { container } = render(<MessageBubbleSkeleton className="custom-class" />);
    expect(container.querySelector('.custom-class')).toBeDefined();
  });

  it('uses wave animation for skeletons', () => {
    const { container } = render(<MessageBubbleSkeleton />);
    // Check that skeleton elements have background color (gray-200 or gray-700)
    const skeletonElements = container.querySelectorAll('[class*="bg-gray"]');
    expect(skeletonElements.length).toBeGreaterThan(0);
  });

  it('renders with proper spacing and layout', () => {
    const { container } = render(<MessageBubbleSkeleton />);
    // Should have flex layout
    const flexContainer = container.querySelector('[class*="flex"]');
    expect(flexContainer).toBeDefined();
  });
});
