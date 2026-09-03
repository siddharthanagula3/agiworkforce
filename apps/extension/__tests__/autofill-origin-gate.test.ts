/**
 * SEC-15: ATS detection must be anchored to the parsed hostname, and the stored
 * job-application profile must never reach a page whose origin the user has not
 * put on `agi_site_allowlist`.
 *
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

if (typeof globalThis.CSS === 'undefined') {
  (globalThis as Record<string, unknown>).CSS = {};
}
if (typeof CSS.escape !== 'function') {
  CSS.escape = (value: string) => value.replace(/([^\w-])/g, '\\$1');
}

const chromeMock = vi.hoisted(() => {
  const localStore: Record<string, unknown> = {};
  const mock = {
    runtime: {
      onMessage: { addListener: vi.fn() },
      sendMessage: vi.fn().mockResolvedValue({ success: true }),
      lastError: undefined as string | undefined,
      getManifest: vi.fn(() => ({ version: '1.2.0' })),
    },
    storage: {
      local: {
        get: vi.fn((keys: unknown) => {
          if (typeof keys === 'string') {
            return Promise.resolve(
              keys in localStore ? { [keys]: localStore[keys] } : ({} as Record<string, unknown>),
            );
          }
          return Promise.resolve({ ...localStore });
        }),
        set: vi.fn().mockResolvedValue(undefined),
      },
    },
    _localStore: localStore,
  };
  (globalThis as Record<string, unknown>).chrome = mock;
  return mock;
});

vi.mock('../src/utils', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  sleep: vi.fn().mockResolvedValue(undefined),
  domUtils: {
    querySelector: vi.fn((selector: string) => document.querySelector(selector)),
    querySelectorAll: vi.fn((selector: string) => Array.from(document.querySelectorAll(selector))),
    waitForSelector: vi.fn().mockResolvedValue(null),
    safeClick: vi.fn().mockReturnValue(true),
    getText: vi.fn((el: Element | null) => el?.textContent ?? ''),
    getElementRect: vi.fn().mockReturnValue(null),
    scrollIntoView: vi.fn().mockReturnValue(true),
    isVisible: vi.fn().mockReturnValue(false),
  },
  formUtils: {
    getForms: vi.fn().mockReturnValue([]),
    getFormFields: vi.fn().mockReturnValue([]),
    fillField: vi.fn().mockReturnValue(true),
    submitForm: vi.fn().mockReturnValue(true),
  },
  validators: {
    isValidSelector: vi.fn().mockReturnValue(true),
    isSafeUrl: vi.fn().mockReturnValue(true),
    isLocalUrl: vi.fn().mockReturnValue(false),
    sanitizeInput: vi.fn((s: string) => s),
  },
}));

vi.mock('../src/jobAutofill', () => ({
  runPlatformJobAutofill: vi.fn().mockResolvedValue({ success: true, filledCount: 0 }),
}));

vi.mock('../src/webmcp', () => ({
  discoverAllTools: vi.fn(() => ({ supported: false, tools: [], url: '', timestamp: 0 })),
  callTool: vi.fn().mockResolvedValue({ success: true }),
  watchForToolChanges: vi.fn(),
}));

vi.mock('../src/page-metadata', () => ({
  extractPageMetadata: vi.fn(() => ({ url: '', title: '' })),
}));

vi.mock('../src/nlweb', () => ({
  detectNLWeb: vi
    .fn()
    .mockResolvedValue({ supported: false, endpoints: [], schemaTypes: [], url: '' }),
}));

vi.mock('../src/inPagePanel/setup', () => ({
  setupInPagePanel: vi.fn().mockResolvedValue(undefined),
}));

import {
  detectJobApplication,
  isLeverUrl,
  isLinkedInUrl,
} from '../src/features/content/autofill/detector';
import { isGreenhouseUrl } from '../src/features/content/autofill/greenhouse';
import { isAshbyUrl } from '../src/features/content/autofill/ashby';
import { AUTOFILL_PROFILE_STORAGE_KEY } from '../src/features/content/autofill/filler';
import { handleMessage } from '../src/content.ts';

const ATTACKER_ORIGIN = 'https://attacker.example';

function setPageUrl(href: string): void {
  const parsed = new URL(href);
  Object.defineProperty(window, 'location', {
    value: { href, origin: parsed.origin, hostname: parsed.hostname, pathname: parsed.pathname },
    writable: true,
    configurable: true,
  });
}

function buildGreenhouseLikeDom(): void {
  document.body.innerHTML = `
    <form id="application_form">
      <label for="first_name">First Name *</label>
      <input id="first_name" name="job_application[first_name]" type="text" required />
      <label for="last_name">Last Name *</label>
      <input id="last_name" name="job_application[last_name]" type="text" required />
      <label for="email">Email *</label>
      <input id="email" name="job_application[email]" type="email" required />
    </form>
  `;
}

function runAutofill(): Promise<{ success?: boolean; error?: string; platform?: string }> {
  return new Promise((resolve) => {
    handleMessage({ type: 'AGI_RUN_AUTOFILL' }, {} as chrome.runtime.MessageSender, (response) =>
      resolve(response as { success?: boolean; error?: string; platform?: string }),
    );
  });
}

describe('SEC-15, ATS detection is hostname-anchored', () => {
  it('rejects attacker URLs that merely contain an ATS host as a path or query substring', () => {
    expect(isGreenhouseUrl(`${ATTACKER_ORIGIN}/boards.greenhouse.io/apply`)).toBe(false);
    expect(isGreenhouseUrl(`${ATTACKER_ORIGIN}/?next=grnh.se/abc`)).toBe(false);
    expect(isGreenhouseUrl('https://greenhouse.io.attacker.example/x/jobs/1')).toBe(false);
    expect(isAshbyUrl(`${ATTACKER_ORIGIN}/jobs.ashbyhq.com/apply`)).toBe(false);
    expect(isLeverUrl(`${ATTACKER_ORIGIN}/jobs.lever.co/acme`)).toBe(false);
    expect(isLinkedInUrl(`${ATTACKER_ORIGIN}/linkedin.com/jobs/view/1`)).toBe(false);
  });

  it('still accepts the real ATS hosts', () => {
    expect(isGreenhouseUrl('https://boards.greenhouse.io/acmecorp/jobs/123')).toBe(true);
    expect(isGreenhouseUrl('https://job-boards.greenhouse.io/acmecorp/jobs/123')).toBe(true);
    expect(isGreenhouseUrl('https://grnh.se/abc123')).toBe(true);
    expect(isAshbyUrl('https://jobs.ashbyhq.com/acme/1234')).toBe(true);
    expect(isLeverUrl('https://jobs.lever.co/acme/1234')).toBe(true);
    expect(isLinkedInUrl('https://www.linkedin.com/jobs/view/1234')).toBe(true);
  });

  it('does not classify an attacker page carrying an ATS-shaped form as a job application', () => {
    setPageUrl(`${ATTACKER_ORIGIN}/boards.greenhouse.io/apply`);
    buildGreenhouseLikeDom();
    const detection = detectJobApplication();
    expect(detection.platform).toBeNull();
    expect(detection.isJobApplication).toBe(false);
    expect(detection.fields).toHaveLength(0);
  });
});

describe('SEC-15, AGI_RUN_AUTOFILL gates the stored profile on the site allowlist', () => {
  beforeEach(() => {
    for (const key of Object.keys(chromeMock._localStore)) {
      delete chromeMock._localStore[key];
    }
    chromeMock._localStore[AUTOFILL_PROFILE_STORAGE_KEY] = {
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
    };
    buildGreenhouseLikeDom();
  });

  it('refuses to read or write the profile on an origin that is not allowlisted', async () => {
    chromeMock._localStore['agi_site_allowlist'] = ['https://boards.greenhouse.io'];
    setPageUrl(`${ATTACKER_ORIGIN}/boards.greenhouse.io/apply`);

    const response = await runAutofill();

    expect(response.success).toBe(false);
    expect(response.error).toMatch(/allowlist/i);
    expect(chromeMock.storage.local.get).not.toHaveBeenCalledWith(AUTOFILL_PROFILE_STORAGE_KEY);
    expect((document.querySelector('#first_name') as HTMLInputElement).value).toBe('');
    expect((document.querySelector('#email') as HTMLInputElement).value).toBe('');
  });

  it('refuses on a real ATS host that the user has not allowlisted', async () => {
    chromeMock._localStore['agi_site_allowlist'] = [];
    setPageUrl('https://boards.greenhouse.io/acmecorp/jobs/123');

    const response = await runAutofill();

    expect(response.success).toBe(false);
    expect(response.error).toMatch(/allowlist/i);
    expect((document.querySelector('#first_name') as HTMLInputElement).value).toBe('');
  });

  it('fills a real allowlisted ATS page', async () => {
    chromeMock._localStore['agi_site_allowlist'] = ['https://boards.greenhouse.io'];
    setPageUrl('https://boards.greenhouse.io/acmecorp/jobs/123');

    const response = await runAutofill();

    expect(response.success).toBe(true);
    expect(response.platform).toBe('greenhouse');
    expect((document.querySelector('#first_name') as HTMLInputElement).value).toBe('Jane');
    expect((document.querySelector('#email') as HTMLInputElement).value).toBe('jane@example.com');
  });
});
