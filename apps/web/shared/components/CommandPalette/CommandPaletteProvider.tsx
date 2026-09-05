'use client';

import { useState, useEffect, useCallback } from 'react';
import { CommandPalette } from './CommandPalette';

export function CommandPaletteProvider() {
  const [open, setOpen] = useState(false);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      // Capture phase + stopPropagation: the chat page registers its own
      // Cmd/Ctrl+K binding (for its conversation-search dialog) on `document`
      // in the bubble phase. Left alone, both listeners fire on every page
      // that also mounts that binding. This one wins and the event never
      // reaches the bubble-phase listener, so every page, chat included, gets
      // ONE consistent shortcut: this palette.
      e.stopPropagation();
      setOpen((v) => !v);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [handleKeyDown]);

  return <CommandPalette open={open} onOpenChange={setOpen} />;
}
