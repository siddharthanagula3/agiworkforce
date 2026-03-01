import { Loader2, Mic, Sparkles } from 'lucide-react';
import { useVoiceInputStore } from '../../stores/voiceInputStore';
import { cn } from '../../lib/utils';

/**
 * Floating overlay that appears over the chat composer while the user is
 * dictating (listening), waiting for Whisper (transcribing), or waiting for
 * AI cleanup (processing).  Returns null when idle.
 *
 * Visual states:
 *   listening   → pulsing red mic circle + "Release to transcribe"
 *   transcribing → grey spinner + "Transcribing..."
 *   processing   → grey sparkles + "Cleaning up..."
 */
export function VoiceInputOverlay() {
  const mode = useVoiceInputStore((s) => s.mode);
  const error = useVoiceInputStore((s) => s.error);
  const postProcessingMode = useVoiceInputStore((s) => s.postProcessingMode);

  if (mode === 'idle') return null;

  const isListening = mode === 'listening';
  const isTranscribing = mode === 'transcribing';
  const isProcessing = mode === 'processing';

  /** Label shown beneath the icon circle */
  const statusLabel = (() => {
    if (isListening) return '\u2325 Release to transcribe';
    if (isTranscribing) return 'Transcribing...';
    if (isProcessing && postProcessingMode === 'ai') return 'Cleaning up...';
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
            : 'bg-zinc-700/90 border-zinc-500',
        )}
      >
        {isListening && <Mic size={24} className="text-white" />}
        {isTranscribing && <Loader2 size={24} className="text-white animate-spin" />}
        {isProcessing && (
          <Sparkles size={24} className="text-violet-300 animate-pulse" />
        )}
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

      {error && (
        <div className="bg-red-900/80 border border-red-700 rounded-lg px-3 py-1 text-xs text-red-300 shadow-lg">
          {error}
        </div>
      )}
    </div>
  );
}
