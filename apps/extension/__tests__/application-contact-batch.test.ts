import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fillApplicationContactBatch } from '../src/features/content/autofill/contactBatch';
import {
  MAX_AUTOFILL_PROFILE_FIELD_CHARS,
  parseContactAutofillProfile,
} from '../src/features/content/autofill/contactProfile';
import {
  parseChatBrowserToolCall,
  CHAT_AUTOFILL_TOOL,
} from '../src/features/computer-use/chatBrowserTools';
import { getMessagePolicy } from '../src/background/policy';
import { autofillLever } from '../src/features/content/autofill/filler';
import { makeEscalationDecision } from '../src/features/computer-use/escalationEngine';

const URL = 'https://jobs.lever.co/example/job/apply';
const PROFILE = {
  fullName: 'Test Applicant',
  email: 'test@example.com',
  phone: '202-555-0118',
  locationCity: 'Toronto, Ontario, Canada',
  currentCompany: 'Test Labs',
  linkedinUrl: 'https://example.com/linkedin',
  githubUrl: 'https://example.com/github',
  portfolioUrl: 'https://example.com/portfolio',
};

beforeEach(() => {
  vi.stubGlobal('location', { href: URL });
  vi.stubGlobal('CSS', {
    escape: (value: string) => value.replace(/[^a-zA-Z0-9_-]/gu, (ch) => `\\${ch}`),
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 100,
    bottom: 20,
    width: 100,
    height: 20,
    toJSON: () => ({}),
  });
  document.body.innerHTML = `<form id="application-form" class="application-form">
    <label>Full name<input id="name" name="name"></label>
    <label>Email<input id="email" name="email" type="email"></label>
    <label>Phone<input id="phone" name="phone" type="tel"></label>
    <label>Current location<input id="location-input" name="location"></label>
    <label>Current company<input id="org" name="org"></label>
    <label>LinkedIn<input id="urls_LinkedIn" name="urls[LinkedIn]"></label>
    <label>GitHub<input id="urls_GitHub" name="urls[GitHub]"></label>
    <label>Portfolio<input id="urls_Portfolio" name="urls[Portfolio]"></label>
    <input id="resume" type="file"><input id="consent" type="checkbox">
    <input id="pronouns"><button type="submit">Submit application</button>
  </form>`;
});

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('local application contact batch', () => {
  it('fills a single full-name field from the saved first and last names', async () => {
    const result = await fillApplicationContactBatch(
      { firstName: 'Sage', lastName: 'Native' },
      URL,
    );
    expect((document.getElementById('name') as HTMLInputElement).value).toBe('Sage Native');
    expect(result.fields).toEqual([
      expect.objectContaining({ key: 'fullName', status: 'filled', verifiedValue: 'Sage Native' }),
    ]);
  });

  it('keeps separate first and last name fields separate', async () => {
    document.body.innerHTML = `<form id="application-form">
      <label>First name<input name="first_name" aria-label="First name"></label>
      <label>Last name<input name="last_name" aria-label="Last name"></label>
    </form>`;
    const result = await fillApplicationContactBatch(
      { firstName: 'Sage', lastName: 'Native' },
      URL,
    );
    expect((document.querySelector('[name=first_name]') as HTMLInputElement).value).toBe('Sage');
    expect((document.querySelector('[name=last_name]') as HTMLInputElement).value).toBe('Native');
    expect(result.fields.some((field) => field.key === 'fullName')).toBe(false);
  });

  it.each(['Company name', 'CompanyName', 'BusinessName', 'ManagerName'])(
    'does not put a derived person name into %s',
    async (label) => {
      document.getElementById('name')!.remove();
      const company = document.getElementById('org') as HTMLInputElement;
      company.setAttribute('aria-label', label);
      await fillApplicationContactBatch({ firstName: 'Sage', lastName: 'Native' }, URL);
      expect(company.value).toBe('');
    },
  );

  it.each(['Company name', 'CompanyName', 'BusinessName', 'ManagerName'])(
    'does not put an explicit person name into %s',
    async (label) => {
      document.getElementById('name')!.remove();
      const company = document.getElementById('org') as HTMLInputElement;
      company.setAttribute('aria-label', label);
      await fillApplicationContactBatch({ fullName: 'Sage Native' }, URL);
      expect(company.value).toBe('');
    },
  );

  it('does not exceed the contact-value budget when joining names', async () => {
    await fillApplicationContactBatch(
      {
        firstName: 'S'.repeat(MAX_AUTOFILL_PROFILE_FIELD_CHARS),
        lastName: 'N'.repeat(MAX_AUTOFILL_PROFILE_FIELD_CHARS),
      },
      URL,
    );
    expect((document.getElementById('name') as HTMLInputElement).value).toBe('');
  });

  it('defers the same interactive location from the legacy Run Autofill path', async () => {
    const input = document.querySelector<HTMLInputElement>('[name=location]')!;
    input.className = 'location-input';
    input.setAttribute('data-qa', 'location-input');
    const result = await autofillLever(PROFILE, 0);
    expect(input.value).toBe('');
    expect(result.filled.find((field) => field.key === 'locationCity')).toMatchObject({
      success: false,
      skipped: true,
      selectionRequired: true,
    });
    const escalation = makeEscalationDecision(result.filled, [], PROFILE, 'lever');
    expect(escalation.triggers).toContainEqual(
      expect.objectContaining({ reason: 'typeahead_dropdown', fieldKey: 'locationCity' }),
    );
    expect(escalation.agentGoal).not.toContain('type slowly');
  });
  it('fills and verifies eight answers together without submitting or changing excluded controls', async () => {
    const submit = vi.fn((event: Event) => event.preventDefault());
    document.querySelector('form')!.addEventListener('submit', submit);
    const result = await fillApplicationContactBatch(PROFILE, URL);

    expect(result.filledCount).toBe(8);
    expect(result.fields.every((field) => field.status === 'filled')).toBe(true);
    expect((document.getElementById('location-input') as HTMLInputElement).value).toBe(
      PROFILE.locationCity,
    );
    expect((document.getElementById('consent') as HTMLInputElement).checked).toBe(false);
    expect((document.getElementById('resume') as HTMLInputElement).files).toHaveLength(0);
    expect((document.getElementById('pronouns') as HTMLInputElement).value).toBe('');
    expect(submit).not.toHaveBeenCalled();
    expect(result.submitted).toBe(false);
    expect(JSON.stringify(result.fieldContext)).not.toContain(PROFILE.email);
  });

  it('preserves an existing answer that differs from the requested profile', async () => {
    (document.getElementById('email') as HTMLInputElement).value = 'existing@example.com';
    const result = await fillApplicationContactBatch(PROFILE, URL);
    expect(result.filledCount).toBe(7);
    expect(result.fields.find((field) => field.key === 'email')?.status).toBe('skipped');
    expect((document.getElementById('email') as HTMLInputElement).value).toBe(
      'existing@example.com',
    );
  });

  it('replaces an existing ordinary value only when explicitly requested', async () => {
    const email = document.getElementById('email') as HTMLInputElement;
    email.value = 'existing@example.com';
    const result = await fillApplicationContactBatch({ email: PROFILE.email }, URL, true);
    expect(result.fields[0]).toMatchObject({
      key: 'email',
      status: 'filled',
      verifiedValue: PROFILE.email,
    });
    expect(email.value).toBe(PROFILE.email);
    expect(result.submitted).toBe(false);
  });

  it('keeps interactive location selection protected when replacement is requested', async () => {
    const location = document.getElementById('location-input') as HTMLInputElement;
    location.className = 'location-input';
    location.setAttribute('data-qa', 'location-input');
    location.value = 'Existing committed city';
    const result = await fillApplicationContactBatch({ locationCity: 'New query' }, URL, true);
    expect(result.fields[0]).toMatchObject({
      status: 'skipped',
      reason: expect.stringContaining('autocomplete'),
    });
    expect(location.value).toBe('Existing committed city');
    expect(result.submitted).toBe(false);
  });

  it('keeps password fields protected even when replacement is requested', async () => {
    const email = document.getElementById('email') as HTMLInputElement;
    email.type = 'password';
    email.value = 'existing-secret';
    const result = await fillApplicationContactBatch({ email: PROFILE.email }, URL, true);
    expect(result.fields[0]).toMatchObject({ status: 'skipped' });
    expect(result.fields[0]?.verifiedValue).toBeUndefined();
    expect(email.value).toBe('existing-secret');
  });

  it.each(['true', 1, null, {}])(
    'refuses malformed replacement option %j before any write',
    async (flag) => {
      await expect(
        fillApplicationContactBatch({ email: PROFILE.email }, URL, flag),
      ).rejects.toThrow('replacement');
      expect((document.getElementById('email') as HTMLInputElement).value).toBe('');
    },
  );

  it.each([true, false])('accepts the declared profile replacement flag %s', (replaceExisting) => {
    expect(
      parseChatBrowserToolCall({
        id: 'replace-1',
        function: {
          name: CHAT_AUTOFILL_TOOL,
          arguments: JSON.stringify({ profile: { email: PROFILE.email }, replaceExisting }),
        },
      }),
    ).toEqual({
      kind: 'autofill',
      toolCallId: 'replace-1',
      profile: { email: PROFILE.email },
      replaceExisting,
    });
  });

  it.each(['true', 1, null, {}])(
    'refuses malformed profile replacement arguments %j',
    (replaceExisting) => {
      expect(
        parseChatBrowserToolCall({
          id: 'replace-1',
          function: {
            name: CHAT_AUTOFILL_TOOL,
            arguments: JSON.stringify({ profile: { email: PROFILE.email }, replaceExisting }),
          },
        }),
      ).toBeNull();
    },
  );

  it('does not fill a password control that impersonates an ordinary application field', async () => {
    document.getElementById('email')!.setAttribute('type', 'password');
    const result = await fillApplicationContactBatch(PROFILE, URL);
    expect(result.fields.find((field) => field.key === 'email')?.status).toBe('skipped');
    expect((document.getElementById('email') as HTMLInputElement).value).toBe('');
  });

  it('does not claim success when page code immediately rejects a value', async () => {
    const email = document.getElementById('email') as HTMLInputElement;
    email.addEventListener('change', () => {
      email.value = '';
    });
    const result = await fillApplicationContactBatch(PROFILE, URL);
    expect(result.filledCount).toBe(7);
    expect(result.fields.find((field) => field.key === 'email')?.status).toBe('failed');
  });

  it('stops when navigation occurs during the batch', async () => {
    document.getElementById('name')!.addEventListener('input', () => {
      vi.stubGlobal('location', { href: 'https://elsewhere.example/' });
    });
    await expect(fillApplicationContactBatch(PROFILE, URL)).rejects.toThrow('page changed');
    expect((document.getElementById('email') as HTMLInputElement).value).toBe('');
  });

  it('refuses a stale page before writing any answers', async () => {
    await expect(fillApplicationContactBatch(PROFILE, `${URL}?changed`)).rejects.toThrow(
      'page changed',
    );
    expect((document.getElementById('name') as HTMLInputElement).value).toBe('');
  });

  it.each([{ files: {} }, { autoSubmit: 'true' }, { customAnswers: {} }, { password: 'secret' }])(
    'rejects unsupported profile data before execution: %j',
    (value) => {
      expect(parseContactAutofillProfile({ ...PROFILE, ...value })).toBeNull();
    },
  );

  it('parses a complete profile tool call and restricts its controller to extension pages', () => {
    expect(
      parseChatBrowserToolCall({
        id: 'fill-1',
        function: { name: CHAT_AUTOFILL_TOOL, arguments: JSON.stringify({ profile: PROFILE }) },
      }),
    ).toEqual({ kind: 'autofill', toolCallId: 'fill-1', profile: PROFILE });
    expect(getMessagePolicy('FILL_APPLICATION_CONTACT').senderClass).toBe('extension-page-only');
  });
});
