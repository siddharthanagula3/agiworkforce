/**
 * The unsaved composer surface has no conversation id, so every visit to it
 * shares one draft slot. That makes "a draft must not follow the user into a
 * new chat" and "a draft must survive going back" the same key with opposite
 * answers, and no rule keyed on the conversation can satisfy both.
 *
 * What separates them is the navigation, not the surface. Opening a new chat
 * is a push: the user asked for a blank slate. Going back is a pop: they
 * expect to find what they left, which is exactly what a browser does for form
 * fields. So the pending draft is offered back only on a history step.
 *
 * It is held per tab rather than in memory because the navigation away from
 * the surface can tear the store down with it, and a draft that only survives
 * a soft navigation would restore or vanish depending on how the button that
 * moved the user happened to be built. Session storage dies with the tab,
 * which is the lifetime the in-memory draft already documented for itself.
 */
const PENDING_DRAFT_STORAGE_KEY = 'agi.composer-pending-draft';

let arrivedByHistoryStep = false;

function markHistoryStep(): void {
  arrivedByHistoryStep = true;
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', markHistoryStep);
}

export function parkPendingDraft(content: string): void {
  try {
    if (content) window.sessionStorage.setItem(PENDING_DRAFT_STORAGE_KEY, content);
    else window.sessionStorage.removeItem(PENDING_DRAFT_STORAGE_KEY);
  } catch {
    // Storage blocked by the browser costs the draft, never the composer.
  }
}

export function clearPendingDraft(): void {
  parkPendingDraft('');
}

/**
 * The draft this arrival is entitled to. Empty unless the user stepped back or
 * forward to get here; reading it spends that step, so a composer mounted by a
 * push cannot inherit the answer. `inMemory` wins when it is present, since a
 * navigation keeps the store, and it is the fresher of the two.
 */
export function restorablePendingDraft(inMemory: string): string {
  const steppedBack = arrivedByHistoryStep;
  arrivedByHistoryStep = false;
  if (!steppedBack) return '';
  if (inMemory) return inMemory;
  try {
    return window.sessionStorage.getItem(PENDING_DRAFT_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}
