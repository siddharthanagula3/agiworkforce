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

export async function focusPageComposer(win: BrowserWindow): Promise<boolean> {
  if (win.isDestroyed()) return false;
  try {
    return (await win.webContents.executeJavaScript(FOCUS_COMPOSER_SCRIPT, true)) === true;
  } catch (error) {
    console.warn('[composer] could not focus the composer:', error);
    return false;
  }
}

const COMPOSER_POLL_MS = 150;

/**
 * A page that has just loaded paints its composer only after it hydrates, so
 * the first attempt can find nothing to focus. Tries until the composer takes
 * focus or the time runs out.
 */
export async function focusComposerWhenReady(
  win: BrowserWindow,
  timeoutMs: number,
  focus: (win: BrowserWindow) => Promise<boolean> = focusPageComposer,
): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    if (win.isDestroyed()) return false;
    if (await focus(win)) return true;
    if (Date.now() >= end) return false;
    await new Promise((resolve) => setTimeout(resolve, COMPOSER_POLL_MS));
  }
}
