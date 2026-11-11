/**
 * The options page saves the autofill profile through the one owner of that
 * write, `saveAutofillProfile`, and reports its outcome in the same words.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi } from 'vitest';
type FreeTrialClientModule = typeof import('../src/features/cloud-bridge/freeTrialClient');
type ProfileStorageModule = typeof import('../src/features/content/autofill/profile-storage');

const clerkOpenSignIn = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const accountRefresh = vi.hoisted(() =>
  vi.fn(
    async (
      _getToken: () => Promise<string | null>,
      render: (state: { signedIn: boolean; unavailable: boolean; loading: boolean }) => void,
    ) => {
      render({ signedIn: false, unavailable: false, loading: false });
    },
  ),
);

const chromeHarness = vi.hoisted(() => {
  class FakeStyleSheet {
    replaceSync(): void {}
  }
  (globalThis as Record<string, unknown>).CSSStyleSheet = FakeStyleSheet;
  Object.defineProperty(globalThis.document, 'adoptedStyleSheets', {
    configurable: true,
    writable: true,
    value: [],
  });

  const storageSet = vi.fn((_items: unknown, cb?: () => void) => {
    if (cb) cb();
    return Promise.resolve();
  });
  (globalThis as Record<string, unknown>).chrome = {
    i18n: { getMessage: (key: string) => key, getUILanguage: () => 'en' },
    runtime: {
      sendMessage: () => Promise.resolve({ success: true, shortcuts: [] }),
      getManifest: () => ({ name: 'agiworkforce', version: '1.2.3' }),
      getURL: (path: string) => `chrome-extension://test/${path}`,
      lastError: undefined,
    },
    storage: {
      local: {
        get: (_keys: unknown, cb?: (result: Record<string, unknown>) => void) => {
          if (cb) cb({});
          return Promise.resolve({});
        },
        set: storageSet,
        remove: () => Promise.resolve(),
      },
      onChanged: { addListener: () => undefined },
      sync: {
        get: () => Promise.resolve({}),
        set: () => Promise.resolve(),
      },
    },
    permissions: {
      contains: () => Promise.resolve(false),
      request: () => Promise.resolve(false),
      remove: () => Promise.resolve(true),
    },
    tabs: {
      query: (_q: unknown, cb?: (tabs: unknown[]) => void) => {
        if (cb) cb([]);
        return Promise.resolve([]);
      },
      create: () => Promise.resolve({}),
    },
    commands: {
      getAll: () =>
        Promise.resolve([
          { name: '_execute_action', description: 'Open side panel', shortcut: 'Alt+Shift+G' },
          { name: 'capture_page', description: 'Capture page' },
        ]),
    },
  };
  return { storageSet };
});

vi.mock('../src/features/cloud-bridge/freeTrialClient', async (importOriginal) => ({
  ...(await importOriginal<FreeTrialClientModule>()),
  FREE_TRIAL_GATEWAY: 'https://agiworkforce.com',
  getAuthToken: vi.fn().mockResolvedValue(null),
  signOutOfAccount: vi.fn().mockResolvedValue({ webSessionEnded: true }),
}));

vi.mock('../src/features/cloud-bridge/clerkAuth', () => ({
  isClerkExtensionAuthConfigured: () => true,
  openClerkSignIn: clerkOpenSignIn,
}));

vi.mock('../src/features/options/account-state', () => ({
  beginOptionsAccountRefresh: accountRefresh,
}));

vi.mock('../src/features/content/autofill/profile-storage', async (importOriginal) => {
  const actual = await importOriginal<ProfileStorageModule>();
  return { ...actual, saveAutofillProfile: vi.fn(actual.saveAutofillProfile) };
});

import {
  AUTOFILL_PROFILE_STORAGE_KEY,
  saveAutofillProfile,
} from '../src/features/content/autofill/profile-storage';

function field(key: string): HTMLInputElement {
  return document.getElementById(`profile-${key}`) as HTMLInputElement;
}

function saveProfileButton(): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
    (candidate) => candidate.textContent === 'Save profile',
  );
  if (!button) throw new Error('the Save profile button was never built');
  return button;
}

function profileStatus(): HTMLElement {
  return document.getElementById('opt-profile-status') as HTMLElement;
}

describe('options page, autofill profile save', () => {
  it('saves the trimmed, non-empty fields through saveAutofillProfile under the profile key', async () => {
    await import('../src/options');
    field('firstName').value = '  Ada ';
    field('email').value = 'ada@example.test';
    field('phone').value = '   ';
    chromeHarness.storageSet.mockClear();

    saveProfileButton().click();

    await vi.waitFor(() => expect(profileStatus().textContent).toBe('Saved'));
    expect(saveAutofillProfile).toHaveBeenCalledExactlyOnceWith({
      firstName: 'Ada',
      email: 'ada@example.test',
    });
    expect(chromeHarness.storageSet).toHaveBeenCalledExactlyOnceWith({
      [AUTOFILL_PROFILE_STORAGE_KEY]: { firstName: 'Ada', email: 'ada@example.test' },
    });
    expect(profileStatus().className).toBe('opt-save-status saved');
  });

  it('says the profile could not be saved when the write fails', async () => {
    field('firstName').value = 'Ada';
    chromeHarness.storageSet.mockRejectedValueOnce(new Error('quota'));

    saveProfileButton().click();

    await vi.waitFor(() =>
      expect(profileStatus().textContent).toBe('Could not save this profile. Please try again.'),
    );
    expect(profileStatus().className).toBe('opt-save-status error');
    expect(saveProfileButton().disabled).toBe(false);
  });
});
