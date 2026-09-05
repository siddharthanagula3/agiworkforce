import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VoiceInputButton } from './VoiceInputButton';

function setMediaDevices(value: unknown) {
  Object.defineProperty(navigator, 'mediaDevices', {
    value,
    writable: true,
    configurable: true,
  });
}

describe('VoiceInputButton · dictation trigger', () => {
  beforeEach(() => {
    setMediaDevices({ getUserMedia: vi.fn() });
  });

  afterEach(() => {
    setMediaDevices(undefined);
  });

  it('opens dictation on click', () => {
    const onStart = vi.fn();
    render(<VoiceInputButton onStart={onStart} />);

    fireEvent.click(screen.getByRole('button', { name: 'Start voice input' }));

    expect(onStart).toHaveBeenCalledOnce();
  });

  it('reports the dictation bar as pressed while it is open', () => {
    render(<VoiceInputButton onStart={vi.fn()} active />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  });

  it('does not open dictation while the composer is disabled', () => {
    const onStart = vi.fn();
    render(<VoiceInputButton onStart={onStart} disabled />);

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onStart).not.toHaveBeenCalled();
  });

  it('explains itself instead of opening when capture is unsupported', () => {
    setMediaDevices(undefined);
    const onStart = vi.fn();
    render(<VoiceInputButton onStart={onStart} />);

    const button = screen.getByRole('button', {
      name: 'Voice input not supported in this browser',
    });
    fireEvent.click(button);

    expect(onStart).not.toHaveBeenCalled();
    expect(screen.getByRole('tooltip')).toHaveTextContent('not supported in this browser');
  });
});
