import { Film } from 'lucide-react';
import { cn } from '../lib/utils';

export interface VideoGenCardProps {
  status: 'generating' | 'complete' | 'error';
  description: string;
  videoUrl?: string;
  progress?: number;
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

export function VideoGenCard({ status, description, videoUrl, progress }: VideoGenCardProps) {
  return (
    <div className="my-2">
      {status === 'generating' && (
        <div
          className={cn(
            'flex flex-col gap-3 rounded-lg border border-[var(--chat-border)]',
            'bg-[var(--chat-surface-elevated)] px-4 py-4',
          )}
        >
          <div className="flex items-center gap-2">
            <Film size={15} className="text-[var(--chat-accent-secondary)] shrink-0" />
            <span className="text-sm font-medium text-[var(--chat-text-primary)]">
              Generating your video...
            </span>
          </div>

          {description && (
            <p className="text-[13px] text-[var(--chat-text-muted)] leading-relaxed">
              {description}
            </p>
          )}

          <p className="text-[12px] text-[var(--chat-text-muted)]">This can take 1–2 minutes</p>

          {typeof progress === 'number' && <ProgressBar value={progress} />}

          {typeof progress !== 'number' && (
            <div className="h-1 w-full rounded-full bg-[var(--chat-surface-hover)] overflow-hidden">
              <div className="h-full w-1/3 rounded-full bg-[var(--chat-accent-primary)] animate-[slide_1.5s_ease-in-out_infinite]" />
            </div>
          )}
        </div>
      )}

      {status === 'complete' && videoUrl && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Film size={15} className="text-[var(--chat-accent-secondary)] shrink-0" />
            <span className="text-sm font-medium text-[var(--chat-text-primary)]">
              Your video is ready!
            </span>
          </div>

          <video
            src={videoUrl}
            controls
            className="w-full rounded-lg bg-black"
            aria-label={description}
          />
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
