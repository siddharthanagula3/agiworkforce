/**
 * MessageBubbleSkeleton Component Tests
 *
 * Tests the skeleton loader for message bubbles used in the UnifiedAgenticChat.
 * This component depends on SkeletonLoader from @shared/ui/skeleton-loader,
 * which uses framer-motion's motion.div for animations.
 *
 * The framer-motion mock in test/setup.ts prevents the motion-dom CSS parsing
 * error (TypeError: Cannot read properties of undefined (reading 'split'))
 * that occurs when motion-dom tries to set CSS transforms via jsdom's cssstyle.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageBubbleSkeleton } from '../MessageBubbleSkeleton';

describe('MessageBubbleSkeleton', () => {
  describe('rendering', () => {
    it('renders the skeleton container with correct test id', () => {
      render(<MessageBubbleSkeleton />);
      expect(screen.getByTestId('message-bubble-skeleton')).toBeInTheDocument();
    });

    it('renders with default layout classes', () => {
      render(<MessageBubbleSkeleton />);
      const skeleton = screen.getByTestId('message-bubble-skeleton');
      expect(skeleton).toHaveClass('flex', 'gap-3', 'py-3', 'px-4');
    });

    it('renders avatar skeleton with circular shape', () => {
      const { container } = render(<MessageBubbleSkeleton />);
      const avatar = container.querySelector('.rounded-full');
      expect(avatar).toBeInTheDocument();
    });

    it('renders multiple skeleton lines for message content', () => {
      const { container } = render(<MessageBubbleSkeleton />);
      // SkeletonLoader renders motion.div elements (mocked as plain divs).
      // The component has: 1 avatar + 1 header text + 3 content lines = 5 skeleton loaders.
      // Each SkeletonLoader renders a div with bg-gray-200 class.
      const skeletonElements = container.querySelectorAll('.bg-gray-200');
      expect(skeletonElements.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('className prop', () => {
    it('applies custom className to the container', () => {
      render(<MessageBubbleSkeleton className="mt-4" />);
      const skeleton = screen.getByTestId('message-bubble-skeleton');
      expect(skeleton).toHaveClass('mt-4');
    });

    it('preserves default classes when custom className is added', () => {
      render(<MessageBubbleSkeleton className="custom-class" />);
      const skeleton = screen.getByTestId('message-bubble-skeleton');
      expect(skeleton).toHaveClass('flex', 'gap-3');
      expect(skeleton).toHaveClass('custom-class');
    });
  });

  describe('layout structure', () => {
    it('renders a flex-shrink-0 container for the avatar', () => {
      const { container } = render(<MessageBubbleSkeleton />);
      const avatarContainer = container.querySelector('.flex-shrink-0');
      expect(avatarContainer).toBeInTheDocument();
    });

    it('renders a flex-1 container for the content area', () => {
      const { container } = render(<MessageBubbleSkeleton />);
      const contentArea = container.querySelector('.flex-1');
      expect(contentArea).toBeInTheDocument();
    });

    it('renders content lines within a spaced container', () => {
      const { container } = render(<MessageBubbleSkeleton />);
      const spacedContainer = container.querySelector('.space-y-2');
      expect(spacedContainer).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('does not contain interactive elements in loading state', () => {
      const { container } = render(<MessageBubbleSkeleton />);
      const buttons = container.querySelectorAll('button');
      const links = container.querySelectorAll('a');
      expect(buttons.length).toBe(0);
      expect(links.length).toBe(0);
    });
  });
});
