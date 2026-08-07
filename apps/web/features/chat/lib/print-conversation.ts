/**
 * Print the whole conversation.
 *
 * The browser's own Ctrl+P was never usable here for two reasons: the app
 * chrome printed alongside the transcript, and the transcript is VIRTUALIZED —
 * only the handful of rows currently in the DOM exist, so a long conversation
 * printed as a few pages with the middle silently missing. That second problem
 * is the important one: a partial printout looks complete.
 *
 * This scopes the print with `data-print-scope` (see the `@media print` block in
 * `app/globals.css`) and gives the virtual list a chance to render everything
 * before the print dialog opens.
 */

/** Marks the document so the print stylesheet applies, and cleans up after. */
export async function printConversation(
  options: { onExpand?: () => void; waitMs?: number } = {},
): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const root = document.documentElement;
  root.setAttribute('data-print-scope', 'transcript');

  // Let the caller force the virtual list to render every row. Without this the
  // printout is whatever happened to be within the scroll window.
  options.onExpand?.();

  // Two frames plus a short settle: one for React to commit the expanded list,
  // one for layout, then a beat for images and fonts already in cache. This is
  // deliberately not a network wait — printing should not hang on a slow asset.
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
  if (options.waitMs && options.waitMs > 0) {
    await new Promise<void>((resolve) => setTimeout(resolve, options.waitMs));
  }

  const cleanup = () => {
    root.removeAttribute('data-print-scope');
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);

  try {
    window.print();
  } finally {
    // `afterprint` does not fire in every browser (and never when the user
    // cancels in some). Clear on a timer too so the app is never left in print
    // scope, which would hide the sidebar on screen.
    setTimeout(cleanup, 1000);
  }
}
