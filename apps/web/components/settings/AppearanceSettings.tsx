'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useSettingsStore, type Theme, type ChatFontSize } from '@/stores/settingsStore';
import { cn } from '@/utils/cn';

const THEMES: { value: Theme; label: string; icon: React.ElementType }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

const FONT_SIZES: { value: ChatFontSize; label: string; preview: string }[] = [
  { value: 'sm', label: 'Small', preview: 'Aa' },
  { value: 'md', label: 'Medium', preview: 'Aa' },
  { value: 'lg', label: 'Large', preview: 'Aa' },
];

const FONT_SIZE_CLASSES: Record<ChatFontSize, string> = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
};

export function AppearanceSettings() {
  const { theme, setTheme, chatFontSize, setChatFontSize } = useSettingsStore();

  return (
    <div className="space-y-6">
      {/* Theme */}
      <div>
        <label className="text-sm font-medium text-zinc-200 block mb-3">Theme</label>
        <div className="grid grid-cols-3 gap-2">
          {THEMES.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setTheme(value)}
              className={cn(
                'flex flex-col items-center gap-2 p-3 rounded-lg border text-sm font-medium transition-all',
                theme === value
                  ? 'border-white/40 bg-white/10 text-white'
                  : 'border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200',
              )}
            >
              <Icon className="w-5 h-5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Font size */}
      <div>
        <label className="text-sm font-medium text-zinc-200 block mb-3">Chat Font Size</label>
        <div className="grid grid-cols-3 gap-2">
          {FONT_SIZES.map(({ value, label, preview }) => (
            <button
              key={value}
              onClick={() => setChatFontSize(value)}
              className={cn(
                'flex flex-col items-center gap-2 p-3 rounded-lg border transition-all',
                chatFontSize === value
                  ? 'border-white/40 bg-white/10 text-white'
                  : 'border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200',
              )}
            >
              <span className={cn('font-semibold', FONT_SIZE_CLASSES[value])}>{preview}</span>
              <span className="text-xs">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
