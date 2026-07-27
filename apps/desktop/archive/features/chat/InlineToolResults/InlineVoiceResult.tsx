import { Mic, Loader2, AlertCircle, Clock, Zap } from 'lucide-react';
import type { ToolResultProps } from './index';

interface VoiceData {
  audioUrl?: string;
  transcription?: string;
  duration?: number;
  provider?: string;
}

export function InlineVoiceResult({ result, status }: ToolResultProps) {
  const data = result?.data as VoiceData | undefined;

  if (status === 'running') {
    return (
      <div className="mt-3 flex items-center gap-2 p-3 rounded-lg bg-card/80 border border-white/10">
        <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
        <span className="text-sm text-muted-foreground">Transcribing audio...</span>
      </div>
    );
  }

  if (status === 'failed' || status === 'error') {
    return (
      <div className="mt-3 p-3 rounded-lg bg-card/80 border border-red-500/30">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-300 font-medium">Audio transcription failed</p>
          {result?.error && <p className="text-xs text-muted-foreground mt-1">{result.error}</p>}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { audioUrl, transcription, duration, provider } = data;

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  return (
    <div className="mt-3 rounded-lg bg-card/80 border border-white/10 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/60 border-b border-white/10">
        <Mic className="h-4 w-4 text-rose-400" />
        <span className="text-xs font-medium text-foreground">Voice Transcription</span>
        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          {duration !== undefined && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDuration(duration)}
            </span>
          )}
          {provider && (
            <span className="flex items-center gap-1">
              <Zap className="h-3 w-3" />
              {provider}
            </span>
          )}
        </div>
      </div>

      <div className="p-3 space-y-3">
        {audioUrl && /^(https?:|data:|blob:)/i.test(audioUrl) && (
          <audio src={audioUrl} controls className="w-full h-8" style={{ colorScheme: 'dark' }} />
        )}

        {transcription && (
          <div className="p-2 rounded bg-muted/60 border border-white/5">
            <p className="text-xs text-foreground leading-relaxed">{transcription}</p>
          </div>
        )}

        {!transcription && !audioUrl && (
          <p className="text-xs text-muted-foreground italic">No transcription available</p>
        )}
      </div>
    </div>
  );
}
