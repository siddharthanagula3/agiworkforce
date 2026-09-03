'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';

const ICON_SIZE = 16;

export function ThemeToggle({
  className = 'agi-ds-theme-toggle',
  interactiveClassName,
}: {
  className?: string;
  interactiveClassName?: string;
}) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <span className={className} aria-hidden="true" />;
  }

  const isDark = resolvedTheme === 'dark';

  return (
    <button
      type="button"
      className={[interactiveClassName, className].filter(Boolean).join(' ')}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {isDark ? (
        <Sun size={ICON_SIZE} aria-hidden="true" />
      ) : (
        <Moon size={ICON_SIZE} aria-hidden="true" />
      )}
    </button>
  );
}
