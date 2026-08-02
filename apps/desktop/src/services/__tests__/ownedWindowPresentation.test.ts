import { beforeEach, describe, expect, it } from 'vitest';

import {
  PRESENTATION_MODE_STORAGE_KEY,
  isPresentationModeEnabled,
  recordOwnedWindowPresentation,
  resolveContentProtection,
  setPresentationModeEnabled,
  subscribeToPresentationMode,
} from '../ownedWindowPresentation';

describe('owned Cloud window presentation policy', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete window.__agiOwnedCloudWindows;
  });

  it('never capture-protects the read/manage settings window', () => {
    // DES-C09: a protected account window renders black in screen recording and
    // conferencing, which hid every bridged settings section during a demo.
    expect(resolveContentProtection('account')).toBe(false);
  });

  it('never capture-protects the connector install window', () => {
    expect(resolveContentProtection('connector-install')).toBe(false);
  });

  it('never capture-protects the sign-in window', () => {
    // The demo starts here and the presentation preference cannot rescue it:
    // that toggle lives in Cloud settings, which requires a session the user
    // does not have until this window has done its job.
    expect(resolveContentProtection('sign-in')).toBe(false);
  });

  it('protects Stripe card entry but not the AGI billing page', () => {
    expect(resolveContentProtection('billing', 'https://checkout.stripe.com/c/pay/cs_test')).toBe(
      true,
    );
    expect(resolveContentProtection('billing', 'https://billing.stripe.com/p/session/abc')).toBe(
      true,
    );
    expect(resolveContentProtection('billing', 'https://agiworkforce.com/billing')).toBe(false);
  });

  it('fails closed when a billing URL cannot be parsed', () => {
    expect(resolveContentProtection('billing', 'not-a-url')).toBe(true);
    expect(resolveContentProtection('billing')).toBe(true);
  });

  it('clears every protection while presentation mode is on', () => {
    setPresentationModeEnabled(true);

    expect(isPresentationModeEnabled()).toBe(true);
    expect(resolveContentProtection('billing', 'https://checkout.stripe.com/c/pay/cs_test')).toBe(
      false,
    );
    expect(resolveContentProtection('sign-in')).toBe(false);
    expect(resolveContentProtection('account')).toBe(false);
  });

  it('restores the protected default when presentation mode is turned off', () => {
    setPresentationModeEnabled(true);
    setPresentationModeEnabled(false);

    expect(window.localStorage.getItem(PRESENTATION_MODE_STORAGE_KEY)).toBeNull();
    expect(resolveContentProtection('billing', 'https://billing.stripe.com/p/session/a')).toBe(
      true,
    );
  });

  it('is off unless the user turned it on', () => {
    expect(isPresentationModeEnabled()).toBe(false);
  });

  it('notifies subscribers on change and stops after unsubscribe', () => {
    const seen: boolean[] = [];
    const unsubscribe = subscribeToPresentationMode((enabled) => seen.push(enabled));

    setPresentationModeEnabled(true);
    setPresentationModeEnabled(false);
    unsubscribe();
    setPresentationModeEnabled(true);

    expect(seen).toEqual([true, false]);
  });

  it('records the resolved decision so a regression is observable on the real binary', () => {
    recordOwnedWindowPresentation('cloud-account', 'account', false);
    recordOwnedWindowPresentation('cloud-sign-in', 'sign-in', true);

    expect(window.__agiOwnedCloudWindows?.['cloud-account']).toMatchObject({
      label: 'cloud-account',
      kind: 'account',
      contentProtected: false,
    });
    expect(window.__agiOwnedCloudWindows?.['cloud-sign-in']?.contentProtected).toBe(true);
  });
});
