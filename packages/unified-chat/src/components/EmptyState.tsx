import { PLAN_LABEL, isFreePlan } from '@agiworkforce/types';
import { useTierStore, selectTier } from '../stores/tierStore';
import { useUIStore } from '../stores/uiStore';

/**
 * Composer-first empty state per design-spec §8.
 *
 * Layout (top-to-bottom, vertically centered):
 *   1. Plan badge pill — free tiers only, with Upgrade CTA
 *   2. Display headline — single line, serif display font, --text-2xl
 *
 * The composer and quick chips are rendered by ChatInterface below this
 * component — they are NOT in this file (separation of concerns).
 *
 * What we explicitly do NOT render here (spec §8.3):
 *   ❌ Multi-step onboarding wizard
 *   ❌ Welcome splash
 *   ❌ Tip-of-the-day
 *   ❌ Tour overlays
 *   ❌ "Try one of these prompts" header label
 */
export function EmptyState() {
  const tier = useTierStore(selectTier);
  const openSettings = useUIStore((s) => s.openSettings);

  const planLabel = PLAN_LABEL[tier];
  const showUpgrade = isFreePlan(tier);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      {/* Plan badge — free-tier only, "Free plan · Upgrade" pill per spec §8.1 */}
      {showUpgrade && (
        <div
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--chat-border)] bg-[var(--chat-surface-base)] px-3 py-1 text-xs"
          style={{ color: 'var(--chat-text-muted)' }}
          aria-label={`Current plan: ${planLabel}`}
        >
          <span>{planLabel} plan</span>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() => openSettings('billing')}
            className="font-medium underline-offset-2 hover:underline transition-colors"
            style={{ color: 'var(--chat-accent-primary)' }}
          >
            Upgrade
          </button>
        </div>
      )}

      {/* Display headline — single line, serif display per spec §8.1 + §2 */}
      <h1
        className="text-[28px] leading-[36px] font-normal tracking-tight"
        style={{
          color: 'var(--chat-text-primary)',
          fontFamily: "'Crimson Pro', 'IBM Plex Serif', Georgia, 'Times New Roman', serif",
        }}
      >
        What can I help with?
      </h1>
    </div>
  );
}
