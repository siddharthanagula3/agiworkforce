'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { CommandPalette } from './CommandPalette';

export function CommandPaletteProvider() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        // On the chat surface, ⌘K is owned by the conversation search dialog
        // (advertised as "Search ⌘K" in the chat sidebar, opened by WebShellV3).
        // This global listener also firing there stacked TWO modals on a single
        // keypress. Yield ⌘K on the chat surface only; the palette stays the sole
        // ⌘K owner everywhere else. Match exactly /chat and /chat/<id> — the
        // surfaces that actually mount the search handler — not a loose
        // startsWith('/chat') that would also swallow ⌘K on unrelated /chat*
        // routes where no search handler exists (leaving ⌘K dead).
        if (pathname === '/chat' || pathname?.startsWith('/chat/')) return;
        e.preventDefault();
        setOpen((v) => !v);
      }
    },
    [pathname],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return <CommandPalette open={open} onOpenChange={setOpen} />;
}
