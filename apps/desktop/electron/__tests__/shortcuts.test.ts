import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PRODUCT_NAMES } from '@agiworkforce/types';
import { DEFAULT_SHORTCUTS, shortcutChoices, type GarnishShortcuts } from '../garnishCore';

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
    unregister: (accelerator: string) => registered.delete(accelerator),
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
let diskRefusesWrites = false;
vi.mock('../settingsStore', () => ({
  getShortcuts: () => stored,
  saveSettings: (patch: Partial<GarnishShortcuts>) => {
    stored = { ...stored, ...patch };
    return stored;
  },
  saveSettingsDurably: (patch: Partial<GarnishShortcuts>) => {
    if (diskRefusesWrites) {
      throw new Error('The setting could not be saved on this computer, so it was not changed.');
    }
    stored = { ...stored, ...patch };
    return stored;
  },
}));

const {
  changeGarnishShortcuts,
  registerGarnishShortcuts,
  shortcutRegistrations,
  unregisterGarnishShortcuts,
} = await import('../shortcuts');

function handlers() {
  return {
    onQuickAsk: vi.fn(),
    onNewChat: vi.fn(),
    onScreenshot: vi.fn(),
    onWindowShot: vi.fn(),
    onVoice: vi.fn(),
    onStop: vi.fn(),
  };
}

function statusOf(key: keyof GarnishShortcuts): string | undefined {
  return shortcutRegistrations().find((entry) => entry.key === key)?.status;
}

describe('global shortcut registration', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    stored = { ...DEFAULT_SHORTCUTS };
    diskRefusesWrites = false;
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

  it('ships defaults that collide with no sibling shortcut', () => {
    registerGarnishShortcuts(handlers());
    expect(shortcutRegistrations().map((entry) => entry.status)).toEqual([
      'registered',
      'registered',
      'registered',
      'registered',
      'registered',
      'registered',
    ]);
  });

  it('opens a new chat window on its own chord, not Quick Ask', () => {
    const spies = handlers();
    registerGarnishShortcuts(spies);

    expect(statusOf('newChatShortcut')).toBe('registered');
    registered.get(DEFAULT_SHORTCUTS.newChatShortcut)?.();
    expect(spies.onNewChat).toHaveBeenCalledTimes(1);
    expect(spies.onQuickAsk).not.toHaveBeenCalled();
  });

  it('claims the stop chord and runs the stop handler on it', () => {
    const spies = handlers();
    registerGarnishShortcuts(spies);

    expect(statusOf('stopShortcut')).toBe('registered');
    registered.get(DEFAULT_SHORTCUTS.stopShortcut)?.();
    expect(spies.onStop).toHaveBeenCalledTimes(1);
    expect(spies.onVoice).not.toHaveBeenCalled();
  });

  it('reports a chord another app already holds without dropping the others', () => {
    rejected.add(DEFAULT_SHORTCUTS.voiceShortcut);
    registerGarnishShortcuts(handlers());

    expect(statusOf('voiceShortcut')).toBe('taken');
    expect(statusOf('quickAskShortcut')).toBe('registered');
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.body).toContain(DEFAULT_SHORTCUTS.voiceShortcut);
  });

  it.each([
    ['darwin', 'menu bar'],
    ['win32', 'tray menu'],
    ['linux', 'tray menu'],
  ] as const)('points a %s user at the %s', (platform, place) => {
    const original = process.platform;
    Object.defineProperty(process, 'platform', { value: platform });
    try {
      rejected.add(DEFAULT_SHORTCUTS.voiceShortcut);
      registerGarnishShortcuts(handlers());
    } finally {
      Object.defineProperty(process, 'platform', { value: original });
    }

    expect(notifications[0]?.body).toContain(`${PRODUCT_NAMES.desktop} ${place} instead`);
  });

  it('announces a conflict again after shortcuts are reconfigured', () => {
    rejected.add(DEFAULT_SHORTCUTS.voiceShortcut);
    registerGarnishShortcuts(handlers());
    expect(notifications).toHaveLength(1);

    unregisterGarnishShortcuts();
    registerGarnishShortcuts(handlers());

    expect(notifications).toHaveLength(2);
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

  describe('changing shortcuts', () => {
    const stopChoices = shortcutChoices('stopShortcut', DEFAULT_SHORTCUTS.stopShortcut);
    const replacement = stopChoices.find((value) => value !== DEFAULT_SHORTCUTS.stopShortcut) ?? '';

    it('keeps the working Stop Agents chord registered when the new one is refused', () => {
      const spies = handlers();
      registerGarnishShortcuts(spies);
      rejected.add(replacement);

      const refusal = changeGarnishShortcuts({ stopShortcut: replacement }, spies);

      expect(refusal).toMatch(
        /Stop Agents could not take that shortcut: it is already in use by another app\. The shortcut it had is kept/u,
      );
      expect(stored.stopShortcut).toBe(DEFAULT_SHORTCUTS.stopShortcut);
      expect(statusOf('stopShortcut')).toBe('registered');
      registered.get(DEFAULT_SHORTCUTS.stopShortcut)?.();
      expect(spies.onStop).toHaveBeenCalledTimes(1);
    });

    it('does not claim the old chord is kept when it cannot be taken back either', () => {
      const spies = handlers();
      registerGarnishShortcuts(spies);
      rejected.add(replacement);
      rejected.add(DEFAULT_SHORTCUTS.stopShortcut);

      const refusal = changeGarnishShortcuts({ stopShortcut: replacement }, spies);

      expect(refusal).toContain('could not be restored either');
      expect(refusal).not.toContain('is kept');
    });

    it('applies a change to a shortcut that may be off even when another app holds it', () => {
      const spies = handlers();
      registerGarnishShortcuts(spies);
      const held = shortcutChoices('voiceShortcut', DEFAULT_SHORTCUTS.voiceShortcut).find(
        (value) => value !== DEFAULT_SHORTCUTS.voiceShortcut,
      ) as string;
      rejected.add(held);

      const refusal = changeGarnishShortcuts({ voiceShortcut: held }, spies);

      expect(refusal).toBeNull();
      expect(stored.voiceShortcut).toBe(held);
      expect(statusOf('voiceShortcut')).toBe('taken');
      expect(statusOf('stopShortcut')).toBe('registered');
    });

    it('refuses a change the settings file could not keep and leaves every chord as registered', () => {
      const spies = handlers();
      registerGarnishShortcuts(spies);
      diskRefusesWrites = true;

      const refusal = changeGarnishShortcuts({ stopShortcut: replacement }, spies);

      expect(refusal).toMatch(/could not be saved/u);
      expect(stored.stopShortcut).toBe(DEFAULT_SHORTCUTS.stopShortcut);
      expect(registered.has(DEFAULT_SHORTCUTS.stopShortcut)).toBe(true);
      expect(registered.has(replacement)).toBe(false);
    });

    it('returns null and registers the new chord when it is free', () => {
      const spies = handlers();
      registerGarnishShortcuts(spies);

      const refusal = changeGarnishShortcuts({ stopShortcut: replacement }, spies);

      expect(refusal).toBeNull();
      expect(stored.stopShortcut).toBe(replacement);
      expect(registered.has(DEFAULT_SHORTCUTS.stopShortcut)).toBe(false);
      expect(registered.has(replacement)).toBe(true);
    });
  });
});
