'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, X } from '@agiworkforce/icons';
import { onAppCommand } from '@shared/lib/app-commands';
import { applyPageFindSelection, pageFindOccurrences } from '../lib/page-find';

const FIELD_CLASS =
  'h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-focus-ring';
const BUTTON_CLASS =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-40 pointer-coarse:h-11 pointer-coarse:w-11';

/**
 * The find session Edit > Find asks the page to run.
 *
 * It searches the text already on screen, then Find Next and Find Previous
 * walk those matches. Closing it clears the highlight.
 */
export function PageFindBar() {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const openRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const [count, setCount] = useState(0);
  const [position, setPosition] = useState(-1);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    const stopFind = onAppCommand('find', () => {
      setOpen(true);
      setIndex(0);
    });
    const stopNext = onAppCommand('find-next', () => {
      setOpen(true);
      setIndex((current) => (openRef.current ? current + 1 : 0));
    });
    const stopPrevious = onAppCommand('find-previous', () => {
      setOpen(true);
      setIndex((current) => (openRef.current ? current - 1 : -1));
    });
    return () => {
      stopFind();
      stopNext();
      stopPrevious();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [open]);

  useEffect(() => {
    if (!open) {
      applyPageFindSelection(undefined);
      return;
    }
    const bar = document.querySelector('[data-page-find-bar]');
    const matches = pageFindOccurrences(document.body, bar, query);
    const chosen =
      matches.length === 0 ? -1 : ((index % matches.length) + matches.length) % matches.length;
    setCount(matches.length);
    setPosition(chosen);
    applyPageFindSelection(chosen < 0 ? undefined : matches[chosen]);
  }, [open, query, index]);

  if (!open) return null;

  const status =
    query.trim() === '' ? '' : count === 0 ? 'No matches' : `${position + 1} of ${count}`;

  return (
    <div
      role="search"
      aria-label="Find in page"
      data-page-find-bar=""
      className="fixed right-3 top-[calc(var(--agi-window-title-strip,0px)+3rem)] z-[var(--z-popover)] w-96 max-w-[calc(100vw-1.5rem)] rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg"
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <label htmlFor={inputId} className="text-sm font-medium">
          Find in page
        </label>
        <button
          type="button"
          aria-label="Close"
          className={BUTTON_CLASS}
          onClick={() => setOpen(false)}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          placeholder="Search this page"
          value={query}
          autoComplete="off"
          spellCheck={false}
          className={FIELD_CLASS}
          onChange={(event) => {
            setQuery(event.target.value);
            setIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              setOpen(false);
              return;
            }
            if (event.key === 'Enter') {
              event.preventDefault();
              setIndex((current) => current + (event.shiftKey ? -1 : 1));
            }
          }}
        />
        <button
          type="button"
          aria-label="Previous"
          title="Previous match"
          className={BUTTON_CLASS}
          disabled={count === 0}
          onClick={() => setIndex((current) => current - 1)}
        >
          <ChevronUp className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Next"
          title="Next match"
          className={BUTTON_CLASS}
          disabled={count === 0}
          onClick={() => setIndex((current) => current + 1)}
        >
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div aria-live="polite" className="mt-2 text-xs text-muted-foreground">
        {status || 'Type to find text on this page'}
      </div>
    </div>
  );
}
