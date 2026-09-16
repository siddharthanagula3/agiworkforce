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
  ageGateConfirmed: false,
};

const at = (segments: string[], overrides: Partial<RootRouteInput> = {}): RootRouteInput => ({
  ...base,
  ...overrides,
  segments,
});

describe('resolveRootRedirect', () => {
  it('leaves a signed-out Local user alone in the app', () => {
    expect(resolveRootRedirect(at(['(app)', '(tabs)', 'chat']))).toBeNull();
  });

  it('raises the age gate when a signed-out user heads for Cloud sign-in', () => {
    expect(resolveRootRedirect(at(['(auth)', 'login']))).toEqual({
      pathname: '/(public)/age-gate',
      params: { returnTo: CLOUD_SIGN_IN_RETURN_PATH },
    });
  });

  it('keeps the age gate on screen for a signed-out user who finished onboarding', () => {
    expect(resolveRootRedirect(at(['(public)', 'age-gate']))).toBeNull();
  });

  it('keeps the age gate on screen for a signed-in user who finished onboarding', () => {
    expect(resolveRootRedirect(at(['(public)', 'age-gate'], { isClerkSignedIn: true }))).toBeNull();
  });

  it('shows Cloud sign-in once the age gate is confirmed', () => {
    expect(resolveRootRedirect(at(['(auth)', 'login'], { ageGateConfirmed: true }))).toBeNull();
  });

  it('sends a finished user who lands back on onboarding into the app', () => {
    expect(resolveRootRedirect(at(['(public)', 'onboarding']))).toEqual({ pathname: '/(app)' });
    expect(resolveRootRedirect(at(['(public)', 'onboarding'], { isClerkSignedIn: true }))).toEqual({
      pathname: '/(app)',
    });
  });

  it('sends a user with no onboarding straight to onboarding on the Local path', () => {
    expect(resolveRootRedirect(at(['(app)', '(tabs)', 'chat'], { onboardingDone: false }))).toEqual(
      { pathname: '/(public)/onboarding' },
    );
    expect(
      resolveRootRedirect(at(['(public)', 'onboarding'], { onboardingDone: false })),
    ).toBeNull();
    expect(resolveRootRedirect(at(['legal', 'privacy'], { onboardingDone: false }))).toBeNull();
  });

  it('gates the signed-in first run on age before onboarding', () => {
    expect(
      resolveRootRedirect(
        at(['(auth)', 'login'], { isClerkSignedIn: true, onboardingDone: false }),
      ),
    ).toEqual({ pathname: '/(public)/age-gate' });
    expect(
      resolveRootRedirect(
        at(['(app)', '(tabs)', 'chat'], { isClerkSignedIn: true, onboardingDone: false }),
      ),
    ).toEqual({ pathname: '/(public)/age-gate' });
    expect(
      resolveRootRedirect(
        at(['(app)', '(tabs)', 'chat'], {
          isClerkSignedIn: true,
          onboardingDone: false,
          ageGateConfirmed: true,
        }),
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

  it('never routes through the age gate when auth is disabled', () => {
    expect(resolveRootRedirect(at(['(auth)', 'login'], { authEnabled: false }))).toEqual({
      pathname: '/(app)',
    });
    expect(
      resolveRootRedirect(
        at(['(app)', '(tabs)', 'chat'], { authEnabled: false, onboardingDone: false }),
      ),
    ).toEqual({ pathname: '/(public)/onboarding' });
  });
});
