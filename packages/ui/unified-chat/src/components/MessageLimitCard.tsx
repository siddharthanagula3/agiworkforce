/**
 * MessageLimitCard — in-transcript card for a managed quota / rate-limit
 * refusal.
 *
 * A managed ceiling (rolling 5-hour, weekly, flagship weekly, credits, billing
 * period, plain rate limit) is not a generic failure: the user needs the
 * reason, when it clears, and — when one actually exists — the upgrade that
 * lifts it. Desktop Cloud previously showed a toast that disappeared over an
 * empty assistant bubble, so a refusal mid-demo looked like the app breaking.
 *
 * Shape mirrors web's `InlinePaywallCard`, reads the same `metadata.paywall`
 * block `classifyManagedQuotaErrorCode` produces, and now shares its wording
 * via PAYWALL_FEATURE_COPY. Nothing is synthesised: the
 * upgrade CTA renders only when a next self-serve tier exists, and the reset
 * line only when the SERVER supplied an instant.
 */

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
  /** ISO instant reported by the server. Never client-derived. */
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

/**
 * Format the server's reset instant for display, or null when it is absent or
 * unparseable — the card must never invent a "clears at" time.
 */
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
  /** Retry the refused turn. Omit to render the card without a retry action. */
  onRetry?: () => void;
  /** Open billing/upgrade. Omit and the upgrade CTA is not rendered. */
  onUpgrade?: () => void;
  className?: string;
}

export function MessageLimitCard({ block, onRetry, onUpgrade, className }: MessageLimitCardProps) {
  const showUpgradeCta = block.showUpgradeCta !== false && Boolean(onUpgrade);
  // Copy comes from @agiworkforce/types. This card previously carried a
  // four-feature table of its own, so a refusal web described precisely
  // ("Upgrade to Pro for video generation") arrived here as the generic
  // "Upgrade to Pro for this capability" — same server, less information.
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
                className="rounded-lg bg-[var(--chat-accent-primary)] px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
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
