import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import catalog from '../_locales/en/messages.json';
import { ASK_BEFORE_ACTING_KEY } from '../src/features/computer-use/askBeforeActing';
import {
  UNAPPROVED_SITE_DEFAULT_HINT,
  createSitePermissionPolicySection,
} from '../src/features/options/site-permission-policy';

const here = dirname(fileURLToPath(import.meta.url));
const read = (relativePath: string): string =>
  readFileSync(resolve(here, '..', relativePath), 'utf8');

beforeAll(() => {
  vi.stubGlobal('chrome', {
    i18n: {
      getMessage: (key: string) => (catalog as Record<string, { message: string }>)[key]!.message,
    },
  });
});

function fakeStorage(initial: Record<string, unknown> = {}) {
  const values = { ...initial };
  const writes: Array<Record<string, unknown>> = [];
  const listeners: Array<(changes: Record<string, { newValue?: unknown }>) => void> = [];
  return {
    values,
    writes,
    listeners,
    failNextSet: false,
    onChanged(listener: (changes: Record<string, { newValue?: unknown }>) => void) {
      listeners.push(listener);
    },
    async get(key: string) {
      return key in values ? { [key]: values[key] } : {};
    },
    async set(this: { failNextSet: boolean }, items: Record<string, unknown>) {
      if (this.failNextSet) throw new Error('storage full');
      writes.push(items);
      Object.assign(values, items);
    },
  };
}

describe('options default site permission', () => {
  it('states the policy that applies to sites the user has not approved', () => {
    const storage = fakeStorage();
    const section = createSitePermissionPolicySection(storage);
    expect(section.element.textContent).toContain(UNAPPROVED_SITE_DEFAULT_HINT);
    expect(UNAPPROVED_SITE_DEFAULT_HINT).toMatch(/have not approved are blocked/);
    expect(UNAPPROVED_SITE_DEFAULT_HINT).toMatch(/^Auto is the default/);
  });

  it('offers Auto, Ask and Full access and starts on Auto', async () => {
    const storage = fakeStorage();
    const section = createSitePermissionPolicySection(storage);
    await section.loaded;
    expect([...section.select.options].map((o) => o.value)).toEqual(['auto', 'ask', 'full']);
    expect(section.select.value).toBe('auto');
    expect(section.select.disabled).toBe(false);
  });

  it('reflects a stored run-without-asking default', async () => {
    const section = createSitePermissionPolicySection(
      fakeStorage({ [ASK_BEFORE_ACTING_KEY]: false }),
    );
    await section.loaded;
    expect(section.select.value).toBe('full');
    expect(section.status.textContent).toBe(
      'AGI skips routine confirmations and still asks before protected actions.',
    );
  });

  it('labels the modes with the side panel wording, and no option claims to run without asking', () => {
    const section = createSitePermissionPolicySection(fakeStorage());
    expect([...section.select.options].map((o) => o.textContent)).toEqual([
      'Auto',
      'Ask first',
      'Full access',
    ]);
    expect(section.element.textContent).not.toMatch(/without asking/i);
  });

  it('follows a mode changed elsewhere while Options stays open', async () => {
    const storage = fakeStorage();
    const section = createSitePermissionPolicySection(storage);
    await section.loaded;
    expect(section.select.value).toBe('auto');

    for (const listener of storage.listeners)
      listener({ [ASK_BEFORE_ACTING_KEY]: { newValue: false } });
    expect(section.select.value).toBe('full');
    expect(section.status.textContent).toBe(
      'AGI skips routine confirmations and still asks before protected actions.',
    );

    for (const listener of storage.listeners)
      listener({ [ASK_BEFORE_ACTING_KEY]: { newValue: true } });
    expect(section.select.value).toBe('ask');
  });

  it('subscribes to local storage changes from the Options page', () => {
    const options = read('src/options.ts');
    expect(options).toMatch(/onChanged: \(listener\) =>\s*chrome\.storage\.onChanged\.addListener/);
  });

  it('persists a change to the preference the background enforces', async () => {
    const storage = fakeStorage();
    const section = createSitePermissionPolicySection(storage);
    await section.loaded;

    section.select.value = 'full';
    section.select.dispatchEvent(new Event('change'));
    await Promise.resolve();
    await Promise.resolve();
    expect(storage.values[ASK_BEFORE_ACTING_KEY]).toBe(false);

    section.select.value = 'ask';
    section.select.dispatchEvent(new Event('change'));
    await Promise.resolve();
    await Promise.resolve();
    expect(storage.values[ASK_BEFORE_ACTING_KEY]).toBe(true);

    section.select.value = 'auto';
    section.select.dispatchEvent(new Event('change'));
    await Promise.resolve();
    await Promise.resolve();
    expect(storage.values[ASK_BEFORE_ACTING_KEY]).toBe('auto');
  });

  it('restores the previous choice when the write fails', async () => {
    const storage = fakeStorage();
    const section = createSitePermissionPolicySection(storage);
    await section.loaded;
    storage.failNextSet = true;

    section.select.value = 'full';
    section.select.dispatchEvent(new Event('change'));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(section.select.value).toBe('auto');
    expect(storage.writes).toHaveLength(0);
    expect(section.status.textContent).toMatch(/Could not save/);
  });

  it('drives the same key the background reads before every action', () => {
    expect(ASK_BEFORE_ACTING_KEY).toBe('agi_cu_ask_before_acting');
    expect(read('src/background.ts')).toContain(
      'readBrowserPermissionMode(askPref[ASK_BEFORE_ACTING_KEY])',
    );
  });

  it('renders in the options permissions section above the approved-sites list', () => {
    const options = read('src/options.ts');
    expect(options).toContain("from './features/options/site-permission-policy'");
    expect(options).toContain('createSitePermissionPolicySection');
    expect(options).toContain('permSection.appendChild(sitePolicySection.element)');
    expect(options.indexOf('permSection.appendChild(sitePolicySection.element)')).toBeLessThan(
      options.indexOf("const allowlistBody = el('div', { class: 'opt-allowlist-body' })"),
    );
    expect(options).toContain('.opt-policy-select');
  });
});
