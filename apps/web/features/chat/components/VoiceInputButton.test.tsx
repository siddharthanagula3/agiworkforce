/**
 * Tests for VoiceInputButton component
 *
 * Tests cover:
 * - Renders mic button in idle state
 * - Shows listening state visual when recognition starts
 * - Calls onTranscript with the final transcript text
 * - Shows tooltip / error message when browser is unsupported
 * - Respects disabled prop
 * - Cleans up SpeechRecognition on unmount
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { VoiceInputButton } from './VoiceInputButton';

// ─── SpeechRecognition mock ────────────────────────────────────────────────────

interface SpeechResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string; confidence: number } }>;
}

interface SpeechErrorEvent {
  error: string;
}

class MockSpeechRecognition {
  continuous = false;
  interimResults = false;
  lang = 'en-US';

  onresult: ((e: SpeechResultEvent) => void) | null = null;
  onerror: ((e: SpeechErrorEvent) => void) | null = null;
  onend: (() => void) | null = null;
  onstart: (() => void) | null = null;

  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();

  /** Helper: simulate a successful result */
  triggerResult(transcript: string) {
    this.onresult?.({
      resultIndex: 0,
      results: [
        Object.assign([{ transcript, confidence: 0.95 }], { isFinal: true }),
      ] as unknown as ArrayLike<{
        isFinal: boolean;
        0: { transcript: string; confidence: number };
      }>,
    });
  }

  /** Helper: simulate an error */
  triggerError(errorCode: string) {
    this.onerror?.({ error: errorCode });
  }

  /** Helper: simulate recognition ending */
  triggerEnd() {
    this.onend?.();
  }

  /** Helper: simulate recognition starting */
  triggerStart() {
    this.onstart?.();
  }
}

// Module-level instance updated in beforeEach
let recognition: MockSpeechRecognition;

// Regular function constructor (NOT arrow function) — required for `new`
function SpeechRecognitionCtor(this: MockSpeechRecognition) {
  return recognition;
}

function installSpeechRecognition() {
  recognition = new MockSpeechRecognition();
  Object.defineProperty(window, 'SpeechRecognition', {
    value: SpeechRecognitionCtor,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(window, 'webkitSpeechRecognition', {
    value: undefined,
    writable: true,
    configurable: true,
  });
}

function uninstallSpeechRecognition() {
  Object.defineProperty(window, 'SpeechRecognition', {
    value: undefined,
    writable: true,
    configurable: true,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('VoiceInputButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Supported browser ──────────────────────────────────────────────────────

  describe('when SpeechRecognition is supported', () => {
    beforeEach(installSpeechRecognition);
    afterEach(uninstallSpeechRecognition);

    it('renders a button with an accessible label', () => {
      render(<VoiceInputButton onTranscript={vi.fn()} />);
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
      expect(button).toHaveAttribute('aria-label');
    });

    it('button is not in pressed state initially', () => {
      render(<VoiceInputButton onTranscript={vi.fn()} />);
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-pressed', 'false');
    });

    it('calls recognition.start() when clicked', () => {
      render(<VoiceInputButton onTranscript={vi.fn()} />);
      fireEvent.click(screen.getByRole('button'));
      expect(recognition.start).toHaveBeenCalledOnce();
    });

    it('transitions to listening state after onstart fires', () => {
      render(<VoiceInputButton onTranscript={vi.fn()} />);
      fireEvent.click(screen.getByRole('button'));
      act(() => recognition.triggerStart());
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-pressed', 'true');
      expect(button).toHaveAttribute('aria-label', 'Stop listening');
    });

    it('calls onTranscript with the recognized text', () => {
      const onTranscript = vi.fn();
      render(<VoiceInputButton onTranscript={onTranscript} />);
      fireEvent.click(screen.getByRole('button'));
      act(() => recognition.triggerStart());
      act(() => recognition.triggerResult('hello world'));
      expect(onTranscript).toHaveBeenCalledWith('hello world');
    });

    it('trims whitespace before calling onTranscript', () => {
      const onTranscript = vi.fn();
      render(<VoiceInputButton onTranscript={onTranscript} />);
      fireEvent.click(screen.getByRole('button'));
      act(() => recognition.triggerStart());
      act(() => recognition.triggerResult('  padded  '));
      expect(onTranscript).toHaveBeenCalledWith('padded');
    });

    it('does not call onTranscript for blank transcript', () => {
      const onTranscript = vi.fn();
      render(<VoiceInputButton onTranscript={onTranscript} />);
      fireEvent.click(screen.getByRole('button'));
      act(() => recognition.triggerStart());
      act(() => recognition.triggerResult('   '));
      expect(onTranscript).not.toHaveBeenCalled();
    });

    it('calls recognition.stop() when clicked while listening', () => {
      render(<VoiceInputButton onTranscript={vi.fn()} />);
      const button = screen.getByRole('button');
      // Start
      fireEvent.click(button);
      act(() => recognition.triggerStart());
      // Stop
      fireEvent.click(button);
      expect(recognition.stop).toHaveBeenCalledOnce();
    });

    it('shows error tooltip on not-allowed permission error', () => {
      render(<VoiceInputButton onTranscript={vi.fn()} />);
      fireEvent.click(screen.getByRole('button'));
      act(() => recognition.triggerStart());
      act(() => recognition.triggerError('not-allowed'));
      expect(screen.getByRole('tooltip')).toBeInTheDocument();
    });

    it('shows error tooltip on no-speech error', () => {
      render(<VoiceInputButton onTranscript={vi.fn()} />);
      fireEvent.click(screen.getByRole('button'));
      act(() => recognition.triggerStart());
      act(() => recognition.triggerError('no-speech'));
      expect(screen.getByRole('tooltip')).toBeInTheDocument();
    });

    it('calls recognition.abort() on unmount', () => {
      const { unmount } = render(<VoiceInputButton onTranscript={vi.fn()} />);
      fireEvent.click(screen.getByRole('button'));
      act(() => recognition.triggerStart());
      unmount();
      expect(recognition.abort).toHaveBeenCalled();
    });
  });

  // ── Disabled prop ──────────────────────────────────────────────────────────

  describe('disabled prop', () => {
    beforeEach(installSpeechRecognition);
    afterEach(uninstallSpeechRecognition);

    it('renders the button as disabled', () => {
      render(<VoiceInputButton onTranscript={vi.fn()} disabled />);
      expect(screen.getByRole('button')).toBeDisabled();
    });
  });

  // ── className prop ─────────────────────────────────────────────────────────

  describe('className prop', () => {
    beforeEach(installSpeechRecognition);
    afterEach(uninstallSpeechRecognition);

    it('applies additional className to the button', () => {
      render(<VoiceInputButton onTranscript={vi.fn()} className="extra-class" />);
      expect(screen.getByRole('button').className).toContain('extra-class');
    });
  });

  // ── Unsupported browser ────────────────────────────────────────────────────

  describe('when SpeechRecognition is unsupported', () => {
    beforeEach(() => {
      Object.defineProperty(window, 'SpeechRecognition', {
        value: undefined,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(window, 'webkitSpeechRecognition', {
        value: undefined,
        writable: true,
        configurable: true,
      });
    });

    it('renders a button with "not supported" in the aria-label', () => {
      render(<VoiceInputButton onTranscript={vi.fn()} />);
      const button = screen.getByRole('button');
      expect(button.getAttribute('aria-label')).toMatch(/not supported/i);
    });

    it('shows tooltip on click when unsupported', () => {
      render(<VoiceInputButton onTranscript={vi.fn()} />);
      fireEvent.click(screen.getByRole('button'));
      expect(screen.getByRole('tooltip')).toBeInTheDocument();
    });

    it('tooltip suggests a supported browser', () => {
      render(<VoiceInputButton onTranscript={vi.fn()} />);
      fireEvent.click(screen.getByRole('button'));
      const tooltip = screen.getByRole('tooltip');
      expect(tooltip.textContent).toMatch(/chrome|edge|browser/i);
    });

    it('shows tooltip on mouseenter', () => {
      render(<VoiceInputButton onTranscript={vi.fn()} />);
      fireEvent.mouseEnter(screen.getByRole('button'));
      expect(screen.getByRole('tooltip')).toBeInTheDocument();
    });

    it('hides tooltip on mouseleave', () => {
      render(<VoiceInputButton onTranscript={vi.fn()} />);
      const button = screen.getByRole('button');
      fireEvent.mouseEnter(button);
      fireEvent.mouseLeave(button);
      expect(screen.queryByRole('tooltip')).toBeNull();
    });
  });
});
