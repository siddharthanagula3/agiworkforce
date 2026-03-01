import { Loader2, Mic } from 'lucide-react';
import { useVoiceInputStore } from '../../stores/voiceInputStore';
import { cn } from '../../lib/utils';

export function VoiceInputOverlay() {
  const mode = useVoiceInputStore((s) => s.mode);
  const error = useVoiceInputStore((s) => s.error);

  if (mode === 'idle') return null;

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 pointer-events-none">
      {/* Pulsing mic circle */}
      <div
        className={cn(
          'w-16 h-16 rounded-full flex items-center justify-center shadow-2xl border-2 transition-all',
          mode === 'listening'
            ? 'bg-red-500/90 border-red-300 animate-pulse'
            : 'bg-zinc-700/90 border-zinc-500',
        )}
      >
        {mode === 'listening' && <Mic size={24} className="text-white" />}
        {mode === 'transcribing' && (
          <Loader2 size={24} className="text-white animate-spin" />
        )}
      </div>

      {/* Status label */}
      <div className="bg-zinc-800/95 backdrop-blur-sm border border-zinc-700 rounded-full px-4 py-1.5 text-sm text-zinc-200 shadow-lg select-none">
        {mode === 'listening' ? '\u2325 Release to transcribe' : 'Transcribing...'}
      </div>

      {error && (
        <div className="bg-red-900/80 border border-red-700 rounded-lg px-3 py-1 text-xs text-red-300 shadow-lg">
          {error}
        </div>
      )}
    </div>
  );
}
