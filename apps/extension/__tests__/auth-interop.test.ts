/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  classifyNavigation,
  credentialFieldKind,
  isCredentialField,
  isMfaChallenge,
  isSsoFlow,
  withoutCredentialFields,
} from '../src/features/auth/authInterop';
import {
  detectAuthTriggers,
  makeEscalationDecision,
} from '../src/features/computer-use/escalationEngine';

describe('the extension never fills credentials itself', () => {
  it('recognises what a password manager owns', () => {
    expect(credentialFieldKind({ type: 'password' })).toBe('password');
    expect(credentialFieldKind({ autocomplete: 'current-password' })).toBe('password');
    expect(credentialFieldKind({ autocomplete: 'new-password' })).toBe('new-password');
    expect(credentialFieldKind({ autocomplete: 'one-time-code' })).toBe('one-time-code');
    expect(credentialFieldKind({ label: 'Enter the verification code' })).toBe('one-time-code');
    expect(credentialFieldKind({ name: 'security-key-challenge' })).toBe('webauthn');
    expect(credentialFieldKind({ type: 'text', name: 'first_name' })).toBeNull();
  });

  it('leaves ordinary fields fillable and hands the rest off', () => {
    const { fillable, handedOff } = withoutCredentialFields([
      { name: 'first_name', type: 'text' },
      { name: 'password', type: 'password' },
      { name: 'otp', autocomplete: 'one-time-code' },
    ]);

    expect(fillable.map((field) => field.name)).toEqual(['first_name']);
    expect(handedOff.map((entry) => entry.kind)).toEqual(['password', 'one-time-code']);
  });

  it('does not treat a confirm-password field as a field it may retype', () => {
    expect(isCredentialField({ name: 'confirm_password', type: 'text' })).toBe(true);
  });
});

describe('an SSO redirect is part of the same flow', () => {
  it('names the hop out to an identity provider', () => {
    expect(
      classifyNavigation(
        'https://app.example.com/dashboard',
        'https://id.example.net/oauth2/authorize?client_id=abc&redirect_uri=https%3A%2F%2Fapp.example.com',
      ),
    ).toBe('sso-redirect');
  });

  it('names an identity provider that uses SAML', () => {
    expect(classifyNavigation('https://app.example.com/', 'https://id.example.net/sso/login')).toBe(
      'sso-redirect',
    );
  });

  it('names the hop back with the authorization result', () => {
    expect(
      classifyNavigation(
        'https://id.example.net/oauth2/authorize',
        'https://app.example.com/callback?code=xyz&state=1',
      ),
    ).toBe('sso-return');
  });

  it('still calls an unrelated origin unrelated', () => {
    expect(classifyNavigation('https://app.example.com/', 'https://ads.example.org/promo')).toBe(
      'unrelated-origin',
    );
  });

  it('accepts a full chain that returns where it started', () => {
    expect(
      isSsoFlow([
        'https://app.example.com/dashboard',
        'https://id.example.net/oauth2/authorize?client_id=abc&redirect_uri=x',
        'https://id.example.net/oauth2/consent',
        'https://app.example.com/callback?code=xyz',
      ]),
    ).toBe(true);
  });

  it('rejects a chain that wandered off to another site', () => {
    expect(
      isSsoFlow([
        'https://app.example.com/dashboard',
        'https://ads.example.org/promo',
        'https://app.example.com/dashboard',
      ]),
    ).toBe(false);
  });

  it('rejects a chain that never came back', () => {
    expect(
      isSsoFlow([
        'https://app.example.com/dashboard',
        'https://id.example.net/oauth2/authorize?client_id=abc',
      ]),
    ).toBe(false);
  });
});

describe('a second factor is never answered or dismissed', () => {
  it('sees a one-time code prompt', () => {
    expect(isMfaChallenge({ fields: [{ autocomplete: 'one-time-code' }] })).toBe(true);
  });

  it('sees a hardware key prompt with no field at all', () => {
    expect(
      isMfaChallenge({ fields: [], headingText: 'Insert your security key and touch it' }),
    ).toBe(true);
  });

  it('does not see one on an ordinary form', () => {
    expect(
      isMfaChallenge({ fields: [{ type: 'text', name: 'city' }], headingText: 'Your address' }),
    ).toBe(false);
  });
});

describe('escalation on a sign-in page', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('escalates a password field to the person rather than filling it', () => {
    const triggers = detectAuthTriggers([{ type: 'password', name: 'password' }], null);
    expect(triggers.map((trigger) => trigger.reason)).toEqual(['credential_field']);
    expect(triggers[0]?.description).toContain('does not fill credentials');
  });

  it('escalates a one-time code as both a credential and a second factor', () => {
    const triggers = detectAuthTriggers([{ autocomplete: 'one-time-code', name: 'otp' }], null);
    expect(triggers.map((trigger) => trigger.reason)).toEqual([
      'credential_field',
      'mfa_challenge',
    ]);
  });

  it('reads the fields off the live page', () => {
    document.body.innerHTML = '<input type="password" name="password" />';
    expect(detectAuthTriggers().map((trigger) => trigger.reason)).toContain('credential_field');
  });

  it('tells the agent not to answer the prompt and not to treat the redirect as a failure', () => {
    document.body.innerHTML = '<input type="password" name="password" />';
    const decision = makeEscalationDecision([], [], {}, 'greenhouse');

    expect(decision.shouldEscalate).toBe(true);
    expect(decision.agentGoal).toContain('never dismiss a second-factor prompt');
    expect(decision.agentGoal).toContain('part of the same sign-in');
  });

  it('stays quiet on a page with no sign-in at all', () => {
    document.body.innerHTML = '<input type="text" name="first_name" />';
    expect(detectAuthTriggers()).toHaveLength(0);
  });
});
