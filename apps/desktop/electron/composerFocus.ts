/**
 * Put keyboard focus in the chat composer of a hosted-app window.
 *
 * Raising or showing a BrowserWindow focuses the document, not any particular
 * element, so focus lands on the page's first focusable node — in practice the
 * "Skip to main content" link. That breaks both garnish features: a summoned
 * Quick Ask panel the user cannot type into, and `webContents.paste()` firing
 * at a link instead of the composer.
 *
 * The renderer is the hosted web app and exposes no shell-facing focus API, so
 * the composer is located structurally rather than by a brittle test id: the
 * last visible text input on the page. If the web app ever adds a stable hook
 * for this, prefer it over the heuristic.
 */
import type { BrowserWindow } from 'electron';

const FOCUS_COMPOSER_SCRIPT = `(() => {
  const candidates = Array.from(
    document.querySelectorAll('textarea, [contenteditable="true"]'),
  ).filter((el) => {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
  const composer = candidates[candidates.length - 1];
  if (!composer) return false;
  composer.focus();
  return document.activeElement === composer;
})()`;

/**
 * Returns whether the composer actually took focus. `false` means the page had
 * no composer to focus (signed out, still loading, or an unexpected route) —
 * callers should treat that as "the page is not ready", not as a hard error.
 */
export async function focusPageComposer(win: BrowserWindow): Promise<boolean> {
  if (win.isDestroyed()) return false;
  try {
    return (await win.webContents.executeJavaScript(FOCUS_COMPOSER_SCRIPT, true)) === true;
  } catch (error) {
    console.warn('[composer] could not focus the composer:', error);
    return false;
  }
}
