import { useCallback } from 'react';
import { EmptyState, QuickChips, useChatStore } from '@agiworkforce/unified-chat';
import type { ChipType } from '@agiworkforce/unified-chat';

const CHIP_PROMPTS: Partial<Record<ChipType, string>> = {
  code: 'Help me write code for ',
  write: 'Help me write ',
  learn: 'Explain this to me: ',
  life: 'Help me with ',
  research: 'Research this topic in depth: ',
  web: 'Search the web for ',
};

/**
 * v3 empty-chat surface: serif headline + four task chips, composer-first
 * per docs/design/design-spec-2026-05-15.md §8.
 *
 * Mounted as `<ChatInterface emptyStateSlot={<EmptyChat/>} />` so existing
 * EmptyState behavior (plan-badge pill + serif headline) is preserved; we
 * only add the chip row below the empty state. The composer below remains
 * the unified-chat default.
 */
export function EmptyChat() {
  const setDraftContent = useChatStore((s) => s.setDraftContent);

  const handleChipClick = useCallback(
    (chip: ChipType) => {
      setDraftContent(CHIP_PROMPTS[chip] ?? '');
    },
    [setDraftContent],
  );

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-6">
      <div className="w-full">
        <EmptyState />
      </div>
      <div className="w-full max-w-xl">
        <QuickChips onChipClick={handleChipClick} />
      </div>
    </div>
  );
}
