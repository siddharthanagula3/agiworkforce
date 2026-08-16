import type { SavedShortcut } from '../../types';

export function normalizeShortcutStartUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    // Origin is sufficient for replay safety and avoids persisting URL paths,
    return parsed.origin;
  } catch {
    return null;
  }
}

export type ShortcutReplayTargetResult = { ok: true } | { ok: false; error: string };

export function validateShortcutReplayTarget(
  shortcut: Pick<SavedShortcut, 'actions' | 'startUrl'>,
  activeTabUrl: unknown,
): ShortcutReplayTargetResult {
  if (!Array.isArray(shortcut.actions) || shortcut.actions.length === 0) return { ok: true };

  const recordedOrigin = normalizeShortcutStartUrl(shortcut.startUrl);
  if (!recordedOrigin) {
    return {
      ok: false,
      error: 'This older shortcut is not bound to a site. Re-record it before replaying.',
    };
  }

  const activeOrigin = normalizeShortcutStartUrl(activeTabUrl);
  if (!activeOrigin) {
    return {
      ok: false,
      error: `Open ${new URL(recordedOrigin).host} in a web tab to replay this shortcut.`,
    };
  }
  if (activeOrigin !== recordedOrigin) {
    return {
      ok: false,
      error: `This shortcut was recorded for ${new URL(recordedOrigin).host}. Open that site to replay it.`,
    };
  }
  return { ok: true };
}
