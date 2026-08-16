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
