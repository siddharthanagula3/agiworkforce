import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight, Laptop, Plus } from 'lucide-react-native';
import { MOBILE_ADD_DEVICE_LABEL, MOBILE_REMOTE_SCREEN_LABEL } from '@agiworkforce/types';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { listAccountComputers, type AccountComputer } from '@/src/features/device-registry';
import { useWaitlistStore } from '@/src/features/waitlist/store';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { useConnectionStore, type ConnectionStatus } from '@/stores/connectionStore';

export type CodeDeviceState = 'connected' | 'connecting' | 'reconnecting' | 'not-connected';

export interface CodeDevice {
  key: string;
  name: string;
  state: CodeDeviceState;
}

export const CODE_DEVICE_STATE_LABELS: Readonly<Record<CodeDeviceState, string>> = {
  connected: 'Connected',
  connecting: 'Connecting',
  reconnecting: 'Reconnecting',
  'not-connected': 'Not connected',
};

export const NO_DEVICE_LINE = 'Pair a computer to see and open its coding sessions here.';

const PAIRED_DEVICE_KEY = 'paired';

function pairingState(status: ConnectionStatus): CodeDeviceState {
  if (status === 'connected') return 'connected';
  if (status === 'connecting') return 'connecting';
  if (status === 'stale' || status === 'reconnecting') return 'reconnecting';
  return 'not-connected';
}

export function codeDevices(
  computers: readonly AccountComputer[] | null,
  pairedName: string | null,
  status: ConnectionStatus,
): CodeDevice[] {
  const known = computers ?? [];
  const namesake = pairedName === null ? [] : known.filter((item) => item.name === pairedName);
  const paired = namesake.length === 1 ? (namesake[0] ?? null) : null;
  const state = pairingState(status);
  const rows: CodeDevice[] = known.map((computer) => ({
    key: computer.id,
    name: computer.name ?? 'Computer',
    state: computer === paired ? state : 'not-connected',
  }));
  if (pairedName !== null && paired === null) {
    rows.unshift({ key: PAIRED_DEVICE_KEY, name: pairedName, state });
  }
  return rows.sort(
    (a, b) => Number(b.state !== 'not-connected') - Number(a.state !== 'not-connected'),
  );
}

export const DEVICES_LOAD_FAILED_LINE = 'Your computers could not be loaded.';

type AccountComputersLoad = 'loading' | 'ready' | 'failed';

function useAccountComputers(): {
  computers: AccountComputer[] | null;
  load: AccountComputersLoad;
} {
  const cloudUnlocked = useWaitlistStore((state) => state.cloudUnlocked);
  const [computers, setComputers] = useState<AccountComputer[] | null>(null);
  const [load, setLoad] = useState<AccountComputersLoad>('loading');
  const revision = useRef(0);

  useEffect(() => {
    const current = ++revision.current;
    setComputers(null);
    setLoad(cloudUnlocked ? 'loading' : 'ready');
    if (!cloudUnlocked) return;
    listAccountComputers().then(
      (list) => {
        if (current !== revision.current) return;
        setComputers(list);
        setLoad('ready');
      },
      () => {
        if (current === revision.current) setLoad('failed');
      },
    );
  }, [cloudUnlocked]);

  return { computers, load };
}

export function CodeListSectionHeading({ children }: { children: string }) {
  const colors = useThemeColors();
  return (
    <Text
      accessibilityRole="header"
      style={{
        color: colors.textMuted,
        fontSize: typeScale.caption,
        fontWeight: '600',
        paddingHorizontal: 12,
      }}
    >
      {children}
    </Text>
  );
}

function DeviceRow({ device, onOpen }: { device: CodeDevice; onOpen: () => void }) {
  const colors = useThemeColors();
  const label = CODE_DEVICE_STATE_LABELS[device.state];
  return (
    <PressableBox
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${device.name}, ${label}`}
      accessibilityHint={`Opens ${MOBILE_REMOTE_SCREEN_LABEL}`}
      style={({ pressed }) => ({
        minHeight: 52,
        paddingHorizontal: 12,
        borderRadius: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: pressed ? colors.surfaceHover : 'transparent',
      })}
    >
      <Laptop
        testID={`code-device-icon-${device.key}`}
        size={18}
        color={device.state === 'connected' ? colors.agentSuccess : colors.textMuted}
      />
      <Text
        numberOfLines={1}
        style={{ flex: 1, color: colors.textPrimary, fontSize: typeScale.body, fontWeight: '600' }}
      >
        {device.name}
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: typeScale.footnote }}>{label}</Text>
      <ChevronRight size={16} color={colors.textMuted} />
    </PressableBox>
  );
}

function AddDevicePill({ onPress }: { onPress: () => void }) {
  const colors = useThemeColors();
  return (
    <PressableBox
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={MOBILE_ADD_DEVICE_LABEL}
      style={({ pressed }) => ({
        alignSelf: 'flex-start',
        minHeight: 44,
        borderRadius: 22,
        paddingHorizontal: 16,
        marginHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: pressed ? colors.surfaceHover : 'transparent',
      })}
    >
      <Plus size={16} color={colors.textPrimary} />
      <Text style={{ color: colors.textPrimary, fontSize: typeScale.body, fontWeight: '600' }}>
        {MOBILE_ADD_DEVICE_LABEL}
      </Text>
    </PressableBox>
  );
}

export function CodeDevicesSection() {
  const colors = useThemeColors();
  const router = useRouter();
  const status = useConnectionStore((state) => state.status);
  const pairedName = useConnectionStore((state) => state.desktopName);
  const { computers, load } = useAccountComputers();
  const devices = codeDevices(computers, pairedName, status);

  const openRemote = useCallback(() => {
    router.push('/(app)/companion' as Parameters<typeof router.push>[0]);
  }, [router]);

  if (!FEATURES.companion) return null;

  return (
    <View style={{ gap: 8, paddingBottom: 20 }}>
      <CodeListSectionHeading>Devices</CodeListSectionHeading>
      {devices.map((device) => (
        <DeviceRow key={device.key} device={device} onOpen={openRemote} />
      ))}
      {load === 'failed' ? (
        <Text
          accessibilityRole="alert"
          style={{
            color: colors.agentError,
            fontSize: typeScale.footnote,
            lineHeight: 19,
            paddingHorizontal: 12,
          }}
        >
          {DEVICES_LOAD_FAILED_LINE}
        </Text>
      ) : devices.length === 0 && load === 'ready' ? (
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: typeScale.footnote,
            lineHeight: 19,
            paddingHorizontal: 12,
          }}
        >
          {NO_DEVICE_LINE}
        </Text>
      ) : null}
      {pairingState(status) === 'not-connected' ? <AddDevicePill onPress={openRemote} /> : null}
    </View>
  );
}
