
export interface GarnishShortcuts {
  quickAskShortcut: string;
  screenshotShortcut: string;
}

export const DEFAULT_SHORTCUTS: GarnishShortcuts = {
  quickAskShortcut: 'Alt+Shift+Space',
  screenshotShortcut: 'CommandOrControl+Shift+2',
};

export function isUsableAccelerator(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && !/\s/.test(value);
}

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

export function parseSettingsFile(contents: string): GarnishShortcuts {
  try {
    return normalizeShortcuts(JSON.parse(contents));
  } catch {
    return { ...DEFAULT_SHORTCUTS };
  }
}

export interface CapturerSourceLike {
  display_id?: string;
  id?: string;
}

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

export function centeredUpperPosition(
  workArea: RectLike,
  panelWidth: number,
  panelHeight: number,
): { x: number; y: number } {
  const x = Math.round(workArea.x + (workArea.width - panelWidth) / 2);
  const preferredY = Math.round(workArea.y + workArea.height * 0.18);
  const maxY = Math.round(workArea.y + Math.max(0, workArea.height - panelHeight));
  return { x, y: Math.min(preferredY, maxY) };
}
