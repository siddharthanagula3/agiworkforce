/**
 * UsageLimitBanner — inline banner shown in the chat stream when the user
 * is close to or has exceeded their daily budget. Mirrors Gemini's pattern
 * of surfacing limits where users feel them, not buried in settings.
 *
 * Two exports:
 *   - `UsageLimitBanner` (props-driven, render anywhere)
 *   - `UsageLimitBannerContainer` (auto-wires from budgetStore + threshold gate)
 */
import { AlertTriangle, Info, X } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../lib/utils';
import { useBudgetStore, selectBudget, selectBudgetPercentage } from '../stores/budgetStore';

type UrgencyLevel = 'info' | 'warning' | 'critical';

function getUrgencyLevel(usagePercent: number): UrgencyLevel {
  if (usagePercent >= 95) return 'critical';
  if (usagePercent >= 90) return 'warning';
  return 'info';
}

function formatTimeRemaining(resetTimeMs: number): string {
  const now = Date.now();
  const diffMs = resetTimeMs - now;
  if (diffMs <= 0) return 'soon';
  const totalMinutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

interface UsageLimitBannerProps {
  usagePercent: number;
  remaining: number;
  resetTime: number;
  onDismiss: () => void;
}

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
    urgency === 'info' && 'bg-white/5 border-white/10 text-foreground',
  );

  const iconClasses = cn(
    'h-4 w-4 shrink-0',
    urgency === 'critical' && 'text-red-400',
    urgency === 'warning' && 'text-orange-400',
    urgency === 'info' && 'text-muted-foreground',
  );

  const dismissClasses = cn(
    'ml-auto shrink-0 rounded p-0.5 transition-colors',
    urgency === 'critical' && 'hover:bg-red-500/20 text-red-400 hover:text-red-300',
    urgency === 'warning' && 'hover:bg-orange-500/20 text-orange-400 hover:text-orange-300',
    urgency === 'info' && 'hover:bg-white/10 text-muted-foreground hover:text-foreground',
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

const SHOW_THRESHOLD = 70;

interface UsageLimitBannerContainerProps {
  hasMessages: boolean;
}

/**
 * Auto-wired variant. Reads budget snapshot from `useBudgetStore`, computes
 * urgency, and renders only when usage crosses the show threshold AND the
 * user hasn't dismissed this session.
 */
export function UsageLimitBannerContainer({ hasMessages }: UsageLimitBannerContainerProps) {
  const [dismissed, setDismissed] = useState(false);
  const budget = useBudgetStore(selectBudget);
  const usagePercent = useBudgetStore(selectBudgetPercentage);

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
