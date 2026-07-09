import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Textarea } from '../Textarea';

describe('Textarea', () => {
  it('has no error state by default', () => {
    render(<Textarea aria-label="Bio" />);
    const el = screen.getByLabelText('Bio');
    expect(el.getAttribute('aria-invalid')).toBeNull();
    expect(el.className).not.toContain('border-destructive');
  });

  it('sets aria-invalid and destructive styling when hasError is set', () => {
    render(<Textarea aria-label="Bio" hasError />);
    const el = screen.getByLabelText('Bio');
    expect(el.getAttribute('aria-invalid')).toBe('true');
    expect(el.className).toContain('border-destructive');
  });

  it('merges errorMessageId into aria-describedby', () => {
    render(<Textarea aria-label="Bio" hasError errorMessageId="bio-error" />);
    expect(screen.getByLabelText('Bio').getAttribute('aria-describedby')).toBe('bio-error');
  });
});
