'use client';

import { useTheme } from 'next-themes';
import { Moon, Sun, Monitor } from 'lucide-react';
import { Button } from './Button';

function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const cycleTheme = () => {
    if (theme === 'light') {
      setTheme('dark');
    } else if (theme === 'dark') {
      setTheme('system');
    } else {
      setTheme('light');
    }
  };

  const label = theme === 'light' ? 'Light' : theme === 'dark' ? 'Dark' : 'System';
  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={cycleTheme}
      className="gap-2"
      title={`Current theme: ${label}. Click to cycle through themes.`}
      aria-label={`Switch theme (currently ${label})`}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}
ThemeToggle.displayName = 'ThemeToggle';

export { ThemeToggle };
