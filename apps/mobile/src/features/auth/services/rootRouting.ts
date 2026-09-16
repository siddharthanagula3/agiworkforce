export const CLOUD_SIGN_IN_RETURN_PATH = '/(auth)/login' as const;

const APP_PATH = '/(app)' as const;
const ONBOARDING_PATH = '/(public)/onboarding' as const;
const AGE_GATE_PATH = '/(public)/age-gate' as const;

export interface RootRouteInput {
  segments: readonly string[];
  authEnabled: boolean;
  isClerkLoaded: boolean;
  isClerkSignedIn: boolean;
  onboardingDone: boolean;
  ageGateConfirmed: boolean;
}

export type RootRedirect = {
  pathname: typeof APP_PATH | typeof ONBOARDING_PATH | typeof AGE_GATE_PATH;
  params?: { returnTo: typeof CLOUD_SIGN_IN_RETURN_PATH };
};

export function resolveRootRedirect(input: RootRouteInput): RootRedirect | null {
  const [group, screen] = input.segments;
  const inAuthGroup = group === '(auth)';
  const inPublic = group === '(public)';
  const inAgeGate = inPublic && screen === 'age-gate';
  const inLegal = group === 'legal';
  const { authEnabled, isClerkLoaded, isClerkSignedIn, onboardingDone, ageGateConfirmed } = input;
  const firstRunGate = { pathname: ageGateConfirmed ? ONBOARDING_PATH : AGE_GATE_PATH } as const;

  if (!authEnabled) {
    if (!onboardingDone && !inPublic && !inLegal) return { pathname: ONBOARDING_PATH };
    if (onboardingDone && (inAuthGroup || inPublic)) return { pathname: APP_PATH };
    return null;
  }
  if (!isClerkLoaded) return null;
  if (!isClerkSignedIn) {
    if (inAuthGroup) {
      return ageGateConfirmed
        ? null
        : { pathname: AGE_GATE_PATH, params: { returnTo: CLOUD_SIGN_IN_RETURN_PATH } };
    }
    if (!onboardingDone && !inPublic && !inLegal) return { pathname: ONBOARDING_PATH };
    if (onboardingDone && inPublic && !inAgeGate) return { pathname: APP_PATH };
    return null;
  }
  if (inAuthGroup) {
    return onboardingDone ? { pathname: APP_PATH } : firstRunGate;
  }
  if (inPublic) {
    return onboardingDone && !inAgeGate ? { pathname: APP_PATH } : null;
  }
  return onboardingDone ? null : firstRunGate;
}
