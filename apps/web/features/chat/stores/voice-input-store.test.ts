/**
 * Tests for voice-input-store (Zustand store)
 *
 * Tests cover:
 * - Initial state shape
 * - Action: clearTranscript resets transcript
 * - Action: clearError resets error and mode
 * - Action: setLanguage persists language setting
 * - Action: setPreferServerTranscription persists preference
 * - startListening / stopListening Web Speech path (mocked)
 * - startListening / stopListening MediaRecorder path (mocked)
 * - Error handling for denied permission
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useVoiceInputStore } from './voice-input-store';

// ─── Mock SpeechRecognition ───────────────────────────────────────────────────

class MockSpeechRecognition {
  continuous = false;
  interimResults = false;
  lang = 'en-US';

  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  onstart: (() => void) | null = null;

  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();
}

// Module-level reference to the current mock instance — updated in beforeEach
let currentMockRecognition: MockSpeechRecognition;

// Must be a regular `function` (not arrow) so it can be used with `new`
function SpeechRecognitionCtor(this: MockSpeechRecognition) {
  // Return the pre-created instance so tests can control it
  return currentMockRecognition;
}

// ─── Mock MediaRecorder ───────────────────────────────────────────────────────

class MockMediaRecorder {
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;

  start = vi.fn((_timeslice?: number) => {
    // Emit one chunk immediately
    this.ondataavailable?.({ data: new Blob(['audio'], { type: 'audio/webm' }) });
  });
  stop = vi.fn(() => {
    this.onstop?.();
  });

  static isTypeSupported(_type: string): boolean {
    return true;
  }
}

let currentMockRecorder: MockMediaRecorder;

function MediaRecorderCtor(this: MockMediaRecorder) {
  return currentMockRecorder;
}
(MediaRecorderCtor as unknown as { isTypeSupported: (t: string) => boolean }).isTypeSupported =
  MockMediaRecorder.isTypeSupported;

// ─── Store reset helpers ──────────────────────────────────────────────────────

function resetStore() {
  useVoiceInputStore.setState({
    mode: 'idle',
    transcript: '',
    error: null,
    language: 'en-US',
    preferServerTranscription: false,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('voiceInputStore', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetStore();
  });

  // ── Initial state ──────────────────────────────────────────────────────────

  describe('initial state', () => {
    it('starts in idle mode', () => {
      expect(useVoiceInputStore.getState().mode).toBe('idle');
    });

    it('starts with empty transcript', () => {
      expect(useVoiceInputStore.getState().transcript).toBe('');
    });

    it('starts with no error', () => {
      expect(useVoiceInputStore.getState().error).toBeNull();
    });

    it('has a default language string', () => {
      const { language } = useVoiceInputStore.getState();
      expect(typeof language).toBe('string');
      expect(language.length).toBeGreaterThan(0);
    });

    it('defaults to not preferring server transcription', () => {
      expect(useVoiceInputStore.getState().preferServerTranscription).toBe(false);
    });
  });

  // ── clearTranscript ────────────────────────────────────────────────────────

  describe('clearTranscript', () => {
    it('resets the transcript to empty string', () => {
      useVoiceInputStore.setState({ transcript: 'hello world' });
      useVoiceInputStore.getState().clearTranscript();
      expect(useVoiceInputStore.getState().transcript).toBe('');
    });

    it('does not change mode', () => {
      useVoiceInputStore.setState({ mode: 'idle', transcript: 'text' });
      useVoiceInputStore.getState().clearTranscript();
      expect(useVoiceInputStore.getState().mode).toBe('idle');
    });
  });

  // ── clearError ─────────────────────────────────────────────────────────────

  describe('clearError', () => {
    it('resets error to null', () => {
      useVoiceInputStore.setState({ error: 'some error', mode: 'error' });
      useVoiceInputStore.getState().clearError();
      expect(useVoiceInputStore.getState().error).toBeNull();
    });

    it('resets mode to idle', () => {
      useVoiceInputStore.setState({ error: 'some error', mode: 'error' });
      useVoiceInputStore.getState().clearError();
      expect(useVoiceInputStore.getState().mode).toBe('idle');
    });
  });

  // ── setLanguage ────────────────────────────────────────────────────────────

  describe('setLanguage', () => {
    it('updates the language setting', () => {
      useVoiceInputStore.getState().setLanguage('fr-FR');
      expect(useVoiceInputStore.getState().language).toBe('fr-FR');
    });

    it('accepts any BCP-47 language tag', () => {
      useVoiceInputStore.getState().setLanguage('ja-JP');
      expect(useVoiceInputStore.getState().language).toBe('ja-JP');
    });
  });

  // ── setPreferServerTranscription ───────────────────────────────────────────

  describe('setPreferServerTranscription', () => {
    it('enables server transcription preference', () => {
      useVoiceInputStore.getState().setPreferServerTranscription(true);
      expect(useVoiceInputStore.getState().preferServerTranscription).toBe(true);
    });

    it('disables server transcription preference', () => {
      useVoiceInputStore.setState({ preferServerTranscription: true });
      useVoiceInputStore.getState().setPreferServerTranscription(false);
      expect(useVoiceInputStore.getState().preferServerTranscription).toBe(false);
    });
  });

  // ── startListening (Web Speech path) ──────────────────────────────────────

  describe('startListening — Web Speech API path', () => {
    beforeEach(() => {
      currentMockRecognition = new MockSpeechRecognition();
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
      useVoiceInputStore.setState({ mode: 'idle', preferServerTranscription: false });
    });

    afterEach(() => {
      Object.defineProperty(window, 'SpeechRecognition', {
        value: undefined,
        writable: true,
        configurable: true,
      });
    });

    it('transitions mode to listening', async () => {
      await useVoiceInputStore.getState().startListening();
      expect(useVoiceInputStore.getState().mode).toBe('listening');
    });

    it('clears previous error on start', async () => {
      useVoiceInputStore.setState({ error: 'previous error' });
      await useVoiceInputStore.getState().startListening();
      expect(useVoiceInputStore.getState().error).toBeNull();
    });

    it('clears previous transcript on start', async () => {
      useVoiceInputStore.setState({ transcript: 'old transcript' });
      await useVoiceInputStore.getState().startListening();
      expect(useVoiceInputStore.getState().transcript).toBe('');
    });

    it('calls recognition.start()', async () => {
      await useVoiceInputStore.getState().startListening();
      expect(currentMockRecognition.start).toHaveBeenCalledOnce();
    });

    it('sets language on the recognition instance', async () => {
      useVoiceInputStore.setState({ mode: 'idle', language: 'de-DE' });
      await useVoiceInputStore.getState().startListening();
      expect(currentMockRecognition.lang).toBe('de-DE');
    });

    it('does nothing if already in listening mode', async () => {
      useVoiceInputStore.setState({ mode: 'listening' });
      await useVoiceInputStore.getState().startListening();
      expect(currentMockRecognition.start).not.toHaveBeenCalled();
    });
  });

  // ── stopListening (Web Speech path) ───────────────────────────────────────

  describe('stopListening — mode guard', () => {
    it('returns immediately if not in listening mode', async () => {
      useVoiceInputStore.setState({ mode: 'idle' });
      await expect(useVoiceInputStore.getState().stopListening()).resolves.toBeUndefined();
      // Mode remains idle
      expect(useVoiceInputStore.getState().mode).toBe('idle');
    });
  });

  // ── startListening (MediaRecorder / server path) ───────────────────────────

  describe('startListening — MediaRecorder path', () => {
    let mockStream: MediaStream;

    beforeEach(() => {
      // No SpeechRecognition available → MediaRecorder path
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

      currentMockRecorder = new MockMediaRecorder();
      Object.defineProperty(window, 'MediaRecorder', {
        value: MediaRecorderCtor,
        writable: true,
        configurable: true,
      });

      mockStream = {
        getTracks: vi.fn().mockReturnValue([{ stop: vi.fn() }]),
      } as unknown as MediaStream;

      Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia: vi.fn().mockResolvedValue(mockStream) },
        writable: true,
        configurable: true,
      });

      useVoiceInputStore.setState({ mode: 'idle', preferServerTranscription: false });
    });

    afterEach(() => {
      Object.defineProperty(window, 'MediaRecorder', {
        value: undefined,
        writable: true,
        configurable: true,
      });
    });

    it('transitions mode to listening after getUserMedia resolves', async () => {
      await useVoiceInputStore.getState().startListening();
      expect(useVoiceInputStore.getState().mode).toBe('listening');
    });

    it('sets mode to error on NotAllowedError', async () => {
      const permissionError = new DOMException('Permission denied', 'NotAllowedError');
      Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia: vi.fn().mockRejectedValue(permissionError) },
        writable: true,
        configurable: true,
      });

      await useVoiceInputStore.getState().startListening();

      expect(useVoiceInputStore.getState().mode).toBe('error');
      expect(useVoiceInputStore.getState().error).toContain('denied');
    });

    it('sets mode to error on NotFoundError', async () => {
      const notFoundError = new DOMException('Device not found', 'NotFoundError');
      Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia: vi.fn().mockRejectedValue(notFoundError) },
        writable: true,
        configurable: true,
      });

      await useVoiceInputStore.getState().startListening();

      expect(useVoiceInputStore.getState().mode).toBe('error');
      expect(useVoiceInputStore.getState().error).toContain('microphone');
    });
  });

  // ── Error state management ─────────────────────────────────────────────────

  describe('error state management', () => {
    it('error mode persists until clearError is called', () => {
      useVoiceInputStore.setState({ mode: 'error', error: 'test error' });
      expect(useVoiceInputStore.getState().mode).toBe('error');
      useVoiceInputStore.getState().clearError();
      expect(useVoiceInputStore.getState().mode).toBe('idle');
      expect(useVoiceInputStore.getState().error).toBeNull();
    });
  });

  // ── State immutability ─────────────────────────────────────────────────────

  describe('state immutability', () => {
    it('language change produces updated state without mutating the previous snapshot', () => {
      const snapshot = { ...useVoiceInputStore.getState() };
      useVoiceInputStore.getState().setLanguage('ko-KR');
      expect(useVoiceInputStore.getState().language).toBe('ko-KR');
      // Previous snapshot language should not have changed
      expect(snapshot.language).toBe('en-US');
    });
  });
});
