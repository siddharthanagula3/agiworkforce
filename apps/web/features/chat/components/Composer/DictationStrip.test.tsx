import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DictationStrip } from './DictationStrip';
import { createWaveform, DICTATION_STATUS } from '@features/chat/lib/dictation-machine';

const WAVEFORM = createWaveform(8);

function handlers() {
  return {
    onCancel: vi.fn(),
    onStop: vi.fn(),
    onSend: vi.fn(),
    onRetry: vi.fn(),
  };
}

function renderRecording(overrides: Partial<Parameters<typeof DictationStrip>[0]> = {}) {
  const spies = handlers();
  render(
    <DictationStrip
      status={DICTATION_STATUS.recording}
      bars={WAVEFORM.bars}
      error={null}
      reducedMotion={false}
      {...spies}
      {...overrides}
    />,
  );
  return spies;
}

describe('DictationStrip · recording', () => {
  it('offers cancel, stop and send in the bar', () => {
    renderRecording();
    expect(screen.getByRole('button', { name: 'Discard recording' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Stop recording and edit the transcript' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send message' })).toBeInTheDocument();
  });

  it('draws one bar per waveform sample', () => {
    renderRecording();
    const strip = screen.getByTestId('dictation-strip');
    expect(strip.querySelectorAll('span[style*="height"]')).toHaveLength(WAVEFORM.bars.length);
  });

  it('discards the recording on cancel', () => {
    const spies = renderRecording();
    fireEvent.click(screen.getByRole('button', { name: 'Discard recording' }));
    expect(spies.onCancel).toHaveBeenCalledOnce();
  });

  it('ends capture for editing on stop', () => {
    const spies = renderRecording();
    fireEvent.click(screen.getByRole('button', { name: 'Stop recording and edit the transcript' }));
    expect(spies.onStop).toHaveBeenCalledOnce();
  });

  it('transcribes and sends in one step on send', () => {
    const spies = renderRecording();
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(spies.onSend).toHaveBeenCalledOnce();
  });

  it('takes focus so the keyboard reaches it without a click', () => {
    renderRecording();
    expect(document.activeElement).toBe(screen.getByTestId('dictation-strip'));
  });

  it('cancels on Escape', () => {
    const spies = renderRecording();
    fireEvent.keyDown(screen.getByTestId('dictation-strip'), { key: 'Escape' });
    expect(spies.onCancel).toHaveBeenCalledOnce();
  });

  it('sends on Enter', () => {
    const spies = renderRecording();
    fireEvent.keyDown(screen.getByTestId('dictation-strip'), { key: 'Enter' });
    expect(spies.onSend).toHaveBeenCalledOnce();
  });

  it('leaves Space alone', () => {
    const spies = renderRecording();
    fireEvent.keyDown(screen.getByTestId('dictation-strip'), { key: ' ' });
    expect(spies.onCancel).not.toHaveBeenCalled();
    expect(spies.onSend).not.toHaveBeenCalled();
    expect(spies.onStop).not.toHaveBeenCalled();
  });

  it('renders one static level bar under reduced motion', () => {
    renderRecording({ reducedMotion: true });
    const strip = screen.getByTestId('dictation-strip');
    expect(strip.querySelectorAll('span[style*="height"]')).toHaveLength(0);
  });
});

describe('DictationStrip · transcribing', () => {
  it('replaces the waveform with progress and disables the controls', () => {
    const spies = handlers();
    render(
      <DictationStrip
        status={DICTATION_STATUS.transcribing}
        bars={WAVEFORM.bars}
        error={null}
        reducedMotion={false}
        {...spies}
      />,
    );

    expect(screen.getByRole('progressbar', { name: 'Transcribing' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Stop recording and edit the transcript' }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();

    fireEvent.keyDown(screen.getByTestId('dictation-strip'), { key: 'Enter' });
    expect(spies.onSend).not.toHaveBeenCalled();
  });
});

describe('DictationStrip · error', () => {
  const MESSAGE = 'Microphone permission denied.';

  it('shows the failure inline with a retry instead of a toast', () => {
    const spies = handlers();
    render(
      <DictationStrip
        status={DICTATION_STATUS.error}
        bars={WAVEFORM.bars}
        error={MESSAGE}
        reducedMotion={false}
        {...spies}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(MESSAGE);
    expect(screen.queryByRole('button', { name: 'Send message' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(spies.onRetry).toHaveBeenCalledOnce();
  });

  it('dismisses the failure from the same left control', () => {
    const spies = handlers();
    render(
      <DictationStrip
        status={DICTATION_STATUS.error}
        bars={WAVEFORM.bars}
        error={MESSAGE}
        reducedMotion={false}
        {...spies}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss voice input error' }));
    expect(spies.onCancel).toHaveBeenCalledOnce();
  });
});
