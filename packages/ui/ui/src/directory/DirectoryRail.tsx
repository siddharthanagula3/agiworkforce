'use client';

import { BookOpen, Plug, Puzzle, type LucideIcon } from 'lucide-react';

import { cn } from '../cn';
import { DIRECTORY_RAIL_LABEL, DIRECTORY_SECTION_LABELS } from './constants';
import { DIRECTORY_FOCUS_RING } from './styles';
import type { DirectorySectionKey } from './types';

const SECTION_ICONS: Record<DirectorySectionKey, LucideIcon> = {
  skills: BookOpen,
  connectors: Plug,
  plugins: Puzzle,
};

export function DirectoryRail({
  sections,
  active,
  onSelect,
}: {
  sections: readonly DirectorySectionKey[];
  active: DirectorySectionKey;
  onSelect: (section: DirectorySectionKey) => void;
}) {
  return (
    <div
      role="tablist"
      aria-orientation="vertical"
      aria-label={DIRECTORY_RAIL_LABEL}
      className="flex shrink-0 flex-row gap-1 overflow-x-auto border-b border-border p-3 md:w-52 md:flex-col md:overflow-visible md:border-b-0 md:border-r"
    >
      {sections.map((section) => {
        const Icon = SECTION_ICONS[section];
        const selected = section === active;
        return (
          <button
            key={section}
            type="button"
            role="tab"
            id={`directory-tab-${section}`}
            aria-selected={selected}
            aria-controls={`directory-panel-${section}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(section)}
            className={cn(
              'inline-flex min-h-9 items-center gap-2 rounded-md px-3 text-sm transition-colors motion-reduce:transition-none',
              selected
                ? 'bg-muted font-medium text-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              DIRECTORY_FOCUS_RING,
            )}
          >
            <Icon aria-hidden className="size-4" />
            {DIRECTORY_SECTION_LABELS[section]}
          </button>
        );
      })}
    </div>
  );
}
