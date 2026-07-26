import React, { useEffect, useState } from 'react';
import { Loader2, Image as ImageIcon, Clapperboard, Clock } from 'lucide-react';
import { getModelMetadataById } from '@agiworkforce/types';
import { cn } from '../../lib/utils';

export type MediaGenProvider = 'openai' | 'google' | 'stability' | 'runway';

interface MediaGenerationProgressProps {
  type: 'image' | 'video';
  provider?: MediaGenProvider;
  /** Canonical catalog model id used for release-safe display labels. */
  model?: string;
  /** Optional prompt snippet displayed beneath the spinner */
  prompt?: string;
  className?: string;
}

const PROVIDER_LABELS: Record<string, string> = {
  'image:openai': 'OpenAI image model',
  'image:google': 'Google image model',
  'image:stability': 'Stability image model',
  'video:runway': 'Runway video model',
  'video:google': 'Google video model',
};

function getProviderLabel(type: 'image' | 'video', provider?: MediaGenProvider, model?: string) {
  const fallback = type === 'image' ? 'image provider' : 'video provider';
  const providerLabel = provider ? PROVIDER_LABELS[`${type}:${provider}`] : undefined;
  const modelName = getModelMetadataById(model)?.name;

  return modelName ?? providerLabel ?? fallback;
}

/**
 * MediaGenerationProgress — inline loading indicator for image and video generation.
 *
 * Shows:
 *   - Animated spinner with media-appropriate color (amber=image, purple=video)
 *   - Provider label when known
 *   - Actual elapsed time so users know the request remains in flight
 *   - Prompt snippet (first 60 chars) for context
 *
 * The provider does not emit percentage or named-stage telemetry, so this
 * intentionally stays indeterminate instead of fabricating progress.
 */
export const MediaGenerationProgress: React.FC<MediaGenerationProgressProps> = ({
  type,
  provider,
  model,
  prompt,
  className,
}) => {
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const providerLabel = getProviderLabel(type, provider, model);
  const isImage = type === 'image';

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedSecs((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const accentColor = isImage ? 'text-amber-400' : 'text-purple-400';
  const borderColor = isImage ? 'border-amber-400/20' : 'border-purple-400/20';
  const bgColor = isImage ? 'bg-amber-500/5' : 'bg-purple-500/5';
  const Icon = isImage ? ImageIcon : Clapperboard;

  return (
    <div
      className={cn('rounded-xl border p-4 flex flex-col gap-3', borderColor, bgColor, className)}
      role="status"
      aria-label={isImage ? 'Image generation in progress' : 'Video generation in progress'}
    >
      {/* Header row */}
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <Loader2 className={cn('h-5 w-5 animate-spin', accentColor)} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn('text-sm font-medium', accentColor)}>
            {isImage ? 'Generating image' : 'Rendering video'}
            <span className="ml-1 text-xs font-normal opacity-70">via {providerLabel}</span>
          </p>
          {prompt && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {prompt.length > 60 ? `${prompt.slice(0, 60)}...` : prompt}
            </p>
          )}
        </div>
        {/* Elapsed timer */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
          <Clock className="h-3 w-3" />
          <span>{elapsedSecs}s</span>
        </div>
      </div>

      {/* Indeterminate progress: the media providers do not expose completion percentages. */}
      <div
        className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden"
        role="progressbar"
        aria-label={isImage ? 'Generating image' : 'Rendering video'}
      >
        <div
          className={cn(
            'h-full w-full rounded-full animate-pulse',
            isImage
              ? 'bg-gradient-to-r from-amber-400/20 via-amber-400 to-amber-400/20'
              : 'bg-gradient-to-r from-purple-400/20 via-purple-400 to-purple-400/20',
          )}
        />
      </div>

      {/* Only report observable state; no rotating pseudo-stages or fabricated ETA. */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Icon className="h-3 w-3" />
          Waiting for {providerLabel}
        </span>
        <span className="opacity-60 tabular-nums">{elapsedSecs}s elapsed</span>
      </div>
    </div>
  );
};

export default MediaGenerationProgress;
