/**
 * HelpTour Component Tests
 *
 * Tests for the Help Tour UI component including:
 * - Rendering tour steps with correct information
 * - User interactions (Next, Previous, Skip, Finish buttons)
 * - Element highlighting via position tracking
 * - Progress indicator display
 * - Tour visibility state
 * - Accessibility features
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HelpTour } from '../HelpTour';
import { useHelpTour } from '../../hooks/useHelpTour';
import { ReactNode } from 'react';

// Mock the useHelpTour hook
vi.mock('../../hooks/useHelpTour', () => ({
  useHelpTour: vi.fn(),
}));

const mockUseHelpTour = useHelpTour as any;

describe('HelpTour Component', () => {
  const mockTourState = {
    currentStep: 0,
    isActive: true,
    currentTourId: 'chat-basics',
    totalSteps: 5,
    completedTours: {},
    startTour: vi.fn(),
    nextStep: vi.fn(),
    previousStep: vi.fn(),
    skipTour: vi.fn(),
    finishTour: vi.fn(),
    resetTour: vi.fn(),
    clearAllTours: vi.fn(),
    getCurrentStep: vi.fn(() => ({
      id: 'composer',
      title: 'Write Your Message',
      description: 'Type your message in the composer and send it to the AI',
      targetElementId: 'chat-composer',
      position: { top: 100, left: 100, width: 400, height: 60 } as any,
    })),
    hasNextStep: vi.fn(() => true),
    hasPreviousStep: vi.fn(() => false),
    isTourCompleted: vi.fn(() => false),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseHelpTour.mockReturnValue(mockTourState);

    // Create mock target element so the component can position the tooltip
    const element = document.createElement('div');
    element.id = 'chat-composer';
    element.style.position = 'fixed';
    element.style.top = '100px';
    element.style.left = '100px';
    element.style.width = '400px';
    element.style.height = '60px';
    document.body.appendChild(element);
  });

  afterEach(() => {
    vi.clearAllMocks();
    // Clean up mock elements
    const element = document.getElementById('chat-composer');
    if (element) {
      element.remove();
    }
  });

  describe('Rendering', () => {
    it('should not render when tour is not active', () => {
      mockUseHelpTour.mockReturnValue({
        ...mockTourState,
        isActive: false,
      });

      const { container } = render(<HelpTour />);
      expect(container.querySelector('[data-testid="help-tour"]')).not.toBeInTheDocument();
    });

    it('should render tour container when active', async () => {
      render(<HelpTour />);
      await waitFor(
        () => {
          expect(screen.getByTestId('help-tour')).toBeInTheDocument();
        },
        { timeout: 1000 },
      );
    });

    it('should display current step title', async () => {
      render(<HelpTour />);
      await waitFor(() => {
        expect(screen.getByText('Write Your Message')).toBeInTheDocument();
      });
    });

    it('should display current step description', async () => {
      render(<HelpTour />);
      await waitFor(() => {
        expect(
          screen.getByText('Type your message in the composer and send it to the AI'),
        ).toBeInTheDocument();
      });
    });

    it('should display progress indicator with current and total steps', async () => {
      render(<HelpTour />);
      await waitFor(() => {
        expect(screen.getByText(/Step 1 of 5/i)).toBeInTheDocument();
      });
    });

    it('should render step number badge', async () => {
      render(<HelpTour />);
      await waitFor(() => {
        const badge = screen.getByTestId('tour-step-badge');
        expect(badge).toHaveTextContent('1');
      });
    });
  });

  describe('Controls', () => {
    it('should render Skip button', async () => {
      render(<HelpTour />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /skip/i })).toBeInTheDocument();
      });
    });

    it('should render Previous button', async () => {
      mockUseHelpTour.mockReturnValue({
        ...mockTourState,
        hasPreviousStep: vi.fn(() => true),
      });

      render(<HelpTour />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /previous/i })).toBeInTheDocument();
      });
    });

    it('should disable Previous button when on first step', async () => {
      mockUseHelpTour.mockReturnValue({
        ...mockTourState,
        hasPreviousStep: vi.fn(() => false),
      });

      render(<HelpTour />);
      await waitFor(() => {
        const prevButton = screen.getByRole('button', { name: /previous/i });
        expect(prevButton).toBeDisabled();
      });
    });

    it('should render Next button when not on last step', async () => {
      mockUseHelpTour.mockReturnValue({
        ...mockTourState,
        hasNextStep: vi.fn(() => true),
      });

      render(<HelpTour />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
      });
    });

    it('should render Finish button on last step', async () => {
      mockUseHelpTour.mockReturnValue({
        ...mockTourState,
        hasNextStep: vi.fn(() => false),
      });

      render(<HelpTour />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /finish/i })).toBeInTheDocument();
      });
    });

    it('should call skipTour when Skip button clicked', async () => {
      const user = userEvent.setup();
      render(<HelpTour />);

      const skipButton = screen.getByRole('button', { name: /skip/i });
      await user.click(skipButton);

      expect(mockTourState.skipTour).toHaveBeenCalled();
    });

    it('should call nextStep when Next button clicked', async () => {
      const user = userEvent.setup();
      render(<HelpTour />);

      const nextButton = screen.getByRole('button', { name: /next/i });
      await user.click(nextButton);

      expect(mockTourState.nextStep).toHaveBeenCalled();
    });

    it('should call previousStep when Previous button clicked', async () => {
      const user = userEvent.setup();
      mockUseHelpTour.mockReturnValue({
        ...mockTourState,
        hasPreviousStep: vi.fn(() => true),
      });

      render(<HelpTour />);

      const prevButton = screen.getByRole('button', { name: /previous/i });
      await user.click(prevButton);

      expect(mockTourState.previousStep).toHaveBeenCalled();
    });

    it('should call finishTour when Finish button clicked', async () => {
      const user = userEvent.setup();
      mockUseHelpTour.mockReturnValue({
        ...mockTourState,
        hasNextStep: vi.fn(() => false),
      });

      render(<HelpTour />);

      const finishButton = screen.getByRole('button', { name: /finish/i });
      await user.click(finishButton);

      expect(mockTourState.finishTour).toHaveBeenCalled();
    });
  });

  describe('Element Highlighting', () => {
    it('should render highlight overlay for target element', async () => {
      render(<HelpTour />);
      await waitFor(() => {
        const highlight = screen.getByTestId('tour-highlight');
        expect(highlight).toBeInTheDocument();
      });
    });

    it('should position highlight based on target element position', async () => {
      render(<HelpTour />);
      await waitFor(() => {
        const highlight = screen.getByTestId('tour-highlight');

        expect(highlight).toHaveStyle({
          top: '100px',
          left: '100px',
          width: '400px',
          height: '60px',
        });
      });
    });

    it('should render tooltip near highlighted element', async () => {
      render(<HelpTour />);
      await waitFor(() => {
        expect(screen.getByTestId('tour-tooltip')).toBeInTheDocument();
      });
    });

    it('should apply correct CSS classes for visual styling', async () => {
      render(<HelpTour />);
      await waitFor(() => {
        const highlight = screen.getByTestId('tour-highlight');
        expect(highlight).toHaveClass('tour-highlight');
      });
    });
  });

  describe('Accessibility', () => {
    it('should have appropriate ARIA roles', async () => {
      render(<HelpTour />);
      await waitFor(() => {
        const tourContainer = screen.getByTestId('help-tour');
        expect(tourContainer).toHaveAttribute('role', 'dialog');
      });
    });

    it('should have aria-label on tour container', async () => {
      render(<HelpTour />);
      await waitFor(() => {
        const tourContainer = screen.getByTestId('help-tour');
        expect(tourContainer).toHaveAttribute('aria-label');
      });
    });

    it('should have accessible button labels', async () => {
      render(<HelpTour />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /skip/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
      });
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      render(<HelpTour />);

      await waitFor(() => {
        const skipButton = screen.getByRole('button', { name: /skip/i });
        skipButton.focus();
      });

      const skipButton = screen.getByRole('button', { name: /skip/i });
      await user.keyboard('{Enter}');
      expect(mockTourState.skipTour).toHaveBeenCalled();
    });

    it('should have proper heading hierarchy', async () => {
      render(<HelpTour />);
      await waitFor(() => {
        const title = screen.getByText('Write Your Message');
        expect(title.tagName).toMatch(/^H[1-6]$/);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing target element gracefully', async () => {
      mockUseHelpTour.mockReturnValue({
        ...mockTourState,
        getCurrentStep: vi.fn(() => ({
          id: 'unknown',
          title: 'Unknown Step',
          description: 'This is an unknown step',
          targetElementId: 'nonexistent-element',
          position: undefined as any,
        })),
      });

      const { container } = render(<HelpTour />);
      // Just verify it doesn't crash and backdrop exists
      await waitFor(() => {
        expect(container.querySelector('[data-testid="tour-backdrop"]')).toBeInTheDocument();
      });
    });

    it('should update when step changes', async () => {
      const { rerender } = render(<HelpTour />);

      await waitFor(() => {
        expect(screen.getByText('Write Your Message')).toBeInTheDocument();
      });

      mockUseHelpTour.mockReturnValue({
        ...mockTourState,
        currentStep: 1,
        getCurrentStep: vi.fn(() => ({
          id: 'model-selector',
          title: 'Choose Your AI Model',
          description: 'Select which AI model to use for your response',
          targetElementId: 'model-selector',
          position: { top: 50, left: 200, width: 300, height: 40 } as any,
        })),
      });

      rerender(<HelpTour />);

      await waitFor(() => {
        expect(screen.getByText('Choose Your AI Model')).toBeInTheDocument();
      });
    });

    it('should close when tour is skipped', async () => {
      const user = userEvent.setup();
      const { container, rerender } = render(<HelpTour />);

      await waitFor(() => {
        expect(screen.getByTestId('help-tour')).toBeInTheDocument();
      });

      const skipButton = screen.getByRole('button', { name: /skip/i });
      await user.click(skipButton);

      mockUseHelpTour.mockReturnValue({
        ...mockTourState,
        isActive: false,
      });

      rerender(<HelpTour />);

      expect(container.querySelector('[data-testid="help-tour"]')).not.toBeInTheDocument();
    });
  });
});
