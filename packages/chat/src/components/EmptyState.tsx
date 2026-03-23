import { useMemo } from 'react';
import { getGreeting } from '../lib/greetings';
import { useSettingsStore } from '../stores/settingsStore';

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
    <div className="flex h-full flex-col items-center justify-center gap-3 text-[var(--chat-text-muted)]">
      <div className="text-3xl" aria-hidden="true">
        {emoji}
      </div>
      <p className="text-xl font-semibold text-[var(--chat-text-primary)]">{greeting.text}</p>
    </div>
  );
}
