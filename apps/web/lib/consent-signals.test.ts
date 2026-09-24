import { afterEach, describe, expect, it, vi } from 'vitest';

import { CONSENT_PURPOSES } from './consent-purposes';
import {
  GLOBAL_PRIVACY_CONTROL_HEADER,
  NON_ESSENTIAL_CONSENT_PURPOSE_IDS,
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
  });

  it('never covers a purpose the request itself depends on', () => {
    for (const purpose of CONSENT_PURPOSES) {
      expect(isNonEssentialConsentPurpose(purpose.id)).toBe(!purpose.necessaryForRequest);
    }
    expect(isNonEssentialConsentPurpose('enterprise_waitlist')).toBe(false);
    expect(isNonEssentialConsentPurpose('platform_availability_waitlist')).toBe(false);
  });
});
