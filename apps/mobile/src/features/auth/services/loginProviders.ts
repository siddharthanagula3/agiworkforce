import Constants from 'expo-constants';
import { resolveAuthProviders, type AuthProvider } from '@agiworkforce/client-runtime';

const APPLE_AUTHENTICATION_PLUGIN = 'expo-apple-authentication';

export function buildIncludesSignInWithApple(
  plugins: readonly unknown[] | undefined = Constants.expoConfig?.plugins,
): boolean {
  return (plugins ?? []).some(
    (plugin) => (Array.isArray(plugin) ? plugin[0] : plugin) === APPLE_AUTHENTICATION_PLUGIN,
  );
}

// App Store Guideline 4.8: an iOS build that offers a third-party login must offer
// Sign in with Apple beside it, so iOS shows either both or neither.
export function loginProvidersToRender(
  providers: readonly AuthProvider[],
  platform: string,
  appleOffered: boolean,
): readonly AuthProvider[] {
  if (platform !== 'ios') return providers.filter((provider) => provider.id !== 'apple');
  if (!appleOffered) return [];
  if (providers.some((provider) => provider.id === 'apple')) return providers;
  return [...providers, ...resolveAuthProviders('apple')];
}

interface AppleFlowResult {
  createdSessionId: string | null;
  setActive?: unknown;
  signIn?: { id?: string | null } | null;
  signUp?: { id?: string | null } | null;
}

export interface AppleAttemptIds {
  signIn: string | null | undefined;
  signUp: string | null | undefined;
}

export type AppleFlowWithoutSession = 'not_loaded' | 'cancelled' | 'incomplete';

// Clerk's iOS hook swallows the native cancel and returns no session, the same shape as an
// attempt Clerk left incomplete. Only an incomplete attempt has created a new sign-in or
// sign-up, so the attempt ids taken before the flow tell the two apart.
export function appleFlowWithoutSession(
  result: AppleFlowResult,
  before: AppleAttemptIds,
): AppleFlowWithoutSession {
  if (!result.setActive) return 'not_loaded';
  const attempted =
    (result.signIn?.id ?? undefined) !== (before.signIn ?? undefined) ||
    (result.signUp?.id ?? undefined) !== (before.signUp ?? undefined);
  return attempted ? 'incomplete' : 'cancelled';
}
