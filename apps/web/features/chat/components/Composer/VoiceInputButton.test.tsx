import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { VoiceInputButton } from './VoiceInputButton';
import { useVoiceInputStore } from '@features/chat/stores/voice-input-store';

class MockMediaRecorder {
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn(() => {
    this.onstop?.();
  });

  static isTypeSupported(_type: string): boolean {
    return true;
  }
}

function resetStore() {
  useVoiceInputStore.setState({
    mode: 'idle',
    transcript: '',
    error: null,
    language: 'en-US',
    preferServerTranscription: false,
  });
}

describe('VoiceInputButton (Composer) · error recovery', () => {
  let getUserMedia: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetStore();
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
    Object.defineProperty(window, 'MediaRecorder', {
      value: MockMediaRecorder,
      writable: true,
      configurable: true,
    });
    getUserMedia = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    resetStore();
    Object.defineProperty(window, 'MediaRecorder', {
      value: undefined,
      writable: true,
      configurable: true,
    });
  });

  it('recovers from error mode on click instead of staying stuck', async () => {
    getUserMedia.mockRejectedValueOnce(new DOMException('Permission denied', 'NotAllowedError'));
    const mockStream = {
      getTracks: () => [{ stop: vi.fn() }],
    } as unknown as MediaStream;
    getUserMedia.mockResolvedValueOnce(mockStream);

    render(<VoiceInputButton onTranscript={vi.fn()} />);
    const button = screen.getByRole('button');

    fireEvent.click(button);
    await waitFor(() => expect(useVoiceInputStore.getState().mode).toBe('error'));
    expect(getUserMedia).toHaveBeenCalledTimes(1);

    fireEvent.click(button);
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(useVoiceInputStore.getState().mode).toBe('listening'));
    expect(useVoiceInputStore.getState().error).toBeNull();
  });

  it('does not retry while listening (click stops instead)', async () => {
    const mockStream = {
      getTracks: () => [{ stop: vi.fn() }],
    } as unknown as MediaStream;
    getUserMedia.mockResolvedValue(mockStream);

    render(<VoiceInputButton onTranscript={vi.fn()} />);
    const button = screen.getByRole('button');

    fireEvent.click(button);
    await waitFor(() => expect(useVoiceInputStore.getState().mode).toBe('listening'));

    fireEvent.click(button);
    await waitFor(() => expect(useVoiceInputStore.getState().mode).toBe('idle'));
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });
});
