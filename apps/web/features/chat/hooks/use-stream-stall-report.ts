'use client';

import { useEffect, useRef } from 'react';

import { reportClientFailure } from '@agiworkforce/unified-chat';

// Longer than any first token the routing layer waits for, so a slow provider
// is not reported as a stall.
export const STREAM_STALL_MS = 45_000;

interface StreamProgressRow {
  readonly id: string;
  readonly content?: string | null;
}

export function streamProgressMark(rows: readonly StreamProgressRow[]): string {
  const last = rows[rows.length - 1];
  if (!last) return '';
  return `${rows.length}:${last.id}:${last.content?.length ?? 0}`;
}

// Server-side the turn is still open, so no existing series moves. Reported
// once per stall, not once per timer.
export function useStreamStallReport(input: {
  streaming: boolean;
  rows: readonly StreamProgressRow[];
  turnKey: string | null;
}): void {
  const { streaming, rows, turnKey } = input;
  const mark = streamProgressMark(rows);
  const reported = useRef<string | null>(null);

  useEffect(() => {
    if (!streaming || turnKey === null) return undefined;
    const stallKey = `${turnKey}:${mark}`;
    if (reported.current === stallKey) return undefined;
    const timer = setTimeout(() => {
      reported.current = stallKey;
      reportClientFailure({ failure: 'stream_stall', detail: 'timeout' });
    }, STREAM_STALL_MS);
    return () => clearTimeout(timer);
  }, [streaming, mark, turnKey]);
}
