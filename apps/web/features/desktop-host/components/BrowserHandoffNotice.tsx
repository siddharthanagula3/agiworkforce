'use client';

import { useCallback, useEffect, useState } from 'react';
import { Spinner } from '@agiworkforce/ui';
import { finishBrowserHandoff, useBrowserHandoff } from '../lib/browser-handoff';

const TITLE = 'Continue in your browser';
const CHECK_LABEL = 'Check again';
const CHECKING_LABEL = 'Checking';
const DONE_LABEL = 'Done';

/**
 * The waiting state for a step that left for the browser. The shell cannot see
 * the browser finish, so the window rereads on every return to it and offers
 * the same reread by hand.
 */
export function BrowserHandoffNotice() {
  const handoff = useBrowserHandoff();
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    if (handoff === null) return;
    setChecking(true);
    try {
      await handoff.refresh();
    } finally {
      setChecking(false);
    }
  }, [handoff]);

  useEffect(() => {
    if (handoff === null) return undefined;
    const onFocus = () => void check();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [handoff, check]);

  if (handoff === null) return null;

  return (
    <aside
      role="status"
      aria-live="polite"
      data-testid="browser-handoff-notice"
      className="pointer-events-auto flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 text-foreground shadow-lg"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{TITLE}</p>
        <p className="text-xs text-muted-foreground">{handoff.detail}</p>
      </div>
      <button
        type="button"
        className="inline-flex shrink-0 items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
        disabled={checking}
        onClick={() => void check()}
      >
        {checking ? <Spinner size="sm" aria-hidden="true" /> : null}
        {checking ? CHECKING_LABEL : CHECK_LABEL}
      </button>
      <button
        type="button"
        className="shrink-0 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        onClick={finishBrowserHandoff}
      >
        {DONE_LABEL}
      </button>
    </aside>
  );
}
