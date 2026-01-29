import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '../lib/tauri-mock';

/**
 * Transcription mode - kept for backward compatibility
 * 'web-speech' uses the browser's Web Speech API (streaming, realtime)
 * 'whisper' uses backend Whisper transcription (more accurate, batch)
 */
export type TranscriptionMode = 'web-speech' | 'whisper';

/**
 * Voice transcription result from the backend (Whisper)
 */
export interface VoiceTranscription {
  text: string;
  language: string | null;
  duration: number | null;
  confidence: number | null;
}

/**
 * Voice settings from the backend
 */
export interface VoiceSettings {
  provider: 'openai' | 'webspeech' | 'local';
  openai_api_key: string | null;
  model: string;
  language: string | null;
}

/**
 * Options for the useVoiceTranscription hook
 */
export interface UseVoiceTranscriptionOptions {
  /** Prefer local Whisper over Web Speech API */
  preferLocal?: boolean;
  /** Language code for transcription (e.g., 'en', 'es', 'fr') */
  language?: string;
  /** Audio format for recording (default: 'webm') */
  audioFormat?: 'webm' | 'mp3' | 'wav' | 'ogg';
  /** Callback when transcription result is received */
  onResult?: (transcript: string) => void;
  /** Callback when an error occurs */
  onError?: (error: string) => void;
  /** Callback when recording starts */
  onRecordingStart?: () => void;
  /** Callback when recording stops */
  onRecordingStop?: () => void;
}

/**
 * State for voice transcription
 */
export interface VoiceTranscriptionState {
  /** Whether audio is currently being recorded */
  isRecording: boolean;
  /** Whether audio is being transcribed by the backend */
  isTranscribing: boolean;
  /** Final transcript from the backend */
  transcript: string;
  /** Interim transcript (not used for backend transcription, kept for API compatibility) */
  interimTranscript: string;
  /** Error message if any */
  error: string | null;
}

/**
 * Return type for the useVoiceTranscription hook
 */
export interface UseVoiceTranscriptionReturn extends VoiceTranscriptionState {
  /** Start recording audio */
  startRecording: () => Promise<void>;
  /** Stop recording and get the transcription */
  stopRecording: () => Promise<string>;
  /** Toggle recording on/off */
  toggleRecording: () => Promise<void>;
  /** Clear the current transcript */
  clearTranscript: () => void;
  /** Whether the browser supports MediaRecorder */
  isSupported: boolean;
  /** Available local Whisper implementations */
  availableLocalWhisper: string[];
  /** Configure voice settings on the backend */
  configure: (settings: Partial<VoiceSettings>) => Promise<void>;
  /** Get current voice settings */
  getSettings: () => Promise<VoiceSettings>;
  /** Check available local Whisper implementations */
  checkLocalWhisper: () => Promise<string[]>;
}

/**
 * Hook for voice transcription using MediaRecorder and backend Whisper transcription.
 *
 * This hook provides a way to record audio from the user's microphone and send it
 * to the backend for transcription using OpenAI's Whisper API or local Whisper implementations.
 *
 * @example
 * ```tsx
 * const { isRecording, transcript, startRecording, stopRecording, error } = useVoiceTranscription({
 *   language: 'en',
 *   onResult: (text) => console.log('Transcribed:', text),
 * });
 *
 * return (
 *   <button onClick={isRecording ? stopRecording : startRecording}>
 *     {isRecording ? 'Stop' : 'Start'} Recording
 *   </button>
 * );
 * ```
 */
export function useVoiceTranscription(
  options: UseVoiceTranscriptionOptions = {},
): UseVoiceTranscriptionReturn {
  const {
    preferLocal = false,
    language,
    audioFormat = 'webm',
    onResult,
    onError,
    onRecordingStart,
    onRecordingStop,
  } = options;

  const [state, setState] = useState<VoiceTranscriptionState>({
    isRecording: false,
    isTranscribing: false,
    transcript: '',
    interimTranscript: '',
    error: null,
  });

  const [isSupported, setIsSupported] = useState(false);
  const [availableLocalWhisper, setAvailableLocalWhisper] = useState<string[]>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  /**
   * Check available local Whisper implementations
   */
  const checkLocalWhisperImpl = useCallback(async (): Promise<string[]> => {
    try {
      const available = await invoke<string[]>('voice_check_local_whisper');
      return available;
    } catch {
      return [];
    }
  }, []);

  /**
   * Configure voice settings on the backend
   */
  const configureImpl = useCallback(
    async (settings: Partial<VoiceSettings>): Promise<void> => {
      try {
        await invoke('voice_configure', {
          provider: settings.provider || 'openai',
          apiKey: settings.openai_api_key,
          model: settings.model,
          language: settings.language,
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setState((prev) => ({ ...prev, error: errorMessage }));
        onError?.(errorMessage);
        throw new Error(errorMessage);
      }
    },
    [onError],
  );

  /**
   * Get current voice settings from the backend
   */
  const getSettingsImpl = useCallback(async (): Promise<VoiceSettings> => {
    try {
      const settings = await invoke<VoiceSettings>('voice_get_settings');
      return settings;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setState((prev) => ({ ...prev, error: errorMessage }));
      onError?.(errorMessage);
      throw new Error(errorMessage);
    }
  }, [onError]);

  // Check browser support on mount
  useEffect(() => {
    const supported =
      typeof navigator !== 'undefined' &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function' &&
      typeof MediaRecorder !== 'undefined';

    setIsSupported(supported);

    // Check for available local whisper implementations
    if (supported) {
      checkLocalWhisperImpl().then((available) => {
        setAvailableLocalWhisper(available);
      });
    }

    return () => {
      // Cleanup on unmount
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [checkLocalWhisperImpl]);

  // Configure provider when preferLocal changes
  useEffect(() => {
    if (preferLocal && availableLocalWhisper.length > 0) {
      configureImpl({ provider: 'local' as const }).catch(() => {
        // Fallback to OpenAI if local fails
        configureImpl({ provider: 'openai' as const }).catch(() => {});
      });
    }
  }, [preferLocal, availableLocalWhisper, configureImpl]);

  // Configure language when it changes
  useEffect(() => {
    if (language) {
      configureImpl({ language }).catch(() => {});
    }
  }, [language, configureImpl]);

  /**
   * Get the MIME type for the selected audio format
   */
  const getMimeType = useCallback((): string => {
    const mimeTypes: Record<string, string> = {
      webm: 'audio/webm;codecs=opus',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      ogg: 'audio/ogg;codecs=opus',
    };

    // Check if the preferred MIME type is supported
    const format = audioFormat || 'webm';
    const preferredMime = mimeTypes[format] || 'audio/webm;codecs=opus';
    if (MediaRecorder.isTypeSupported(preferredMime)) {
      return preferredMime;
    }

    // Fallback to webm
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
      return 'audio/webm;codecs=opus';
    }

    // Fallback to webm without codec
    if (MediaRecorder.isTypeSupported('audio/webm')) {
      return 'audio/webm';
    }

    // Last resort - let browser choose
    return '';
  }, [audioFormat]);

  /**
   * Start recording audio from the microphone
   */
  const startRecording = useCallback(async (): Promise<void> => {
    if (!isSupported) {
      const error = 'MediaRecorder is not supported in this browser';
      setState((prev) => ({ ...prev, error }));
      onError?.(error);
      return;
    }

    if (state.isRecording) {
      return;
    }

    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000, // Whisper prefers 16kHz
        },
      });

      streamRef.current = stream;
      audioChunksRef.current = [];

      const mimeType = getMimeType();
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: mimeType || undefined,
        audioBitsPerSecond: 128000,
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onerror = (event) => {
        const errorMessage = `Recording error: ${(event as ErrorEvent).message || 'Unknown error'}`;
        setState((prev) => ({
          ...prev,
          isRecording: false,
          error: errorMessage,
        }));
        onError?.(errorMessage);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100); // Collect data every 100ms

      setState((prev) => ({
        ...prev,
        isRecording: true,
        error: null,
        interimTranscript: '',
      }));

      // Notify backend that recording started (for logging)
      invoke('voice_start_recording').catch((err) => {
        console.warn('[VoiceTranscription] Failed to notify backend of recording start:', err);
      });

      onRecordingStart?.();
    } catch (err) {
      const errorMessage = getMediaErrorMessage(err);
      setState((prev) => ({
        ...prev,
        isRecording: false,
        error: errorMessage,
      }));
      onError?.(errorMessage);
    }
  }, [isSupported, state.isRecording, getMimeType, onError, onRecordingStart]);

  /**
   * Stop recording and transcribe the audio
   */
  const stopRecording = useCallback(async (): Promise<string> => {
    if (!state.isRecording || !mediaRecorderRef.current) {
      return state.transcript;
    }

    return new Promise((resolve) => {
      const mediaRecorder = mediaRecorderRef.current!;

      mediaRecorder.onstop = async () => {
        // Stop all tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }

        // Notify backend that recording stopped
        invoke('voice_stop_recording').catch((err) => {
          console.warn('[VoiceTranscription] Failed to notify backend of recording stop:', err);
        });

        onRecordingStop?.();

        // Create blob from chunks
        const mimeType = mediaRecorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        audioChunksRef.current = [];

        if (audioBlob.size === 0) {
          const error = 'No audio recorded';
          setState((prev) => ({
            ...prev,
            isRecording: false,
            error,
          }));
          onError?.(error);
          resolve('');
          return;
        }

        // Start transcription
        setState((prev) => ({
          ...prev,
          isRecording: false,
          isTranscribing: true,
          error: null,
        }));

        try {
          // Convert blob to array buffer
          const arrayBuffer = await audioBlob.arrayBuffer();
          const audioData = Array.from(new Uint8Array(arrayBuffer));

          // Get format from MIME type
          const format = getFormatFromMimeType(mimeType);

          // Send to backend for transcription
          const result = await invoke<VoiceTranscription>('voice_transcribe_blob', {
            audioData,
            format,
          });

          const transcript = result.text.trim();

          setState((prev) => ({
            ...prev,
            isTranscribing: false,
            transcript: prev.transcript ? `${prev.transcript} ${transcript}` : transcript,
            error: null,
          }));

          onResult?.(transcript);
          resolve(transcript);
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          setState((prev) => ({
            ...prev,
            isTranscribing: false,
            error: errorMessage,
          }));
          onError?.(errorMessage);
          resolve('');
        }
      };

      mediaRecorder.stop();
    });
  }, [state.isRecording, state.transcript, onResult, onError, onRecordingStop]);

  /**
   * Toggle recording on/off
   */
  const toggleRecording = useCallback(async (): Promise<void> => {
    if (state.isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  }, [state.isRecording, startRecording, stopRecording]);

  /**
   * Clear the current transcript
   */
  const clearTranscript = useCallback((): void => {
    setState((prev) => ({
      ...prev,
      transcript: '',
      interimTranscript: '',
      error: null,
    }));
  }, []);

  /**
   * Public API for configuring voice settings
   */
  const configure = useCallback(
    async (settings: Partial<VoiceSettings>): Promise<void> => {
      await configureImpl(settings);
    },
    [configureImpl],
  );

  /**
   * Public API for getting voice settings
   */
  const getSettings = useCallback(async (): Promise<VoiceSettings> => {
    return getSettingsImpl();
  }, [getSettingsImpl]);

  /**
   * Public API for checking local Whisper availability
   */
  const checkLocalWhisper = useCallback(async (): Promise<string[]> => {
    const available = await checkLocalWhisperImpl();
    setAvailableLocalWhisper(available);
    return available;
  }, [checkLocalWhisperImpl]);

  return {
    ...state,
    isSupported,
    availableLocalWhisper,
    startRecording,
    stopRecording,
    toggleRecording,
    clearTranscript,
    configure,
    getSettings,
    checkLocalWhisper,
  };
}

/**
 * Get a user-friendly error message for media errors
 */
function getMediaErrorMessage(err: unknown): string {
  // eslint-disable-next-line no-undef
  if (err instanceof DOMException) {
    switch (err.name) {
      case 'NotAllowedError':
        return 'Microphone permission denied. Please allow microphone access.';
      case 'NotFoundError':
        return 'No microphone found. Please check your audio settings.';
      case 'NotReadableError':
        return 'Microphone is already in use by another application.';
      case 'OverconstrainedError':
        return 'Could not satisfy audio constraints.';
      case 'SecurityError':
        return 'Microphone access blocked due to security policy.';
      case 'AbortError':
        return 'Microphone access was aborted.';
      default:
        return `Microphone error: ${err.message}`;
    }
  }

  if (err instanceof Error) {
    return err.message;
  }

  return 'Failed to access microphone';
}

/**
 * Get the file format extension from MIME type
 */
function getFormatFromMimeType(mimeType: string): string {
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('mp3') || mimeType.includes('mpeg')) return 'mp3';
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'm4a';
  return 'webm'; // Default to webm
}

export default useVoiceTranscription;
