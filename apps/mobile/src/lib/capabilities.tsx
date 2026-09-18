import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { AppState, Pressable, StyleSheet, View, type AppStateStatus } from 'react-native';
import { create } from 'zustand';
import {
  ALL_PLATFORM_CAPABILITIES,
  getPlatformCapabilities,
  isCapabilityEnabled as matrixIsCapabilityEnabled,
  type PlatformCapability,
  type SyncedAppSurface,
} from '@agiworkforce/types';
import { parseMeResponse } from '@agiworkforce/cloud-contracts';
import { api } from '@/services/api';
import { Text } from '@/components/ui/text';
import { useThemeColors, type ColorScheme } from '@/src/ui/theme';

const CapabilityContext = createContext<SyncedAppSurface>('mobile');

/**
 * The server names a capability switch `capability.<its name in snake case>`,
 * so both sides derive the key from the same `PlatformCapability` union rather
 * than keeping two lists that can drift apart.
 */
const CAPABILITY_FLAG_PREFIX = 'capability.';

export function capabilityFlagKey(capability: PlatformCapability): string {
  return `${CAPABILITY_FLAG_PREFIX}${capability.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)}`;
}

interface RemoteCapabilityState {
  switchedOff: Readonly<Record<string, boolean>>;
  loadedAt: string | null;
  refresh: () => Promise<void>;
  clear: () => void;
}

/**
 * What the platform matrix says this build can do, narrowed by what the server
 * currently allows. A capability the server says nothing about stays exactly as
 * the build shipped it, so an unreachable server never disables a working
 * feature; a capability the server has switched off is off on the next refresh,
 * with no store release in between.
 */
export const useRemoteCapabilityStore = create<RemoteCapabilityState>((set) => ({
  switchedOff: {},
  loadedAt: null,
  refresh: async () => {
    try {
      const parsed = parseMeResponse(await api.get<unknown>('/api/me?surface=mobile'));
      const switchedOff: Record<string, boolean> = {};
      for (const capability of ALL_PLATFORM_CAPABILITIES) {
        if (parsed.feature_flags[capabilityFlagKey(capability)] === false) {
          switchedOff[capability] = true;
        }
      }
      set({ switchedOff, loadedAt: new Date().toISOString() });
    } catch (error) {
      console.warn('[capabilities] refresh failed (keeping the last answer):', error);
    }
  },
  clear: () => set({ switchedOff: {}, loadedAt: null }),
}));

export function refreshRemoteCapabilities(): Promise<void> {
  return useRemoteCapabilityStore.getState().refresh();
}

export function CapabilityProvider({
  platform = 'mobile',
  children,
}: {
  platform?: SyncedAppSurface;
  children: ReactNode;
}) {
  useEffect(() => {
    void refreshRemoteCapabilities();
    // A switch thrown while the app sits in the background has to reach it on
    // the next resume, or a mitigation waits for a cold start.
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') void refreshRemoteCapabilities();
    });
    return () => subscription.remove();
  }, []);
  return <CapabilityContext.Provider value={platform}>{children}</CapabilityContext.Provider>;
}

export function useCapability(capability: PlatformCapability): boolean {
  const platform = useContext(CapabilityContext);
  const switchedOff = useRemoteCapabilityStore((state) => state.switchedOff[capability] === true);
  return matrixIsCapabilityEnabled(platform, capability) && !switchedOff;
}

export const CAPABILITY_SWITCHED_OFF_BODY =
  'It was switched off from the server while an issue is fixed. Nothing else in the app is affected, and it comes back without an update.';

export function CapabilityUnavailable({
  label,
  onDismiss,
  dismissLabel = 'Go back',
}: {
  label: string;
  onDismiss?: () => void;
  dismissLabel?: string;
}) {
  const c = useThemeColors();
  const styles = useMemo(() => createUnavailableStyles(c), [c]);
  return (
    <View style={styles.container} testID="capability.unavailable">
      <Text style={styles.title}>{label} is unavailable right now</Text>
      <Text style={styles.body}>{CAPABILITY_SWITCHED_OFF_BODY}</Text>
      {onDismiss ? (
        <Pressable
          onPress={onDismiss}
          style={styles.button}
          accessibilityRole="button"
          accessibilityLabel={dismissLabel}
        >
          <Text style={styles.buttonText}>{dismissLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function createUnavailableStyles(colors: ColorScheme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
      backgroundColor: colors.background,
    },
    title: {
      color: colors.textPrimary,
      textAlign: 'center',
      fontSize: 16,
      fontWeight: '600',
    },
    body: {
      color: colors.textSecondary,
      textAlign: 'center',
      fontSize: 14,
      lineHeight: 20,
      marginTop: 8,
    },
    button: {
      marginTop: 24,
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: 24,
      borderRadius: 12,
      backgroundColor: colors.teal,
    },
    buttonText: {
      color: colors.accentText,
      fontSize: 14,
      fontWeight: '600',
    },
  });
}

export function useCapabilities() {
  const platform = useContext(CapabilityContext);
  const switchedOff = useRemoteCapabilityStore((state) => state.switchedOff);
  return useMemo(() => {
    const effective: Record<PlatformCapability, boolean> = { ...getPlatformCapabilities(platform) };
    for (const capability of ALL_PLATFORM_CAPABILITIES) {
      if (switchedOff[capability]) effective[capability] = false;
    }
    return effective;
  }, [platform, switchedOff]);
}
