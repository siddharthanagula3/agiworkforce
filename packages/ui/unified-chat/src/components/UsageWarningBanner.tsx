import { X } from 'lucide-react';
import { Button } from '@agiworkforce/ui';
import type { ManagedUsageWarning } from '@agiworkforce/types';
import { cn } from '../lib/utils';

export interface UsageWarningBannerProps {
  warning: ManagedUsageWarning | null;
  onUpgrade?: () => void;
  onDismiss?: () => void;
  className?: string;
}

export function UsageWarningBanner({
  warning,
  onUpgrade,
  onDismiss,
  className,
}: UsageWarningBannerProps) {
  if (!warning) return null;

  const critical = warning.severity === 'critical';

  return (
    <div
      role="status"
      data-testid="usage-warning-banner"
      data-severity={warning.severity}
      data-bucket={warning.bucket}
      className={cn(
        'flex items-center gap-3 rounded-t-xl border-x border-t px-4 py-2',
        critical
          ? 'border-amber-500/40 bg-amber-500/10'
          : 'border-[var(--chat-border)] bg-[var(--chat-surface-hover)]',
        className,
      )}
    >
      {/* min-w-0 so a long headline truncates instead of pushing the actions
          out of the container. */}
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'truncate text-xs font-medium',
            critical ? 'text-amber-600 dark:text-amber-400' : 'text-[var(--chat-text-secondary)]',
          )}
        >
          {warning.headline}
        </p>
        {warning.resetLabel ? (
          <p className="truncate text-[12px] text-[var(--chat-text-muted)]">{warning.resetLabel}</p>
        ) : null}
      </div>

      {onUpgrade ? (
        <button
          type="button"
          onClick={onUpgrade}
          className="shrink-0 text-xs font-semibold text-[var(--chat-text-primary)] underline underline-offset-2 hover:opacity-80"
        >
          Get more usage
        </button>
      ) : null}

      {onDismiss ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onDismiss}
          aria-label="Dismiss usage warning"
          className="h-6 w-6 shrink-0 text-[var(--chat-text-muted)] hover:bg-[var(--chat-surface-overlay)] hover:text-[var(--chat-text-primary)]"
        >
          <X size={14} aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}
