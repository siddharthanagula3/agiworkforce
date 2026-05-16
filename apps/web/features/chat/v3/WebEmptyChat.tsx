'use client';

import { useCallback } from 'react';
import { EmptyState, QuickChips, useChatStore } from '@agiworkforce/unified-chat';
import type { ChipType } from '@agiworkforce/unified-chat';

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

export function WebEmptyChat() {
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
