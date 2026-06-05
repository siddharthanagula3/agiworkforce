import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@agiworkforce/unified-chat';
import { useUnifiedAuthStore, selectUser } from '../../stores/auth';

/**
 * v3 empty-chat surface: personalized time-of-day greeting + four task chips,
 * composer-first per docs/design/design-spec-2026-05-15.md §8.
 *
 * Greeting formula:
 *   hour < 12  → "Good morning, {first}"
 *   12–22      → "What can I help with, {first}?"
 *   22+        → "It's late-night, {first}"
 *
 * Falls back to the localized neutral name when auth user has no name.
 */
export function EmptyChat() {
  const { t } = useTranslation('v3');
  const user = useUnifiedAuthStore(selectUser);

  const headline = useMemo(() => {
    const rawName = user?.name?.trim();
    if (!rawName) return t('emptyChat.neutralHeadline');

    const firstName = rawName.split(/\s+/)[0]!;
    const hour = new Date().getHours();
    if (hour < 12) return t('emptyChat.greetMorning', { name: firstName });
    if (hour <= 22) return t('emptyChat.greetDay', { name: firstName });
    return t('emptyChat.greetNight', { name: firstName });
  }, [user?.name, t]);

  return (
    <div className="flex h-full flex-col items-center justify-center px-6">
      <div className="w-full">
        <EmptyState
          headline={headline}
          planBadgeLabel={t('emptyChat.modeLabel')}
          showPlanBadgeNoun={false}
        />
      </div>
    </div>
  );
}
