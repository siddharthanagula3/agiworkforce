'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Transcription mode
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
 * Voice settings (web-compatible subset)
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
  /** Use Whisper Cloud (remote) when true, Web Speech API (local) when false (default) */
  preferWhisperCloud?: boolean;
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
  /** Interim transcript (kept for API compatibility) */
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
}

/**
 * Get the auth token from Supabase for REST API calls
 */
async function getAuthToken(): Promise<string> {
  const { getSupabaseClient } = await import('@/services/supabase');
  const supabase = getSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Authentication required for Whisper Cloud transcription');
  }

  return session.access_token;
}

/**
 * Get the MIME type file extension
 */
function getFormatFromMimeType(mimeType: string): string {
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('mp3') || mimeType.includes('mpeg')) return 'mp3';
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'm4a';
  return 'webm';
}

/**
 * Get a user-friendly error message for media errors
 */
function getMediaErrorMessage(err: unknown): string {
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
 * Hook for voice transcription using the Web Speech API or backend Whisper REST API.
 *
 * Web-only version: no Tauri IPC. Uses fetch('/api/voice/transcribe') for the
 * Whisper Cloud path and the browser's Web Speech API for the local path.
 */
export function useVoiceTranscription(
  options: UseVoiceTranscriptionOptions = {},
): UseVoiceTranscriptionReturn {
  const {
    preferWhisperCloud = false,
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

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const speechFinalTranscriptRef = useRef<string>('');
  const speechLastEmittedRef = useRef<string>('');
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const isMountedRef = useRef(true);

  const withTimeout = useCallback(async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
    let timeoutId: number | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = window.setTimeout(
        () => reject(new Error(`Request timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  }, []);

  // Check browser support on mount
  useEffect(() => {
    const supported =
      typeof navigator !== 'undefined' &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function' &&
      typeof MediaRecorder !== 'undefined';

    setIsSupported(supported);

    return () => {
      isMountedRef.current = false;
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
  }, []);

  // Auto-clear transient voice errors so stale banners do not block input affordances
  useEffect(() => {
    if (!state.error) return;
    const timeoutId = window.setTimeout(() => {
      if (!isMountedRef.current) return;
      setState((prev) => ({ ...prev, error: null }));
    }, 4000);
    return () => window.clearTimeout(timeoutId);
  }, [state.error]);

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

    const format = audioFormat || 'webm';
    const preferredMime = mimeTypes[format] || 'audio/webm;codecs=opus';
    if (MediaRecorder.isTypeSupported(preferredMime)) {
      return preferredMime;
    }

    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
      return 'audio/webm;codecs=opus';
    }

    if (MediaRecorder.isTypeSupported('audio/webm')) {
      return 'audio/webm';
    }

    return '';
  }, [audioFormat]);

  /**
   * Start recording audio from the microphone
   */
  const startRecording = useCallback(async (): Promise<void> => {
    // When not using Whisper Cloud, use Web Speech API (local, no server round-trip)
    if (!preferWhisperCloud) {
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

    // Whisper Cloud path: use MediaRecorder + POST /api/voice/transcribe
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
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
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
      mediaRecorder.start(100);

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
    preferWhisperCloud,
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
    // Web Speech API path
    if (!preferWhisperCloud && speechRecognitionRef.current) {
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
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }

        onRecordingStop?.();

        const mimeType = mediaRecorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        audioChunksRef.current = [];

        if (audioBlob.size === 0) {
          const error = 'No audio recorded';
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

        if (isMountedRef.current) {
          setState((prev) => ({
            ...prev,
            isRecording: false,
            isTranscribing: true,
            error: null,
          }));
        }

        try {
          const accessToken = await getAuthToken();

          const transcriptionFile = new File(
            [audioBlob],
            `voice.${getFormatFromMimeType(mimeType)}`,
            { type: mimeType },
          );
          const formData = new FormData();
          formData.append('file', transcriptionFile);
          formData.append('model', 'whisper-1');
          if (language) {
            formData.append('language', language);
          }

          const response = await withTimeout(
            fetch('/api/voice/transcribe', {
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
    preferWhisperCloud,
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

  return {
    ...state,
    isSupported,
    startRecording,
    stopRecording,
    toggleRecording,
    clearTranscript,
  };
}

export default useVoiceTranscription;
