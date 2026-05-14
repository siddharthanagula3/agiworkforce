import { useMemo } from 'react';
import { getGreeting } from '../lib/greetings';
import { useSettingsStore } from '../stores/settingsStore';

/**
 * Centered hero shown when a conversation has zero messages.
 *
 * Reference: ~/Desktop/reference/ui/claude ui/claude Desktop ui/
 *   01_empty-state_new-chat-collapsed-sidebar.png
 *
 * The reference centers a serif greeting with a quiet subtitle just
 * above the composer; the composer itself stays in `ChatInterface`,
 * so this component only owns the text. The time-of-day emoji is kept
 * because it's a small piece of personality the reference apps don't
 * have, and `getGreeting` already gives us a stable per-mount string.
 */
export function EmptyState() {
  const profile = useSettingsStore((s) => s.profile);
  const name = profile.nickname?.trim() || profile.fullName?.trim() || undefined;

  // Stable greeting per mount (random selection, not re-rolled on re-render)
  const greeting = useMemo(() => getGreeting(name || undefined), [name]);

  // Time-of-day emoji per the spec
  const hour = new Date().getHours();
  const emoji =
    hour >= 5 && hour < 12
      ? '☀️'
      : hour >= 12 && hour < 17
        ? '🌸'
        : hour >= 17 && hour < 21
          ? '🌇'
          : '🌙';

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
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
