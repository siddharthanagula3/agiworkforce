'use client';

import { useState, useEffect, useCallback } from 'react';
import { CommandPalette } from './CommandPalette';

export function CommandPaletteProvider() {
  const [open, setOpen] = useState(false);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      setOpen((v) => !v);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return <CommandPalette open={open} onOpenChange={setOpen} />;
}
