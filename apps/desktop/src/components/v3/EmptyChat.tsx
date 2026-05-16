import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState, QuickChips, useChatStore } from '@agiworkforce/unified-chat';
import type { ChipType } from '@agiworkforce/unified-chat';
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
  const setDraftContent = useChatStore((s) => s.setDraftContent);
  const user = useUnifiedAuthStore(selectUser);

  const headline = useMemo(() => {
    const rawName = user?.name?.trim();
    const firstName = rawName ? rawName.split(/\s+/)[0]! : t('emptyChat.fallbackName');
    const hour = new Date().getHours();
    if (hour < 12) return t('emptyChat.greetMorning', { name: firstName });
    if (hour <= 22) return t('emptyChat.greetDay', { name: firstName });
    return t('emptyChat.greetNight', { name: firstName });
  }, [user?.name, t]);

  const handleChipClick = useCallback(
    (chip: ChipType) => {
      const prompts: Partial<Record<ChipType, string>> = {
        code: t('emptyChat.chipPrompts.code'),
        write: t('emptyChat.chipPrompts.write'),
        research: t('emptyChat.chipPrompts.research'),
        image: t('emptyChat.chipPrompts.image'),
        video: t('emptyChat.chipPrompts.video'),
        computer: t('emptyChat.chipPrompts.computer'),
        learn: t('emptyChat.chipPrompts.learn'),
        life: t('emptyChat.chipPrompts.life'),
        web: t('emptyChat.chipPrompts.web'),
      };
      setDraftContent(prompts[chip] ?? '');
    },
    [setDraftContent, t],
  );

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-6">
      <div className="w-full">
        <EmptyState headline={headline} />
      </div>
      <div className="w-full max-w-xl">
        <QuickChips onChipClick={handleChipClick} />
      </div>
    </div>
  );
}
