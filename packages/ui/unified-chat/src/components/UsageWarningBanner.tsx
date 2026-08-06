/**
 * UsageWarningBanner — the pre-emptive "you're running low" line above the
 * composer.
 *
 * The product had no warning at all: usage was visible only in Settings, so a
 * user's first signal that they were out of capacity was a refused message
 * mid-task. Both reference products warn at 75% used, attached directly above
 * the composer, and that placement is the point — a toast disappears and a
 * settings meter is somewhere the user is not.
 *
 * Which limit to name is decided by `selectUsageWarning`, not here: it picks
 * the BINDING bucket rather than the first one over the line, because telling
 * someone about their weekly total while their session bucket is nearly gone is
 * the wrong warning, and a wrong warning teaches people to dismiss warnings.
 *
 * Nothing is synthesised. The reset line renders only when the server sent an
 * instant, and the upgrade action renders only when the host passed a handler —
 * the established "omit the handler, do not render the control" rule, which is
 * what keeps this honest for a user already on the top tier.
 */

import { X } from 'lucide-react';
import type { ManagedUsageWarning } from '@agiworkforce/types';
import { cn } from '../lib/utils';

export interface UsageWarningBannerProps {
  warning: ManagedUsageWarning | null;
  /** Open billing/upgrade. Omit and no upgrade affordance is rendered. */
  onUpgrade?: () => void;
  /** Dismiss for this session. Omit and the banner is not dismissible. */
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
      // `status`, not `alert`: this is ambient context the user can finish their
      // sentence before reading. `alert` interrupts a screen-reader mid-word,
      // which is wrong for something that has been true for the last hour.
      role="status"
      data-testid="usage-warning-banner"
      data-severity={warning.severity}
      data-bucket={warning.bucket}
      className={cn(
        'flex items-center gap-3 rounded-t-xl border-x border-t px-4 py-2',
        // Attached to the composer below it, matching the reference: a floating
        // card here reads as an error, and this is not an error yet.
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
          <p className="truncate text-[11px] text-[var(--chat-text-muted)]">{warning.resetLabel}</p>
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
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss usage warning"
          className="shrink-0 rounded p-0.5 text-[var(--chat-text-muted)] transition-colors hover:bg-[var(--chat-surface-overlay)] hover:text-[var(--chat-text-primary)]"
        >
          <X size={14} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
