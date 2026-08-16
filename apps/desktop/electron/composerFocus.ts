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
