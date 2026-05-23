'use client';

import { useCallback } from 'react';
import { useChatStore } from '@agiworkforce/unified-chat';
import { GreetingBanner } from '../components/GreetingBanner/GreetingBanner';

export function WebEmptyChat() {
  const setDraftContent = useChatStore((s) => s.setDraftContent);

  const handleChipClick = useCallback(
    (prompt: string) => {
      setDraftContent(prompt);
    },
    [setDraftContent],
  );

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-6">
      <GreetingBanner onSendMessage={handleChipClick} />
    </div>
  );
}
