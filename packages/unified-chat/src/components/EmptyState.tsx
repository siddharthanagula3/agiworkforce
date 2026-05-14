import { useMemo } from 'react';
import { PLAN_LABEL, isFreePlan } from '@agiworkforce/types';
import { getGreeting } from '../lib/greetings';
import { useSettingsStore } from '../stores/settingsStore';
import { useTierStore, selectTier } from '../stores/tierStore';
import { useUIStore } from '../stores/uiStore';

/**
 * Centered hero shown when a conversation has zero messages.
 *
 * Reference: ~/Desktop/reference/ui/claude/claude-desktop/
 *   01_empty-state_new-chat-collapsed-sidebar.png
 *
 * Shows: plan badge pill (with Upgrade CTA for free tiers) → time-of-day
 * greeting → "How can I help you today?" subtitle. The composer and quick
 * chips live in ChatInterface below this panel.
 */
export function EmptyState() {
  const profile = useSettingsStore((s) => s.profile);
  const name = profile.nickname?.trim() || profile.fullName?.trim() || undefined;
  const tier = useTierStore(selectTier);
  const openSettings = useUIStore((s) => s.openSettings);

  const greeting = useMemo(() => getGreeting(name || undefined), [name]);

  const hour = new Date().getHours();
  const emoji =
    hour >= 5 && hour < 12
      ? '☀️'
      : hour >= 12 && hour < 17
        ? '🌸'
        : hour >= 17 && hour < 21
          ? '🌇'
          : '🌙';

  const planLabel = PLAN_LABEL[tier];
  const showUpgrade = isFreePlan(tier);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      {/* Plan badge — matches Claude Desktop "Free plan · Upgrade" pill */}
      <div
        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--chat-border)] bg-[var(--chat-surface-base)] px-3 py-1 text-xs"
        style={{ color: 'var(--chat-text-muted)' }}
        aria-label={`Current plan: ${planLabel}`}
      >
        <span>{planLabel} plan</span>
        {showUpgrade && (
          <>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => openSettings('billing')}
              className="font-medium underline-offset-2 hover:underline transition-colors"
              style={{ color: 'var(--chat-accent-primary)' }}
            >
              Upgrade
            </button>
          </>
        )}
      </div>

      <div className="text-3xl" aria-hidden="true">
        {emoji}
      </div>
      <h1
        className="text-2xl font-semibold tracking-tight sm:text-3xl"
        style={{ color: 'var(--chat-text-primary)' }}
      >
        {greeting.text}
      </h1>
      <p className="max-w-md text-sm sm:text-base" style={{ color: 'var(--chat-text-muted)' }}>
        How can I help you today?
      </p>
    </div>
  );
}
