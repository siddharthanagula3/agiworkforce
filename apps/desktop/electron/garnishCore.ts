/**
 * Pure logic shared by the shell "garnish" modules (quick ask, screenshot,
 * tray, hotkeys).
 *
 * Nothing here imports `electron`, so it is unit-testable under the desktop
 * vitest project (jsdom, no Electron runtime). Anything that needs `app`,
 * `screen`, or `BrowserWindow` belongs in the sibling modules instead.
 */

export interface GarnishShortcuts {
  /** Accelerator that toggles the always-on-top quick-ask panel. */
  quickAskShortcut: string;
  /** Accelerator that captures the screen into the chat composer. */
  screenshotShortcut: string;
}

export const DEFAULT_SHORTCUTS: GarnishShortcuts = {
  // Alt+Shift+Space avoids Spotlight (Cmd+Space) and the macOS input-source
  // switcher (Ctrl+Space); Cmd/Ctrl+Shift+2 avoids the OS screenshot family
  // (Cmd+Shift+3/4/5 on macOS).
  quickAskShortcut: 'Alt+Shift+Space',
  screenshotShortcut: 'CommandOrControl+Shift+2',
};

/**
 * An accelerator we are willing to hand to `globalShortcut.register`.
 * Electron throws on a malformed accelerator rather than returning false, so
 * anything that is not a non-empty, whitespace-free string falls back to the
 * default instead of taking the app down at startup.
 */
export function isUsableAccelerator(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && !/\s/.test(value);
}

/**
 * Coerce whatever was on disk into a complete settings object. Unknown keys
 * are dropped and unusable values fall back to defaults, so a hand-edited or
 * partially-written settings.json can never break startup.
 */
export function normalizeShortcuts(raw: unknown): GarnishShortcuts {
  const source =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const quickAsk = source['quickAskShortcut'];
  const screenshot = source['screenshotShortcut'];
  return {
    quickAskShortcut: isUsableAccelerator(quickAsk) ? quickAsk : DEFAULT_SHORTCUTS.quickAskShortcut,
    screenshotShortcut: isUsableAccelerator(screenshot)
      ? screenshot
      : DEFAULT_SHORTCUTS.screenshotShortcut,
  };
}

/** Parse a settings.json body; malformed JSON yields defaults, never a throw. */
export function parseSettingsFile(contents: string): GarnishShortcuts {
  try {
    return normalizeShortcuts(JSON.parse(contents));
  } catch {
    return { ...DEFAULT_SHORTCUTS };
  }
}

/** The subset of `DesktopCapturerSource` this module needs (keeps tests free of Electron). */
export interface CapturerSourceLike {
  display_id?: string;
  id?: string;
}

/**
 * Pick the capturer source that corresponds to a display.
 *
 * `display_id` is the reliable match but is empty on some platforms/versions;
 * the screen source `id` is then of the form `screen:<display id>:<index>`, so
 * fall back to that before finally taking the first source. Returning the
 * first source is deliberate: capturing the wrong screen is a better failure
 * than capturing nothing.
 */
export function pickSourceForDisplay<T extends CapturerSourceLike>(
  sources: readonly T[],
  displayId: number | string,
): T | null {
  if (sources.length === 0) return null;
  const wanted = String(displayId);
  const byDisplayId = sources.find((source) => source.display_id === wanted);
  if (byDisplayId) return byDisplayId;
  const bySourceId = sources.find((source) => source.id?.split(':')[1] === wanted);
  if (bySourceId) return bySourceId;
  return sources[0] ?? null;
}

export interface RectLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Centre a panel horizontally on a display and sit it in the upper third —
 * the Spotlight/Raycast position, which keeps the panel clear of the dock and
 * of whatever the user is reading at the centre of the screen.
 */
export function centeredUpperPosition(
  workArea: RectLike,
  panelWidth: number,
  panelHeight: number,
): { x: number; y: number } {
  const x = Math.round(workArea.x + (workArea.width - panelWidth) / 2);
  const preferredY = Math.round(workArea.y + workArea.height * 0.18);
  // Never push the panel off the bottom of a short display.
  const maxY = Math.round(workArea.y + Math.max(0, workArea.height - panelHeight));
  return { x, y: Math.min(preferredY, maxY) };
}
