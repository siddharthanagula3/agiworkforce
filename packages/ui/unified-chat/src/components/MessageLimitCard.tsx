import { Gauge, Timer, Database, Sparkles } from 'lucide-react';
import {
  getBillingPlanPricing,
  isBillingPlanTier,
  paywallLimitHeadline,
  paywallUpgradeLabel,
} from '@agiworkforce/types';
import { cn } from '../lib/utils';

export interface MessagePaywallBlock {
  feature: string;
  requiredTier: string;
  reason?: string;
  showUpgradeCta?: boolean;
  showResetTime?: boolean;
  suggestStandardModel?: boolean;
  resetAt?: string;
}

/**
 * Read a `metadata.paywall` bag into a typed block, or null when the message
 * carries none. Exported for tests and for hosts that render their own card.
 */
export function readMessagePaywall(
  metadata: Record<string, unknown> | undefined,
): MessagePaywallBlock | null {
  const raw = metadata?.['paywall'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const feature = record['feature'];
  const requiredTier = record['requiredTier'];
  if (typeof feature !== 'string' || typeof requiredTier !== 'string') return null;
  return {
    feature,
    requiredTier,
    ...(typeof record['reason'] === 'string' ? { reason: record['reason'] } : {}),
    ...(typeof record['showUpgradeCta'] === 'boolean'
      ? { showUpgradeCta: record['showUpgradeCta'] }
      : {}),
    ...(typeof record['showResetTime'] === 'boolean'
      ? { showResetTime: record['showResetTime'] }
      : {}),
    ...(typeof record['suggestStandardModel'] === 'boolean'
      ? { suggestStandardModel: record['suggestStandardModel'] }
      : {}),
    ...(typeof record['resetAt'] === 'string' ? { resetAt: record['resetAt'] } : {}),
  };
}

export function formatResetLabel(resetAt: string | undefined): string | null {
  if (!resetAt) return null;
  const parsed = new Date(resetAt);
  if (Number.isNaN(parsed.getTime())) return null;
  return `Clears at ${parsed.toLocaleString()}`;
}

function tierLabel(tier: string): string {
  return isBillingPlanTier(tier) ? getBillingPlanPricing(tier).label : tier;
}

export interface MessageLimitCardProps {
  block: MessagePaywallBlock;
  onRetry?: () => void;
  onUpgrade?: () => void;
  className?: string;
}

export function MessageLimitCard({ block, onRetry, onUpgrade, className }: MessageLimitCardProps) {
  const showUpgradeCta = block.showUpgradeCta !== false && Boolean(onUpgrade);
  const headline = showUpgradeCta
    ? `Upgrade to ${tierLabel(block.requiredTier)} for ${paywallUpgradeLabel(block.feature)}`
    : paywallLimitHeadline(block.feature);
  const resetLabel = block.showResetTime === false ? null : formatResetLabel(block.resetAt);
  const Icon =
    block.feature === 'request_rate'
      ? Gauge
      : block.feature === 'rolling_capacity'
        ? Timer
        : block.feature === 'token_cap'
          ? Database
          : Sparkles;

  return (
    <section
      role="alert"
      data-testid="message-limit-card"
      aria-label="Usage limit reached"
      className={cn(
        'mt-2 rounded-xl border px-4 py-3',
        'border-amber-500/40 bg-amber-500/10',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--chat-text-primary)]">{headline}</p>
          {block.reason ? (
            <p className="mt-1 text-xs text-[var(--chat-text-secondary)]">{block.reason}</p>
          ) : null}
          {block.suggestStandardModel ? (
            <p className="mt-1 text-xs text-[var(--chat-text-secondary)]">
              Switching to a standard (non-flagship) model clears this now.
            </p>
          ) : null}
          {resetLabel ? (
            <p className="mt-1 text-xs text-[var(--chat-text-muted)]">{resetLabel}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-2">
            {showUpgradeCta && onUpgrade ? (
              <button
                type="button"
                onClick={onUpgrade}
                className="rounded-lg bg-[var(--chat-accent-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--chat-accent-on-primary)] transition-opacity hover:opacity-90"
              >
                Upgrade to {tierLabel(block.requiredTier)}
              </button>
            ) : null}
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                aria-label="Retry this response"
                className="rounded-lg border border-[var(--chat-border-strong)] px-3 py-1.5 text-xs font-medium text-[var(--chat-text-primary)] transition-colors hover:bg-[var(--chat-surface-hover)]"
              >
                Retry
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
