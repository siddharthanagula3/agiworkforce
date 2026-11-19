import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { AppState, StyleSheet, View, type AppStateStatus } from 'react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { create } from 'zustand';
import {
  ALL_PLATFORM_CAPABILITIES,
  describeCapabilityDenial,
  getPlatformCapabilities,
  isCapabilityEnabled as matrixIsCapabilityEnabled,
  resolveCapabilityDocumentDecision,
  type CapabilityDenialReason,
  type PlatformCapability,
  type SyncedAppSurface,
} from '@agiworkforce/types';
import { NATIVE_PURCHASES_AVAILABLE } from '@/src/features/billing/nativePurchaseAvailability';
import { useTierStore } from '@/src/features/billing/store';
import { parseMeResponse } from '@agiworkforce/cloud-contracts';
import { api } from '@/services/api';
import { Text } from '@/components/ui/Text';
import { useThemeColors, type ColorScheme } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useWaitlistStore } from '@/src/features/waitlist/store';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
} from '@/src/features/auth/services/cloudAccountSession';

const CapabilityContext = createContext<SyncedAppSurface>('mobile');

/**
 * The server names a capability switch `capability.<its name in snake case>`,
 * so both sides derive the key from the same `PlatformCapability` union rather
 * than keeping two lists that can drift apart.
 */
const CAPABILITY_FLAG_PREFIX = 'capability.';
let capabilityRefreshGeneration = 0;

function canRefreshRemoteCapabilities(): boolean {
  return (
    useChatAppModeStore.getState().appMode === 'cloud' &&
    useWaitlistStore.getState().cloudUnlocked &&
    captureCloudAccountEpoch() !== null
  );
}

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
    if (!canRefreshRemoteCapabilities()) return;
    const account = captureCloudAccountEpoch();
    const generation = capabilityRefreshGeneration;
    try {
      const parsed = parseMeResponse(await api.get<unknown>('/api/me?surface=mobile'));
      if (
        !isCloudAccountEpochCurrent(account) ||
        generation !== capabilityRefreshGeneration ||
        !canRefreshRemoteCapabilities()
      ) {
        return;
      }
      const switchedOff: Record<string, boolean> = {};
      for (const capability of ALL_PLATFORM_CAPABILITIES) {
        if (parsed.feature_flags[capabilityFlagKey(capability)] === false) {
          switchedOff[capability] = true;
        }
      }
      set({ switchedOff, loadedAt: new Date().toISOString() });
    } catch (error) {
      if (isCloudAccountEpochCurrent(account) && canRefreshRemoteCapabilities()) {
        console.warn('[capabilities] refresh failed (keeping the last answer):', error);
      }
    }
  },
  clear: () => {
    capabilityRefreshGeneration += 1;
    set({ switchedOff: {}, loadedAt: null });
  },
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
  const appMode = useChatAppModeStore((state) => state.appMode);
  const cloudUnlocked = useWaitlistStore((state) => state.cloudUnlocked);

  useEffect(() => {
    void refreshRemoteCapabilities();
    // A switch thrown while the app sits in the background has to reach it on
    // the next resume, or a mitigation waits for a cold start.
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') void refreshRemoteCapabilities();
    });
    return () => subscription.remove();
  }, [appMode, cloudUnlocked]);
  return <CapabilityContext.Provider value={platform}>{children}</CapabilityContext.Provider>;
}

export function useCapability(capability: PlatformCapability): boolean {
  const platform = useContext(CapabilityContext);
  const document = useTierStore((state) => state.capabilityDocument);
  const switchedOff = useRemoteCapabilityStore((state) => state.switchedOff[capability] === true);
  const decision = resolveCapabilityDocumentDecision(document, capability);
  return decision
    ? decision.allowed
    : matrixIsCapabilityEnabled(platform, capability) && !switchedOff;
}

const SWITCHED_OFF_REASON: CapabilityDenialReason = 'temporarily_unavailable';

/**
 * Why a capability is closed, or null when it is open. A plan that leaves a
 * capability out and an operator switch that pauses it both close it, and the
 * reader is owed the true one: a plan limit shown as an outage reads as a
 * broken feature.
 */
export function useCapabilityDenialReason(
  capability: PlatformCapability,
): CapabilityDenialReason | null {
  const platform = useContext(CapabilityContext);
  const document = useTierStore((state) => state.capabilityDocument);
  const switchedOff = useRemoteCapabilityStore((state) => state.switchedOff[capability] === true);
  const decision = resolveCapabilityDocumentDecision(document, capability);
  if (decision) return decision.allowed ? null : (decision.reason ?? SWITCHED_OFF_REASON);
  if (!matrixIsCapabilityEnabled(platform, capability)) return 'unsupported_by_surface';
  return switchedOff ? SWITCHED_OFF_REASON : null;
}

export const CAPABILITY_SWITCHED_OFF_BODY =
  'It’s paused while we fix an issue and will come back without an update.';

const PURCHASE_REMEDY_REASONS: ReadonlySet<CapabilityDenialReason> = new Set([
  'requires_upgrade',
  'entitlement_missing',
  'quota_exceeded',
  'payment_required',
]);

function unavailableCopy(
  label: string,
  reason: CapabilityDenialReason | null | undefined,
): { title: string; body: string } {
  if (!reason || reason === SWITCHED_OFF_REASON) {
    return { title: `${label} is unavailable right now`, body: CAPABILITY_SWITCHED_OFF_BODY };
  }
  const copy = describeCapabilityDenial(reason);
  const namesAPurchase = PURCHASE_REMEDY_REASONS.has(reason) && !NATIVE_PURCHASES_AVAILABLE;
  return {
    title: copy.title,
    body: namesAPurchase ? copy.message : `${copy.message} ${copy.suggestion}`,
  };
}

export function CapabilityUnavailable({
  label,
  reason,
  onDismiss,
  dismissLabel = 'Go back',
}: {
  label: string;
  reason?: CapabilityDenialReason | null;
  onDismiss?: () => void;
  dismissLabel?: string;
}) {
  const c = useThemeColors();
  const styles = useMemo(() => createUnavailableStyles(c), [c]);
  const copy = unavailableCopy(label, reason);
  return (
    <View style={styles.container} testID="capability.unavailable">
      <Text style={styles.title}>{copy.title}</Text>
      <Text style={styles.body}>{copy.body}</Text>
      {onDismiss ? (
        <PressableBox
          onPress={onDismiss}
          style={styles.button}
          accessibilityRole="button"
          accessibilityLabel={dismissLabel}
        >
          <Text style={styles.buttonText}>{dismissLabel}</Text>
        </PressableBox>
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
      fontSize: typeScale.callout,
      fontWeight: '600',
    },
    body: {
      color: colors.textSecondary,
      textAlign: 'center',
      fontSize: typeScale.subhead,
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
      fontSize: typeScale.subhead,
      fontWeight: '600',
    },
  });
}

export function useCapabilities() {
  const platform = useContext(CapabilityContext);
  const document = useTierStore((state) => state.capabilityDocument);
  const switchedOff = useRemoteCapabilityStore((state) => state.switchedOff);
  return useMemo(() => {
    const effective: Record<PlatformCapability, boolean> = { ...getPlatformCapabilities(platform) };
    for (const capability of ALL_PLATFORM_CAPABILITIES) {
      const decision = resolveCapabilityDocumentDecision(document, capability);
      effective[capability] = decision
        ? decision.allowed
        : effective[capability] && !switchedOff[capability];
    }
    return effective;
  }, [document, platform, switchedOff]);
}
