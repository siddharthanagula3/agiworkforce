import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BROWSER_CONTROL_CONSENT_STORAGE_KEY,
  browserControlConsentRequiredMessage,
  grantBrowserControlConsent,
  hasBrowserControlConsent,
  readBrowserControlConsent,
  revokeBrowserControlConsent,
  type BrowserControlConsentStorage,
} from '../src/features/computer-use/browserControlConsent';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string): string => readFileSync(resolve(here, '..', rel), 'utf8');

function fakeStorage(seed: Record<string, unknown> = {}): BrowserControlConsentStorage & {
  data: Record<string, unknown>;
} {
  const data: Record<string, unknown> = { ...seed };
  return {
    data,
    get: (key) => Promise.resolve({ [key]: data[key] }),
    set: (items) => {
      Object.assign(data, items);
      return Promise.resolve();
    },
  };
}

describe('browser control consent record', () => {
  it('withholds consent for an origin that was never confirmed', async () => {
    const storage = fakeStorage();
    await expect(hasBrowserControlConsent('https://acme.example', storage)).resolves.toBe(false);
  });

  it('grants and revokes one origin at a time', async () => {
    const storage = fakeStorage();
    await grantBrowserControlConsent('https://acme.example/jobs?q=1', storage);

    expect(storage.data[BROWSER_CONTROL_CONSENT_STORAGE_KEY]).toEqual(['https://acme.example']);
    await expect(hasBrowserControlConsent('https://acme.example', storage)).resolves.toBe(true);
    await expect(hasBrowserControlConsent('https://other.example', storage)).resolves.toBe(false);
    await expect(hasBrowserControlConsent('http://acme.example', storage)).resolves.toBe(false);

    await revokeBrowserControlConsent('https://acme.example', storage);
    await expect(hasBrowserControlConsent('https://acme.example', storage)).resolves.toBe(false);
  });

  it('drops non-http(s) and malformed stored entries instead of honouring them', async () => {
    const storage = fakeStorage({
      [BROWSER_CONTROL_CONSENT_STORAGE_KEY]: [
        'javascript:alert(1)',
        'chrome-extension://abc',
        'not a url',
        42,
        'https://ok.example',
      ],
    });
    await expect(readBrowserControlConsent(storage)).resolves.toEqual(['https://ok.example']);
    await expect(hasBrowserControlConsent('javascript:alert(1)', storage)).resolves.toBe(false);
  });

  it('refuses to record a grant for a non-origin value', async () => {
    const storage = fakeStorage();
    await expect(grantBrowserControlConsent('not a url', storage)).rejects.toThrow(
      /http\(s\) origin/,
    );
    expect(storage.data[BROWSER_CONTROL_CONSENT_STORAGE_KEY]).toBeUndefined();
  });

  it('fails closed when the consent record cannot be read', async () => {
    const broken: BrowserControlConsentStorage = {
      get: () => Promise.reject(new Error('storage unavailable')),
      set: () => Promise.resolve(),
    };
    await expect(hasBrowserControlConsent('https://acme.example', broken)).rejects.toThrow(
      'storage unavailable',
    );
  });

  it('names the elevated risk and the exact place to grant it', () => {
    const message = browserControlConsentRequiredMessage('https://acme.example');
    expect(message).toContain('https://acme.example');
    expect(message).toContain('Chrome DevTools Protocol');
    expect(message).toContain('Grant full browser control');
  });
});

describe('computer-use start refuses an unconfirmed origin', () => {
  const background = read('src/background.ts');
  const startHandler = background.slice(
    background.indexOf("case 'AGI_START_COMPUTER_USE'"),
    background.indexOf('const lease = computerUseRuns.begin({'),
  );

  it('checks browser control consent before a lease is ever created', () => {
    expect(startHandler).toContain('await hasBrowserControlConsent(cuOrigin)');
    expect(startHandler).toMatch(
      /if \(!cuBrowserControlGranted\) \{[\s\S]*browserControlConsentRequiredMessage\(cuOrigin\)/,
    );
  });

  it('fails closed when the consent record cannot be verified', () => {
    expect(startHandler).toContain(
      'AGI_START_COMPUTER_USE: browser control consent could not be verified',
    );
  });
});

describe('options page is the surface that grants browser control', () => {
  const options = read('src/options.ts');

  it('never writes a grant outside the explicit confirmation button', () => {
    const grantCalls = options.match(/grantBrowserControlConsent\(origin\)/g) ?? [];
    expect(grantCalls).toHaveLength(1);
    expect(options).toMatch(
      /consentGrantBtn\.addEventListener\('click',[\s\S]*grantBrowserControlConsent\(origin\)/,
    );
  });

  it('opens the elevated-risk prompt instead of approving straight from Add', () => {
    expect(options).toMatch(
      /addBtn\.addEventListener\('click',[\s\S]*consentPrompt\.hidden = false;[\s\S]*return;/,
    );
    expect(options).toContain('BROWSER_CONTROL_CONSENT_HEADLINE');
    expect(options).toContain('BROWSER_CONTROL_CONSENT_BODY');
  });

  it('revokes the grant whenever the origin leaves the allowlist', () => {
    const revokeCalls = options.match(/revokeBrowserControlConsent\(origin\)/g) ?? [];
    expect(revokeCalls).toHaveLength(2);
  });
});
