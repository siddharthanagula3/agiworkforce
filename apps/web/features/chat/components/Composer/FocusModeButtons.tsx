'use client';

import { cn } from '@shared/lib/utils';

export type FocusMode = 'web' | 'academic' | 'code' | 'writing' | 'research' | null;

const MODES: Array<{ id: FocusMode; label: string }> = [
  { id: 'web', label: 'Web' },
  { id: 'academic', label: 'Academic' },
  { id: 'code', label: 'Code' },
  { id: 'writing', label: 'Writing' },
  { id: 'research', label: 'Deep Research' },
  { id: null, label: 'All' },
];

interface FocusModeButtonsProps {
  activeMode: FocusMode;
  onChange: (mode: FocusMode) => void;
}

export function FocusModeButtons({ activeMode, onChange }: FocusModeButtonsProps) {
  return (
    <div className="mb-2 flex flex-wrap items-center justify-center gap-2">
      {MODES.map(({ id, label }) => {
        const isActive = activeMode === id;
        return (
          <button
            key={String(id)}
            onClick={() => onChange(id)}
            className={cn(
              'rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200',
              isActive
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'border border-border bg-white/80 text-muted-foreground hover:bg-muted/50 dark:bg-zinc-800/80',
            )}
            aria-pressed={isActive}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
