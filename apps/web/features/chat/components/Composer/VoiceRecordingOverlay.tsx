'use client';

/**
 * VoiceRecordingOverlay - Overlay shown during voice recording
 *
 * - "Listening..." text + elapsed timer
 * - Cancel (X) and Done (checkmark) buttons
 * - 4 animated waveform bars with staggered animation
 */

import { memo } from 'react';
import { X, Check, Loader2 } from 'lucide-react';
import { cn } from '@shared/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

interface VoiceRecordingOverlayProps {
  /** Whether actively recording */
  isListening: boolean;
  /** Whether transcribing the recording */
  isTranscribing: boolean;
  /** Elapsed recording time in seconds */
  elapsedSeconds: number;
  /** Called when the user clicks the Done/check button */
  onDone: () => void;
  /** Called when the user clicks the Cancel/X button */
  onCancel: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── Waveform Bars ───────────────────────────────────────────────────────────

const BAR_DELAYS = ['0s', '0.15s', '0.3s', '0.45s'];
const BAR_HEIGHTS = ['60%', '100%', '75%', '90%'];

function WaveformBars({ animate }: { animate: boolean }) {
  return (
    <div className="flex items-end justify-center gap-[3px] h-6" aria-hidden="true">
      {BAR_DELAYS.map((delay, i) => (
        <div
          key={i}
          className={cn(
            'w-[3px] rounded-full bg-red-400 transition-all duration-300',
            animate ? 'animate-[waveform_0.8s_ease-in-out_infinite_alternate]' : 'h-1',
          )}
          style={{
            animationDelay: animate ? delay : undefined,
            height: animate ? undefined : '4px',
            // Set a max-height via custom property so the animation can use it

            ['--bar-height' as any]: BAR_HEIGHTS[i],
          }}
        />
      ))}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

function VoiceRecordingOverlayComponent({
  isListening,
  isTranscribing,
  elapsedSeconds,
  onDone,
  onCancel,
}: VoiceRecordingOverlayProps) {
  return (
    <>
      {/* Inject keyframes for the waveform animation */}
      <style>{`
        @keyframes waveform {
          0% {
            height: 4px;
          }
          100% {
            height: var(--bar-height, 100%);
          }
        }
      `}</style>

      <div
        className={cn(
          'absolute bottom-full left-1/2 -translate-x-1/2 mb-3 z-50',
          'flex flex-col items-center gap-3 rounded-2xl',
          'border border-border/60 bg-popover/95 px-6 py-4 shadow-xl backdrop-blur-xl',
          'min-w-[200px]',
        )}
        role="status"
        aria-live="polite"
        aria-label={isTranscribing ? 'Processing voice input' : 'Recording voice input'}
      >
        {/* Status text + timer */}
        <div className="flex flex-col items-center gap-1.5">
          {isTranscribing ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-sm font-medium text-foreground">Processing...</span>
            </>
          ) : (
            <>
              {/* Waveform visualization */}
              <WaveformBars animate={isListening} />

              <span className="text-sm font-medium text-foreground">
                {isListening ? 'Listening...' : 'Ready'}
              </span>

              {/* Timer */}
              <span className="font-mono text-xs text-muted-foreground">
                {formatTimer(elapsedSeconds)}
              </span>
            </>
          )}
        </div>

        {/* Action buttons */}
        {!isTranscribing && (
          <div className="flex items-center gap-3">
            {/* Cancel */}
            <button
              type="button"
              onClick={onCancel}
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-full',
                'border border-border bg-muted/50 text-muted-foreground',
                'hover:bg-muted hover:text-foreground transition-colors',
              )}
              aria-label="Cancel recording"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Done */}
            <button
              type="button"
              onClick={onDone}
              disabled={!isListening}
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-full',
                'bg-red-500 text-white shadow-sm',
                'hover:bg-red-600 transition-colors',
                'disabled:opacity-40 disabled:cursor-not-allowed',
              )}
              aria-label="Finish recording"
            >
              <Check className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </>
  );
}

export const VoiceRecordingOverlay = memo(VoiceRecordingOverlayComponent);
VoiceRecordingOverlay.displayName = 'VoiceRecordingOverlay';
