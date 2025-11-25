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

// Web Speech API type definitions
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

  // Check for browser support
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
          onResult?.(finalTranscript, true);
        } else if (interimTranscript) {
          onResult?.(interimTranscript, false);
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        const errorMessage = getErrorMessage(event.error);
        setState((prev) => ({
          ...prev,
          isListening: false,
          error: errorMessage,
        }));
        onError?.(errorMessage);
      };

      recognition.onend = () => {
        setState((prev) => ({
          ...prev,
          isListening: false,
          interimTranscript: '',
        }));

        // Auto-restart if continuous and not manually stopped
        if (continuous && !isManualStop.current && recognitionRef.current) {
          try {
            recognitionRef.current.start();
          } catch {
            // Ignore errors on restart
          }
        }

        onEnd?.();
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // Ignore cleanup errors
        }
      }
    };
  }, [continuous, interimResults, language, onResult, onError, onEnd]);

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
    } catch (err) {
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
      // Ignore stop errors
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
