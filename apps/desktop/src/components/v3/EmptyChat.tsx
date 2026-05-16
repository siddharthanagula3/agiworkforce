import { useCallback, useMemo } from 'react';
import { EmptyState, QuickChips, useChatStore } from '@agiworkforce/unified-chat';
import type { ChipType } from '@agiworkforce/unified-chat';
import { useUnifiedAuthStore, selectUser } from '../../stores/auth';

const CHIP_PROMPTS: Partial<Record<ChipType, string>> = {
  code: 'Help me write code for ',
  write: 'Help me write ',
  research: 'Research this topic in depth: ',
  image: 'Create an image of ',
  video: 'Create a video of ',
  computer: 'Use computer to ',
  learn: 'Explain this to me: ',
  life: 'Help me with ',
  web: 'Search the web for ',
};

function timeOfDayGreeting(firstName: string): string {
  const hour = new Date().getHours();
  if (hour < 12) return `Good morning, ${firstName}`;
  if (hour <= 22) return `What can I help with, ${firstName}?`;
  return `It's late-night, ${firstName}`;
}

/**
 * v3 empty-chat surface: personalized time-of-day greeting + four task chips,
 * composer-first per docs/design/design-spec-2026-05-15.md §8.
 *
 * Greeting formula:
 *   hour < 12  → "Good morning, {first}"
 *   12–22      → "What can I help with, {first}?"
 *   22+        → "It's late-night, {first}"
 *
 * Falls back to "there" when auth user has no name.
 */
export function EmptyChat() {
  const setDraftContent = useChatStore((s) => s.setDraftContent);
  const user = useUnifiedAuthStore(selectUser);

  const headline = useMemo(() => {
    const rawName = user?.name?.trim();
    const firstName = rawName ? rawName.split(/\s+/)[0]! : 'there';
    return timeOfDayGreeting(firstName);
  }, [user?.name]);

  const handleChipClick = useCallback(
    (chip: ChipType) => {
      setDraftContent(CHIP_PROMPTS[chip] ?? '');
    },
    [setDraftContent],
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
