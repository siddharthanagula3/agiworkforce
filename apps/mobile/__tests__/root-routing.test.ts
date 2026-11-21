import {
  CLOUD_SIGN_IN_RETURN_PATH,
  resolveRootRedirect,
  type RootRouteInput,
} from '../src/features/auth/services/rootRouting';

const base: RootRouteInput = {
  segments: ['(app)', '(tabs)', 'chat'],
  authEnabled: true,
  isClerkLoaded: true,
  isClerkSignedIn: false,
  onboardingDone: true,
  ageGateConfirmed: true,
  signInOwedForEndedSession: false,
};

const at = (segments: string[], overrides: Partial<RootRouteInput> = {}): RootRouteInput => ({
  ...base,
  ...overrides,
  segments,
});

const AGE_GATE = { pathname: '/(public)/age-gate' };

describe('resolveRootRedirect', () => {
  describe('a device with no current adult result', () => {
    const unconfirmed = { ageGateConfirmed: false };

    it('reaches the age gate on a first launch with no account, before onboarding and Local Mode', () => {
      const firstLaunch = { ...unconfirmed, onboardingDone: false };
      expect(resolveRootRedirect(at(['(public)', 'onboarding'], firstLaunch))).toEqual(AGE_GATE);
      expect(resolveRootRedirect(at(['(app)', '(tabs)', 'chat'], firstLaunch))).toEqual(AGE_GATE);
      expect(resolveRootRedirect(at(['(public)', 'age-gate'], firstLaunch))).toBeNull();
    });

    it('cannot reach Local chat after onboarding either', () => {
      expect(resolveRootRedirect(at(['(app)', '(tabs)', 'chat'], unconfirmed))).toEqual(AGE_GATE);
      expect(resolveRootRedirect(at(['(app)', 'settings'], unconfirmed))).toEqual(AGE_GATE);
    });

    it('is gated before Clerk answers, so a slow or offline launch is gated too', () => {
      expect(
        resolveRootRedirect(
          at(['(app)', '(tabs)', 'chat'], { ...unconfirmed, isClerkLoaded: false }),
        ),
      ).toEqual(AGE_GATE);
    });

    it('is gated with auth disabled', () => {
      expect(
        resolveRootRedirect(
          at(['(app)', '(tabs)', 'chat'], { ...unconfirmed, authEnabled: false }),
        ),
      ).toEqual(AGE_GATE);
    });

    it('raises the age gate before Cloud sign-in and keeps the way back to it', () => {
      expect(resolveRootRedirect(at(['(auth)', 'login'], unconfirmed))).toEqual({
        pathname: '/(public)/age-gate',
        params: { returnTo: CLOUD_SIGN_IN_RETURN_PATH },
      });
    });

    it('gates a signed-in person too', () => {
      const signedIn = { ...unconfirmed, isClerkSignedIn: true };
      expect(resolveRootRedirect(at(['(app)', '(tabs)', 'chat'], signedIn))).toEqual(AGE_GATE);
      expect(resolveRootRedirect(at(['(auth)', 'login'], signedIn))).toEqual(AGE_GATE);
    });

    it('still lets the legal pages open', () => {
      expect(resolveRootRedirect(at(['legal', 'privacy'], unconfirmed))).toBeNull();
    });

    it('wins over a sign-in owed for an ended session', () => {
      expect(
        resolveRootRedirect(
          at(['(app)', '(tabs)', 'chat'], { ...unconfirmed, signInOwedForEndedSession: true }),
        ),
      ).toEqual(AGE_GATE);
    });
  });

  it('leaves a signed-out Local user with a current adult result alone in the app', () => {
    expect(resolveRootRedirect(at(['(app)', '(tabs)', 'chat']))).toBeNull();
  });

  it('keeps the age gate on screen once it is open', () => {
    expect(resolveRootRedirect(at(['(public)', 'age-gate']))).toBeNull();
    expect(resolveRootRedirect(at(['(public)', 'age-gate'], { isClerkSignedIn: true }))).toBeNull();
  });

  it('shows Cloud sign-in once the age gate is confirmed', () => {
    expect(resolveRootRedirect(at(['(auth)', 'login']))).toBeNull();
  });

  it('sends a finished user who lands back on onboarding into the app', () => {
    expect(resolveRootRedirect(at(['(public)', 'onboarding']))).toEqual({ pathname: '/(app)' });
    expect(resolveRootRedirect(at(['(public)', 'onboarding'], { isClerkSignedIn: true }))).toEqual({
      pathname: '/(app)',
    });
  });

  it('sends a confirmed user with no onboarding to onboarding', () => {
    expect(resolveRootRedirect(at(['(app)', '(tabs)', 'chat'], { onboardingDone: false }))).toEqual(
      { pathname: '/(public)/onboarding' },
    );
    expect(
      resolveRootRedirect(at(['(public)', 'onboarding'], { onboardingDone: false })),
    ).toBeNull();
    expect(resolveRootRedirect(at(['legal', 'privacy'], { onboardingDone: false }))).toBeNull();
    expect(
      resolveRootRedirect(
        at(['(app)', '(tabs)', 'chat'], { isClerkSignedIn: true, onboardingDone: false }),
      ),
    ).toEqual({ pathname: '/(public)/onboarding' });
    expect(
      resolveRootRedirect(
        at(['(auth)', 'login'], { isClerkSignedIn: true, onboardingDone: false }),
      ),
    ).toEqual({ pathname: '/(public)/onboarding' });
  });

  it('returns a signed-in user from the auth group to the app', () => {
    expect(resolveRootRedirect(at(['(auth)', 'login'], { isClerkSignedIn: true }))).toEqual({
      pathname: '/(app)',
    });
  });

  it('waits for Clerk before deciding anything on the Cloud paths', () => {
    expect(resolveRootRedirect(at(['(auth)', 'login'], { isClerkLoaded: false }))).toBeNull();
  });

  it('never routes a confirmed device through sign-in when auth is disabled', () => {
    expect(resolveRootRedirect(at(['(auth)', 'login'], { authEnabled: false }))).toEqual({
      pathname: '/(app)',
    });
    expect(
      resolveRootRedirect(
        at(['(app)', '(tabs)', 'chat'], { authEnabled: false, onboardingDone: false }),
      ),
    ).toEqual({ pathname: '/(public)/onboarding' });
  });

  describe('a session that ended without the person signing out', () => {
    const owed = { signInOwedForEndedSession: true };

    it('opens sign-in with the way back to Cloud chat', () => {
      expect(resolveRootRedirect(at(['(app)', '(tabs)', 'chat'], owed))).toEqual({
        pathname: CLOUD_SIGN_IN_RETURN_PATH,
        params: { postAuthIntent: 'cloud-chat' },
      });
    });

    it('stays on sign-in once it is open', () => {
      expect(resolveRootRedirect(at(['(auth)', 'login'], owed))).toBeNull();
    });

    it('waits for Clerk and yields to a session that is signed in again', () => {
      expect(
        resolveRootRedirect(at(['(app)', '(tabs)', 'chat'], { ...owed, isClerkLoaded: false })),
      ).toBeNull();
      expect(
        resolveRootRedirect(at(['(app)', '(tabs)', 'chat'], { ...owed, isClerkSignedIn: true })),
      ).toBeNull();
    });

    it('leaves first-run, legal and public screens to their own rules', () => {
      expect(
        resolveRootRedirect(at(['(app)', '(tabs)', 'chat'], { ...owed, onboardingDone: false })),
      ).toEqual({ pathname: '/(public)/onboarding' });
      expect(resolveRootRedirect(at(['legal', 'privacy'], owed))).toBeNull();
      expect(resolveRootRedirect(at(['(public)', 'age-gate'], owed))).toBeNull();
    });

    it('is not opened for a person who chose to sign out', () => {
      expect(resolveRootRedirect(at(['(app)', '(tabs)', 'chat']))).toBeNull();
    });
  });
});
