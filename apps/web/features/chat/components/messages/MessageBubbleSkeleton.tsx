'use client';

import React from 'react';
import { cn } from '@shared/lib/utils';
import { Skeleton } from '@/components/ui/Skeleton';

interface MessageBubbleSkeletonProps {
  /** Whether this skeleton represents a user message (right-aligned). */
  isUser?: boolean;
  /** Number of text line skeletons to render inside the bubble. */
  lines?: number;
  /** Animation variant forwarded to all child Skeleton primitives. */
  animation?: 'pulse' | 'wave' | 'none';
  className?: string;
}

/**
 * MessageBubbleSkeleton — loading placeholder that mirrors the shape and
 * layout of a real MessageItem from MessageListNew.
 *
 * Layout matches MessageItem exactly:
 *  - 8px avatar circle (h-8 w-8)
 *  - flex gap-4, reversed for user messages
 *  - Name + time header row
 *  - Rounded bubble or prose area for content
 */
export function MessageBubbleSkeleton({
  isUser = false,
  lines = 2,
  animation = 'pulse',
  className,
}: MessageBubbleSkeletonProps) {
  // Vary the width of each text line for a natural look.
  const lineWidths = ['w-full', 'w-4/5', 'w-3/5', 'w-2/3', 'w-3/4'];

  return (
    <div
      className={cn('px-4 py-5', className)}
      role="status"
      aria-label="Loading message"
      aria-busy="true"
    >
      <div className={cn('mx-auto flex max-w-3xl gap-4', isUser && 'flex-row-reverse')}>
        {/* Avatar placeholder */}
        <Skeleton animation={animation} className="h-8 w-8 shrink-0 rounded-full" />

        {/* Content area */}
        <div className={cn('min-w-0 flex-1', isUser && 'flex flex-col items-end')}>
          {/* Header row: name chip + timestamp chip */}
          <div className={cn('mb-1.5 flex items-center gap-2', isUser && 'flex-row-reverse')}>
            <Skeleton animation={animation} className="h-4 w-10 rounded" />
            <Skeleton animation={animation} className="h-3 w-16 rounded" />
          </div>

          {/* Message body */}
          {isUser ? (
            /* User messages use a pill-shaped bubble */
            <Skeleton
              animation={animation}
              className="inline-block rounded-2xl rounded-tr-sm px-4 py-3"
              style={{ width: `${55 + (lines - 1) * 15}%`, height: `${lines * 24 + 16}px` }}
            />
          ) : (
            /* Assistant messages use a prose text block with varying lines */
            <div className="space-y-2 w-full">
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
