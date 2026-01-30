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

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

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

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const isManualStop = useRef(false);
  // AUDIT-007-003 fix: Track mounted state to prevent auto-restart after unmount
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
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const isSupported = !!SpeechRecognition;

    setState((prev) => ({ ...prev, isSupported }));

    if (isSupported && !recognitionRef.current) {
      const recognition = new SpeechRecognition();
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

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let finalTranscript = '';
        let interimTranscript = '';
        let maxConfidence = 0;

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results?.[i];
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

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        const errorMessage = getErrorMessage(event.error);
        setState((prev) => ({
          ...prev,
          isListening: false,
          error: errorMessage,
        }));
        onErrorRef.current?.(errorMessage);
      };

      recognition.onend = () => {
        // AUDIT-007-003 fix: Check isMounted before setState and auto-restart
        if (!isMountedRef.current) return;

        setState((prev) => ({
          ...prev,
          isListening: false,
          interimTranscript: '',
        }));

        // AUDIT-007-003 fix: Add isMounted check before auto-restart in continuous mode
        if (continuous && !isManualStop.current && recognitionRef.current && isMountedRef.current) {
          try {
            recognitionRef.current.start();
          } catch {
            // AUDIT-P3-ERROR: Intentionally ignored - auto-restart failure is non-critical
            // The recognition may have been aborted or the browser may have restrictions
          }
        }

        onEndRef.current?.();
      };

      recognitionRef.current = recognition;
    }

    return () => {
      // AUDIT-007-003 fix: Set isMounted to false before cleanup
      isMountedRef.current = false;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // AUDIT-P3-ERROR: Intentionally ignored - cleanup abort may fail if already stopped
        }
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
      // AUDIT-P3-ERROR: Intentionally ignored - stop may fail if already stopped
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
