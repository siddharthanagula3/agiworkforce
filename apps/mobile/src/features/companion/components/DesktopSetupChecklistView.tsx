/**
 * Pre-pair desktop setup checklist (PAR-M28).
 *
 * Before this existed the first Dispatch screen was a "Scan QR Code" primary
 * with the three prerequisites rendered *below* it under a "HOW IT WORKS"
 * divider — scan first, read later — and no way forward at all for a user who
 * has not installed Desktop yet. Pairing hands a remote computer the right to
 * run work sent from this phone, so the prerequisites, the download path and
 * the risk disclosure all have to come before the first pairing action.
 *
 * Shown once, on first entry to the Dispatch screen; `hasSeenDispatchSetup`
 * persists the dismissal the same way `useDemoStore.hasSeenDemo` persists the
 * walkthrough, and `DisconnectedView` takes over on every later visit (it
 * carries the same checklist and the same risk disclosure).
 */
import { useCallback } from 'react';
import { Alert, Linking, Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Mail, MonitorDown } from 'lucide-react-native';
import { useUser } from '@clerk/expo';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';
import { useThemeColors } from '@/src/ui/theme';
import { PairingChecklist } from './ConnectionStateViews';
import { PairingRiskDisclosure } from './PairingRiskDisclosure';

// ---------------------------------------------------------------------------
// First-run flag
// ---------------------------------------------------------------------------

interface DispatchSetupState {
  hasSeenDispatchSetup: boolean;
  markDispatchSetupSeen: () => void;
  resetDispatchSetup: () => void;
}

export const useDispatchSetupStore = create<DispatchSetupState>()(
  persist(
    (set) => ({
      hasSeenDispatchSetup: false,
      markDispatchSetupSeen: () => set({ hasSeenDispatchSetup: true }),
      resetDispatchSetup: () => set({ hasSeenDispatchSetup: false }),
    }),
    {
      name: 'dispatch-setup-store',
      storage: createJSONStorage(() => mmkvStorage),
      // AUDIT-FIX: MMKV-RACE — same contract as companion-demo-store.
      skipHydration: true,
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[dispatch-setup-store] Hydration failed:', error);
      },
    },
  ),
);

rehydrateWhenMmkvReady(useDispatchSetupStore, 'dispatch-setup-store');

// ---------------------------------------------------------------------------
// Desktop download hand-off
// ---------------------------------------------------------------------------

/** Real route: `apps/web/app/download/page.tsx`. */
export const DESKTOP_DOWNLOAD_URL = 'https://agiworkforce.com/download';

/**
 * Builds the "email me the desktop app link" mailto. Pre-addressed to the
 * signed-in account when Clerk knows it, so the common case is one tap plus
 * Send.
 */
export function buildDesktopLinkMailto(accountEmail: string | null): string {
  const subject = encodeURIComponent('AGI Workforce for desktop');
  const body = encodeURIComponent(
    [
      'Download AGI Workforce for desktop here:',
      DESKTOP_DOWNLOAD_URL,
      '',
      'Then open it, sign in, and turn on Dispatch under Settings → Connections to generate a pairing code for your phone.',
    ].join('\n'),
  );
  return `mailto:${accountEmail ?? ''}?subject=${subject}&body=${body}`;
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

interface DesktopSetupChecklistViewProps {
  /**
   * Optional. Marking the flag seen is what advances the Dispatch screen to
   * `DisconnectedView`, so the companion route needs no handler; this exists
   * for callers that want to react to the gate being cleared.
   */
  onContinue?: () => void;
}

export function DesktopSetupChecklistView({ onContinue }: DesktopSetupChecklistViewProps = {}) {
  const colors = useThemeColors();
  // useAuthStore().user is always null in v1 — Clerk is the real signed-in user
  // source (same pattern as ErrorView in ConnectionStateViews.tsx).
  const { user } = useUser();
  const accountEmail = user?.primaryEmailAddress?.emailAddress ?? null;

  const markDispatchSetupSeen = useDispatchSetupStore((s) => s.markDispatchSetupSeen);

  const handleContinue = useCallback(() => {
    markDispatchSetupSeen();
    onContinue?.();
  }, [markDispatchSetupSeen, onContinue]);

  const handleEmailDesktopLink = useCallback(async () => {
    // A mailto: is a system-app hand-off, not an https: URL, so it cannot go
    // through the openExternalUrl allowlist (lib/safeOpenURL.ts) — same
    // exception About makes for Contact Support.
    const url = buildDesktopLinkMailto(accountEmail);
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert(
          'No mail app',
          'Set up a mail app on this device, or visit agiworkforce.com/download on your computer.',
        );
        return;
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert('Error', 'Could not open the link. Please try again.');
    }
  }, [accountEmail]);

  return (
    <Animated.View entering={FadeIn.duration(300)} className="flex-1">
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 32, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="items-center mb-6">
          <View
            className="w-20 h-20 rounded-3xl items-center justify-center mb-5"
            style={{ backgroundColor: colors.accentSurface }}
          >
            <MonitorDown size={38} color={colors.teal} />
          </View>
          <Text variant="heading" className="text-center mb-2">
            Set up Dispatch on desktop first
          </Text>
          <Text className="text-white/50 text-center text-sm leading-5">
            Dispatch sends work from this phone to your computer. Three things have to be true on
            that computer before it can pair.
          </Text>
        </View>

        {/* Steps sit ABOVE the CTA — the whole point of this screen. */}
        <PairingChecklist
          className="mb-8"
          steps={[
            'Install AGI Workforce on your computer, then open it in Managed Cloud',
            accountEmail
              ? `Sign in on that computer as ${accountEmail}`
              : 'Sign in on that computer with the account you use here',
            'Turn on Dispatch in Settings → Connections, then generate a pairing code',
          ]}
        />

        <Button
          title="Done — continue to pairing"
          variant="primary"
          size="lg"
          onPress={handleContinue}
          className="w-full"
        />

        {/* Directly beneath the pair button, before any pairing action. */}
        <PairingRiskDisclosure className="mt-4" />

        <Pressable
          onPress={() => void handleEmailDesktopLink()}
          className="flex-row items-center justify-center gap-2 mt-6 py-3 rounded-xl"
          style={{ backgroundColor: colors.accentSurface }}
          accessibilityRole="button"
          accessibilityLabel="Email me the desktop app link"
        >
          <Mail size={15} color={colors.teal} />
          <Text className="text-sm font-medium" style={{ color: colors.teal }}>
            Email me the desktop app link
          </Text>
        </Pressable>
      </ScrollView>
    </Animated.View>
  );
}
