import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createBlockedSitesSection } from '../src/features/options/blocked-sites-section';
import {
  USER_SITE_BLOCKLIST_STORAGE_KEY,
  blockSite,
  blockedSiteOrigin,
  isUserBlockedSite,
  readUserSiteBlocklist,
  unblockSite,
} from '../src/features/site-policy/userBlocklist';

function memoryStorage(initial: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = { ...initial };
  return {
    data,
    get: vi.fn(async (key: string) => (key in data ? { [key]: data[key] } : {})),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(data, items);
    }),
  };
}

describe('user site blocklist', () => {
  it('reads a typed domain as its https origin and rejects what is not a site', () => {
    expect(blockedSiteOrigin(' bank.example ')).toBe('https://bank.example');
    expect(blockedSiteOrigin('http://intranet.local/path?q=1')).toBe('http://intranet.local');
    expect(blockedSiteOrigin('chrome://settings')).toBeNull();
    expect(blockedSiteOrigin('')).toBeNull();
  });

  it('blocks a site, takes it off approved sites and withdraws its browser-control grants', async () => {
    const storage = memoryStorage({
      agi_site_allowlist: ['https://bank.example', 'https://docs.example'],
    });
    const grants = {
      revokeConsent: vi.fn(async () => undefined),
      removeHostPermission: vi.fn(async () => undefined),
    };
    await blockSite('https://bank.example/login', storage, grants);
    expect(storage.data[USER_SITE_BLOCKLIST_STORAGE_KEY]).toEqual(['https://bank.example']);
    expect(storage.data['agi_site_allowlist']).toEqual(['https://docs.example']);
    expect(grants.revokeConsent).toHaveBeenCalledWith('https://bank.example');
    expect(grants.removeHostPermission).toHaveBeenCalledWith('https://bank.example');
    expect(await isUserBlockedSite('https://bank.example/statements', storage)).toBe(true);
    expect(await isUserBlockedSite('https://docs.example/a', storage)).toBe(false);
  });

  it('unblocks a site and reads an unreadable list as empty', async () => {
    const storage = memoryStorage({ [USER_SITE_BLOCKLIST_STORAGE_KEY]: ['https://bank.example'] });
    expect(await unblockSite('https://bank.example', storage)).toEqual([]);
    const broken = { get: vi.fn(async () => Promise.reject(new Error('gone'))), set: vi.fn() };
    expect(await readUserSiteBlocklist(broken)).toEqual([]);
  });
});

describe('Blocked sites in extension settings', () => {
  const messages: Record<string, string> = {
    optBlockedSitesEmpty: 'No blocked sites.',
    optBlockedSitesInvalid: 'Enter a website address, for example bank.example.',
    optBlockedSitesRemove: 'Remove',
  };
  beforeEach(() => {
    vi.stubGlobal('chrome', {
      i18n: {
        getMessage: (key: string, substitutions: string[] = []) =>
          messages[key] ?? `${key}${substitutions.length ? `:${substitutions.join(',')}` : ''}`,
        getUILanguage: () => 'en',
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  function store(initial: string[] = []) {
    let list = [...initial];
    return {
      read: vi.fn(async () => [...list]),
      block: vi.fn(async (origin: string) => {
        list = list.includes(origin) ? list : [...list, origin];
        return [...list];
      }),
      unblock: vi.fn(async (origin: string) => {
        list = list.filter((entry) => entry !== origin);
        return [...list];
      }),
    };
  }

  it('blocks a typed site and lists it with a Remove button', async () => {
    const sites = store();
    const section = createBlockedSitesSection(sites);
    await section.loaded;
    expect(section.list.textContent).toBe('No blocked sites.');
    section.input.value = 'bank.example';
    section.element.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(section.list.textContent).toContain('https://bank.example'));
    expect(sites.block).toHaveBeenCalledWith('https://bank.example');
    expect(section.input.value).toBe('');
    const remove = section.list.querySelector('button')!;
    expect(remove.getAttribute('aria-label')).toBe(
      'optBlockedSitesRemoveLabel:https://bank.example',
    );
    remove.click();
    await vi.waitFor(() => expect(section.list.textContent).toBe('No blocked sites.'));
  });

  it('refuses an entry that is not a website without touching the list', async () => {
    const sites = store();
    const section = createBlockedSitesSection(sites);
    await section.loaded;
    section.input.value = 'chrome://settings';
    section.element.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(section.status.textContent).toBe('Enter a website address, for example bank.example.');
    expect(sites.block).not.toHaveBeenCalled();
  });
});
