/**
 * SendButton Tests
 *
 * Covers all 3 states: send, stop, queue.
 * Validates colors, icons, aria-labels, disabled logic, and click handlers.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SendButton } from './SendButton';

// ── helpers ──────────────────────────────────────────────────────────────────

function renderButton(props: Parameters<typeof SendButton>[0]) {
  return render(<SendButton {...props} />);
}

// ── Send state ────────────────────────────────────────────────────────────────

describe('SendButton — send mode', () => {
  it('renders the ArrowUp icon', () => {
    renderButton({ mode: 'send', onClick: vi.fn() });
    // lucide renders SVG; check aria-label
    expect(screen.getByRole('button', { name: 'Send message' })).toBeInTheDocument();
  });

  it('is disabled when hasContent is false', () => {
    renderButton({ mode: 'send', hasContent: false, onClick: vi.fn() });
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('is enabled when hasContent is true and not disabled', () => {
    renderButton({ mode: 'send', hasContent: true, onClick: vi.fn() });
    expect(screen.getByRole('button')).not.toBeDisabled();
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    renderButton({ mode: 'send', hasContent: true, onClick });
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled when external disabled prop is true', () => {
    renderButton({ mode: 'send', hasContent: true, disabled: true, onClick: vi.fn() });
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('shows spinner and is disabled while isSending', () => {
    renderButton({ mode: 'send', hasContent: true, isSending: true, onClick: vi.fn() });
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-label', 'Sending message…');
  });

  it('applies terra-cotta bg class when has content and not disabled', () => {
    const { container } = renderButton({ mode: 'send', hasContent: true, onClick: vi.fn() });
    const btn = container.querySelector('button');
    expect(btn?.className).toContain('bg-terra-cotta-500');
  });

  it('applies muted bg class when no content', () => {
    const { container } = renderButton({ mode: 'send', hasContent: false, onClick: vi.fn() });
    const btn = container.querySelector('button');
    expect(btn?.className).toContain('bg-muted');
  });

  it('does not call onClick when button is disabled', () => {
    const onClick = vi.fn();
    renderButton({ mode: 'send', hasContent: false, onClick });
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });
});

// ── Stop state ────────────────────────────────────────────────────────────────

describe('SendButton — stop mode', () => {
  it('renders with stop aria-label', () => {
    renderButton({ mode: 'stop', onClick: vi.fn() });
    expect(screen.getByRole('button', { name: 'Stop the current response' })).toBeInTheDocument();
  });

  it('is always enabled regardless of hasContent', () => {
    renderButton({ mode: 'stop', hasContent: false, onClick: vi.fn() });
    expect(screen.getByRole('button')).not.toBeDisabled();
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    renderButton({ mode: 'stop', onClick });
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('applies red-500 background class', () => {
    const { container } = renderButton({ mode: 'stop', onClick: vi.fn() });
    const btn = container.querySelector('button');
    expect(btn?.className).toContain('bg-red-500');
  });

  it('applies red shadow', () => {
    const { container } = renderButton({ mode: 'stop', onClick: vi.fn() });
    const btn = container.querySelector('button');
    expect(btn?.className).toContain('shadow-red-500/25');
  });

  it('has title "Stop generation"', () => {
    renderButton({ mode: 'stop', onClick: vi.fn() });
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('title', 'Stop generation');
  });
});

// ── Queue state ───────────────────────────────────────────────────────────────

describe('SendButton — queue mode', () => {
  it('renders with queue aria-label', () => {
    renderButton({ mode: 'queue', onClick: vi.fn() });
    expect(screen.getByRole('button', { name: 'Add message to queue' })).toBeInTheDocument();
  });

  it('is enabled when not externally disabled', () => {
    renderButton({ mode: 'queue', onClick: vi.fn() });
    expect(screen.getByRole('button')).not.toBeDisabled();
  });

  it('is disabled when external disabled prop is true', () => {
    renderButton({ mode: 'queue', disabled: true, onClick: vi.fn() });
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    renderButton({ mode: 'queue', onClick });
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('applies amber-500 background class', () => {
    const { container } = renderButton({ mode: 'queue', onClick: vi.fn() });
    const btn = container.querySelector('button');
    expect(btn?.className).toContain('bg-amber-500');
  });

  it('has the queue title', () => {
    renderButton({ mode: 'queue', onClick: vi.fn() });
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute(
      'title',
      'Queue message — will send after current response finishes',
    );
  });
});

// ── type="button" on all states ───────────────────────────────────────────────

describe('SendButton — button type', () => {
  it.each(['send', 'stop', 'queue'] as const)(
    'renders type="button" in %s mode to prevent accidental form submission',
    (mode) => {
      const { container } = renderButton({ mode, hasContent: true, onClick: vi.fn() });
      const btn = container.querySelector('button');
      expect(btn).toHaveAttribute('type', 'button');
    },
  );
});
