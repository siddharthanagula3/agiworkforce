/**
 * SEC-15: ATS detection must be anchored to the parsed hostname, and the stored
 * job-application profile must never reach a page whose origin the user has not
 * put on `agi_site_allowlist`.
 *
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AutofillResult } from '../src/features/content/autofill/filler';
import type { EscalationDecision } from '../src/features/computer-use/escalationEngine';

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
    _profileReadFails: false,
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
  startToolChangeReporting: vi.fn(),
  stopWatchingToolChanges: vi.fn(),
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
  isJobApplicationHostUrl,
  isLeverUrl,
  isLinkedInUrl,
} from '../src/features/content/autofill/detector';
import { isGreenhouseUrl } from '../src/features/content/autofill/greenhouse';
import { isAshbyUrl } from '../src/features/content/autofill/ashby';
import { AUTOFILL_PROFILE_STORAGE_KEY } from '../src/features/content/autofill/profile-storage';
import { handleMessage } from '../src/content.ts';

const ATTACKER_ORIGIN = 'https://attacker.example';

function pageApproved(): boolean {
  const allowlist = chromeMock._localStore['agi_site_allowlist'];
  return Array.isArray(allowlist) && allowlist.includes(window.location.origin);
}

function serviceWorkerReply(message: { type?: string }): Record<string, unknown> {
  if (message.type === 'GET_PAGE_ACCESS')
    return { success: true, approved: pageApproved(), inPagePanel: false };
  if (message.type === 'GET_AUTOFILL_PROFILE') {
    if (!pageApproved())
      return {
        success: false,
        error: 'Autofill is blocked here, this site is not on your approved-site allowlist',
      };
    if (!isJobApplicationHostUrl(window.location.href))
      return { success: false, error: 'Autofill does not support this page.' };
    if (chromeMock._profileReadFails)
      return { success: false, error: 'Your autofill profile could not be read.' };
    return { success: true, profile: chromeMock._localStore[AUTOFILL_PROFILE_STORAGE_KEY] };
  }
  return { success: true };
}

beforeEach(() => {
  chromeMock.runtime.sendMessage.mockImplementation(async (message: { type?: string }) =>
    serviceWorkerReply(message),
  );
  chromeMock.storage.local.get.mockClear();
  chromeMock._profileReadFails = false;
});

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

interface AutofillResponse {
  success?: boolean;
  error?: string;
  platform?: string;
  autofill?: AutofillResult;
  escalation?: EscalationDecision;
}

function runAutofill(): Promise<AutofillResponse> {
  return new Promise((resolve) => {
    handleMessage({ type: 'AGI_RUN_AUTOFILL' }, {} as chrome.runtime.MessageSender, (response) =>
      resolve(response as AutofillResponse),
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
    expect(chromeMock.storage.local.get).not.toHaveBeenCalled();
    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({ type: 'GET_AUTOFILL_PROFILE' });
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

  it('says an approved site that is not a supported application page is unsupported, not unapproved', async () => {
    chromeMock._localStore['agi_site_allowlist'] = ['https://acme.wd5.myworkdayjobs.com'];
    setPageUrl('https://acme.wd5.myworkdayjobs.com/en-US/careers/job/1');

    const response = await runAutofill();

    expect(response.success).toBe(false);
    expect(response.error).toMatch(/does not support this page/i);
    expect(response.error).not.toMatch(/approved|allowlist/i);
  });

  it('says a profile that could not be read could not be read, not that the site is unapproved', async () => {
    chromeMock._localStore['agi_site_allowlist'] = ['https://boards.greenhouse.io'];
    chromeMock._profileReadFails = true;
    setPageUrl('https://boards.greenhouse.io/acmecorp/jobs/123');

    const response = await runAutofill();

    expect(response.success).toBe(false);
    expect(response.error).toMatch(/could not be read/i);
    expect(response.error).not.toMatch(/approved|allowlist/i);
  });

  it('tells the user the extension did not answer when the worker is unreachable', async () => {
    chromeMock.runtime.sendMessage.mockRejectedValueOnce(
      new Error('Extension context invalidated'),
    );
    setPageUrl('https://boards.greenhouse.io/acmecorp/jobs/123');

    const response = await runAutofill();

    expect(response.success).toBe(false);
    expect(response.error).toMatch(/did not answer/i);
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

describe.each([
  [
    'linkedin',
    'https://www.linkedin.com/jobs/view/123',
    'application-form',
    'jobs-easy-apply-modal',
    'email',
  ],
  [
    'lever',
    'https://jobs.lever.co/acme/123/apply',
    'application-form',
    'application-form',
    'email',
  ],
  [
    'greenhouse',
    'https://boards.greenhouse.io/acme/jobs/123',
    'application_form',
    '',
    'job_application[email]',
  ],
  ['ashby', 'https://jobs.ashbyhq.com/acme/123', 'application-form', '', '_systemfield_email'],
])('mounted autofill field custody on %s', (platform, href, id, className, emailName) => {
  beforeEach(() => {
    for (const key of Object.keys(chromeMock._localStore)) delete chromeMock._localStore[key];
    setPageUrl(href);
    chromeMock._localStore.agi_site_allowlist = [new URL(href).origin];
    chromeMock._localStore[AUTOFILL_PROFILE_STORAGE_KEY] = { email: 'jane@example.com' };
    document.body.innerHTML = `<form id="${id}" class="${className}">
      <label for="email">Email</label><input id="email" name="${emailName}" type="email" required>
      <button type="submit">Submit application</button></form>`;
  });

  it('finishes an email-only form without inventing file or location work', async () => {
    const submit = vi.fn((event: Event) => event.preventDefault());
    document.querySelector('form')!.addEventListener('submit', submit);
    const response = await runAutofill();
    expect(response.success).toBe(true);
    expect(response.platform).toBe(platform);
    expect((document.querySelector('#email') as HTMLInputElement).value).toBe('jane@example.com');
    expect(response.escalation).toMatchObject({ shouldEscalate: false, triggers: [] });
    expect(response.autofill?.filled.some((result) => result.key.startsWith('files.'))).toBe(false);
    expect(submit).not.toHaveBeenCalled();
  });

  it('leaves an optional unrequested upload empty without starting the agent', async () => {
    document
      .querySelector('form')!
      .insertAdjacentHTML(
        'beforeend',
        '<label for="resume">Resume</label><input id="resume" name="resume" type="file">',
      );
    const response = await runAutofill();
    expect(response.success).toBe(true);
    expect(response.escalation).toMatchObject({ shouldEscalate: false, triggers: [] });
    expect((document.getElementById('resume') as HTMLInputElement).files).toHaveLength(0);
  });

  it('keeps an actual required upload incomplete and requests assistance', async () => {
    document
      .querySelector('form')!
      .insertAdjacentHTML(
        'beforeend',
        '<label for="resume">Resume</label><input id="resume" name="resume" type="file" required>',
      );
    const response = await runAutofill();
    expect(response.success).toBe(true);
    expect(response.escalation?.shouldEscalate).toBe(true);
    expect(response.escalation?.triggers).toContainEqual(
      expect.objectContaining({ fieldKey: 'files.resume', reason: 'file_upload' }),
    );
    expect((document.getElementById('resume') as HTMLInputElement).files).toHaveLength(0);
  });

  it('does not call a required unanswered question complete when the profile has no answer', async () => {
    chromeMock._localStore[AUTOFILL_PROFILE_STORAGE_KEY] = {};
    const response = await runAutofill();
    expect(response.success).toBe(true);
    expect(response.autofill?.filledCount).toBe(0);
    expect(response.escalation?.triggers).toContainEqual(
      expect.objectContaining({ fieldKey: 'email', reason: 'required_field_empty' }),
    );
  });

  it('retains the request to upload an explicitly saved optional file', async () => {
    chromeMock._localStore[AUTOFILL_PROFILE_STORAGE_KEY] = {
      email: 'jane@example.com',
      files: {
        resumeDataUrl: 'data:text/plain;base64,VGVzdA==',
        resumeFileName: 'test-resume.txt',
      },
    };
    document
      .querySelector('form')!
      .insertAdjacentHTML(
        'beforeend',
        '<label for="resume">Resume</label><input id="resume" name="resume" type="file">',
      );
    const response = await runAutofill();
    expect(response.escalation?.triggers).toContainEqual(
      expect.objectContaining({ fieldKey: 'files.resume', reason: 'file_upload' }),
    );
  });
});
