import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Input } from '../Input';

describe('Input', () => {
  it('has no error state by default', () => {
    render(<Input aria-label="Email" />);
    const input = screen.getByLabelText('Email');
    expect(input.getAttribute('aria-invalid')).toBeNull();
    expect(input.className).not.toContain('border-destructive');
  });

  it('sets aria-invalid and destructive styling when hasError is set', () => {
    render(<Input aria-label="Email" hasError />);
    const input = screen.getByLabelText('Email');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.className).toContain('border-destructive');
  });

  it('merges errorMessageId into aria-describedby alongside an existing value', () => {
    render(
      <Input aria-label="Email" hasError errorMessageId="email-error" aria-describedby="hint" />,
    );
    expect(screen.getByLabelText('Email').getAttribute('aria-describedby')).toBe(
      'hint email-error',
    );
  });
});
