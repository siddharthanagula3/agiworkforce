
import { Clipboard } from 'lucide-react';
import { cn } from '../../../lib/utils';

export interface PastedBadgeProps {
  className?: string;
}

export function PastedBadge({ className }: PastedBadgeProps) {
  return (
    <span
      data-testid="pasted-badge"
      className={cn(
        'inline-flex items-center gap-1 rounded-md border border-border/50',
        'bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground',
        'mb-1 select-none',
        className,
      )}
    >
      <Clipboard className="h-2.5 w-2.5 shrink-0" aria-hidden />
      Pasted
    </span>
  );
}

export function isPastedMessage(metadata?: Record<string, unknown> | null): boolean {
  if (!metadata) return false;
  return Boolean(metadata['pasted'] || metadata['pastedFromClipboard']);
}
