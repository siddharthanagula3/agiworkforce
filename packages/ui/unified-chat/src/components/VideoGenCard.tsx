import { Film, Download, Share2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from '@agiworkforce/ui';

export interface VideoGenCardProps {
  status: 'generating' | 'complete' | 'error';
  description: string;
  videoUrl?: string;
  progress?: number;
  onDownload?: () => void;
  onShare?: () => void;
}

function ProgressBar({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      className="h-1 w-full rounded-full bg-[var(--chat-surface-hover)] overflow-hidden"
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-[var(--chat-accent-primary)] transition-all duration-300"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export function VideoGenCard({
  status,
  description,
  videoUrl,
  progress,
  onDownload,
  onShare,
}: VideoGenCardProps) {
  return (
    <div className="my-2">
      {status === 'generating' && (
        <div
          className="relative w-full aspect-video overflow-hidden rounded-xl bg-[var(--chat-surface-elevated)]"
          role="status"
          aria-live="polite"
          aria-label={
            typeof progress === 'number'
              ? `Generating your video, ${Math.round(progress)}% complete`
              : 'Generating your video'
          }
        >
          {/* Drives `@keyframes shimmer` in globals.css, which animates
              background-position (-200% -> 200%), so the highlight has to be a
              background gradient sized wider than the box. A translate-based
              sweep would not move at all under that keyframe. */}
          <div
            className={cn(
              'absolute inset-0',
              'bg-[linear-gradient(90deg,transparent,var(--chat-surface-hover),transparent)]',
              'bg-[length:200%_100%]',
              'motion-safe:animate-[shimmer_1.8s_ease-in-out_infinite]',
            )}
          />
          {/* Reduced-motion and no-animation fallback: without this the block is
              indistinguishable from a failed render. */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 motion-safe:opacity-0">
            <Film size={20} className="text-[var(--chat-text-muted)]" aria-hidden="true" />
            <span className="text-[13px] text-[var(--chat-text-muted)]">
              Generating your video…
            </span>
          </div>
          {typeof progress === 'number' && (
            <div className="absolute inset-x-4 bottom-4">
              <ProgressBar value={progress} />
            </div>
          )}
        </div>
      )}

      {status === 'complete' && videoUrl && (
        <div className="flex flex-col gap-2">
          <span className="text-sm text-[var(--chat-text-primary)]">Your video is ready!</span>

          <div className="group relative w-full overflow-hidden rounded-xl bg-black">
            <video
              src={videoUrl}
              controls
              playsInline
              preload="metadata"
              className="w-full rounded-xl bg-black"
              aria-label={description}
            />

            {/* Overlaid on the player rather than in a row beneath it, so the
                controls sit where the reference puts them. focus-within keeps
                them reachable by keyboard, where hover alone would not. */}
            {(onDownload || onShare) && (
              <div
                className={cn(
                  'absolute right-2 top-2 flex items-center gap-1',
                  'opacity-0 transition-opacity duration-150',
                  'group-hover:opacity-100 group-focus-within:opacity-100',
                  'motion-reduce:opacity-100',
                )}
              >
                {onDownload && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Download video"
                    onClick={onDownload}
                    className="h-8 w-8 rounded-full bg-black/55 text-white hover:bg-black/75 hover:text-white"
                  >
                    <Download size={14} aria-hidden="true" />
                  </Button>
                )}
                {onShare && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Share video"
                    onClick={onShare}
                    className="h-8 w-8 rounded-full bg-black/55 text-white hover:bg-black/75 hover:text-white"
                  >
                    <Share2 size={14} aria-hidden="true" />
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="flex items-center gap-2">
          <Film size={15} className="text-[var(--chat-destructive)] shrink-0" />
          <p className="text-sm text-[var(--chat-destructive)]">
            Video generation failed. Please try again.
          </p>
        </div>
      )}
    </div>
  );
}
