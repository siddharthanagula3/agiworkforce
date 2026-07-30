import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'expo-router';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { hasAcknowledgedContinuityOnboarding } from './continuity-onboarding';

const CONTINUITY_ROUTE = '/(app)/continuity' as const;

/**
 * Presents the continuity explanation once per Cloud owner on this device.
 *
 * The gate is mounted under the authenticated app layout, after encrypted MMKV
 * and Clerk have both hydrated. A per-session owner set prevents a dismissed
 * route from immediately re-opening when the user uses the system back action;
 * acknowledgement is only persisted by an explicit screen action.
 */
export function ContinuityOnboardingGate() {
  const router = useRouter();
  const pathname = usePathname();
  const appMode = useChatAppModeStore((state) => state.appMode);
  const isClerkSignedIn = useAuthStore((state) => state.isClerkSignedIn);
  const clerkUserId = useAuthStore((state) => state.clerkUserId);
  const presentedOwnersRef = useRef(new Set<string>());

  useEffect(() => {
    if (appMode !== 'cloud' || !isClerkSignedIn || !clerkUserId) return;
    if (pathname === '/continuity') return;
    if (presentedOwnersRef.current.has(clerkUserId)) return;
    if (hasAcknowledgedContinuityOnboarding(clerkUserId)) return;

    presentedOwnersRef.current.add(clerkUserId);
    router.push({
      pathname: CONTINUITY_ROUTE as never,
      params: { source: 'first-cloud' },
    });
  }, [appMode, clerkUserId, isClerkSignedIn, pathname, router]);

  return null;
}
