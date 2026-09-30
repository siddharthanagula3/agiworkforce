import { useEffect, useState } from 'react';
import { Alert, Modal, View } from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import * as LocalAuthentication from 'expo-local-authentication';
import { Fingerprint } from 'lucide-react-native';
import { usePathname } from 'expo-router';
import { Text } from '@/components/ui/text';
import { useBiometricFlag } from '@/lib/biometricFlagStore';
import { useAuthStore } from '@/src/features/auth/store';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
  type CloudAccountEpoch,
} from '@/src/features/auth/services/cloudAccountSession';
import { useWaitlistStore } from '@/src/features/waitlist/store';
import { hasAcknowledgedContinuityOnboarding } from '@/src/features/continuity/continuity-onboarding';
import { useThemeColors } from '@/src/ui/theme';
import { dialogPadding, typeScale } from '@/src/ui/theme/tokens';

function canOfferToAccount(account: CloudAccountEpoch | null): account is CloudAccountEpoch {
  return (
    isCloudAccountEpochCurrent(account) &&
    useAuthStore.getState().isClerkSignedIn &&
    useAuthStore.getState().clerkUserId === account.ownerId &&
    useWaitlistStore.getState().cloudUnlocked
  );
}

export function AppLockOffer() {
  const colors = useThemeColors();
  const pathname = usePathname();
  const signedIn = useAuthStore((state) => state.isClerkSignedIn);
  const clerkUserId = useAuthStore((state) => state.clerkUserId);
  const cloudUnlocked = useWaitlistStore((state) => state.cloudUnlocked);
  const hydrated = useBiometricFlag((state) => state.hydrated);
  const enabled = useBiometricFlag((state) => state.enabled);
  const prompted = useBiometricFlag((state) => state.prompted);
  const [offerAccount, setOfferAccount] = useState<CloudAccountEpoch | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (
      !signedIn ||
      !clerkUserId ||
      !cloudUnlocked ||
      !hydrated ||
      enabled ||
      prompted ||
      pathname === '/continuity' ||
      !hasAcknowledgedContinuityOnboarding(clerkUserId)
    ) {
      setOfferAccount(null);
      return;
    }
    const account = captureCloudAccountEpoch();
    if (!canOfferToAccount(account)) return;
    let cancelled = false;
    void Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ])
      .then(([hasHardware, enrolled]) => {
        if (!cancelled && hasHardware && enrolled && canOfferToAccount(account)) {
          setOfferAccount(account);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [signedIn, clerkUserId, cloudUnlocked, hydrated, enabled, prompted, pathname]);

  const visible =
    canOfferToAccount(offerAccount) &&
    pathname !== '/continuity' &&
    hasAcknowledgedContinuityOnboarding(clerkUserId ?? '') &&
    !enabled &&
    !prompted;

  const skip = async () => {
    if (!canOfferToAccount(offerAccount) || busy) return;
    setBusy(true);
    try {
      await useBiometricFlag.getState().markPrompted();
      setOfferAccount(null);
    } catch {
      Alert.alert('Could not save your choice', 'Try again or turn on App Lock in Settings.');
    } finally {
      setBusy(false);
    }
  };

  const enable = async () => {
    const account = offerAccount;
    if (!canOfferToAccount(account) || busy) return;
    setBusy(true);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Turn On AGI App Lock',
        fallbackLabel: 'Use Passcode',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });
      if (!result.success || !canOfferToAccount(account)) return;
      await useBiometricFlag.getState().setEnabled(true);
      await useBiometricFlag
        .getState()
        .markPrompted()
        .catch(() => undefined);
      setOfferAccount(null);
    } catch {
      if (canOfferToAccount(account)) {
        Alert.alert('Could not turn on App Lock', 'Secure storage is unavailable on this device.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => void skip()}>
      <View
        accessibilityViewIsModal
        style={{
          flex: 1,
          justifyContent: 'center',
          paddingHorizontal: 24,
          backgroundColor: colors.scrim,
        }}
      >
        <View
          style={{
            backgroundColor: colors.surfaceElevated,
            borderRadius: 20,
            padding: dialogPadding,
            alignItems: 'center',
            gap: 16,
          }}
        >
          <Fingerprint size={36} color={colors.teal} />
          <Text
            style={{ color: colors.textPrimary, fontSize: typeScale.title3, fontWeight: '700' }}
          >
            Protect AGI with App Lock
          </Text>
          <Text style={{ color: colors.textSecondary, textAlign: 'center', lineHeight: 21 }}>
            Use Face ID, Touch ID, or your device passcode when opening AGI. You can change this
            later in Safety &amp; Security.
          </Text>
          <PressableBox
            accessibilityRole="button"
            accessibilityLabel="Turn on App Lock"
            disabled={busy}
            onPress={() => void enable()}
            style={{
              minHeight: 48,
              alignSelf: 'stretch',
              justifyContent: 'center',
              alignItems: 'center',
              backgroundColor: colors.teal,
              borderRadius: 12,
              opacity: busy ? 0.6 : 1,
            }}
          >
            <Text style={{ color: colors.surfaceBase, fontWeight: '700' }}>
              {busy ? 'Confirming…' : 'Turn on App Lock'}
            </Text>
          </PressableBox>
          <PressableBox
            accessibilityRole="button"
            accessibilityLabel="Skip App Lock"
            disabled={busy}
            onPress={() => void skip()}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Skip for now</Text>
          </PressableBox>
        </View>
      </View>
    </Modal>
  );
}
