'use client';

import { cn } from '@shared/lib/utils';
import { Skeleton } from '@agiworkforce/ui';

interface MessageBubbleSkeletonProps {
  isUser?: boolean;
  lines?: number;
  animation?: 'pulse' | 'wave' | 'none';
  className?: string;
}

export function MessageBubbleSkeleton({
  isUser = false,
  lines = 2,
  animation = 'pulse',
  className,
}: MessageBubbleSkeletonProps) {
  const lineWidths = ['w-full', 'w-4/5', 'w-3/5', 'w-2/3', 'w-3/4'];

  return (
    <div
      className={cn('py-3', className)}
      role="status"
      aria-label="Loading message"
      aria-busy="true"
    >
      {/* Geometry mirrors .message-row / .message-inner so the skeleton occupies
          the same column and vertical rhythm as the message it is standing in
          for — no avatars and no name row, because rendered messages have
          neither. */}
      <div className={cn('mx-auto flex max-w-3xl gap-3 px-4', isUser && 'flex-row-reverse')}>
        <div className={cn('min-w-0 flex-1', isUser && 'flex flex-col items-end')}>
          {isUser ? (
            <Skeleton
              animation={animation}
              className="inline-block rounded-2xl px-4 py-3"
              style={{ width: `${55 + (lines - 1) * 15}%`, height: `${lines * 24 + 24}px` }}
            />
          ) : (
            <div className="w-full space-y-3">
              {Array.from({ length: lines }).map((_, index) => (
                <Skeleton
                  key={index}
                  animation={animation}
                  className={cn(
                    'h-4 rounded',
                    index === lines - 1
                      ? lineWidths[Math.min(index, lineWidths.length - 1)]
                      : 'w-full',
                  )}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      <span className="sr-only">Loading message...</span>
    </div>
  );
}

MessageBubbleSkeleton.displayName = 'MessageBubbleSkeleton';
