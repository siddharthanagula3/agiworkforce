import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PastedBadge, isPastedMessage } from '../MessageBubble/PastedBadge';

describe('PastedBadge', () => {
  it('renders the Pasted label', () => {
    render(<PastedBadge />);
    expect(screen.getByText('Pasted')).toBeInTheDocument();
  });

  it('has the expected test id', () => {
    render(<PastedBadge />);
    expect(screen.getByTestId('pasted-badge')).toBeInTheDocument();
  });

  it('matches snapshot', () => {
    const { container } = render(<PastedBadge />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('isPastedMessage', () => {
  it('returns false for undefined metadata', () => {
    expect(isPastedMessage(undefined)).toBe(false);
  });

  it('returns false for null metadata', () => {
    expect(isPastedMessage(null)).toBe(false);
  });

  it('returns false when neither pasted flag is set', () => {
    expect(isPastedMessage({ role: 'user' })).toBe(false);
  });

  it('returns true when metadata.pasted is true', () => {
    expect(isPastedMessage({ pasted: true })).toBe(true);
  });

  it('returns true when metadata.pastedFromClipboard is true', () => {
    expect(isPastedMessage({ pastedFromClipboard: true })).toBe(true);
  });

  it('returns false when pasted is a falsy non-boolean', () => {
    expect(isPastedMessage({ pasted: 0 })).toBe(false);
  });
});
