import { afterEach, describe, expect, it, vi } from 'vitest';

import { CONSENT_PURPOSES } from './consent-purposes';
import {
  GLOBAL_PRIVACY_CONTROL_BLOCKS_GRANT_NOTICE,
  GLOBAL_PRIVACY_CONTROL_HEADER,
  NON_ESSENTIAL_CONSENT_PURPOSE_IDS,
  grantedUnderGlobalPrivacyControl,
  isGlobalPrivacyControlValue,
  isNonEssentialConsentPurpose,
  readBrowserGlobalPrivacyControl,
  readGlobalPrivacyControlHeader,
} from './consent-signals';

describe('the opt-out signal', () => {
  it('reads only the exact "1" the specification defines', () => {
    expect(isGlobalPrivacyControlValue('1')).toBe(true);
    expect(isGlobalPrivacyControlValue(' 1 ')).toBe(true);
    expect(isGlobalPrivacyControlValue('0')).toBe(false);
    expect(isGlobalPrivacyControlValue('true')).toBe(false);
    expect(isGlobalPrivacyControlValue('')).toBe(false);
    expect(isGlobalPrivacyControlValue(null)).toBe(false);
    expect(isGlobalPrivacyControlValue(undefined)).toBe(false);
  });

  it('reads it off a request under the header name the browser sends', () => {
    expect(GLOBAL_PRIVACY_CONTROL_HEADER).toBe('sec-gpc');
    expect(readGlobalPrivacyControlHeader(new Headers({ 'Sec-GPC': '1' }))).toBe(true);
    expect(readGlobalPrivacyControlHeader(new Headers({ 'sec-gpc': '1' }))).toBe(true);
    expect(readGlobalPrivacyControlHeader(new Headers({ 'Sec-GPC': '0' }))).toBe(false);
    expect(readGlobalPrivacyControlHeader(new Headers())).toBe(false);
  });
});

describe('the browser property', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, 'globalPrivacyControl');
  });

  it('is true only when the browser sets it to true', () => {
    Object.defineProperty(navigator, 'globalPrivacyControl', {
      configurable: true,
      value: true,
    });
    expect(readBrowserGlobalPrivacyControl()).toBe(true);

    Object.defineProperty(navigator, 'globalPrivacyControl', {
      configurable: true,
      value: 'yes',
    });
    expect(readBrowserGlobalPrivacyControl()).toBe(false);
  });

  it('is false rather than throwing where there is no navigator at all', () => {
    vi.stubGlobal('navigator', undefined);
    expect(readBrowserGlobalPrivacyControl()).toBe(false);
  });

  it('is false when reading the property throws', () => {
    Object.defineProperty(navigator, 'globalPrivacyControl', {
      configurable: true,
      get() {
        throw new Error('blocked by the embedder');
      },
    });
    expect(readBrowserGlobalPrivacyControl()).toBe(false);
  });
});

describe('which purposes the signal covers', () => {
  it('covers every purpose that is not necessary for the request, and only those', () => {
    const expected = CONSENT_PURPOSES.filter((purpose) => !purpose.necessaryForRequest).map(
      (purpose) => purpose.id,
    );
    expect([...NON_ESSENTIAL_CONSENT_PURPOSE_IDS].sort()).toEqual([...expected].sort());
    expect(NON_ESSENTIAL_CONSENT_PURPOSE_IDS).toContain('product_analytics');
    expect(NON_ESSENTIAL_CONSENT_PURPOSE_IDS).toContain('product_updates');
    expect(NON_ESSENTIAL_CONSENT_PURPOSE_IDS).toContain('marketing_email');
  });

  it('never covers a purpose the request itself depends on', () => {
    for (const purpose of CONSENT_PURPOSES) {
      expect(isNonEssentialConsentPurpose(purpose.id)).toBe(!purpose.necessaryForRequest);
    }
    expect(isNonEssentialConsentPurpose('enterprise_waitlist')).toBe(false);
    expect(isNonEssentialConsentPurpose('platform_availability_waitlist')).toBe(false);
  });
});

describe('what the signal does to a decision', () => {
  const optional = CONSENT_PURPOSES.filter((purpose) => !purpose.necessaryForRequest);
  const necessary = CONSENT_PURPOSES.filter((purpose) => purpose.necessaryForRequest);

  it('turns a grant for every optional purpose into a refusal', () => {
    expect(optional.length).toBeGreaterThan(0);
    for (const purpose of optional) {
      expect(grantedUnderGlobalPrivacyControl({ purpose: purpose.id, granted: true }, true)).toBe(
        false,
      );
    }
  });

  it('leaves a grant the request depends on as it was given', () => {
    expect(necessary.length).toBeGreaterThan(0);
    for (const purpose of necessary) {
      expect(grantedUnderGlobalPrivacyControl({ purpose: purpose.id, granted: true }, true)).toBe(
        true,
      );
    }
  });

  it('never turns a refusal into a grant, and changes nothing without the signal', () => {
    for (const purpose of CONSENT_PURPOSES) {
      expect(grantedUnderGlobalPrivacyControl({ purpose: purpose.id, granted: false }, true)).toBe(
        false,
      );
      expect(grantedUnderGlobalPrivacyControl({ purpose: purpose.id, granted: true }, false)).toBe(
        true,
      );
      expect(grantedUnderGlobalPrivacyControl({ purpose: purpose.id, granted: false }, false)).toBe(
        false,
      );
    }
  });
});

describe('the sentence shown beside a choice the signal holds off', () => {
  it('says the choice is off and that Global Privacy Control in this browser is why', () => {
    expect(GLOBAL_PRIVACY_CONTROL_BLOCKS_GRANT_NOTICE).toMatch(/\boff\b/);
    expect(GLOBAL_PRIVACY_CONTROL_BLOCKS_GRANT_NOTICE).toMatch(/this browser/);
    expect(GLOBAL_PRIVACY_CONTROL_BLOCKS_GRANT_NOTICE).toMatch(/Global Privacy Control/);
  });

  it('is one plain sentence', () => {
    expect(GLOBAL_PRIVACY_CONTROL_BLOCKS_GRANT_NOTICE).toMatch(/^[A-Z][^.!?]*\.$/);
  });
});
