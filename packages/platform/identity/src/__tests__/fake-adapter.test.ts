import { describe, expect, it } from 'vitest';

import { createFakeIdentityProvider } from '../testing';

describe('fake identity provider', () => {
  it('answers the request auth the test signed in', async () => {
    const provider = createFakeIdentityProvider().signIn({
      subject: 'user_1',
      sessionId: 'sess_1',
      organizationId: 'org_1',
      organizationRole: 'org:admin',
      token: 'jwt',
    });

    const auth = await provider.currentRequestAuth();
    expect(auth).toMatchObject({ subject: 'user_1', sessionId: 'sess_1', isSignedIn: true });
    await expect(auth.getToken()).resolves.toBe('jwt');
  });

  it('verifies the token that sign-in minted and rejects any other', async () => {
    const provider = createFakeIdentityProvider().signIn({ subject: 'user_1', token: 'jwt' });
    const parties = provider.authorizedParties();

    await expect(
      provider.verifySessionToken('jwt', { authorizedParties: parties }),
    ).resolves.toMatchObject({ subject: 'user_1' });
    await expect(
      provider.verifySessionToken('other', { authorizedParties: parties }),
    ).resolves.toBeNull();
  });

  it('records the destructive calls a test needs to assert on', async () => {
    const provider = createFakeIdentityProvider().setUser({ id: 'user_1' });
    await provider.deleteUser('user_1');
    await provider.setUserSuspended('user_2', true);
    await provider.revokeSession('sess_1');

    expect(provider.calls.deletedUsers).toEqual(['user_1']);
    expect(provider.calls.suspendedUsers).toEqual([{ userId: 'user_2', suspended: true }]);
    expect(provider.calls.revokedSessions).toEqual(['sess_1']);
    await expect(provider.getUser('user_1')).resolves.toBeNull();
  });

  it('signs out and resets back to an empty world', async () => {
    const provider = createFakeIdentityProvider()
      .signIn({ subject: 'user_1' })
      .setUser({ id: 'u' });
    provider.reset();
    await expect(provider.currentRequestAuth()).resolves.toMatchObject({ isSignedIn: false });
    await expect(provider.getUser('u')).resolves.toBeNull();
  });
});
