import { readFileSync } from 'fs';
import { join } from 'path';

import { describe, expect, it } from 'vitest';

import {
  PLATFORM_AVAILABILITY_CONSENT_PURPOSES,
  WAITLIST_CONSENT_PURPOSES,
  WAITLIST_SOURCES,
  consentPurposesForWaitlistSource,
  findConsentPurpose,
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
