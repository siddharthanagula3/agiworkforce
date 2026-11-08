'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { onAppCommand } from '@shared/lib/app-commands';
import { applyPageFindSelection, pageFindOccurrences } from '../lib/page-find';

const FIELD_CLASS =
  'min-h-[32px] w-44 rounded-md border border-border/60 bg-background px-3 py-1 text-sm text-foreground outline-none focus-visible:border-[var(--chat-accent-primary)]';
const BUTTON_CLASS =
  'min-h-[32px] rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring';

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
      aria-label="Find"
      data-page-find-bar=""
      className="fixed right-3 top-12 z-[var(--z-popover)] flex items-center gap-2 rounded-md border border-border/60 bg-background px-2 py-1 text-foreground"
    >
      <label htmlFor={inputId} className="sr-only">
        Find
      </label>
      <input
        ref={inputRef}
        id={inputId}
        type="text"
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
      <span aria-live="polite" className="min-w-16 text-xs text-muted-foreground">
        {status}
      </span>
      <button
        type="button"
        className={BUTTON_CLASS}
        onClick={() => setIndex((current) => current - 1)}
      >
        Previous
      </button>
      <button
        type="button"
        className={BUTTON_CLASS}
        onClick={() => setIndex((current) => current + 1)}
      >
        Next
      </button>
      <button type="button" className={BUTTON_CLASS} onClick={() => setOpen(false)}>
        Close
      </button>
    </div>
  );
}
