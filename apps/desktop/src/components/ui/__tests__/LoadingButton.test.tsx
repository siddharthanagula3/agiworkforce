import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LoadingButton } from '../LoadingButton';

describe('LoadingButton', () => {
  describe('Rendering', () => {
    it('should render children when not loading', () => {
      render(<LoadingButton>Click me</LoadingButton>);

      expect(screen.getByText('Click me')).toBeInTheDocument();
    });

    it('should show loading spinner when loading', () => {
      render(<LoadingButton loading>Click me</LoadingButton>);

      expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
    });

    it('should show loading text when loading', () => {
      render(
        <LoadingButton loading loadingText="Saving...">
          Save
        </LoadingButton>,
      );

      // The loading text appears both visually and in the sr-only span
      expect(screen.getAllByText('Saving...')).toHaveLength(2);
    });

    it('should keep children visible when loading without loadingText', () => {
      render(<LoadingButton loading>Click me</LoadingButton>);

      expect(screen.getByText('Click me')).toBeInTheDocument();
    });
  });

  describe('Interaction', () => {
    it('should be disabled when loading', () => {
      const onClick = vi.fn();
      render(
        <LoadingButton loading onClick={onClick}>
          Click me
        </LoadingButton>,
      );

      const button = screen.getByRole('button');
      expect(button).toBeDisabled();

      fireEvent.click(button);
      expect(onClick).not.toHaveBeenCalled();
    });

    it('should be clickable when not loading', () => {
      const onClick = vi.fn();
      render(<LoadingButton onClick={onClick}>Click me</LoadingButton>);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('should respect disabled prop', () => {
      render(<LoadingButton disabled>Click me</LoadingButton>);

      expect(screen.getByRole('button')).toBeDisabled();
    });
  });

  describe('Accessibility', () => {
    it('should announce loading state to screen readers', () => {
      render(<LoadingButton loading>Click me</LoadingButton>);

      expect(screen.getByText('Loading, please wait')).toBeInTheDocument();
    });

    it('should announce custom loading text to screen readers', () => {
      render(
        <LoadingButton loading loadingText="Processing your request">
          Submit
        </LoadingButton>,
      );

      // The sr-only span should contain the loading text for screen readers
      const srOnlyElements = screen.getAllByText('Processing your request');
      const srOnlySpan = srOnlyElements.find((el) => el.classList.contains('sr-only'));
      expect(srOnlySpan).toBeInTheDocument();
      expect(srOnlySpan).toHaveAttribute('aria-live', 'polite');
    });

    it('should have aria-busy attribute when loading', () => {
      render(<LoadingButton loading>Click me</LoadingButton>);

      expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
    });

    it('should have aria-disabled attribute when loading', () => {
      render(<LoadingButton loading>Click me</LoadingButton>);

      expect(screen.getByRole('button')).toHaveAttribute('aria-disabled', 'true');
    });
  });

  describe('Spinner Position', () => {
    it('should position spinner on left by default', () => {
      const { container } = render(<LoadingButton loading>Click me</LoadingButton>);

      // Check that the button content structure has spinner before text
      const button = container.querySelector('button');
      const children = button?.children;
      expect(children?.[0]?.tagName.toLowerCase()).toBe('svg'); // Spinner
    });

    it('should position spinner on right when specified', () => {
      const { container } = render(
        <LoadingButton loading spinnerPosition="right">
          Click me
        </LoadingButton>,
      );

      const button = container.querySelector('button');
      const children = button?.children;
      // Last visible element should be spinner (before sr-only span)
      expect(children?.[1]?.tagName.toLowerCase()).toBe('svg'); // Spinner
    });
  });
});
