// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createNotificationsRow,
  TASK_NOTIFICATIONS_STORAGE_KEY,
} from '../src/features/options/notifications-row';
import {
  createMicrophoneRow,
  readMicrophoneAccess,
  requestMicrophoneAccess,
} from '../src/features/options/microphone-section';
import { createReadAloudRow } from '../src/features/options/read-aloud-row';
import { READ_ALOUD_STORAGE_KEY } from '../src/features/read-aloud';
import { createKeyboardShortcutRows } from '../src/features/options/keyboard-shortcut-rows';
import {
  createShortcutsSection,
  pickRecordableTab,
  type ShortcutsSectionDependencies,
} from '../src/features/options/shortcuts-section';
import { optionsDestinations } from '../src/features/options/destinations';
import { createInPageAssistantRow } from '../src/features/options/preference-rows';
import { createDesktopPairingRows } from '../src/features/options/desktop-pairing-rows';

beforeEach(() => {
  vi.stubGlobal('chrome', {
    i18n: { getMessage: (key: string) => key, getUILanguage: () => 'en' },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await new Promise((resolveTimer) => setTimeout(resolveTimer, 0));
};

function memoryStorage(initial: Record<string, unknown> = {}) {
  const store: Record<string, unknown> = { ...initial };
  return {
    store,
    get: vi.fn(async (query: string | Record<string, unknown>) => {
      if (typeof query === 'string') return query in store ? { [query]: store[query] } : {};
      return Object.fromEntries(
        Object.keys(query).map((k) => [k, k in store ? store[k] : query[k]]),
      );
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(store, items);
    }),
  };
}

describe('task completion notifications row', () => {
  it('is on by default and stores the choice', async () => {
    const storage = memoryStorage();
    const row = createNotificationsRow(storage);
    await row.loaded;
    expect(row.toggle.checked).toBe(true);
    row.toggle.checked = false;
    row.toggle.dispatchEvent(new Event('change'));
    await flush();
    expect(storage.store[TASK_NOTIFICATIONS_STORAGE_KEY]).toBe(false);
    expect(row.status.textContent).toBe('optNotificationsOff');
    expect(row.toggle.disabled).toBe(false);
  });

  it('puts the toggle back and says so when the save fails', async () => {
    const storage = memoryStorage({ [TASK_NOTIFICATIONS_STORAGE_KEY]: true });
    storage.set.mockRejectedValueOnce(new Error('quota'));
    const row = createNotificationsRow(storage);
    await row.loaded;
    row.toggle.checked = false;
    row.toggle.dispatchEvent(new Event('change'));
    await flush();
    expect(row.toggle.checked).toBe(true);
    expect(row.status.textContent).toBe('optSaveFailed');
  });

  it('names the toggle through its visible label', async () => {
    const row = createNotificationsRow(memoryStorage());
    document.body.appendChild(row.element);
    const labelledBy = row.toggle.getAttribute('aria-labelledby')!;
    expect(document.getElementById(labelledBy)?.textContent).toBe('optNotificationsTitle');
  });
});

describe('microphone access row', () => {
  const stream = () => ({ getTracks: () => [{ stop: vi.fn() }] }) as unknown as MediaStream;

  it('reports the permission state without prompting', async () => {
    const getUserMedia = vi.fn();
    const state = await readMicrophoneAccess({
      mediaDevices: { getUserMedia },
      permissions: { query: vi.fn(async () => ({ state: 'prompt' })) } as never,
    });
    expect(state).toBe('prompt');
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('is unsupported without a media API', async () => {
    expect(await readMicrophoneAccess({})).toBe('unsupported');
    expect(await requestMicrophoneAccess({})).toBe('unsupported');
  });

  it('releases the microphone right after the permission is granted', async () => {
    const track = { stop: vi.fn() };
    const getUserMedia = vi.fn(
      async () => ({ getTracks: () => [track] }) as unknown as MediaStream,
    );
    expect(await requestMicrophoneAccess({ mediaDevices: { getUserMedia } })).toBe('granted');
    expect(track.stop).toHaveBeenCalledOnce();
  });

  it('treats a refusal as denied', async () => {
    const getUserMedia = vi.fn(async () => {
      throw new DOMException('no', 'NotAllowedError');
    });
    expect(await requestMicrophoneAccess({ mediaDevices: { getUserMedia } })).toBe('denied');
  });

  it('hides the button once granted and disables it once blocked', async () => {
    const row = createMicrophoneRow({
      mediaDevices: { getUserMedia: vi.fn(async () => stream()) },
      permissions: { query: vi.fn(async () => ({ state: 'prompt' })) } as never,
    });
    await row.loaded;
    expect(row.button.hidden).toBe(false);
    row.button.click();
    await flush();
    expect(row.status.textContent).toBe('optMicrophoneGranted');
    expect(row.button.hidden).toBe(true);

    const blocked = createMicrophoneRow({
      mediaDevices: { getUserMedia: vi.fn() },
      permissions: { query: vi.fn(async () => ({ state: 'denied' })) } as never,
    });
    await blocked.loaded;
    expect(blocked.status.textContent).toBe('optMicrophoneDenied');
    expect(blocked.button.disabled).toBe(true);
  });
});

describe('read aloud row', () => {
  function synth() {
    return {
      speak: vi.fn(),
      cancel: vi.fn(),
      getVoices: vi.fn(() => [{ voiceURI: 'v1', name: 'Voice One', lang: 'en-US' }]),
      addEventListener: vi.fn(),
    } as unknown as SpeechSynthesis;
  }

  it('says so and disables the controls when the browser cannot speak', () => {
    const row = createReadAloudRow(memoryStorage(), undefined);
    expect(row.status.textContent).toBe('optReadAloudUnsupported');
    expect(row.voiceSelect.disabled).toBe(true);
    expect(row.previewButton.disabled).toBe(true);
  });

  it('offers the browser voices and stores the chosen voice and speed', async () => {
    const storage = memoryStorage({ [READ_ALOUD_STORAGE_KEY]: { voiceURI: 'v1', rate: 1.5 } });
    const row = createReadAloudRow(storage, synth());
    await row.loaded;
    expect(row.voiceSelect.value).toBe('v1');
    expect(row.rateSelect.value).toBe('1.5');
    row.rateSelect.value = '2';
    row.rateSelect.dispatchEvent(new Event('change'));
    await flush();
    expect(storage.store[READ_ALOUD_STORAGE_KEY]).toEqual({ voiceURI: 'v1', rate: 2 });
  });

  it('previews the voice with the chosen settings', async () => {
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        rate = 1;
        voice: unknown = null;
        lang = '';
        constructor(public text: string) {}
      },
    );
    const engine = synth();
    const row = createReadAloudRow(memoryStorage(), engine);
    await row.loaded;
    row.previewButton.click();
    expect(engine.speak).toHaveBeenCalledOnce();
    expect(row.previewButton.textContent).toBe('optReadAloudStop');
  });
});

describe('keyboard shortcut rows', () => {
  it('shows the current keys and a Configure button that opens the Chrome page', async () => {
    const openShortcutSettings = vi.fn(async () => undefined);
    const rows = createKeyboardShortcutRows({
      getAll: async () => [
        { name: '_execute_action', shortcut: 'Alt+Shift+K' },
        { name: 'capture_page', shortcut: '' },
      ],
      openShortcutSettings,
    });
    await rows.loaded;
    document.body.appendChild(rows.element);
    expect(rows.element.querySelectorAll('kbd')).toHaveLength(3);
    expect(rows.element.textContent).toContain('optShortcutNotAssigned');
    rows.element.querySelector<HTMLButtonElement>('#opt-shortcut-configure')!.click();
    expect(openShortcutSettings).toHaveBeenCalledOnce();
  });

  it('still offers Configure when the keys cannot be read', async () => {
    const rows = createKeyboardShortcutRows({
      getAll: async () => {
        throw new Error('no commands');
      },
      openShortcutSettings: async () => undefined,
    });
    await rows.loaded;
    expect(rows.element.textContent).toContain('optShortcutLoadFailed');
    expect(rows.element.querySelector('#opt-shortcut-configure')).not.toBeNull();
  });
});

describe('in-page assistant row', () => {
  it('reverts when the preference cannot be stored', async () => {
    const storage = memoryStorage();
    storage.set.mockRejectedValueOnce(new Error('blocked'));
    const row = createInPageAssistantRow(storage);
    await row.loaded;
    const toggle = row.control as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change'));
    await flush();
    expect(toggle.checked).toBe(true);
    expect(row.status.textContent).toBe('spPreferenceSaveFailed');
  });
});

describe('desktop pairing rows', () => {
  const state = (phase: string, extra: Record<string, unknown> = {}) =>
    ({
      phase,
      fingerprint: null,
      error: null,
      requestId: null,
      codeLength: null,
      expiresAt: null,
      ...extra,
    }) as never;

  it('shows Unpair only while paired', async () => {
    const rows = createDesktopPairingRows({
      loadPairingState: async () => state('paired', { fingerprint: 'ab:cd' }),
      beginPairing: vi.fn(),
      submitPairingCode: vi.fn(),
      unpair: vi.fn(async () => state('idle')),
    });
    await rows.loaded;
    document.body.appendChild(rows.element);
    const unpairButton = rows.element.querySelector<HTMLButtonElement>('#opt-unpair-btn')!;
    expect(unpairButton.hidden).toBe(false);
    expect(rows.element.querySelector<HTMLButtonElement>('#opt-pair-btn')!.hidden).toBe(true);
    unpairButton.click();
    await flush();
    expect(unpairButton.hidden).toBe(true);
    expect(rows.element.querySelector('#opt-pairing-label')!.textContent).toBe('spPairingIdle');
  });

  it('asks for the code Desktop shows', async () => {
    const rows = createDesktopPairingRows({
      loadPairingState: async () => state('idle'),
      beginPairing: vi.fn(async () => state('awaiting-code')),
      submitPairingCode: vi.fn(async () => state('paired')),
      unpair: vi.fn(),
    });
    await rows.loaded;
    document.body.appendChild(rows.element);
    rows.element.querySelector<HTMLButtonElement>('#opt-pair-btn')!.click();
    await flush();
    expect(rows.element.querySelector<HTMLElement>('#opt-pairing-code-row')!.hidden).toBe(false);
  });
});

describe('pickRecordableTab', () => {
  it('picks the most recently used web tab and ignores extension and browser pages', () => {
    expect(
      pickRecordableTab([
        { id: 1, url: 'chrome-extension://abc/src/options.html', lastAccessed: 900 },
        { id: 2, url: 'https://old.example.com/a', lastAccessed: 100 },
        { id: 3, url: 'https://new.example.com/b?q=1', lastAccessed: 500 },
        { id: 4, url: 'chrome://extensions', lastAccessed: 800 },
        { url: 'https://noid.example.com', lastAccessed: 999 },
      ]),
    ).toEqual({ id: 3, origin: 'https://new.example.com' });
  });

  it('is null when no website is open', () => {
    expect(pickRecordableTab([{ id: 1, url: 'chrome://newtab' }])).toBeNull();
  });
});

describe('shortcuts section', () => {
  const saved = [
    { id: 'p1', name: 'Summarize Doc', prompt: 'Summarize: {{input}}', actions: [], createdAt: 1 },
    {
      id: 'r1',
      name: 'Check order',
      actions: [{}, {}],
      createdAt: 2,
      startUrl: 'https://shop.example.com',
    },
  ];

  function build(overrides: Partial<ShortcutsSectionDependencies> = {}) {
    const send = vi.fn(async (message: Record<string, unknown>) => {
      if (message['type'] === 'LIST_SHORTCUTS') return { success: true, shortcuts: saved };
      return { success: true };
    });
    const section = createShortcutsSection({
      send: send as never,
      queryTabs: async () => [],
      ...overrides,
    });
    document.body.appendChild(section.element);
    return { section, send };
  }

  it('lists prompt and recorded shortcuts when the section opens', async () => {
    const { section } = build();
    section.setActive(true);
    await flush();
    const rows = section.element.querySelectorAll('.opt-shortcut-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain('/summarize-doc');
    expect(rows[1]!.textContent).toContain('optShortcutRecordedMeta');
    expect(rows[1]!.querySelector('[aria-label="optShortcutRunAria"]')).not.toBeNull();
  });

  it('only offers Edit for prompt shortcuts', async () => {
    const { section } = build();
    section.setActive(true);
    await flush();
    const rows = section.element.querySelectorAll('.opt-shortcut-row');
    expect(rows[0]!.textContent).toContain('optShortcutEdit');
    expect(rows[1]!.textContent).not.toContain('optShortcutEdit');
  });

  it('refuses a name that collides with a built-in command and sends nothing', async () => {
    const { section, send } = build();
    section.setActive(true);
    await flush();
    section.element.querySelector<HTMLButtonElement>('#opt-shortcut-create')!.click();
    (section.element.querySelector('#opt-shortcut-name') as HTMLInputElement).value = 'Summarize';
    (section.element.querySelector('#opt-shortcut-prompt') as HTMLTextAreaElement).value = 'x';
    section.element.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(section.element.querySelector('#opt-shortcut-error')!.textContent).toBe(
      'spShortcutNameTaken',
    );
    expect(send.mock.calls.some(([m]) => m['type'] === 'SAVE_SHORTCUT')).toBe(false);
  });

  it('saves a new prompt shortcut and reloads the list', async () => {
    const { section, send } = build();
    section.setActive(true);
    await flush();
    section.element.querySelector<HTMLButtonElement>('#opt-shortcut-create')!.click();
    (section.element.querySelector('#opt-shortcut-name') as HTMLInputElement).value = 'Standup';
    (section.element.querySelector('#opt-shortcut-prompt') as HTMLTextAreaElement).value =
      'Write my standup';
    section.element.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(send).toHaveBeenCalledWith({
      type: 'SAVE_SHORTCUT',
      name: 'Standup',
      actions: [],
      prompt: 'Write my standup',
    });
    expect(send.mock.calls.filter(([m]) => m['type'] === 'LIST_SHORTCUTS').length).toBe(2);
  });

  it('asks before deleting, naming what is lost, and deletes only on confirm', async () => {
    const { section, send } = build();
    section.setActive(true);
    await flush();
    const row = section.element.querySelectorAll<HTMLElement>('.opt-shortcut-row')[0]!;
    row.querySelector<HTMLButtonElement>('.opt-btn-danger')!.click();
    expect(send.mock.calls.some(([m]) => m['type'] === 'DELETE_SHORTCUT')).toBe(false);
    expect(row.querySelector('.opt-confirm')!.textContent).toContain('spShortcutDeleteConfirm');
    row.querySelector<HTMLButtonElement>('.opt-confirm .opt-btn-danger')!.click();
    await flush();
    expect(send).toHaveBeenCalledWith({ type: 'DELETE_SHORTCUT', shortcutId: 'p1' });
  });

  it('keeps the shortcut when the confirmation is declined', async () => {
    const { section, send } = build();
    section.setActive(true);
    await flush();
    const row = section.element.querySelectorAll<HTMLElement>('.opt-shortcut-row')[0]!;
    row.querySelector<HTMLButtonElement>('.opt-btn-danger')!.click();
    row.querySelector<HTMLButtonElement>('.opt-confirm .opt-btn-secondary')!.click();
    expect(row.querySelector('.opt-confirm')).toBeNull();
    expect(send.mock.calls.some(([m]) => m['type'] === 'DELETE_SHORTCUT')).toBe(false);
  });

  it('records on the last web tab, then saves the steps with that site as start URL', async () => {
    const actions = [{ kind: 'click' }];
    const send = vi.fn(async (message: Record<string, unknown>) => {
      if (message['type'] === 'LIST_SHORTCUTS') return { success: true, shortcuts: [] };
      if (message['type'] === 'GET_RECORDED_ACTIONS') return { success: true, actions };
      return { success: true };
    });
    const { section } = build({
      send: send as never,
      queryTabs: async () => [{ id: 7, url: 'https://shop.example.com/cart', lastAccessed: 5 }],
    });
    const button = section.element.querySelector<HTMLButtonElement>('#opt-record-btn')!;
    button.click();
    await flush();
    expect(send).toHaveBeenCalledWith({ type: 'START_RECORDING', tabId: 7 });
    expect(button.textContent).toBe('optRecordStop');

    button.click();
    await flush();
    expect(send).toHaveBeenCalledWith({ type: 'STOP_RECORDING', tabId: 7 });
    const form = section.element.querySelector<HTMLFormElement>('#opt-record-save')!;
    expect(form.hidden).toBe(false);
    (section.element.querySelector('#opt-record-name') as HTMLInputElement).value = 'Cart check';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(send).toHaveBeenCalledWith({
      type: 'SAVE_SHORTCUT',
      name: 'Cart check',
      actions,
      startUrl: 'https://shop.example.com',
    });
  });

  it('does not start recording when no website tab is open', async () => {
    const { section, send } = build();
    section.element.querySelector<HTMLButtonElement>('#opt-record-btn')!.click();
    await flush();
    expect(send.mock.calls.some(([m]) => m['type'] === 'START_RECORDING')).toBe(false);
    expect(section.element.textContent).toContain('optRecordNoTab');
  });
});

describe('options page navigation', () => {
  const source = readFileSync(resolve(__dirname, '../src/options.ts'), 'utf8');

  it('has the five destinations Claude has, Permissions first', () => {
    expect(
      optionsDestinations().map((destination) => [destination.label, destination.target]),
    ).toEqual([
      ['optNavPermissions', 'opt-permissions'],
      ['optNavShortcuts', 'opt-shortcuts'],
      ['optNavOptions', 'opt-options'],
      ['optNavAccount', 'opt-account'],
      ['optNavHelp', 'opt-help'],
    ]);
  });

  it('shows the Options destination with its keyboard and appearance cards', () => {
    const options = optionsDestinations().find(
      (destination) => destination.target === 'opt-options',
    );
    expect(options?.sections).toEqual(['opt-options', 'opt-keyboard', 'opt-appearance']);
  });

  it('no longer hosts notifications inside Permissions', () => {
    const permissions = source.slice(
      source.indexOf("id: 'opt-permissions'"),
      source.indexOf('createSitePermissionPolicySection'),
    );
    expect(permissions).not.toContain('opt-notif-toggle');
  });
});
