import { useState, useRef, useCallback, useEffect } from 'react';

export type VoiceInputState = 'idle' | 'listening' | 'error' | 'unsupported';

interface UseVoiceInputOptions {
  onTranscript: (text: string) => void;
  scopeKey?: string | null;
}

interface SpeechRecognitionEvent extends Event {
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }
}

export function useVoiceInput({ onTranscript, scopeKey }: UseVoiceInputOptions) {
  const [state, setState] = useState<VoiceInputState>(() => {
    if (typeof window === 'undefined') return 'unsupported';
    return window.SpeechRecognition || window.webkitSpeechRecognition ? 'idle' : 'unsupported';
  });

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const stopRequestedRef = useRef(false);

  useEffect(() => {
    setState((previous) => (previous === 'unsupported' ? previous : 'idle'));
    return () => {
      const recognition = recognitionRef.current;
      recognitionRef.current = null;
      recognition?.abort();
    };
  }, [scopeKey]);

  const start = useCallback(() => {
    if (typeof window === 'undefined') return;
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) {
      setState('unsupported');
      return;
    }

    if (recognitionRef.current) {
      stopRequestedRef.current = true;
      recognitionRef.current.stop();
      return;
    }

    const recognition = new Ctor();
    stopRequestedRef.current = false;
    let receivedTranscript = false;
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      if (recognitionRef.current !== recognition) return;
      const transcript = Array.from(event.results)
        .map((r) => r[0]?.transcript ?? '')
        .join(' ')
        .trim();
      if (transcript) {
        receivedTranscript = true;
        onTranscript(transcript);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (recognitionRef.current !== recognition) return;
      if (event.error !== 'aborted') {
        setState('error');
      }
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return;
      setState(!receivedTranscript && !stopRequestedRef.current ? 'error' : 'idle');
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    setState('listening');
    recognition.start();
  }, [onTranscript]);

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      stopRequestedRef.current = true;
      recognitionRef.current.stop();
    }
  }, []);

  return { state, start, stop };
}
