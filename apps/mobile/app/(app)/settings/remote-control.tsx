import { useCallback } from 'react';
import { Alert, View } from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import { useRouter } from 'expo-router';
import {
  Check,
  Laptop,
  MonitorSmartphone,
  QrCode,
  RotateCcw,
  Sparkles,
  Unlink,
} from 'lucide-react-native';
import { PRODUCT_NAMES, canUseBillingPlanCapability } from '@agiworkforce/types';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { SettingsGroup, SettingsRow, SettingsScreenShell } from '@/src/features/settings/common';
import { offlineStatusLine } from '@/src/features/companion/components/StatusBanners';
import { useConnectionStore, type ConnectionStatus } from '@/stores/connectionStore';
import { manualReconnect } from '@/services/companion';
import { useTierStore } from '@/src/features/billing/store';
import {
  REMOTE_FOLLOW_UP_BEHAVIORS,
  useRemoteCodePreferences,
  type RemoteFollowUpBehavior,
} from '@/src/features/companion/remote-code/store';

const PAID_PLANS_ONLY = 'Remote Control comes with paid plans.';

const FOLLOW_UP_OPTIONS: Record<RemoteFollowUpBehavior, { label: string; description: string }> = {
  queue: { label: 'Queue', description: 'Send after the current turn finishes.' },
  steer: { label: 'Steer', description: 'Stop the current turn and send now.' },
};

function FollowUpBehaviorPicker() {
  const colors = useThemeColors();
  const value = useRemoteCodePreferences((s) => s.followUpBehavior);
  const setValue = useRemoteCodePreferences((s) => s.setFollowUpBehavior);
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Follow-up behavior">
      {REMOTE_FOLLOW_UP_BEHAVIORS.map((behavior, index) => {
        const option = FOLLOW_UP_OPTIONS[behavior];
        const selected = value === behavior;
        return (
          <PressableBox
            key={behavior}
            onPress={() => setValue(behavior)}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={`${option.label}. ${option.description}`}
            style={{
              minHeight: 60,
              paddingHorizontal: 14,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              borderBottomWidth: index === REMOTE_FOLLOW_UP_BEHAVIORS.length - 1 ? 0 : 1,
              borderBottomColor: colors.border,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{ color: colors.textPrimary, fontSize: typeScale.body, fontWeight: '600' }}
              >
                {option.label}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: typeScale.footnote, marginTop: 2 }}>
                {option.description}
              </Text>
            </View>
            {selected ? <Check size={18} color={colors.textPrimary} /> : null}
          </PressableBox>
        );
      })}
    </View>
  );
}

type Tone = 'success' | 'warning' | 'error' | 'muted';

function connectionSummary(
  status: ConnectionStatus,
  paired: boolean,
  lastSeenAt: number | null,
): { label: string; tone: Tone } {
  switch (status) {
    case 'connected':
      return { label: 'Connected', tone: 'success' };
    case 'connecting':
      return { label: 'Connecting…', tone: 'warning' };
    case 'stale':
    case 'reconnecting':
      return { label: 'Reconnecting…', tone: 'warning' };
    case 'session_expired':
      return { label: 'Session expired', tone: 'error' };
    case 'error':
      return { label: 'Connection error', tone: 'error' };
    case 'disconnected':
    default:
      return paired
        ? { label: offlineStatusLine(lastSeenAt), tone: 'muted' }
        : { label: 'Not connected', tone: 'muted' };
  }
}

function SectionHeader({ children }: { children: string }) {
  const colors = useThemeColors();
  return (
    <Text
      accessibilityRole="header"
      style={{
        color: colors.textMuted,
        fontSize: typeScale.footnote,
        fontWeight: '600',
        marginBottom: 8,
        paddingHorizontal: 2,
      }}
    >
      {children}
    </Text>
  );
}

export default function RemoteControlSettingsScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const status = useConnectionStore((s) => s.status);
  const desktopName = useConnectionStore((s) => s.desktopName);
  const pairingCode = useConnectionStore((s) => s.pairingCode);
  const lastHeartbeatAt = useConnectionStore((s) => s.lastHeartbeatAt);
  const disconnect = useConnectionStore((s) => s.disconnect);
  const tier = useTierStore((s) => s.tier);
  const tierKnown = useTierStore((s) => s.lastRefreshedAt !== null);

  const paired = pairingCode !== null;
  const active = status === 'connected' || status === 'stale' || status === 'reconnecting';
  const summary = connectionSummary(status, paired, lastHeartbeatAt);
  const toneColor: Record<Tone, string> = {
    success: colors.agentSuccess,
    warning: colors.agentWarning,
    error: colors.agentError,
    muted: colors.textMuted,
  };
  const name = desktopName ?? (paired ? 'Desktop' : 'No computer paired');
  const needsUpgrade =
    tierKnown && !paired && !active && !canUseBillingPlanCapability(tier, 'remote_control');

  const openRemote = useCallback(() => {
    router.push('/(app)/companion' as Parameters<typeof router.push>[0]);
  }, [router]);

  const openPlans = useCallback(() => {
    router.push('/(app)/settings/plans' as Parameters<typeof router.push>[0]);
  }, [router]);

  const confirmDisconnect = useCallback(() => {
    Alert.alert(
      `Disconnect from ${desktopName ?? 'Desktop'}?`,
      'This ends the pairing. To connect again, scan a new QR code on the computer.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Disconnect', style: 'destructive', onPress: disconnect },
      ],
    );
  }, [desktopName, disconnect]);

  return (
    <SettingsScreenShell title="Remote control">
      <SectionHeader>Connection</SectionHeader>
      <SettingsGroup>
        <View
          testID="remote-control-device"
          accessibilityLabel={`${PRODUCT_NAMES.desktop}, ${name}, ${summary.label}`}
          style={{
            minHeight: 72,
            paddingHorizontal: 14,
            paddingVertical: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          <Laptop size={22} color={colors.textSecondary} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: colors.textMuted, fontSize: typeScale.footnote }}>
              {PRODUCT_NAMES.desktop}
            </Text>
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={{ color: colors.textPrimary, fontSize: typeScale.body, fontWeight: '600' }}
            >
              {name}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <View
                testID="remote-control-status-dot"
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: toneColor[summary.tone],
                }}
              />
              <Text
                numberOfLines={1}
                style={{ color: colors.textSecondary, fontSize: typeScale.footnote }}
              >
                {summary.label}
              </Text>
            </View>
          </View>
        </View>
        {needsUpgrade ? (
          <SettingsRow label="See plans" icon={Sparkles} onPress={openPlans} isLast />
        ) : (
          <SettingsRow
            label={paired || active ? 'Open Remote' : 'Pair a computer'}
            icon={paired || active ? MonitorSmartphone : QrCode}
            onPress={openRemote}
            isLast={!(paired || active)}
          />
        )}
        {status === 'disconnected' && paired ? (
          <SettingsRow label="Reconnect" icon={RotateCcw} onPress={manualReconnect} />
        ) : null}
        {paired || active ? (
          <SettingsRow
            label="Disconnect"
            icon={Unlink}
            onPress={confirmDisconnect}
            destructive
            isLast
          />
        ) : null}
      </SettingsGroup>
      {needsUpgrade ? (
        <Text
          accessibilityRole="text"
          style={{
            color: colors.textMuted,
            fontSize: typeScale.footnote,
            marginBottom: 16,
            paddingHorizontal: 2,
          }}
        >
          {PAID_PLANS_ONLY}
        </Text>
      ) : null}
      <SectionHeader>Follow-up behavior</SectionHeader>
      <SettingsGroup>
        <FollowUpBehaviorPicker />
      </SettingsGroup>
    </SettingsScreenShell>
  );
}
