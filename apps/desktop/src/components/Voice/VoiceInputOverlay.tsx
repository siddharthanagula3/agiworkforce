import { useEffect, useRef } from 'react';
import { CheckCheck, Loader2, Mic, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useVoiceInputStore } from '../../stores/voiceInputStore';
import { cn } from '../../lib/utils';

/** How long (ms) the preview is shown before auto-inserting into the composer */
const PREVIEW_AUTO_CONFIRM_MS = 2000;

/**
 * Floating overlay that appears over the chat composer while the user is
 * dictating (listening), waiting for Whisper (transcribing), waiting for
 * AI cleanup (processing), or previewing the result before insertion.
 * Returns null when idle.
 *
 * Visual states:
 *   listening    → pulsing red mic circle + "Release to transcribe"
 *   transcribing → grey spinner + "Transcribing..."
 *   processing   → grey sparkles + "Cleaning up..."
 *   preview      → green check + transcript text preview + "Inserting in Xs..."
 */
export function VoiceInputOverlay() {
  const mode = useVoiceInputStore((s) => s.mode);
  const error = useVoiceInputStore((s) => s.error);
  const postProcessingMode = useVoiceInputStore((s) => s.postProcessingMode);
  const pendingTranscript = useVoiceInputStore((s) => s.pendingTranscript);
  const confirmTranscript = useVoiceInputStore((s) => s.confirmTranscript);

  // Auto-confirm after PREVIEW_AUTO_CONFIRM_MS when in preview mode
  const confirmRef = useRef(confirmTranscript);
  confirmRef.current = confirmTranscript;
  useEffect(() => {
    if (mode !== 'preview') return;
    const timer = setTimeout(() => confirmRef.current(), PREVIEW_AUTO_CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [mode]);

  // Show error as toast — the overlay itself is hidden when mode:'idle',
  // so the inline error div was never visible on permission-denied etc.
  useEffect(() => {
    if (error) {
      toast.error(error, { duration: 5000 });
    }
  }, [error]);

  if (mode === 'idle') return null;

  const isListening = mode === 'listening';
  const isTranscribing = mode === 'transcribing';
  const isProcessing = mode === 'processing';
  const isPreview = mode === 'preview';

  /** Label shown beneath the icon circle */
  const statusLabel = (() => {
    if (isListening) return '\u2325 Release to transcribe';
    if (isTranscribing) return 'Transcribing...';
    if (isProcessing && postProcessingMode === 'ai') return 'Cleaning up...';
    if (isPreview) return 'Inserting...';
    return 'Processing...';
  })();

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 pointer-events-none">
      {/* Icon circle */}
      <div
        className={cn(
          'w-16 h-16 rounded-full flex items-center justify-center shadow-2xl border-2 transition-all duration-300',
          isListening
            ? 'bg-red-500/90 border-red-300 animate-pulse'
            : isPreview
              ? 'bg-green-600/90 border-green-400'
              : 'bg-zinc-700/90 border-zinc-500',
        )}
      >
        {isListening && <Mic size={24} className="text-white" />}
        {isTranscribing && <Loader2 size={24} className="text-white animate-spin" />}
        {isProcessing && <Sparkles size={24} className="text-violet-300 animate-pulse" />}
        {isPreview && <CheckCheck size={24} className="text-white" />}
      </div>

      {/* Status badge */}
      <div className="bg-zinc-800/95 backdrop-blur-sm border border-zinc-700 rounded-full px-4 py-1.5 text-sm text-zinc-200 shadow-lg select-none whitespace-nowrap">
        {statusLabel}
      </div>

      {/* Processing sub-label — only shown when AI cleanup is running */}
      {isProcessing && postProcessingMode === 'ai' && (
        <div className="bg-violet-900/60 border border-violet-700/50 rounded-full px-3 py-1 text-xs text-violet-300 shadow-lg select-none">
          AI is removing filler words
        </div>
      )}

      {/* Preview transcript — shows cleaned text before it's inserted */}
      {isPreview && pendingTranscript && (
        <div className="max-w-sm bg-zinc-800/95 backdrop-blur-sm border border-green-700/50 rounded-xl px-4 py-2.5 text-sm text-zinc-100 shadow-lg select-none text-center leading-relaxed">
          {pendingTranscript.length > 120
            ? `${pendingTranscript.slice(0, 120)}\u2026`
            : pendingTranscript}
        </div>
      )}
    </div>
  );
}
