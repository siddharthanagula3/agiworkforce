import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SHORTCUTS, type GarnishShortcuts } from '../garnishCore';

const registered = new Map<string, () => void>();
const rejected = new Set<string>();
const notifications: { title: string; body: string }[] = [];

vi.mock('electron', () => ({
  globalShortcut: {
    register: (accelerator: string, handler: () => void) => {
      if (rejected.has(accelerator)) return false;
      if (registered.has(accelerator)) return false;
      registered.set(accelerator, handler);
      return true;
    },
    unregisterAll: () => registered.clear(),
  },
  Notification: Object.assign(
    function NotificationMock(this: unknown, options: { title: string; body: string }) {
      return {
        show: () => {
          notifications.push(options);
        },
      };
    },
    { isSupported: () => true },
  ),
}));

let stored: GarnishShortcuts = { ...DEFAULT_SHORTCUTS };
vi.mock('../settingsStore', () => ({
  getShortcuts: () => stored,
}));

const { registerGarnishShortcuts, shortcutRegistrations, unregisterGarnishShortcuts } =
  await import('../shortcuts');

function handlers() {
  return { onQuickAsk: vi.fn(), onScreenshot: vi.fn(), onVoice: vi.fn() };
}

function statusOf(key: keyof GarnishShortcuts): string | undefined {
  return shortcutRegistrations().find((entry) => entry.key === key)?.status;
}

describe('global shortcut registration', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    stored = { ...DEFAULT_SHORTCUTS };
    registered.clear();
    rejected.clear();
    notifications.length = 0;
    unregisterGarnishShortcuts();
  });

  it('claims a dictation accelerator alongside quick ask and screenshot', () => {
    const spies = handlers();
    registerGarnishShortcuts(spies);

    expect(statusOf('voiceShortcut')).toBe('registered');
    registered.get(DEFAULT_SHORTCUTS.voiceShortcut)?.();
    expect(spies.onVoice).toHaveBeenCalledTimes(1);
    expect(spies.onQuickAsk).not.toHaveBeenCalled();
  });

  it('ships a dictation default that collides with neither sibling shortcut', () => {
    registerGarnishShortcuts(handlers());
    expect(shortcutRegistrations().map((entry) => entry.status)).toEqual([
      'registered',
      'registered',
      'registered',
    ]);
  });

  it('reports a chord another app already holds without dropping the others', () => {
    rejected.add(DEFAULT_SHORTCUTS.voiceShortcut);
    registerGarnishShortcuts(handlers());

    expect(statusOf('voiceShortcut')).toBe('taken');
    expect(statusOf('quickAskShortcut')).toBe('registered');
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.body).toContain(DEFAULT_SHORTCUTS.voiceShortcut);
  });

  it('reports a chord already assigned to another AGI shortcut as a duplicate', () => {
    stored = { ...DEFAULT_SHORTCUTS, voiceShortcut: DEFAULT_SHORTCUTS.quickAskShortcut };
    registerGarnishShortcuts(handlers());

    expect(statusOf('quickAskShortcut')).toBe('registered');
    expect(statusOf('voiceShortcut')).toBe('duplicate');
  });

  it('sees through modifier spelling and order when detecting a duplicate', () => {
    stored = {
      ...DEFAULT_SHORTCUTS,
      quickAskShortcut: 'CommandOrControl+Alt+V',
      voiceShortcut: 'Alt+CmdOrCtrl+v',
    };
    registerGarnishShortcuts(handlers());

    expect(statusOf('voiceShortcut')).toBe('duplicate');
  });

  it('reports a malformed accelerator instead of asking the OS for it', () => {
    stored = { ...DEFAULT_SHORTCUTS, voiceShortcut: 'Alt Shift V' };
    registerGarnishShortcuts(handlers());

    expect(statusOf('voiceShortcut')).toBe('malformed');
    expect(registered.has('Alt Shift V')).toBe(false);
  });
});
