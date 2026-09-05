import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { canonicalVoiceModel } = vi.hoisted(() => ({
  canonicalVoiceModel: 'catalog-voice-transcription-model',
}));

vi.mock('@agiworkforce/types', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@agiworkforce/types')>()),
  getRoutingSlotModel: () => canonicalVoiceModel,
}));

import { useVoiceInputStore, _resetRuntimeRefs } from './voice-input-store';
import { clearCsrfToken } from '@/lib/client/csrf';

const CSRF_ENDPOINT = '/api/csrf';
const CSRF_TOKEN = 'csrf-token-fixture';
const TRANSCRIBE_ENDPOINT = '/api/voice/transcribe';

function stubFetch(transcribe: () => unknown) {
  const mock = vi.fn(async (url: string) => {
    if (url === CSRF_ENDPOINT) {
      return { ok: true, json: async () => ({ token: CSRF_TOKEN, expiresIn: 3_600_000 }) };
    }
    return transcribe();
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

function transcribeCall(mock: ReturnType<typeof stubFetch>) {
  const call = mock.mock.calls.find(([url]) => url === TRANSCRIBE_ENDPOINT);
  if (!call) throw new Error('the transcription endpoint was never called');
  return call as unknown as [string, RequestInit | undefined];
}

class MockMediaRecorder {
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;

  start = vi.fn((_timeslice?: number) => {
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

function resetStore() {
  useVoiceInputStore.setState({
    mode: 'idle',
    transcript: '',
    error: null,
    language: 'en-US',
    captureStream: null,
  });
}

function defineWindowValue(key: string, value: unknown) {
  Object.defineProperty(window, key, { value, writable: true, configurable: true });
}

function installCapture(): { stream: MediaStream; stop: ReturnType<typeof vi.fn> } {
  _resetRuntimeRefs();
  currentMockRecorder = new MockMediaRecorder();
  defineWindowValue('MediaRecorder', MediaRecorderCtor);

  const stop = vi.fn();
  const stream = { getTracks: vi.fn().mockReturnValue([{ stop }]) } as unknown as MediaStream;

  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    writable: true,
    configurable: true,
  });

  return { stream, stop };
}

function installFailingCapture(error: DOMException) {
  _resetRuntimeRefs();
  currentMockRecorder = new MockMediaRecorder();
  defineWindowValue('MediaRecorder', MediaRecorderCtor);
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn().mockRejectedValue(error) },
    writable: true,
    configurable: true,
  });
}

describe('voiceInputStore', () => {
  beforeEach(() => {
    resetStore();
    clearCsrfToken();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetStore();
    defineWindowValue('MediaRecorder', undefined);
    vi.unstubAllGlobals();
  });

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

    it('starts with no capture stream', () => {
      expect(useVoiceInputStore.getState().captureStream).toBeNull();
    });

    it('has a default language string', () => {
      const { language } = useVoiceInputStore.getState();
      expect(typeof language).toBe('string');
      expect(language.length).toBeGreaterThan(0);
    });
  });

  describe('clearTranscript', () => {
    it('resets the transcript to empty string', () => {
      useVoiceInputStore.setState({ transcript: 'hello world' });
      useVoiceInputStore.getState().clearTranscript();
      expect(useVoiceInputStore.getState().transcript).toBe('');
    });

    it('does not change mode', () => {
      useVoiceInputStore.setState({ mode: 'listening', transcript: 'hello' });
      useVoiceInputStore.getState().clearTranscript();
      expect(useVoiceInputStore.getState().mode).toBe('listening');
    });
  });

  describe('clearError', () => {
    it('resets error to null', () => {
      useVoiceInputStore.setState({ error: 'boom' });
      useVoiceInputStore.getState().clearError();
      expect(useVoiceInputStore.getState().error).toBeNull();
    });

    it('resets mode to idle', () => {
      useVoiceInputStore.setState({ mode: 'error', error: 'boom' });
      useVoiceInputStore.getState().clearError();
      expect(useVoiceInputStore.getState().mode).toBe('idle');
    });
  });

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

  describe('startListening', () => {
    beforeEach(() => {
      installCapture();
    });

    it('transitions mode to listening after getUserMedia resolves', async () => {
      await useVoiceInputStore.getState().startListening();
      expect(useVoiceInputStore.getState().mode).toBe('listening');
    });

    it('exposes the capture stream so a level meter can read it', async () => {
      const { stream } = installCapture();
      await useVoiceInputStore.getState().startListening();
      expect(useVoiceInputStore.getState().captureStream).toBe(stream);
    });

    it('captures audio even where the browser offers speech recognition', async () => {
      defineWindowValue('webkitSpeechRecognition', function noop() {});
      await useVoiceInputStore.getState().startListening();
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledOnce();
      expect(useVoiceInputStore.getState().captureStream).not.toBeNull();
      defineWindowValue('webkitSpeechRecognition', undefined);
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

    it('does nothing if already in listening mode', async () => {
      useVoiceInputStore.setState({ mode: 'listening' });
      await useVoiceInputStore.getState().startListening();
      expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    });

    it('sets mode to error on NotAllowedError', async () => {
      installFailingCapture(new DOMException('Permission denied', 'NotAllowedError'));

      await useVoiceInputStore.getState().startListening();

      expect(useVoiceInputStore.getState().mode).toBe('error');
      expect(useVoiceInputStore.getState().error).toContain('denied');
      expect(useVoiceInputStore.getState().captureStream).toBeNull();
    });

    it('sets mode to error on NotFoundError', async () => {
      installFailingCapture(new DOMException('Device not found', 'NotFoundError'));

      await useVoiceInputStore.getState().startListening();

      expect(useVoiceInputStore.getState().mode).toBe('error');
      expect(useVoiceInputStore.getState().error).toContain('microphone');
    });
  });

  describe('stopListening', () => {
    it('returns immediately if not in listening mode', async () => {
      useVoiceInputStore.setState({ mode: 'idle' });
      await expect(useVoiceInputStore.getState().stopListening()).resolves.toBeUndefined();
      expect(useVoiceInputStore.getState().mode).toBe('idle');
    });

    it('POSTs to /api/voice/transcribe with the catalog voice model and a csrf token', async () => {
      installCapture();
      const fetchMock = stubFetch(() => ({
        ok: true,
        json: async () => ({ text: 'hello' }),
        text: async () => '',
      }));

      await useVoiceInputStore.getState().startListening();
      await useVoiceInputStore.getState().stopListening();

      const [, init] = transcribeCall(fetchMock);
      const request = init as RequestInit;
      expect((request.body as FormData).get('model')).toBe(canonicalVoiceModel);
      expect((request.headers as Record<string, string>)['x-csrf-token']).toBe(CSRF_TOKEN);
      expect(useVoiceInputStore.getState().transcript).toBe('hello');
      expect(useVoiceInputStore.getState().captureStream).toBeNull();
    });

    it('reports a transcription failure without keeping the recording', async () => {
      installCapture();
      stubFetch(() => ({ ok: false, status: 500 }));

      await useVoiceInputStore.getState().startListening();
      await useVoiceInputStore.getState().stopListening();

      expect(useVoiceInputStore.getState().mode).toBe('error');
      expect(useVoiceInputStore.getState().transcript).toBe('');
    });
  });

  describe('cancelListening', () => {
    it('releases the microphone and drops the recording', async () => {
      const { stop } = installCapture();
      await useVoiceInputStore.getState().startListening();

      useVoiceInputStore.getState().cancelListening();

      expect(stop).toHaveBeenCalled();
      expect(useVoiceInputStore.getState().mode).toBe('idle');
      expect(useVoiceInputStore.getState().transcript).toBe('');
      expect(useVoiceInputStore.getState().captureStream).toBeNull();
    });
  });

  describe('error state management', () => {
    it('error mode persists until clearError is called', () => {
      useVoiceInputStore.setState({ mode: 'error', error: 'test error' });
      expect(useVoiceInputStore.getState().mode).toBe('error');
      useVoiceInputStore.getState().clearError();
      expect(useVoiceInputStore.getState().mode).toBe('idle');
      expect(useVoiceInputStore.getState().error).toBeNull();
    });
  });

  describe('state immutability', () => {
    it('language change produces updated state without mutating the previous snapshot', () => {
      const snapshot = { ...useVoiceInputStore.getState() };
      useVoiceInputStore.getState().setLanguage('ko-KR');
      expect(useVoiceInputStore.getState().language).toBe('ko-KR');
      expect(snapshot.language).toBe('en-US');
    });
  });
});
