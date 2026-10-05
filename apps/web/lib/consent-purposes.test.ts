import { readFileSync } from 'fs';
import { join } from 'path';

import { describe, expect, it } from 'vitest';

import {
  CONSENT_PURPOSES,
  CONSENT_SURFACES,
  MARKETING_EMAIL_CONSENT_PURPOSE,
  PLATFORM_AVAILABILITY_CONSENT_PURPOSES,
  PLATFORM_AVAILABILITY_CONSENT_PURPOSE_IDS,
  WAITLIST_CONSENT_PURPOSES,
  WAITLIST_CONSENT_PURPOSE_IDS,
  WAITLIST_SOURCES,
  consentPurposesForWaitlistSource,
  findConsentPurpose,
  isConsentSurface,
  isEnterpriseWaitlistSource,
  isWaitlistSource,
  type WaitlistSource,
} from './consent-purposes';

describe('enterprise waitlist consent purpose', () => {
  it('preserves the historical purpose id while describing current Enterprise availability', () => {
    const purpose = findConsentPurpose('enterprise_waitlist');

    expect(purpose?.description).toMatch(/already live for entitled workspaces/i);
    expect(purpose?.description).toMatch(/additional Enterprise capabilities/i);
    expect(purpose?.description).not.toMatch(/when enterprise organisation and SSO features open/i);
    expect(purpose?.label).toMatch(/contract-scoped Enterprise access/i);
    expect(purpose?.label).not.toMatch(/early-access/i);
  });
});

describe('marketing email consent purpose', () => {
  it('is the catalogue entry itself, so every screen states it in the same words', () => {
    expect(MARKETING_EMAIL_CONSENT_PURPOSE).toBe(findConsentPurpose('marketing_email'));
    expect(CONSENT_PURPOSES).toContain(MARKETING_EMAIL_CONSENT_PURPOSE);
  });

  it('is optional wherever it is asked', () => {
    expect(MARKETING_EMAIL_CONSENT_PURPOSE.necessaryForRequest).toBe(false);
  });

  it('says what the email is, that it starts off, and where to turn it off', () => {
    expect(MARKETING_EMAIL_CONSENT_PURPOSE).toEqual({
      id: 'marketing_email',
      label: 'Email me product news, tips and offers.',
      description:
        'Email about new features, ways to get more from AGI, and offers such as discounts or free allowances. Off unless you turn it on. You can turn it off at any time in Settings or on the privacy requests page.',
      necessaryForRequest: false,
    });
  });

  it('is a different purpose from the waitlist product updates, so neither grant stands in for the other', () => {
    const productUpdates = findConsentPurpose('product_updates');

    expect(productUpdates).toBeDefined();
    expect(MARKETING_EMAIL_CONSENT_PURPOSE).not.toBe(productUpdates);
    expect(MARKETING_EMAIL_CONSENT_PURPOSE.id).not.toBe(productUpdates?.id);
    expect(MARKETING_EMAIL_CONSENT_PURPOSE.label).not.toBe(productUpdates?.label);
  });
});

describe('the purposes people have already agreed to', () => {
  it('keeps every earlier purpose first and in its published order, with the account purpose after them', () => {
    expect(CONSENT_PURPOSES.map((purpose) => purpose.id)).toEqual([
      'enterprise_waitlist',
      'platform_availability_waitlist',
      'product_updates',
      'product_analytics',
      'marketing_email',
    ]);
  });

  it('keeps the wording of the three waitlist purposes exactly as it was published', () => {
    expect(findConsentPurpose('enterprise_waitlist')).toEqual({
      id: 'enterprise_waitlist',
      label: 'Store my email address so AGI can discuss contract-scoped Enterprise access with me.',
      description:
        'Your address is stored so a person can discuss contract-scoped Enterprise access and contact you as additional Enterprise capabilities become available. Organisation, SSO, SCIM, audit export, and retention controls are already live for entitled workspaces. It is used for this Enterprise conversation and nothing else; nothing in the product mails this list automatically.',
      necessaryForRequest: true,
    });
    expect(findConsentPurpose('platform_availability_waitlist')).toEqual({
      id: 'platform_availability_waitlist',
      label: 'Store my email address so we can tell you when this platform ships.',
      description:
        'Your address is stored so we can email you once AGI Mobile, AGI in Chrome or AGI in VS Code has a verified installer to download. It is used for that and nothing else, and is unrelated to the Enterprise contract-access contact list.',
      necessaryForRequest: true,
    });
    expect(findConsentPurpose('product_updates')).toEqual({
      id: 'product_updates',
      label: 'Also email me product updates and launch news.',
      description:
        'Occasional email about new releases and capabilities, sent by a person rather than an automated system. Separate from the early-access list, so you can withdraw it without leaving that list.',
      necessaryForRequest: false,
    });
  });

  it('asks the waitlist forms for the same purposes as before, never the account one', () => {
    expect([...WAITLIST_CONSENT_PURPOSE_IDS]).toEqual(['enterprise_waitlist', 'product_updates']);
    expect([...PLATFORM_AVAILABILITY_CONSENT_PURPOSE_IDS]).toEqual([
      'platform_availability_waitlist',
      'product_updates',
    ]);
    expect(WAITLIST_CONSENT_PURPOSES.map((purpose) => purpose.id)).toEqual([
      'enterprise_waitlist',
      'product_updates',
    ]);
    expect(PLATFORM_AVAILABILITY_CONSENT_PURPOSES.map((purpose) => purpose.id)).toEqual([
      'platform_availability_waitlist',
      'product_updates',
    ]);
    for (const source of WAITLIST_SOURCES) {
      expect(consentPurposesForWaitlistSource(source)).not.toContain(
        MARKETING_EMAIL_CONSENT_PURPOSE,
      );
    }
  });
});

describe('consent surfaces', () => {
  it('names the two account screens that ask about marketing email with the terms', () => {
    expect(CONSENT_SURFACES).toContain('web-signup');
    expect(CONSENT_SURFACES).toContain('web-login');
    expect(isConsentSurface('web-signup')).toBe(true);
    expect(isConsentSurface('web-login')).toBe(true);
  });

  it('does not read the native terms surface as a place consent is collected', () => {
    expect(isConsentSurface('mobile-auth')).toBe(false);
  });

  it('lists each surface once', () => {
    expect(new Set(CONSENT_SURFACES).size).toBe(CONSENT_SURFACES.length);
  });
});

describe('waitlist source to consent purposes', () => {
  const expectedRequiredPurpose: Record<WaitlistSource, string> = {
    website: 'enterprise_waitlist',
    byok: 'enterprise_waitlist',
    sync: 'enterprise_waitlist',
    billing: 'enterprise_waitlist',
    mobile: 'platform_availability_waitlist',
    other: 'platform_availability_waitlist',
  };

  it('lists exactly the sources the mapping covers', () => {
    expect([...WAITLIST_SOURCES].sort()).toEqual(Object.keys(expectedRequiredPurpose).sort());
  });

  it.each(WAITLIST_SOURCES)('asks %s for its own required purpose and nothing else', (source) => {
    const purposes = consentPurposesForWaitlistSource(source);
    const required = purposes.filter((purpose) => purpose.necessaryForRequest);
    const optional = purposes.filter((purpose) => !purpose.necessaryForRequest);

    expect(required.map((purpose) => purpose.id)).toEqual([expectedRequiredPurpose[source]]);
    expect(optional.map((purpose) => purpose.id)).toEqual(['product_updates']);
  });

  it('resolves mobile and other to the identical platform availability set', () => {
    expect(consentPurposesForWaitlistSource('mobile')).toBe(PLATFORM_AVAILABILITY_CONSENT_PURPOSES);
    expect(consentPurposesForWaitlistSource('other')).toBe(PLATFORM_AVAILABILITY_CONSENT_PURPOSES);
    expect(consentPurposesForWaitlistSource('website')).toBe(WAITLIST_CONSENT_PURPOSES);
  });

  it('never mixes the Enterprise purpose with the platform availability purpose', () => {
    for (const source of WAITLIST_SOURCES) {
      const ids = consentPurposesForWaitlistSource(source).map((purpose) => purpose.id);

      expect(
        ids.includes('enterprise_waitlist') && ids.includes('platform_availability_waitlist'),
      ).toBe(false);
      expect(ids.includes('enterprise_waitlist')).toBe(isEnterpriseWaitlistSource(source));
    }
  });

  it('recognises only the listed sources', () => {
    for (const source of WAITLIST_SOURCES) {
      expect(isWaitlistSource(source)).toBe(true);
    }
    for (const value of ['sneaky-source', '', 'Mobile', undefined, null, 7, ['mobile']]) {
      expect(isWaitlistSource(value)).toBe(false);
    }
  });
});

describe('waitlist source list has one owner', () => {
  const WEB_ROOT = join(__dirname, '..');
  const FALLBACK_SOURCE: WaitlistSource = 'website';

  function readWebFile(path: string): string {
    return readFileSync(join(WEB_ROOT, path), 'utf8');
  }

  function namesImportedFromConsentPurposes(source: string): string[] {
    const names: string[] = [];
    const pattern = /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+'@\/lib\/consent-purposes'/g;
    for (const match of source.matchAll(pattern)) {
      for (const name of (match[1] ?? '').split(',')) {
        const trimmed = name.replace(/^\s*type\s+/, '').trim();
        if (trimmed) names.push(trimmed);
      }
    }
    return names;
  }

  function quotedSourceLiterals(source: string): string[] {
    return WAITLIST_SOURCES.filter(
      (name) => name !== FALLBACK_SOURCE && new RegExp(`['"\`]${name}['"\`]`).test(source),
    );
  }

  it('finds a re-added literal list', () => {
    expect(quotedSourceLiterals("new Set(['website', 'byok', 'sync'])")).toEqual(['byok', 'sync']);
    expect(quotedSourceLiterals("isWaitlistSource(value) ? value : 'website'")).toEqual([]);
  });

  it('has the public waitlist route take its sources and purposes from consent-purposes', () => {
    const route = readWebFile('app/api/waitlist/public/route.ts');
    const imported = namesImportedFromConsentPurposes(route);

    expect(imported).toContain('isWaitlistSource');
    expect(imported).toContain('consentPurposesForWaitlistSource');
    expect(route).toMatch(/\bisWaitlistSource\(/);
    expect(route).toMatch(/\bconsentPurposesForWaitlistSource\(/);
    expect(quotedSourceLiterals(route)).toEqual([]);
  });

  it('has the Enterprise dialog take its sources from EnterpriseWaitlistSource', () => {
    const modal = readWebFile('features/marketing/components/WaitlistModal.tsx');

    expect(namesImportedFromConsentPurposes(modal)).toContain('EnterpriseWaitlistSource');
    expect(modal).toMatch(/export type WaitlistModalSource = EnterpriseWaitlistSource;/);
    expect(quotedSourceLiterals(modal)).toEqual([]);
  });

  it('has joinPublicWaitlist validate its source with isWaitlistSource', () => {
    const client = readWebFile('lib/services/waitlistServiceClient.ts');
    const start = client.indexOf('export async function joinPublicWaitlist');
    const end = client.indexOf('export async function joinWaitlist');

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const joinPublicWaitlist = client.slice(start, end);

    expect(namesImportedFromConsentPurposes(client)).toContain('isWaitlistSource');
    expect(joinPublicWaitlist).toMatch(/\bisWaitlistSource\(/);
    expect(quotedSourceLiterals(joinPublicWaitlist)).toEqual([]);
  });
});
