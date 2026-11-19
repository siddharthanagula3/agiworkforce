import { useEffect } from 'react';
import { Platform } from 'react-native';
import { addRevokeListener } from 'expo-apple-authentication';
import { useAuthStore } from '@/src/features/auth/store';

export function AppleRevokeListener() {
  const signedIn = useAuthStore((state) => state.isClerkSignedIn);

  useEffect(() => {
    if (Platform.OS !== 'ios' || !signedIn) return undefined;
    let subscription: ReturnType<typeof addRevokeListener> | undefined;
    try {
      subscription = addRevokeListener(() => {
        useAuthStore
          .getState()
          .signOut()
          .catch((err: unknown) => {
            console.warn('[auth] could not sign out after Sign in with Apple was revoked:', err);
          });
      });
    } catch (err) {
      console.warn('[auth] Sign in with Apple revoke listener unavailable:', err);
    }
    return () => subscription?.remove?.();
  }, [signedIn]);

  return null;
}
