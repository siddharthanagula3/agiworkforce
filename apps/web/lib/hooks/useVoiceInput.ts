'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface VoiceInputState {
  isListening: boolean;
  isSupported: boolean;
  transcript: string;
  interimTranscript: string;
  error: string | null;
  confidence: number;
}

export interface UseVoiceInputOptions {
  continuous?: boolean;
  interimResults?: boolean;
  language?: string;
  onResult?: (transcript: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
}

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

export function useVoiceInput(options: UseVoiceInputOptions = {}) {
  const {
    continuous = false,
    interimResults = true,
    language = 'en-US',
    onResult,
    onError,
    onEnd,
  } = options;

  const [state, setState] = useState<VoiceInputState>({
    isListening: false,
    isSupported: false,
    transcript: '',
    interimTranscript: '',
    error: null,
    confidence: 0,
  });

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const isManualStop = useRef(false);
  const isMountedRef = useRef(true);

  // Use refs to avoid recreating recognition on callback changes
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  const onEndRef = useRef(onEnd);

  useEffect(() => {
    onResultRef.current = onResult;
    onErrorRef.current = onError;
    onEndRef.current = onEnd;
  }, [onResult, onError, onEnd]);

  useEffect(() => {
    isMountedRef.current = true;
    const SpeechRecognitionCtor = getSpeechRecognitionConstructor();
    const isSupported = !!SpeechRecognitionCtor;

    setState((prev) => ({ ...prev, isSupported }));

    if (isSupported) {
      // Abort and nullify any existing instance before creating a new one,
      // so the guard below doesn't prevent recreation after cleanup.
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // Abort may fail if already stopped
        }
        recognitionRef.current = null;
      }

      const recognition = new SpeechRecognitionCtor();
      recognition.continuous = continuous;
      recognition.interimResults = interimResults;
      recognition.lang = language;

      recognition.onstart = () => {
        setState((prev) => ({
          ...prev,
          isListening: true,
          error: null,
        }));
      };

      recognition.onresult = (event) => {
        let finalTranscript = '';
        let interimTranscript = '';
        let maxConfidence = 0;

        const speechEvent = event as Event & {
          resultIndex?: number;
          results?: ArrayLike<{
            isFinal?: boolean;
            0?: { transcript?: string; confidence?: number };
          }>;
        };
        const resultIndex = speechEvent.resultIndex ?? 0;
        const results = speechEvent.results;
        if (!results) {
          return;
        }

        for (let i = resultIndex; i < results.length; i++) {
          const result = results?.[i];
          if (!result) continue;

          const transcript = result[0]?.transcript ?? '';
          const confidence = result[0]?.confidence ?? 0;

          if (result.isFinal) {
            finalTranscript += transcript;
            maxConfidence = Math.max(maxConfidence, confidence);
          } else {
            interimTranscript += transcript;
          }
        }

        setState((prev) => ({
          ...prev,
          transcript: prev.transcript + finalTranscript,
          interimTranscript,
          confidence: maxConfidence || prev.confidence,
        }));

        if (finalTranscript) {
          onResultRef.current?.(finalTranscript, true);
        } else if (interimTranscript) {
          onResultRef.current?.(interimTranscript, false);
        }
      };

      recognition.onerror = (event) => {
        const speechEvent = event as Event & { error?: string };
        const errorMessage = getErrorMessage(speechEvent.error || 'unknown');
        setState((prev) => ({
          ...prev,
          isListening: false,
          error: errorMessage,
        }));
        onErrorRef.current?.(errorMessage);
      };

      recognition.onend = () => {
        if (!isMountedRef.current) return;

        setState((prev) => ({
          ...prev,
          isListening: false,
          interimTranscript: '',
        }));

        if (continuous && !isManualStop.current && recognitionRef.current && isMountedRef.current) {
          try {
            recognitionRef.current.start();
          } catch {
            // Auto-restart failure is non-critical
          }
        }

        onEndRef.current?.();
      };

      recognitionRef.current = recognition;
    }

    return () => {
      isMountedRef.current = false;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // Cleanup abort may fail if already stopped
        }
        recognitionRef.current = null;
      }
    };
  }, [continuous, interimResults, language]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current || state.isListening) return;

    isManualStop.current = false;
    setState((prev) => ({
      ...prev,
      transcript: '',
      interimTranscript: '',
      error: null,
    }));

    try {
      recognitionRef.current.start();
    } catch {
      setState((prev) => ({
        ...prev,
        error: 'Failed to start voice recognition',
      }));
    }
  }, [state.isListening]);

  const stopListening = useCallback(() => {
    if (!recognitionRef.current || !state.isListening) return;

    isManualStop.current = true;
    try {
      recognitionRef.current.stop();
    } catch {
      // Stop may fail if already stopped
    }
  }, [state.isListening]);

  const toggleListening = useCallback(() => {
    if (state.isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [state.isListening, startListening, stopListening]);

  const resetTranscript = useCallback(() => {
    setState((prev) => ({
      ...prev,
      transcript: '',
      interimTranscript: '',
    }));
  }, []);

  return {
    ...state,
    startListening,
    stopListening,
    toggleListening,
    resetTranscript,
  };
}

function getErrorMessage(error: string): string {
  switch (error) {
    case 'no-speech':
      return 'No speech detected. Please try again.';
    case 'audio-capture':
      return 'No microphone found. Please check your audio settings.';
    case 'not-allowed':
      return 'Microphone permission denied. Please allow microphone access.';
    case 'network':
      return 'Network error. Please check your connection.';
    case 'aborted':
      return 'Voice input was cancelled.';
    case 'language-not-supported':
      return 'Language not supported.';
    case 'service-not-allowed':
      return 'Speech recognition service not allowed.';
    default:
      return `Voice input error: ${error}`;
  }
}

export default useVoiceInput;
