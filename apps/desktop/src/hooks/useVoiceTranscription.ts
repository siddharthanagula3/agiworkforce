import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '../lib/tauri-mock';
import { API_BASE_URL } from '../api/client';
import { supabaseAuth } from '../services/supabaseAuth';

/**
 * Transcription mode - kept for backward compatibility
 * 'web-speech' uses the browser's Web Speech API (streaming, realtime)
 * 'whisper' uses backend Whisper transcription (more accurate, batch)
 */
export type TranscriptionMode = 'web-speech' | 'whisper';

type SpeechRecognitionLike = EventTarget & {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
  onstart?: (() => void) | null;
};

type SpeechRecognitionConstructorLike = new () => SpeechRecognitionLike;

const getSpeechRecognitionConstructor = (): SpeechRecognitionConstructorLike | undefined => {
  if (typeof window === 'undefined') {
    return undefined;
  }
  const windowWithSpeech = window as typeof globalThis & {
    webkitSpeechRecognition?: SpeechRecognitionConstructorLike;
    SpeechRecognition?: SpeechRecognitionConstructorLike;
  };
  return windowWithSpeech.SpeechRecognition || windowWithSpeech.webkitSpeechRecognition;
};

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
  provider: 'cloud' | 'webspeech' | 'local';
  model: string;
  language: string | null;
}

/**
 * Options for the useVoiceTranscription hook
 */
export interface UseVoiceTranscriptionOptions {
  /** Use Whisper (Cloud) when true, Web Speech when false */
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
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const speechFinalTranscriptRef = useRef<string>('');
  const speechLastEmittedRef = useRef<string>('');
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  // HKS-005 fix: Track mount state to prevent setState after unmount
  const isMountedRef = useRef(true);

  const withTimeout = useCallback(async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
    const timeout = new Promise<never>((_, reject) => {
      window.setTimeout(
        () => reject(new Error(`Request timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );
    });
    return Promise.race([promise, timeout]);
  }, []);

  /**
   * Check available local Whisper implementations
   */
  const checkLocalWhisperImpl = useCallback(async (): Promise<string[]> => {
    try {
      const availability = await invoke<boolean | string[]>('voice_check_local_whisper');
      if (Array.isArray(availability)) {
        return availability.filter((engine): engine is string => typeof engine === 'string');
      }
      return availability ? ['whisper'] : [];
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
          provider: settings.provider || 'cloud',
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
      // HKS-005 fix: Mark as unmounted to prevent setState calls
      isMountedRef.current = false;
      // Cleanup on unmount
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.stop();
        } catch {
          // Ignore speech recognition shutdown failures
        }
      }
    };
  }, [checkLocalWhisperImpl]);

  // Configure provider when preferLocal changes
  useEffect(() => {
    if (preferLocal && availableLocalWhisper.length > 0) {
      configureImpl({ provider: 'local' as const }).catch((err) => {
        // AUDIT-P3-ERROR: Log local provider failure, then fallback to Cloud
        console.debug('[VoiceTranscription] Local provider failed, falling back to Cloud:', err);
        configureImpl({ provider: 'cloud' as const }).catch((fallbackErr) => {
          // AUDIT-P3-ERROR: Both providers failed - error state already set by configureImpl
          console.debug('[VoiceTranscription] Cloud fallback also failed:', fallbackErr);
        });
      });
    }
  }, [preferLocal, availableLocalWhisper, configureImpl]);

  // Auto-clear transient voice errors so stale banners do not block input affordances.
  useEffect(() => {
    if (!state.error) return;
    const timeoutId = window.setTimeout(() => {
      if (!isMountedRef.current) return;
      setState((prev) => ({ ...prev, error: null }));
    }, 4000);
    return () => window.clearTimeout(timeoutId);
  }, [state.error]);

  // Configure language when it changes
  useEffect(() => {
    if (language) {
      configureImpl({ language }).catch((err) => {
        // AUDIT-P3-ERROR: Language configuration failure - error state already set by configureImpl
        console.debug('[VoiceTranscription] Language configuration failed:', err);
      });
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
    if (!preferLocal) {
      const SpeechRecognitionCtor = getSpeechRecognitionConstructor();

      if (!SpeechRecognitionCtor) {
        const error = 'Web Speech API is not supported in this environment';
        setState((prev) => ({ ...prev, error }));
        onError?.(error);
        return;
      }

      if (state.isRecording) {
        return;
      }

      speechFinalTranscriptRef.current = '';
      speechLastEmittedRef.current = '';
      const recognition = new SpeechRecognitionCtor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = language || 'en-US';

      recognition.onresult = (event) => {
        let interimText = '';
        let finalText = speechFinalTranscriptRef.current;
        const speechEvent = event as Event & {
          resultIndex?: number;
          results?: ArrayLike<{ isFinal?: boolean; 0?: { transcript?: string } }>;
        };
        const resultIndex = speechEvent.resultIndex ?? 0;
        const results = speechEvent.results;
        if (!results) {
          return;
        }
        for (let i = resultIndex; i < results.length; i++) {
          const result = results[i];
          if (!result || !result[0]) continue;
          const transcriptText = result[0].transcript || '';
          if (result.isFinal) {
            finalText = `${finalText} ${transcriptText}`.trim();
          } else {
            interimText = `${interimText} ${transcriptText}`.trim();
          }
        }
        speechFinalTranscriptRef.current = finalText;
        if (isMountedRef.current) {
          setState((prev) => ({
            ...prev,
            transcript: finalText,
            interimTranscript: interimText,
            error: null,
          }));
        }
        if (finalText) {
          const previous = speechLastEmittedRef.current;
          let delta = finalText;
          if (previous && finalText.startsWith(previous)) {
            delta = finalText.slice(previous.length).trim();
          }
          speechLastEmittedRef.current = finalText;
          if (delta) {
            onResult?.(delta);
          }
        }
      };

      recognition.onerror = (event) => {
        const speechEvent = event as Event & { error?: string };
        const errorCode = speechEvent.error || 'unknown';
        const errorMessage = `Speech recognition error: ${errorCode}`;
        if (isMountedRef.current) {
          setState((prev) => ({
            ...prev,
            isRecording: false,
            error: errorMessage,
          }));
        }
        onError?.(errorMessage);
      };

      recognition.onend = () => {
        if (isMountedRef.current) {
          setState((prev) => ({
            ...prev,
            isRecording: false,
            interimTranscript: '',
          }));
        }
        onRecordingStop?.();
      };

      try {
        speechRecognitionRef.current = recognition;
        recognition.start();
        if (isMountedRef.current) {
          setState((prev) => ({
            ...prev,
            isRecording: true,
            error: null,
            interimTranscript: '',
          }));
        }
        onRecordingStart?.();
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to start speech recognition';
        if (isMountedRef.current) {
          setState((prev) => ({
            ...prev,
            isRecording: false,
            error: errorMessage,
          }));
        }
        onError?.(errorMessage);
      }
      return;
    }

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
  }, [
    preferLocal,
    language,
    isSupported,
    state.isRecording,
    getMimeType,
    onError,
    onRecordingStart,
    onRecordingStop,
    onResult,
  ]);

  /**
   * Stop recording and transcribe the audio
   */
  const stopRecording = useCallback(async (): Promise<string> => {
    if (!preferLocal && speechRecognitionRef.current) {
      const recognition = speechRecognitionRef.current;
      speechRecognitionRef.current = null;
      try {
        recognition.stop();
      } catch {
        // noop
      }
      const final = speechFinalTranscriptRef.current.trim();
      if (isMountedRef.current) {
        setState((prev) => ({
          ...prev,
          isRecording: false,
          interimTranscript: '',
          transcript: final,
        }));
      }
      return final;
    }

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

        onRecordingStop?.();

        // Create blob from chunks
        const mimeType = mediaRecorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        audioChunksRef.current = [];

        if (audioBlob.size === 0) {
          const error = 'No audio recorded';
          // HKS-005 fix: Check if still mounted before setState
          if (isMountedRef.current) {
            setState((prev) => ({
              ...prev,
              isRecording: false,
              error,
            }));
          }
          onError?.(error);
          resolve('');
          return;
        }

        // Start transcription
        // HKS-005 fix: Check if still mounted before setState
        if (isMountedRef.current) {
          setState((prev) => ({
            ...prev,
            isRecording: false,
            isTranscribing: true,
            error: null,
          }));
        }

        try {
          const session = supabaseAuth.getSession();
          const accessToken = session?.access_token;
          if (!accessToken) {
            throw new Error('Authentication required for Whisper Cloud transcription');
          }

          const transcriptionFile = new File(
            [audioBlob],
            `voice.${getFormatFromMimeType(mimeType)}`,
            {
              type: mimeType,
            },
          );
          const formData = new FormData();
          formData.append('file', transcriptionFile);
          formData.append('model', 'whisper-1');
          if (language) {
            formData.append('language', language);
          }

          const response = await withTimeout(
            fetch(`${API_BASE_URL}/api/voice/transcribe`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
              body: formData,
            }),
            15000,
          );

          const payload = (await response.json().catch(() => null)) as {
            text?: string;
            error?: { message?: string };
          } | null;
          if (!response.ok) {
            throw new Error(payload?.error?.message || 'Whisper Cloud transcription failed');
          }
          const transcript = (payload?.text || '').trim();

          // HKS-005 fix: Check if still mounted before setState
          if (isMountedRef.current) {
            setState((prev) => ({
              ...prev,
              isTranscribing: false,
              transcript: prev.transcript ? `${prev.transcript} ${transcript}` : transcript,
              error: null,
            }));
          }

          onResult?.(transcript);
          resolve(transcript);
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          // HKS-005 fix: Check if still mounted before setState
          if (isMountedRef.current) {
            setState((prev) => ({
              ...prev,
              isTranscribing: false,
              error: errorMessage,
            }));
          }
          onError?.(errorMessage);
          resolve('');
        }
      };

      mediaRecorder.stop();
    });
  }, [
    preferLocal,
    language,
    state.isRecording,
    state.transcript,
    onResult,
    onError,
    onRecordingStop,
    withTimeout,
  ]);

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
