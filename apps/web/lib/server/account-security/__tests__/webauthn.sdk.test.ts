import { describe, expect, it } from 'vitest';

import {
  authenticationOptions,
  registrationOptions,
  toCredentialSummary,
  verifyAssertion,
  verifyRegistration,
} from '../webauthn';
import type { StoredCredential } from '../store';

const credential: StoredCredential = {
  id: 'synthetic-credential',
  credentialId: 'c3ludGhldGljLWNyZWRlbnRpYWw',
  publicKey: '',
  signCount: 0,
  transports: ['cable', 'smart-card', 'usb', 'unknown-transport'],
  deviceType: 'singleDevice',
  backedUp: false,
  name: 'Synthetic security key',
  createdAt: 0,
  lastUsedAt: null,
};

describe('installed webauthn transport compatibility', () => {
  it('preserves validated stored hints and required verification in actual SDK options', async () => {
    const registration = await registrationOptions({
      userId: 'synthetic-user',
      userName: 'synthetic',
      existing: [credential],
    });
    expect(registration.excludeCredentials).toEqual([
      {
        id: credential.credentialId,
        type: 'public-key',
        transports: ['cable', 'smart-card', 'usb'],
      },
    ]);
    expect(registration.authenticatorSelection?.userVerification).toBe('required');
    const authentication = await authenticationOptions([credential]);
    expect(authentication.allowCredentials).toEqual([
      {
        id: credential.credentialId,
        type: 'public-key',
        transports: ['cable', 'smart-card', 'usb'],
      },
    ]);
    expect(authentication.userVerification).toBe('required');
    expect(toCredentialSummary(credential)).toMatchObject({
      kind: 'security_key',
      worksAcrossDevices: true,
    });
  });

  it('refuses malformed registration and authentication responses without accepting a credential', async () => {
    await expect(
      verifyRegistration({ response: {}, expectedChallenge: 'synthetic-challenge' }),
    ).resolves.toBeNull();
    await expect(
      verifyAssertion({
        response: {},
        expectedChallenge: 'synthetic-challenge',
        credentials: [credential],
      }),
    ).resolves.toBeNull();
  });
});
