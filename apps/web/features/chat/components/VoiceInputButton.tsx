'use client';

/**
 * VoiceInputButton – Speech-to-text using the Web Speech API
 *
 * States: idle | listening | processing
 * - Pulsing red mic icon while listening
 * - Graceful degradation when SpeechRecognition is unavailable
 * - On transcript: calls onTranscript(text)
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Mic, MicOff, Loader2 } from 'lucide-react';
import { cn } from '@shared/lib/utils';

// ─── Browser SpeechRecognition type shim ─────────────────────────────────────

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

// Safely detect SpeechRecognition in browser environments
function getSpeechRecognitionConstructor(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === 'undefined') return null;

  const w = window as unknown as Record<string, (new () => SpeechRecognitionInstance) | undefined>;
  return w['SpeechRecognition'] ?? w['webkitSpeechRecognition'] ?? null;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type VoiceState = 'idle' | 'listening' | 'processing';

interface VoiceInputButtonProps {
  /** Called with the final transcript text when speech is recognised */
  onTranscript: (text: string) => void;
  /** Disable the button (e.g. while the chat is loading) */
  disabled?: boolean;
  /** Extra classes on the outer button element */
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function VoiceInputButton({ onTranscript, disabled, className }: VoiceInputButtonProps) {
  const [state, setState] = useState<VoiceState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  // Check support once on client
  const isSupported = typeof window !== 'undefined' && getSpeechRecognitionConstructor() !== null;

  // Clean up on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  const startListening = useCallback(() => {
    if (!isSupported) return;

    const SpeechRecognition = getSpeechRecognitionConstructor()!;
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;

    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = typeof navigator !== 'undefined' ? navigator.language || 'en-US' : 'en-US';

    recognition.onstart = () => {
      setState('listening');
      setError(null);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      setState('processing');
      const results = event.results;
      const transcript = results[event.resultIndex]?.[0]?.transcript ?? '';
      if (transcript.trim()) {
        onTranscript(transcript.trim());
      }
    };

    recognition.onerror = (event) => {
      const err = (event as unknown as { error?: string }).error;
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        setError('Microphone permission denied. Please allow access in your browser settings.');
      } else if (err === 'no-speech') {
        setError('No speech detected. Please try again.');
      } else if (err !== 'aborted') {
        setError('Voice recognition failed. Please try again.');
      }
      setState('idle');
    };

    recognition.onend = () => {
      setState('idle');
      recognitionRef.current = null;
    };

    try {
      recognition.start();
    } catch {
      setError('Could not start voice recognition.');
      setState('idle');
    }
  }, [isSupported, onTranscript]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setState('idle');
  }, []);

  const handleClick = () => {
    if (!isSupported) {
      setShowTooltip(true);
      setTimeout(() => setShowTooltip(false), 3000);
      return;
    }
    if (state === 'listening') {
      stopListening();
    } else if (state === 'idle') {
      setError(null);
      startListening();
    }
  };

  // ── Derived render values ────────────────────────────────────────────────

  const isListening = state === 'listening';
  const isProcessing = state === 'processing';
  const isActive = isListening || isProcessing;

  const label = !isSupported
    ? 'Voice input not supported in this browser'
    : isListening
      ? 'Stop listening'
      : isProcessing
        ? 'Processing…'
        : error
          ? error
          : 'Start voice input';

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || isProcessing}
        aria-label={label}
        aria-pressed={isListening}
        className={cn(
          'relative h-8 w-8 rounded-full flex items-center justify-center transition-all duration-150',
          'text-muted-foreground hover:text-foreground hover:bg-muted/60',
          isListening && [
            'bg-red-500/20 text-red-500 hover:bg-red-500/30 hover:text-red-500',
            'ring-2 ring-red-500/40',
          ],
          isProcessing && 'opacity-70 cursor-not-allowed',
          !isSupported && 'opacity-40 cursor-not-allowed',
          className,
        )}
        onMouseEnter={() => !isSupported && setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onFocus={() => !isSupported && setShowTooltip(true)}
        onBlur={() => setShowTooltip(false)}
      >
        {/* Pulse ring while listening */}
        {isListening && (
          <span
            className="absolute inset-0 rounded-full bg-red-500/20 animate-ping"
            aria-hidden="true"
          />
        )}

        {isProcessing ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : isActive || !isSupported ? (
          <MicOff className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Mic className="h-4 w-4" aria-hidden="true" />
        )}
      </button>

      {/* Error or unsupported tooltip */}
      {(showTooltip || error) && (
        <div
          role="tooltip"
          className={cn(
            'absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50',
            'w-max max-w-[220px] rounded-lg border border-border bg-popover px-3 py-2',
            'text-xs text-popover-foreground shadow-md text-center',
          )}
        >
          {!isSupported
            ? 'Voice input is not supported in this browser. Try Chrome or Edge.'
            : error}
          {/* Arrow */}
          <span
            className="absolute top-full left-1/2 -translate-x-1/2 block w-0 h-0
                       border-l-4 border-r-4 border-t-4
                       border-l-transparent border-r-transparent border-t-border"
            aria-hidden="true"
          />
        </div>
      )}
    </div>
  );
}
