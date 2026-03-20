/**
 * VoiceMode Component
 *
 * Full-screen voice interaction overlay that creates a hands-free conversational
 * experience. Displays an animated orb/waveform showing the current state
 * (idle, listening, processing, speaking), transcripts of user speech and AI
 * responses, and push-to-talk via spacebar hold.
 *
 * States:
 *   idle       -> pulsing orb, waiting for user to press and hold spacebar
 *   listening  -> animated waveform reacting to microphone input
 *   processing -> spinning/morphing orb while transcribing + generating response
 *   speaking   -> gentle pulsing orb while TTS reads the AI response
 */

import React, { useCallback, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Mic, MicOff, X, RotateCcw, Volume2 } from 'lucide-react';
import { useVoiceModeStore, type VoiceModePhase } from '../../stores/voiceModeStore';
import { cn } from '../../lib/utils';

// ---------------------------------------------------------------------------
// Orb Visualization
// ---------------------------------------------------------------------------

interface OrbProps {
  phase: VoiceModePhase;
  audioLevel: number;
}

/** Animated orb that visually represents the current voice state */
const VoiceOrb: React.FC<OrbProps> = ({ phase, audioLevel }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const timeRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 240;
    canvas.width = size * 2; // retina
    canvas.height = size * 2;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(2, 2);

    const cx = size / 2;
    const cy = size / 2;
    const baseRadius = 60;

    const draw = () => {
      timeRef.current += 0.02;
      const t = timeRef.current;

      ctx.clearRect(0, 0, size, size);

      // Phase-specific colors and behavior
      let primaryColor: string;
      let glowColor: string;
      let radiusMultiplier = 1;
      let waveAmplitude = 0;
      let rotationSpeed = 1;

      switch (phase) {
        case 'listening':
          primaryColor = 'rgba(239, 68, 68, 0.9)'; // red
          glowColor = 'rgba(239, 68, 68, 0.15)';
          radiusMultiplier = 1 + audioLevel * 0.4;
          waveAmplitude = 8 + audioLevel * 20;
          rotationSpeed = 2;
          break;
        case 'processing':
          primaryColor = 'rgba(168, 85, 247, 0.9)'; // purple
          glowColor = 'rgba(168, 85, 247, 0.15)';
          radiusMultiplier = 1 + Math.sin(t * 3) * 0.08;
          waveAmplitude = 4;
          rotationSpeed = 4;
          break;
        case 'speaking':
          primaryColor = 'rgba(59, 130, 246, 0.9)'; // blue
          glowColor = 'rgba(59, 130, 246, 0.15)';
          radiusMultiplier = 1 + Math.sin(t * 2) * 0.05;
          waveAmplitude = 6 + Math.sin(t * 1.5) * 4;
          rotationSpeed = 1.5;
          break;
        default: // idle
          primaryColor = 'rgba(156, 163, 175, 0.6)'; // gray
          glowColor = 'rgba(156, 163, 175, 0.08)';
          radiusMultiplier = 1 + Math.sin(t) * 0.02;
          waveAmplitude = 2;
          rotationSpeed = 0.5;
      }

      const radius = baseRadius * radiusMultiplier;

      // Outer glow rings
      for (let ring = 3; ring >= 1; ring--) {
        const ringRadius = radius + ring * 18 + Math.sin(t * rotationSpeed + ring) * 4;
        const gradient = ctx.createRadialGradient(cx, cy, ringRadius - 10, cx, cy, ringRadius + 10);
        gradient.addColorStop(0, 'transparent');
        gradient.addColorStop(0.5, glowColor);
        gradient.addColorStop(1, 'transparent');

        ctx.beginPath();
        ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
        ctx.strokeStyle = glowColor;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Main orb with wavy edges
      ctx.beginPath();
      const segments = 64;
      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        const wave =
          Math.sin(angle * 3 + t * rotationSpeed) * waveAmplitude +
          Math.sin(angle * 5 - t * rotationSpeed * 0.7) * (waveAmplitude * 0.5);
        const r = radius + wave;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.closePath();

      // Fill with radial gradient
      const fillGradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius + waveAmplitude);
      fillGradient.addColorStop(0, primaryColor);
      fillGradient.addColorStop(0.7, primaryColor);
      fillGradient.addColorStop(1, 'transparent');
      ctx.fillStyle = fillGradient;
      ctx.fill();

      // Inner highlight
      const innerGradient = ctx.createRadialGradient(
        cx - radius * 0.2,
        cy - radius * 0.2,
        0,
        cx,
        cy,
        radius * 0.6,
      );
      innerGradient.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
      innerGradient.addColorStop(1, 'transparent');
      ctx.fillStyle = innerGradient;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.6, 0, Math.PI * 2);
      ctx.fill();

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animRef.current);
    };
  }, [phase, audioLevel]);

  return <canvas ref={canvasRef} className="pointer-events-none" aria-hidden="true" />;
};

// ---------------------------------------------------------------------------
// Transcript Display
// ---------------------------------------------------------------------------

interface TranscriptProps {
  userText: string;
  aiText: string;
  phase: VoiceModePhase;
}

const TranscriptDisplay: React.FC<TranscriptProps> = ({ userText, aiText, phase }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [userText, aiText]);

  return (
    <div
      ref={scrollRef}
      className="flex flex-col gap-3 max-h-48 overflow-y-auto px-2 scrollbar-thin scrollbar-thumb-white/10"
    >
      <AnimatePresence mode="popLayout">
        {userText && (
          <motion.div
            key="user"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="text-center"
          >
            <span className="inline-block px-4 py-2 rounded-2xl bg-white/10 text-white/90 text-sm leading-relaxed max-w-md">
              {userText}
            </span>
          </motion.div>
        )}

        {aiText && (
          <motion.div
            key="ai"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="text-center"
          >
            <span className="inline-block px-4 py-2 rounded-2xl bg-blue-500/20 text-blue-100 text-sm leading-relaxed max-w-md">
              {aiText}
            </span>
          </motion.div>
        )}

        {phase === 'processing' && !aiText && (
          <motion.div
            key="thinking"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-center"
          >
            <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-purple-500/20 text-purple-200 text-sm">
              <span className="flex gap-1">
                <span
                  className="w-1.5 h-1.5 rounded-full bg-purple-300 animate-bounce"
                  style={{ animationDelay: '0ms' }}
                />
                <span
                  className="w-1.5 h-1.5 rounded-full bg-purple-300 animate-bounce"
                  style={{ animationDelay: '150ms' }}
                />
                <span
                  className="w-1.5 h-1.5 rounded-full bg-purple-300 animate-bounce"
                  style={{ animationDelay: '300ms' }}
                />
              </span>
              Thinking
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ---------------------------------------------------------------------------
// History Panel
// ---------------------------------------------------------------------------

interface HistoryProps {
  turns: Array<{ id: string; userText: string; aiText: string }>;
}

const ConversationHistory: React.FC<HistoryProps> = ({ turns }) => {
  if (turns.length === 0) return null;

  // Show only the last 3 turns to keep the overlay clean
  const recentTurns = turns.slice(-3);

  return (
    <div className="flex flex-col gap-2 w-full max-w-lg mx-auto">
      {recentTurns.map((turn) => (
        <div key={turn.id} className="flex flex-col gap-1 px-4">
          <div className="text-right">
            <span className="inline-block px-3 py-1.5 rounded-xl bg-white/5 text-white/50 text-xs leading-relaxed max-w-xs truncate">
              {turn.userText}
            </span>
          </div>
          <div className="text-left">
            <span className="inline-block px-3 py-1.5 rounded-xl bg-blue-500/5 text-blue-200/50 text-xs leading-relaxed max-w-xs truncate">
              {turn.aiText}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main VoiceMode Component
// ---------------------------------------------------------------------------

export const VoiceMode: React.FC = () => {
  const isOpen = useVoiceModeStore((s) => s.isOpen);
  const phase = useVoiceModeStore((s) => s.phase);
  const userTranscript = useVoiceModeStore((s) => s.userTranscript);
  const aiResponse = useVoiceModeStore((s) => s.aiResponse);
  const error = useVoiceModeStore((s) => s.error);
  const turns = useVoiceModeStore((s) => s.turns);
  const audioLevel = useVoiceModeStore((s) => s.audioLevel);

  const close = useVoiceModeStore((s) => s.close);
  const startListening = useVoiceModeStore((s) => s.startListening);
  const stopListeningAndProcess = useVoiceModeStore((s) => s.stopListeningAndProcess);
  const stopTts = useVoiceModeStore((s) => s.stopTts);
  const reset = useVoiceModeStore((s) => s.reset);
  const bargeInEnabled = useVoiceModeStore((s) => s.bargeInEnabled);
  const capabilities = useVoiceModeStore((s) => s.capabilities);

  const spaceHeldRef = useRef(false);

  // Push-to-talk: spacebar hold
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ignore if focus is in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.code === 'Space' && !e.repeat && !spaceHeldRef.current) {
        e.preventDefault();
        spaceHeldRef.current = true;

        // If speaking, interrupt TTS via backend and start new recording
        if (phase === 'speaking') {
          stopTts().then(() => startListening());
        } else {
          startListening();
        }
      }

      // Escape to close
      if (e.code === 'Escape') {
        close();
      }
    },
    [startListening, stopTts, close, phase],
  );

  const handleKeyUp = useCallback(
    (e: KeyboardEvent) => {
      if (e.code === 'Space' && spaceHeldRef.current) {
        e.preventDefault();
        spaceHeldRef.current = false;
        stopListeningAndProcess();
      }
    },
    [stopListeningAndProcess],
  );

  // Register keyboard listeners when voice mode is open
  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isOpen, handleKeyDown, handleKeyUp]);

  // Phase label
  const phaseLabel = (() => {
    switch (phase) {
      case 'listening':
        return 'Listening...';
      case 'processing':
        return 'Processing...';
      case 'speaking':
        return 'Speaking...';
      default:
        return 'Hold spacebar to talk';
    }
  })();

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-[var(--z-overlay)] flex flex-col items-center justify-center bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950"
      role="dialog"
      aria-modal="true"
      aria-label="Voice mode"
    >
      {/* Top bar with close + reset */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4">
        <button
          type="button"
          onClick={reset}
          className="p-2 rounded-full text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors"
          title="Reset conversation"
          aria-label="Reset voice conversation"
        >
          <RotateCcw size={20} />
        </button>
        <div className="flex items-center gap-2 text-sm text-white/40 font-medium select-none">
          <span>Voice Mode</span>
          {bargeInEnabled && (
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30">
              Barge-in
            </span>
          )}
          {capabilities?.localSttAvailable && (
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-green-500/20 text-green-300 border border-green-500/30">
              Local STT
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={close}
          className="p-2 rounded-full text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors"
          title="Exit voice mode (Esc)"
          aria-label="Exit voice mode"
        >
          <X size={20} />
        </button>
      </div>

      {/* Conversation history (faded, above the orb) */}
      <div className="absolute top-16 left-0 right-0 flex justify-center pointer-events-none opacity-60">
        <ConversationHistory turns={turns.slice(0, -1)} />
      </div>

      {/* Central orb */}
      <div className="flex flex-col items-center gap-8">
        <VoiceOrb phase={phase} audioLevel={audioLevel} />

        {/* Phase label */}
        <motion.div
          key={phase}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-white/60 text-sm font-medium select-none"
        >
          {phaseLabel}
        </motion.div>
      </div>

      {/* Transcript area */}
      <div className="absolute bottom-32 left-0 right-0 flex justify-center px-8">
        <div className="w-full max-w-lg">
          <TranscriptDisplay userText={userTranscript} aiText={aiResponse} phase={phase} />
        </div>
      </div>

      {/* Bottom controls */}
      <div className="absolute bottom-8 left-0 right-0 flex flex-col items-center gap-4">
        {/* Error display */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="px-4 py-2 rounded-full bg-red-500/20 border border-red-500/30 text-red-300 text-xs max-w-sm text-center"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action buttons */}
        <div className="flex items-center gap-4">
          {/* Mic tap button (alternative to spacebar hold) */}
          <button
            type="button"
            onPointerDown={() => {
              if (phase === 'idle') {
                startListening();
              }
            }}
            onPointerUp={() => {
              if (phase === 'listening') {
                stopListeningAndProcess();
              }
            }}
            onPointerLeave={() => {
              if (phase === 'listening') {
                stopListeningAndProcess();
              }
            }}
            disabled={phase === 'processing'}
            className={cn(
              'w-16 h-16 rounded-full flex items-center justify-center transition-all duration-200 shadow-lg',
              phase === 'listening'
                ? 'bg-red-500 text-white scale-110 shadow-red-500/30'
                : phase === 'processing'
                  ? 'bg-purple-600/50 text-white/50 cursor-not-allowed'
                  : phase === 'speaking'
                    ? 'bg-blue-500/80 text-white hover:bg-blue-500'
                    : 'bg-white/10 text-white/80 hover:bg-white/20 hover:scale-105',
            )}
            title={
              phase === 'listening'
                ? 'Release to send'
                : phase === 'processing'
                  ? 'Processing...'
                  : phase === 'speaking'
                    ? 'Tap to stop'
                    : 'Hold to talk'
            }
            aria-label={
              phase === 'listening' ? 'Release to send voice message' : 'Hold to start recording'
            }
          >
            {phase === 'listening' ? (
              <MicOff size={24} />
            ) : phase === 'speaking' ? (
              <Volume2 size={24} />
            ) : (
              <Mic size={24} />
            )}
          </button>

          {/* Stop speaking button -- uses backend voice_tts_stop */}
          {phase === 'speaking' && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              type="button"
              onClick={() => void stopTts()}
              className="px-4 py-2 rounded-full bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition-colors text-sm"
              aria-label="Stop speaking"
            >
              Stop
            </motion.button>
          )}
        </div>

        {/* Hint text */}
        <p className="text-white/30 text-xs select-none">
          {phase === 'idle'
            ? 'Hold spacebar or press the mic button to speak'
            : phase === 'listening'
              ? 'Release to send'
              : phase === 'speaking'
                ? 'Press spacebar to interrupt'
                : ''}
        </p>
      </div>
    </motion.div>
  );
};

export default VoiceMode;
