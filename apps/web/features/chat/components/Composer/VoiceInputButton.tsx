'use client';

/**
 * VoiceInputButton - Mic button for the chat composer
 *
 * States:
 * - Idle: microphone icon
 * - Recording: pulsing red ring + elapsed timer
 * - Processing: spinner
 *
 * Uses the voiceInputStore (Zustand) which handles both Web Speech API
 * and server-side transcription fallback.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Loader2 } from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { useVoiceInputStore } from '@features/chat/stores/voice-input-store';
import { VoiceRecordingOverlay } from './VoiceRecordingOverlay';

// ─── Types ───────────────────────────────────────────────────────────────────

interface VoiceInputButtonProps {
  /** Called with the final transcript text */
  onTranscript: (text: string) => void;
  /** Disable the button (e.g. while chat is loading) */
  disabled?: boolean;
  /** Extra classes on the outer wrapper */
  className?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function VoiceInputButton({ onTranscript, disabled, className }: VoiceInputButtonProps) {
  const mode = useVoiceInputStore((s) => s.mode);
  const transcript = useVoiceInputStore((s) => s.transcript);
  const error = useVoiceInputStore((s) => s.error);
  const startListening = useVoiceInputStore((s) => s.startListening);
  const stopListening = useVoiceInputStore((s) => s.stopListening);
  const clearTranscript = useVoiceInputStore((s) => s.clearTranscript);
  const clearError = useVoiceInputStore((s) => s.clearError);

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showOverlay, setShowOverlay] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isListening = mode === 'listening';
  const isTranscribing = mode === 'transcribing';
  const isActive = isListening || isTranscribing;

  // Check for basic browser support
  const isSupported =
    typeof window !== 'undefined' &&
    !!(
      (typeof window !== 'undefined' &&
        ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)) ||
      (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function')
    );

  // ── Timer for recording duration ───────────────────────────────────────

  useEffect(() => {
    if (isListening) {
      setElapsedSeconds(0);
      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isListening]);

  // ── Consume transcript when it arrives ─────────────────────────────────

  useEffect(() => {
    if (transcript && transcript.trim()) {
      onTranscript(transcript.trim());
      clearTranscript();
      setShowOverlay(false);
    }
  }, [transcript, onTranscript, clearTranscript]);

  // ── Close overlay when we leave active states ──────────────────────────

  useEffect(() => {
    if (mode === 'idle' && !transcript) {
      // Small delay so the user can see the transition
      const timeout = setTimeout(() => setShowOverlay(false), 150);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [mode, transcript]);

  // ── Actions ────────────────────────────────────────────────────────────

  const handleStart = useCallback(async () => {
    if (!isSupported) {
      setShowTooltip(true);
      setTimeout(() => setShowTooltip(false), 3000);
      return;
    }
    clearError();
    setShowOverlay(true);
    await startListening();
  }, [isSupported, clearError, startListening]);

  const handleStop = useCallback(async () => {
    await stopListening();
  }, [stopListening]);

  const handleCancel = useCallback(() => {
    if (isListening) {
      // Force stop and discard
      stopListening().then(() => {
        clearTranscript();
        setShowOverlay(false);
      });
    } else {
      setShowOverlay(false);
    }
  }, [isListening, stopListening, clearTranscript]);

  const handleClick = useCallback(() => {
    if (isListening) {
      handleStop();
    } else if (mode === 'idle') {
      handleStart();
    }
  }, [isListening, mode, handleStop, handleStart]);

  // ── Render ─────────────────────────────────────────────────────────────

  const label = !isSupported
    ? 'Voice input not supported in this browser'
    : isListening
      ? `Recording ${formatTimer(elapsedSeconds)} - click to stop`
      : isTranscribing
        ? 'Processing voice...'
        : error
          ? error
          : 'Start voice input';

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || isTranscribing}
        aria-label={label}
        aria-pressed={isListening}
        className={cn(
          'relative flex h-9 w-9 items-center justify-center rounded-full transition-all duration-150',
          'text-muted-foreground hover:text-foreground hover:bg-muted/60',
          isListening && [
            'bg-red-500/20 text-red-500 hover:bg-red-500/30 hover:text-red-500',
            'ring-2 ring-red-500/40',
          ],
          isTranscribing && 'opacity-70 cursor-not-allowed',
          !isSupported && 'opacity-40 cursor-not-allowed',
          (disabled || isTranscribing) && 'cursor-not-allowed opacity-50',
        )}
        onMouseEnter={() => !isSupported && setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {/* Pulse ring while listening */}
        {isListening && (
          <span
            className="absolute inset-0 rounded-full bg-red-500/20 animate-ping"
            aria-hidden="true"
          />
        )}

        {isTranscribing ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : isActive || !isSupported ? (
          <MicOff className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Mic className="h-4 w-4" aria-hidden="true" />
        )}
      </button>

      {/* Timer badge while listening */}
      {isListening && (
        <span className="absolute -top-1.5 -right-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] font-medium text-white shadow-sm">
          {formatTimer(elapsedSeconds)}
        </span>
      )}

      {/* Unsupported / error tooltip */}
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
          <span
            className="absolute top-full left-1/2 -translate-x-1/2 block w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-border"
            aria-hidden="true"
          />
        </div>
      )}

      {/* Recording overlay */}
      {showOverlay && (
        <VoiceRecordingOverlay
          isListening={isListening}
          isTranscribing={isTranscribing}
          elapsedSeconds={elapsedSeconds}
          onDone={handleStop}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
}
