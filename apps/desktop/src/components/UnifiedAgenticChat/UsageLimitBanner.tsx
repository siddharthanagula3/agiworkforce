import { useState } from 'react';
import { Info, AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useBillingUsageStore,
  selectBudget,
  selectBudgetPercentage,
} from '../../stores/billingUsage';

// ── Urgency levels ────────────────────────────────────────────────────────────

type UrgencyLevel = 'info' | 'warning' | 'critical';

function getUrgencyLevel(usagePercent: number): UrgencyLevel {
  if (usagePercent >= 95) return 'critical';
  if (usagePercent >= 90) return 'warning';
  return 'info';
}

// ── Time helpers ──────────────────────────────────────────────────────────────

function formatTimeRemaining(resetTimeMs: number): string {
  const now = Date.now();
  const diffMs = resetTimeMs - now;

  if (diffMs <= 0) return 'soon';

  const totalMinutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h`;
  }
  return `${minutes}m`;
}

// ── UsageLimitBanner ──────────────────────────────────────────────────────────

interface UsageLimitBannerProps {
  usagePercent: number;
  remaining: number;
  resetTime: number;
  onDismiss: () => void;
}

/**
 * Inline usage limit banner rendered directly in the chat stream.
 * Mirrors Gemini's pattern of surfacing limits where users feel them,
 * not buried in settings.
 *
 * Urgency thresholds:
 *   > 70%  → subtle info (white/zinc)
 *   > 90%  → warning (orange)
 *   > 95%  → critical (red)
 */
export function UsageLimitBanner({
  usagePercent,
  remaining,
  resetTime,
  onDismiss,
}: UsageLimitBannerProps) {
  const urgency = getUrgencyLevel(usagePercent);
  const timeRemaining = formatTimeRemaining(resetTime);

  const containerClasses = cn(
    'flex items-center gap-3 rounded-lg border px-4 py-2 text-sm',
    urgency === 'critical' && 'bg-red-500/10 border-red-500/20 text-red-300',
    urgency === 'warning' && 'bg-orange-500/10 border-orange-500/20 text-orange-300',
    urgency === 'info' && 'bg-white/5 border-white/10 text-zinc-300',
  );

  const iconClasses = cn(
    'h-4 w-4 shrink-0',
    urgency === 'critical' && 'text-red-400',
    urgency === 'warning' && 'text-orange-400',
    urgency === 'info' && 'text-zinc-400',
  );

  const dismissClasses = cn(
    'ml-auto shrink-0 rounded p-0.5 transition-colors',
    urgency === 'critical' && 'hover:bg-red-500/20 text-red-400 hover:text-red-300',
    urgency === 'warning' && 'hover:bg-orange-500/20 text-orange-400 hover:text-orange-300',
    urgency === 'info' && 'hover:bg-white/10 text-zinc-500 hover:text-zinc-300',
  );

  return (
    <div className={containerClasses} role="status" aria-live="polite">
      {urgency === 'info' ? (
        <Info className={iconClasses} aria-hidden="true" />
      ) : (
        <AlertTriangle className={iconClasses} aria-hidden="true" />
      )}

      <span className="flex-1">
        {remaining > 0 ? (
          <>
            You can send <span className="font-medium">{remaining.toLocaleString()}</span>{' '}
            {remaining === 1 ? 'more message' : 'more messages'} today.{' '}
            <span className="opacity-70">Usage resets in {timeRemaining}.</span>
          </>
        ) : (
          <>
            You&apos;ve reached your daily message limit.{' '}
            <span className="opacity-70">Usage resets in {timeRemaining}.</span>
          </>
        )}
      </span>

      <button
        type="button"
        onClick={onDismiss}
        className={dismissClasses}
        aria-label="Dismiss usage limit banner"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

// ── UsageLimitBannerContainer ─────────────────────────────────────────────────

interface UsageLimitBannerContainerProps {
  hasMessages: boolean;
}

const SHOW_THRESHOLD = 70;

/**
 * Container that reads from billingUsageStore and renders UsageLimitBanner
 * when usage is above the 70% threshold. Dismissed state is session-local
 * (resets on page/app refresh), which avoids the need for persisted state.
 */
export function UsageLimitBannerContainer({ hasMessages }: UsageLimitBannerContainerProps) {
  const [dismissed, setDismissed] = useState(false);

  const budget = useBillingUsageStore(selectBudget);
  const usagePercent = useBillingUsageStore(selectBudgetPercentage);

  // Do not render when:
  // – No messages yet in the conversation (empty state)
  // – Budget tracking is not enabled by the user
  // – Usage is below the visibility threshold
  // – User dismissed the banner this session
  if (!hasMessages || !budget.enabled || usagePercent < SHOW_THRESHOLD || dismissed) {
    return null;
  }

  const remaining = Math.max(0, budget.limit - budget.currentUsage);

  return (
    <div className="mx-4 mb-2">
      <UsageLimitBanner
        usagePercent={usagePercent}
        remaining={remaining}
        resetTime={budget.periodEnd}
        onDismiss={() => setDismissed(true)}
      />
    </div>
  );
}
