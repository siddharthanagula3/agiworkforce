import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormField } from '../FormField';

describe('FormField', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render with label', () => {
      render(<FormField id="test" label="Test Label" />);

      expect(screen.getByLabelText('Test Label')).toBeInTheDocument();
    });

    it('should render required indicator', () => {
      render(<FormField id="test" label="Test Label" required />);

      expect(screen.getByText('*')).toBeInTheDocument();
    });

    it('should render description text', () => {
      render(<FormField id="test" label="Test Label" description="This is a description" />);

      expect(screen.getByText('This is a description')).toBeInTheDocument();
    });

    it('should render hint text', () => {
      render(<FormField id="test" label="Test Label" hint="This is a hint" />);

      expect(screen.getByText('This is a hint')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should display error message', () => {
      render(<FormField id="test" label="Test Label" error="This field is required" />);

      expect(screen.getByText('This field is required')).toBeInTheDocument();
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('should apply error styling to input', () => {
      render(<FormField id="test" label="Test Label" error="Error message" />);

      const input = screen.getByLabelText('Test Label');
      expect(input).toHaveAttribute('aria-invalid', 'true');
    });

    it('should hide hint when error is displayed', () => {
      render(
        <FormField id="test" label="Test Label" hint="This is a hint" error="Error message" />,
      );

      expect(screen.queryByText('This is a hint')).not.toBeInTheDocument();
      expect(screen.getByText('Error message')).toBeInTheDocument();
    });
  });

  describe('Success State', () => {
    it('should display success message', () => {
      render(
        <FormField id="test" label="Test Label" success="Looking good!" value="valid value" />,
      );

      // Trigger blur to mark as touched
      const input = screen.getByLabelText('Test Label');
      fireEvent.blur(input);

      expect(screen.getByText('Looking good!')).toBeInTheDocument();
    });
  });

  describe('Validation', () => {
    it('should run validation on blur', async () => {
      const validate = vi.fn((value: string) => {
        if (!value) return 'Required';
        return undefined;
      });

      render(<FormField id="test" label="Test Label" validate={validate} />);

      const input = screen.getByLabelText('Test Label');
      fireEvent.blur(input);

      await waitFor(() => {
        expect(validate).toHaveBeenCalled();
      });
    });

    it('should show validation error after blur', async () => {
      const validate = (value: string) => {
        if (!value.includes('@')) return 'Invalid email';
        return undefined;
      };

      render(<FormField id="email" label="Email" validate={validate} />);

      const input = screen.getByLabelText('Email');
      await userEvent.type(input, 'invalid');
      fireEvent.blur(input);

      await waitFor(() => {
        expect(screen.getByText('Invalid email')).toBeInTheDocument();
      });
    });

    it('should debounce validation during typing', async () => {
      const validate = vi.fn((value: string) => {
        if (value.length < 3) return 'Too short';
        return undefined;
      });

      render(<FormField id="test" label="Test Label" validate={validate} validateDebounce={100} />);

      const input = screen.getByLabelText('Test Label');

      // Trigger blur to mark as touched
      fireEvent.blur(input);

      // Type quickly
      await userEvent.type(input, 'abc');

      // Wait for debounce
      await waitFor(
        () => {
          expect(validate).toHaveBeenCalled();
        },
        { timeout: 500 },
      );
    });
  });

  describe('Accessibility', () => {
    it('should have proper aria-describedby', () => {
      render(
        <FormField
          id="test"
          label="Test Label"
          description="Description text"
          error="Error text"
        />,
      );

      const input = screen.getByLabelText('Test Label');
      expect(input).toHaveAttribute('aria-describedby');
      expect(input.getAttribute('aria-describedby')).toContain('test-description');
      expect(input.getAttribute('aria-describedby')).toContain('test-error');
    });

    it('should have aria-required when required', () => {
      render(<FormField id="test" label="Test Label" required />);

      // Use the input role since the label text includes the asterisk
      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('aria-required', 'true');
    });

    it('should announce errors to screen readers', () => {
      render(<FormField id="test" label="Test Label" error="Error message" />);

      const errorElement = screen.getByRole('alert');
      expect(errorElement).toHaveAttribute('aria-live', 'polite');
    });
  });
});
