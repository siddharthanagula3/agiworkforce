'use client';

import { Download, FileText } from 'lucide-react';
import { formatDeliverableTypeLine, formatGeneratedFileByteCount } from '@agiworkforce/types';
import { cn } from '@shared/lib/utils';

export const DELIVERABLE_DOWNLOAD_ACTION = 'Download';

const DETAIL_SEPARATOR = ' · ';

export interface DeliverableCardProps {
  name: string;
  uri: string;
  kind?: string | null;
  mimeType?: string | null;
  byteCount?: number | null;
  className?: string;
}

export function DeliverableCard({
  name,
  uri,
  kind,
  mimeType,
  byteCount,
  className,
}: DeliverableCardProps) {
  const typeLine = [
    formatDeliverableTypeLine({ kind, fileName: name, mimeType }),
    formatGeneratedFileByteCount(byteCount),
  ]
    .filter(Boolean)
    .join(DETAIL_SEPARATOR);

  return (
    <a
      data-testid="deliverable-card"
      href={uri}
      download={name}
      title={`${DELIVERABLE_DOWNLOAD_ACTION} ${name}`}
      className={cn(
        'flex min-w-0 max-w-full items-center gap-3 rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5',
        'no-underline transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
        className,
      )}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background"
        aria-hidden="true"
      >
        <FileText className="h-4 w-4 text-muted-foreground" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-foreground">{name}</span>
        <span className="truncate text-xs text-muted-foreground">{typeLine}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1 rounded-lg border border-border/60 px-2 py-1 text-xs font-medium text-foreground">
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
        {DELIVERABLE_DOWNLOAD_ACTION}
      </span>
    </a>
  );
}
