import { useState, useRef, useCallback } from 'react';

export type VoiceInputState = 'idle' | 'listening' | 'error' | 'unsupported';

interface UseVoiceInputOptions {
  onTranscript: (text: string) => void;
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

export function useVoiceInput({ onTranscript }: UseVoiceInputOptions) {
  const [state, setState] = useState<VoiceInputState>(() => {
    if (typeof window === 'undefined') return 'unsupported';
    return window.SpeechRecognition || window.webkitSpeechRecognition ? 'idle' : 'unsupported';
  });

  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const start = useCallback(() => {
    if (typeof window === 'undefined') return;
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) {
      setState('unsupported');
      return;
    }

    // Already listening — stop instead
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }

    const recognition = new Ctor();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = Array.from(event.results)
        .map((r) => r[0]?.transcript ?? '')
        .join(' ')
        .trim();
      if (transcript) onTranscript(transcript);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // 'aborted' happens on manual stop — not a real error
      if (event.error !== 'aborted') {
        setState('error');
      }
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      setState((prev) => (prev === 'error' ? 'error' : 'idle'));
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    setState('listening');
    recognition.start();
  }, [onTranscript]);

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, []);

  return { state, start, stop };
}
