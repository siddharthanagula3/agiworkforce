'use client';

import { useId, useState } from 'react';
import { Brain, ChevronDown } from '@agiworkforce/icons';
import type { ManagedMemoryCitations } from '@agiworkforce/types';
import { translateUiPlural } from '@agiworkforce/ui';
import { cn } from '@shared/lib/utils';
import { useSettingsModal } from '@features/settings/components/SettingsModalProvider';

const MEMORY_SETTINGS_SECTION = 'memory';

export function CitationMemories({ citations }: { citations: ManagedMemoryCitations }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const { openSettings } = useSettingsModal();
  const unlisted = citations.count - citations.memories.length;

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-7 items-center gap-1 rounded-full border border-[var(--chat-border)] bg-[var(--chat-surface-hover)] px-2.5 text-xs font-medium text-[var(--chat-text-secondary)] transition-colors duration-instant hover:bg-[var(--chat-surface-elevated)] hover:text-[var(--chat-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)] pointer-coarse:min-h-11"
      >
        <Brain className="h-3.5 w-3.5 shrink-0 text-[var(--chat-text-muted)]" aria-hidden="true" />
        <span>
          {translateUiPlural('chat', 'counts.savedMemoriesUsed', citations.count, {
            one: 'Used {{count}} saved memory',
            other: 'Used {{count}} saved memories',
          })}
        </span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-[var(--chat-text-muted)] transition-transform duration-instant',
            open && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div
          id={listId}
          className="w-full max-w-prose rounded-lg border border-[var(--chat-border)] px-3 py-2"
        >
          <ul
            className="flex flex-col gap-1.5 text-xs text-[var(--chat-text-secondary)]"
            aria-label="Saved memories this answer used"
          >
            {citations.memories.map((memory) => (
              <li key={memory.id}>{memory.excerpt}</li>
            ))}
          </ul>
          {unlisted > 0 && (
            <p className="mt-1.5 text-xs text-[var(--chat-text-secondary)]">
              {translateUiPlural('chat', 'counts.moreSavedMemories', unlisted, {
                one: 'And {{count}} more',
                other: 'And {{count}} more',
              })}
            </p>
          )}
          <button
            type="button"
            onClick={() => openSettings(MEMORY_SETTINGS_SECTION)}
            className="mt-2 rounded-control text-xs font-medium text-[var(--chat-text-primary)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)] pointer-coarse:min-h-11"
          >
            Manage memory
          </button>
        </div>
      )}
    </div>
  );
}
