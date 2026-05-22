import React, { useEffect, useState } from 'react';
import { Loader2, Image as ImageIcon, Clapperboard, Clock } from 'lucide-react';
import { cn } from '../../lib/utils';

export type MediaGenProvider = 'dall-e-3' | 'google' | 'stability' | 'runway' | 'veo3';

interface MediaGenerationProgressProps {
  type: 'image' | 'video';
  provider?: MediaGenProvider;
  /** Optional prompt snippet displayed beneath the spinner */
  prompt?: string;
  className?: string;
}

// Estimated generation times per provider (seconds)
const PROVIDER_ESTIMATES: Record<string, { min: number; max: number; label: string }> = {
  // Image providers
  'dall-e-3': { min: 10, max: 25, label: 'DALL-E 3' },
  google: { min: 8, max: 20, label: 'Imagen 4' },
  stability: { min: 10, max: 20, label: 'Stable Image' },
  // Video providers
  runway: { min: 60, max: 120, label: 'Runway Gen4' },
  veo3: { min: 90, max: 150, label: 'Google Veo 3' },
};

const DEFAULT_IMAGE_ESTIMATE = { min: 10, max: 30, label: 'Image AI' };
const DEFAULT_VIDEO_ESTIMATE = { min: 60, max: 120, label: 'Video AI' };

function getEstimate(type: 'image' | 'video', provider?: MediaGenProvider) {
  if (provider && PROVIDER_ESTIMATES[provider]) {
    return PROVIDER_ESTIMATES[provider];
  }
  return type === 'image' ? DEFAULT_IMAGE_ESTIMATE : DEFAULT_VIDEO_ESTIMATE;
}

/**
 * MediaGenerationProgress — inline loading indicator for image and video generation.
 *
 * Shows:
 *   - Animated spinner with media-appropriate color (amber=image, purple=video)
 *   - Provider label and estimated wait range
 *   - Elapsed seconds counter so users know progress is happening
 *   - Prompt snippet (first 60 chars) for context
 */
export const MediaGenerationProgress: React.FC<MediaGenerationProgressProps> = ({
  type,
  provider,
  prompt,
  className,
}) => {
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const estimate = getEstimate(type, provider);
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

  const progressPercent = Math.min(95, Math.round((elapsedSecs / estimate.max) * 100));

  return (
    <div
      className={cn('rounded-xl border p-4 flex flex-col gap-3', borderColor, bgColor, className)}
    >
      {/* Header row */}
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <Loader2 className={cn('h-5 w-5 animate-spin', accentColor)} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn('text-sm font-medium', accentColor)}>
            {isImage ? 'Generating image' : 'Rendering video'}
            <span className="ml-1 text-xs font-normal opacity-70">via {estimate.label}</span>
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

      {/* Progress bar */}
      <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-1000',
            isImage ? 'bg-amber-400' : 'bg-purple-400',
          )}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Time estimate row */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Icon className="h-3 w-3" />
          {isImage
            ? `This may take ${estimate.min}–${estimate.max} seconds`
            : `Video rendering typically takes ${estimate.min}–${estimate.max} seconds`}
        </span>
        <span className="opacity-60">{progressPercent}%</span>
      </div>
    </div>
  );
};

export default MediaGenerationProgress;
