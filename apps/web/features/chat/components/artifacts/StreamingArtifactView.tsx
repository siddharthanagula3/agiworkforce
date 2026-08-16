'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@shared/lib/utils';
import type { StreamingArtifact } from '../../stores/streaming-artifact-store';

export function StreamingArtifactView({
  artifact,
  className,
}: {
  artifact: StreamingArtifact;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [artifact.content]);

  const typeLabel = (artifact.language || artifact.type).toUpperCase();

  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)} data-testid="streaming-artifact">
      {/* Slim header: title + type + writing indicator */}
      <div className="flex shrink-0 items-center justify-between border-b border-border/30 bg-card/80 px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold text-foreground">{artifact.title}</span>
          <span className="shrink-0 text-sm text-muted-foreground">· {typeLabel}</span>
        </div>
        <span
          className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          <span
            className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary"
            aria-hidden="true"
          />
          Writing…
        </span>
      </div>

      {/* Auto-scrolling live code body */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-auto bg-gray-900"
        data-testid="streaming-artifact-code"
      >
        <pre className="p-4">
          <code className="whitespace-pre-wrap break-words text-sm text-gray-100">
            {artifact.content}
            {/* Blinking caret at the write head */}
            <span
              className="ml-0.5 inline-block h-4 w-2 animate-pulse bg-gray-100/70 align-text-bottom"
              aria-hidden="true"
            />
          </code>
        </pre>
      </div>
    </div>
  );
}
