import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { detectVoiceCommand, useVoiceInputStore } from '../voiceInputStore';

// Mock @tauri-apps/api/core (already mocked globally in setup.ts, but we re-declare
// so this file is self-contained and the vi.mocked() type narrows correctly)
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(() => Promise.resolve()),
  isTauri: vi.fn(() => Promise.resolve(false)),
}));

// Mock the modelStore dynamic import used by processTranscript in 'ai' mode
vi.mock('../modelStore', () => ({
  useModelStore: {
    getState: () => ({
      selectedModel: 'claude-haiku-4.5',
      selectedProvider: 'anthropic',
    }),
  },
}));

const mockInvoke = vi.mocked(invoke);

// ---------- MediaRecorder / getUserMedia helpers ----------

/** Minimal mock MediaStream returned by getUserMedia */
function createMockStream(): MediaStream {
  const track = { stop: vi.fn(), kind: 'audio', enabled: true };
  return { getTracks: () => [track] } as unknown as MediaStream;
}

/**
 * A controllable mock for the MediaRecorder class.
 *
 * The caller can trigger `ondataavailable` and `onstop` at will to simulate
 * the browser's asynchronous recording lifecycle.
 */
function createMockMediaRecorder() {
  const instance = {
    start: vi.fn(),
    stop: vi.fn(),
    ondataavailable: null as ((e: { data: Blob }) => void) | null,
    onstop: null as (() => void) | null,
    state: 'inactive' as string,
  };

  // When `stop()` is called we fire onstop asynchronously (matches real API).
  instance.stop.mockImplementation(() => {
    instance.state = 'inactive';
    // Flush on next microtask so that `await new Promise(…)` inside the store resolves.
    queueMicrotask(() => {
      instance.onstop?.();
    });
  });

  instance.start.mockImplementation(() => {
    instance.state = 'recording';
  });

  return instance;
}

/** Install navigator.mediaDevices.getUserMedia + MediaRecorder on the global scope. */
function installMediaMocks(
  streamOrError: MediaStream | Error = createMockStream(),
  recorderInstance = createMockMediaRecorder(),
) {
  const getUserMedia =
    streamOrError instanceof Error
      ? vi.fn().mockRejectedValue(streamOrError)
      : vi.fn().mockResolvedValue(streamOrError);

  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia },
    configurable: true,
    writable: true,
  });

  const MockRecorderCtor = vi.fn().mockImplementation(() => recorderInstance);
  // Static method used by the store to select mimeType
  (MockRecorderCtor as unknown as { isTypeSupported: ReturnType<typeof vi.fn> }).isTypeSupported =
    vi.fn().mockReturnValue(true);

  vi.stubGlobal('MediaRecorder', MockRecorderCtor);

  return { getUserMedia, MockRecorderCtor, recorderInstance };
}

// ---------- Tests ----------

describe('voiceInputStore', () => {
  beforeEach(() => {
    // Reset store to clean defaults before each test
    useVoiceInputStore.setState({
      mode: 'idle',
      transcript: '',
      lastTranscriptIsCommand: false,
      error: null,
      hotkey: 'option',
      provider: 'local_whisper',
      language: 'en',
      postProcessingMode: 'ai',
      _mediaStream: null,
      _recorder: null,
      _audioChunks: [],
      _startAborted: false,
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ----------------------------------------------------------------
  // detectVoiceCommand
  // ----------------------------------------------------------------
  describe('detectVoiceCommand', () => {
    it('detects "make this more formal" as a command', () => {
      expect(detectVoiceCommand('Make this more formal')).toBe(true);
    });

    it('detects "fix the grammar" as a command', () => {
      expect(detectVoiceCommand('fix the grammar in this text')).toBe(true);
    });

    it('detects "rewrite this" as a command', () => {
      expect(detectVoiceCommand('Rewrite this paragraph')).toBe(true);
    });

    it('detects "translate to" as a command', () => {
      expect(detectVoiceCommand('translate to Spanish')).toBe(true);
    });

    it('detects "shorter" as a command', () => {
      expect(detectVoiceCommand('shorter')).toBe(true);
    });

    it('returns false for regular dictation', () => {
      expect(detectVoiceCommand('Hello, how are you today?')).toBe(false);
    });

    it('returns false for text that contains a command word mid-sentence', () => {
      expect(detectVoiceCommand('I want to summarize my day')).toBe(false);
    });

    it('returns false for empty input', () => {
      expect(detectVoiceCommand('')).toBe(false);
    });

    it('is case-insensitive', () => {
      expect(detectVoiceCommand('MAKE THIS MORE FORMAL')).toBe(true);
      expect(detectVoiceCommand('Fix The Grammar')).toBe(true);
    });

    it('trims whitespace before matching', () => {
      expect(detectVoiceCommand('  make this more formal  ')).toBe(true);
    });
  });

  // ----------------------------------------------------------------
  // basicCleanup (via processTranscript with basic mode)
  // ----------------------------------------------------------------
  describe('basicCleanup (via processTranscript with basic mode)', () => {
    beforeEach(() => {
      useVoiceInputStore.setState({ postProcessingMode: 'basic' });
    });

    it('removes filler words like "um" and "uh"', async () => {
      const { processTranscript } = useVoiceInputStore.getState();
      const result = await processTranscript('um I want to uh go home');
      expect(result.text).toBe('I want to go home');
    });

    it('removes "you know" filler phrase', async () => {
      const { processTranscript } = useVoiceInputStore.getState();
      const result = await processTranscript('I was you know thinking about it');
      expect(result.text).toBe('I was thinking about it');
    });

    it('removes "basically" and "literally"', async () => {
      const { processTranscript } = useVoiceInputStore.getState();
      const result = await processTranscript('It basically literally works');
      expect(result.text).toBe('It works');
    });

    it('normalizes extra whitespace', async () => {
      const { processTranscript } = useVoiceInputStore.getState();
      const result = await processTranscript('hello    world');
      expect(result.text).toBe('hello world');
    });

    it('returns short transcripts (< 3 chars) unchanged', async () => {
      const { processTranscript } = useVoiceInputStore.getState();
      const result = await processTranscript('hi');
      expect(result.text).toBe('hi');
      expect(result.isCommand).toBe(false);
    });
  });

  // ----------------------------------------------------------------
  // processTranscript
  // ----------------------------------------------------------------
  describe('processTranscript', () => {
    it('returns raw text when postProcessingMode is "none"', async () => {
      useVoiceInputStore.setState({ postProcessingMode: 'none' });
      const { processTranscript } = useVoiceInputStore.getState();
      const result = await processTranscript('um hello um world');
      expect(result.text).toBe('um hello um world');
    });

    it('applies basic cleanup when postProcessingMode is "basic"', async () => {
      useVoiceInputStore.setState({ postProcessingMode: 'basic' });
      const { processTranscript } = useVoiceInputStore.getState();
      const result = await processTranscript('like I actually want to go');
      expect(result.text).not.toContain('like');
      expect(result.text).not.toContain('actually');
    });

    it('detects commands in all modes', async () => {
      useVoiceInputStore.setState({ postProcessingMode: 'none' });
      const { processTranscript } = useVoiceInputStore.getState();
      const result = await processTranscript('make this more formal');
      expect(result.isCommand).toBe(true);
    });

    it('short-circuits for very short input (< 3 chars)', async () => {
      const { processTranscript } = useVoiceInputStore.getState();
      const result = await processTranscript('ok');
      expect(result.text).toBe('ok');
      expect(result.isCommand).toBe(false);
    });
  });

  // ----------------------------------------------------------------
  // startListening — MediaRecorder path
  // ----------------------------------------------------------------
  describe('startListening', () => {
    it('calls getUserMedia and transitions to listening mode', async () => {
      const mockStream = createMockStream();
      const { getUserMedia } = installMediaMocks(mockStream);

      const { startListening } = useVoiceInputStore.getState();
      await startListening();

      expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
      const state = useVoiceInputStore.getState();
      expect(state.mode).toBe('listening');
      expect(state.error).toBeNull();
      expect(state._recorder).not.toBeNull();
      expect(state._mediaStream).not.toBeNull();
    });

    it('resets error, transcript, and command flag on start', async () => {
      installMediaMocks();
      useVoiceInputStore.setState({
        error: 'previous error',
        transcript: 'old transcript',
        lastTranscriptIsCommand: true,
      });

      const { startListening } = useVoiceInputStore.getState();
      await startListening();

      const state = useVoiceInputStore.getState();
      expect(state.error).toBeNull();
      expect(state.transcript).toBe('');
      expect(state.lastTranscriptIsCommand).toBe(false);
    });

    it('starts the MediaRecorder with 100ms timeslice', async () => {
      const { recorderInstance } = installMediaMocks();

      const { startListening } = useVoiceInputStore.getState();
      await startListening();

      expect(recorderInstance.start).toHaveBeenCalledWith(100);
    });

    it('sets error with "Microphone access denied" when getUserMedia throws NotAllowedError', async () => {
      const notAllowed = new DOMException('Permission denied', 'NotAllowedError');
      Object.defineProperty(notAllowed, 'name', { value: 'NotAllowedError' });
      installMediaMocks(notAllowed);

      const { startListening } = useVoiceInputStore.getState();
      await startListening();

      const state = useVoiceInputStore.getState();
      expect(state.mode).toBe('idle');
      expect(state.error).toContain('Microphone access denied');
    });

    it('sets error with "No microphone found" when getUserMedia throws NotFoundError', async () => {
      const notFound = new DOMException('No device', 'NotFoundError');
      Object.defineProperty(notFound, 'name', { value: 'NotFoundError' });
      installMediaMocks(notFound);

      const { startListening } = useVoiceInputStore.getState();
      await startListening();

      const state = useVoiceInputStore.getState();
      expect(state.mode).toBe('idle');
      expect(state.error).toContain('No microphone found');
    });

    it('sets generic error string for unknown getUserMedia errors', async () => {
      const generic = new Error('Something went wrong');
      installMediaMocks(generic);

      const { startListening } = useVoiceInputStore.getState();
      await startListening();

      const state = useVoiceInputStore.getState();
      expect(state.mode).toBe('idle');
      expect(state.error).toContain('Something went wrong');
    });

    it('aborts and cleans up stream when stopListening called before getUserMedia resolves', async () => {
      // Manually-controlled getUserMedia promise so we can resolve AFTER stopListening
      const mockTrack = { stop: vi.fn(), kind: 'audio', enabled: true };
      const mockStream = { getTracks: () => [mockTrack] } as unknown as MediaStream;
      let resolveGetUserMedia!: (stream: MediaStream) => void;
      const pendingGetUserMedia = new Promise<MediaStream>((resolve) => {
        resolveGetUserMedia = resolve;
      });
      Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia: vi.fn().mockReturnValue(pendingGetUserMedia) },
        configurable: true,
        writable: true,
      });

      // Install only the MediaRecorder constructor (not getUserMedia — we already set it above)
      const recorderInstance = createMockMediaRecorder();
      const MockRecorderCtor = vi.fn().mockImplementation(() => recorderInstance);
      (
        MockRecorderCtor as unknown as { isTypeSupported: ReturnType<typeof vi.fn> }
      ).isTypeSupported = vi.fn().mockReturnValue(true);
      vi.stubGlobal('MediaRecorder', MockRecorderCtor);

      // Start recording — getUserMedia is now pending, won't resolve until we say so
      const startPromise = useVoiceInputStore.getState().startListening();

      // While getUserMedia is still pending, call stopListening (the race condition)
      await useVoiceInputStore.getState().stopListening();

      // Now let getUserMedia resolve — startListening should detect _startAborted and bail
      resolveGetUserMedia(mockStream);
      await startPromise;

      // Store should be idle, recorder should NOT have been created, and stream tracks stopped
      const state = useVoiceInputStore.getState();
      expect(state.mode).toBe('idle');
      expect(state._recorder).toBeNull();
      expect(mockTrack.stop).toHaveBeenCalled();
    });
  });

  // ----------------------------------------------------------------
  // stopListening — full MediaRecorder flow
  // ----------------------------------------------------------------
  describe('stopListening', () => {
    it('returns early when NOT in listening state', async () => {
      useVoiceInputStore.setState({ mode: 'idle' });
      const { stopListening } = useVoiceInputStore.getState();
      await stopListening();
      expect(useVoiceInputStore.getState().mode).toBe('idle');
    });

    it('returns early when in transcribing state', async () => {
      useVoiceInputStore.setState({ mode: 'transcribing' });
      const { stopListening } = useVoiceInputStore.getState();
      await stopListening();
      expect(useVoiceInputStore.getState().mode).toBe('transcribing');
    });

    it('returns early when in processing state', async () => {
      useVoiceInputStore.setState({ mode: 'processing' });
      const { stopListening } = useVoiceInputStore.getState();
      await stopListening();
      expect(useVoiceInputStore.getState().mode).toBe('processing');
    });

    it('sets _startAborted and returns to idle when no recorder exists yet', async () => {
      // Simulates stopListening called before getUserMedia resolves
      useVoiceInputStore.setState({ mode: 'listening', _recorder: null });

      const { stopListening } = useVoiceInputStore.getState();
      await stopListening();

      const state = useVoiceInputStore.getState();
      expect(state.mode).toBe('idle');
      expect(state._startAborted).toBe(true);
    });

    it('stops recorder, transcribes audio, and sets transcript', async () => {
      const mockStream = createMockStream();
      const recorderInstance = createMockMediaRecorder();
      installMediaMocks(mockStream, recorderInstance);

      // Use 'none' post-processing to avoid the LLM path
      useVoiceInputStore.setState({ postProcessingMode: 'none' });

      // Start listening (sets up recorder)
      const { startListening } = useVoiceInputStore.getState();
      await startListening();

      // Simulate some audio data arriving
      const audioBlob = new Blob(['fake-audio-data'], { type: 'audio/webm' });
      recorderInstance.ondataavailable?.({ data: audioBlob });

      // Mock the voice_transcribe_blob invoke to return transcript
      mockInvoke.mockResolvedValueOnce({
        text: 'hello world',
        confidence: 0.95,
      });

      const { stopListening } = useVoiceInputStore.getState();
      await stopListening();

      const state = useVoiceInputStore.getState();
      expect(state.mode).toBe('idle');
      expect(state.transcript).toBe('hello world');
      expect(state._recorder).toBeNull();
      expect(state._mediaStream).toBeNull();
      expect(state._audioChunks).toEqual([]);
    });

    it('calls voice_transcribe_blob with correct arguments', async () => {
      const mockStream = createMockStream();
      const recorderInstance = createMockMediaRecorder();
      installMediaMocks(mockStream, recorderInstance);

      useVoiceInputStore.setState({
        postProcessingMode: 'none',
        provider: 'deepgram',
        language: 'fr',
      });

      const { startListening } = useVoiceInputStore.getState();
      await startListening();

      // Push audio data
      const audioBlob = new Blob(['audio-bytes'], { type: 'audio/webm' });
      recorderInstance.ondataavailable?.({ data: audioBlob });

      mockInvoke.mockResolvedValueOnce({ text: 'bonjour', confidence: 0.9 });

      const { stopListening } = useVoiceInputStore.getState();
      await stopListening();

      // Find the voice_transcribe_blob call
      const transcribeCall = mockInvoke.mock.calls.find(
        (call) => call[0] === 'voice_transcribe_blob',
      );
      expect(transcribeCall).toBeDefined();
      const args = transcribeCall![1] as Record<string, unknown>;
      expect(args['audioData']).toBeDefined();
      expect(args['format']).toBe('webm');
      expect(args['provider']).toBe('deepgram');
      expect(args['language']).toBe('fr');
    });

    it('returns to idle without calling invoke when audio blob is 0 bytes', async () => {
      const mockStream = createMockStream();
      const recorderInstance = createMockMediaRecorder();
      installMediaMocks(mockStream, recorderInstance);

      useVoiceInputStore.setState({ postProcessingMode: 'none' });

      const { startListening } = useVoiceInputStore.getState();
      await startListening();

      // No ondataavailable fired — _audioChunks stays empty → 0-byte blob

      const { stopListening } = useVoiceInputStore.getState();
      await stopListening();

      const state = useVoiceInputStore.getState();
      expect(state.mode).toBe('idle');
      expect(state.transcript).toBe('');
      // voice_transcribe_blob should NOT have been called
      const transcribeCall = mockInvoke.mock.calls.find(
        (call) => call[0] === 'voice_transcribe_blob',
      );
      expect(transcribeCall).toBeUndefined();
    });

    it('returns to idle when transcription returns empty text', async () => {
      const mockStream = createMockStream();
      const recorderInstance = createMockMediaRecorder();
      installMediaMocks(mockStream, recorderInstance);

      useVoiceInputStore.setState({ postProcessingMode: 'none' });

      const { startListening } = useVoiceInputStore.getState();
      await startListening();

      recorderInstance.ondataavailable?.({
        data: new Blob(['data'], { type: 'audio/webm' }),
      });

      // Transcription returns empty text
      mockInvoke.mockResolvedValueOnce({ text: '', confidence: 0 });

      const { stopListening } = useVoiceInputStore.getState();
      await stopListening();

      const state = useVoiceInputStore.getState();
      expect(state.mode).toBe('idle');
      expect(state.transcript).toBe('');
    });

    it('sets error and returns to idle when invoke throws', async () => {
      const mockStream = createMockStream();
      const recorderInstance = createMockMediaRecorder();
      installMediaMocks(mockStream, recorderInstance);

      useVoiceInputStore.setState({ postProcessingMode: 'none' });

      const { startListening } = useVoiceInputStore.getState();
      await startListening();

      recorderInstance.ondataavailable?.({
        data: new Blob(['data'], { type: 'audio/webm' }),
      });

      mockInvoke.mockRejectedValueOnce(new Error('Transcription service unavailable'));

      const { stopListening } = useVoiceInputStore.getState();
      await stopListening();

      const state = useVoiceInputStore.getState();
      expect(state.mode).toBe('idle');
      expect(state.error).toContain('Transcription service unavailable');
      expect(state._recorder).toBeNull();
    });

    it('stops media stream tracks after recording', async () => {
      const mockStream = createMockStream();
      const recorderInstance = createMockMediaRecorder();
      installMediaMocks(mockStream, recorderInstance);

      useVoiceInputStore.setState({ postProcessingMode: 'none' });

      const { startListening } = useVoiceInputStore.getState();
      await startListening();

      recorderInstance.ondataavailable?.({
        data: new Blob(['data'], { type: 'audio/webm' }),
      });

      mockInvoke.mockResolvedValueOnce({ text: 'test', confidence: 1.0 });

      const { stopListening } = useVoiceInputStore.getState();
      await stopListening();

      // Verify stream tracks were stopped (releases microphone)
      const track = mockStream.getTracks()[0]!;
      expect(track.stop).toHaveBeenCalled();
    });

    it('detects voice commands in the transcript', async () => {
      const mockStream = createMockStream();
      const recorderInstance = createMockMediaRecorder();
      installMediaMocks(mockStream, recorderInstance);

      useVoiceInputStore.setState({ postProcessingMode: 'none' });

      const { startListening } = useVoiceInputStore.getState();
      await startListening();

      recorderInstance.ondataavailable?.({
        data: new Blob(['data'], { type: 'audio/webm' }),
      });

      // Return a transcript that matches a command prefix
      mockInvoke.mockResolvedValueOnce({ text: 'make this more formal', confidence: 0.9 });

      const { stopListening } = useVoiceInputStore.getState();
      await stopListening();

      const state = useVoiceInputStore.getState();
      expect(state.transcript).toBe('make this more formal');
      expect(state.lastTranscriptIsCommand).toBe(true);
    });
  });

  // ----------------------------------------------------------------
  // settings
  // ----------------------------------------------------------------
  describe('settings', () => {
    it('setHotkey updates the hotkey', () => {
      const { setHotkey } = useVoiceInputStore.getState();
      setHotkey('ctrl+space');
      expect(useVoiceInputStore.getState().hotkey).toBe('ctrl+space');
    });

    it('setProvider updates the provider', () => {
      const { setProvider } = useVoiceInputStore.getState();
      setProvider('deepgram');
      expect(useVoiceInputStore.getState().provider).toBe('deepgram');
    });

    it('setLanguage updates the language', () => {
      const { setLanguage } = useVoiceInputStore.getState();
      setLanguage('fr');
      expect(useVoiceInputStore.getState().language).toBe('fr');
    });

    it('setPostProcessingMode updates the mode', () => {
      const { setPostProcessingMode } = useVoiceInputStore.getState();
      setPostProcessingMode('basic');
      expect(useVoiceInputStore.getState().postProcessingMode).toBe('basic');
    });

    it('clearTranscript resets transcript and command flag', () => {
      useVoiceInputStore.setState({
        transcript: 'some text',
        lastTranscriptIsCommand: true,
      });

      const { clearTranscript } = useVoiceInputStore.getState();
      clearTranscript();

      const state = useVoiceInputStore.getState();
      expect(state.transcript).toBe('');
      expect(state.lastTranscriptIsCommand).toBe(false);
    });
  });
});
