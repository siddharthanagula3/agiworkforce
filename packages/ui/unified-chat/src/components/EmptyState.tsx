import { PLAN_LABEL, isFreePlan } from '@agiworkforce/types';
import { useTierStore, selectTier } from '../stores/tierStore';
import { useUIStore } from '../stores/uiStore';

export interface EmptyStateProps {
  headline?: string;
  planBadgeLabel?: string;
  planBadgeActionLabel?: string;
  planBadgeActionAriaLabel?: string;
  planBadgeActionTab?: string;
  onPlanBadgeAction?: () => void;
  showPlanBadgeNoun?: boolean;
}

export function EmptyState({
  headline,
  planBadgeLabel,
  planBadgeActionLabel,
  planBadgeActionAriaLabel,
  planBadgeActionTab = 'billing',
  onPlanBadgeAction,
  showPlanBadgeNoun = true,
}: EmptyStateProps = {}) {
  const tier = useTierStore(selectTier);
  const openSettings = useUIStore((s) => s.openSettings);

  const planLabel = planBadgeLabel ?? PLAN_LABEL[tier];
  const showBadge = isFreePlan(tier);
  const showBadgeAction = Boolean(planBadgeActionLabel);
  const badgeLabel = showPlanBadgeNoun ? `${planLabel} plan` : planLabel;
  const handleBadgeAction = onPlanBadgeAction ?? (() => openSettings(planBadgeActionTab));

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      {/* Plan badge, free-tier only. Hosts opt into any cloud/billing CTA. */}
      {showBadge && (
        <div
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--chat-border)] bg-[var(--chat-surface-base)] px-3 py-1 text-xs"
          style={{ color: 'var(--chat-text-muted)' }}
          aria-label={`Current plan: ${planLabel}`}
        >
          <span>{badgeLabel}</span>
          {showBadgeAction && (
            <>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                onClick={handleBadgeAction}
                aria-label={planBadgeActionAriaLabel}
                className="font-medium underline-offset-2 hover:underline transition-colors"
                style={{ color: 'var(--chat-accent-primary-text)' }}
              >
                {planBadgeActionLabel}
              </button>
            </>
          )}
        </div>
      )}

      {/* Display headline, single line, serif display per spec §8.1 + §2 */}
      <h1
        className="text-[28px] leading-[36px] font-normal tracking-tight"
        style={{
          color: 'var(--chat-text-primary)',
          fontFamily: "'Crimson Pro', 'IBM Plex Serif', Georgia, 'Times New Roman', serif",
        }}
      >
        {headline ?? 'What can I help with?'}
      </h1>
    </div>
  );
}
