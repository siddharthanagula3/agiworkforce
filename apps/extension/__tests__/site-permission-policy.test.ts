import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  APPROVED_SITE_PROMPT_STORAGE_KEY,
  UNAPPROVED_SITE_DEFAULT_HINT,
  createSitePermissionPolicySection,
} from '../src/features/options/site-permission-policy';

const here = dirname(fileURLToPath(import.meta.url));
const read = (relativePath: string): string =>
  readFileSync(resolve(here, '..', relativePath), 'utf8');

function fakeStorage(initial: Record<string, unknown> = {}) {
  const values = { ...initial };
  const writes: Array<Record<string, unknown>> = [];
  return {
    values,
    writes,
    failNextSet: false,
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
  });

  it('offers ask and run as the two default permissions and starts on ask', async () => {
    const storage = fakeStorage();
    const section = createSitePermissionPolicySection(storage);
    await section.loaded;
    expect([...section.select.options].map((o) => o.value)).toEqual(['ask', 'run']);
    expect(section.select.value).toBe('ask');
    expect(section.select.disabled).toBe(false);
  });

  it('reflects a stored run-without-asking default', async () => {
    const section = createSitePermissionPolicySection(
      fakeStorage({ [APPROVED_SITE_PROMPT_STORAGE_KEY]: false }),
    );
    await section.loaded;
    expect(section.select.value).toBe('run');
    expect(section.status.textContent).toBe('Approved sites run without asking.');
  });

  it('persists a change to the preference the background enforces', async () => {
    const storage = fakeStorage();
    const section = createSitePermissionPolicySection(storage);
    await section.loaded;

    section.select.value = 'run';
    section.select.dispatchEvent(new Event('change'));
    await Promise.resolve();
    await Promise.resolve();
    expect(storage.values[APPROVED_SITE_PROMPT_STORAGE_KEY]).toBe(false);

    section.select.value = 'ask';
    section.select.dispatchEvent(new Event('change'));
    await Promise.resolve();
    await Promise.resolve();
    expect(storage.values[APPROVED_SITE_PROMPT_STORAGE_KEY]).toBe(true);
  });

  it('restores the previous choice when the write fails', async () => {
    const storage = fakeStorage();
    const section = createSitePermissionPolicySection(storage);
    await section.loaded;
    storage.failNextSet = true;

    section.select.value = 'run';
    section.select.dispatchEvent(new Event('change'));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(section.select.value).toBe('ask');
    expect(storage.writes).toHaveLength(0);
    expect(section.status.textContent).toMatch(/Could not save/);
  });

  it('drives the same key the background reads before every action', () => {
    expect(APPROVED_SITE_PROMPT_STORAGE_KEY).toBe('agi_cu_ask_before_acting');
    expect(read('src/background.ts')).toMatch(
      new RegExp(`${APPROVED_SITE_PROMPT_STORAGE_KEY}'\\]\\s*!==\\s*false`),
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
