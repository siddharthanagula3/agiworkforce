import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Monitor, RefreshCw, X } from 'lucide-react-native';
import type { DevicePresence } from '@agiworkforce/cloud-contracts';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { listAccountComputers, type AccountComputer } from '@/src/features/device-registry';
import { useAuthStore } from '@/src/features/auth/store';
import { useWaitlistStore } from '@/src/features/waitlist/store';
import { useTheme, useThemeColors } from '@/src/ui/theme';
import { useConnectionStore } from '@/stores/connectionStore';
import { QRScanner } from './QRScanner';
import { NewCodeSession } from './CodeSessionsCard';
import { listCodeSessions } from '../remote-code/service';

const PRESENCE_LABELS: Record<DevicePresence, string> = {
  online: 'Online',
  sleeping: 'Asleep',
  offline: 'Offline',
};

const PRESENCE_COLORS: Record<DevicePresence, 'green' | 'yellow' | 'gray'> = {
  online: 'green',
  sleeping: 'yellow',
  offline: 'gray',
};

const KIND_LABELS: Record<string, string> = {
  desktop: 'Desktop app',
  cli: 'CLI',
  vscode: 'VS Code',
};

const CAPABILITY_LABELS = [
  ['remoteControl', 'Remote control'],
  ['browser', 'Browser'],
  ['computerUse', 'Computer use'],
  ['localModels', 'Local models'],
  ['localMcp', 'Local MCP'],
] as const;

function detailLine(computer: AccountComputer): string {
  return [KIND_LABELS[computer.kind] ?? computer.kind, computer.platform, computer.architecture]
    .filter((part): part is string => Boolean(part))
    .join(' · ');
}

function capabilityLine(computer: AccountComputer): string | null {
  const { capabilities } = computer;
  if (!capabilities) return null;
  const offered = CAPABILITY_LABELS.filter(([key]) => capabilities[key]).map(([, label]) => label);
  return offered.length > 0 ? offered.join(' · ') : 'Remote control off';
}

type ComputerSheetKind = 'start' | 'pair';

function SessionSheet({ name, onClose }: { name: string; onClose: () => void }) {
  const { colors, isDark } = useTheme();
  return (
    <Modal visible animationType="slide" onRequestClose={onClose} accessibilityViewIsModal>
      <SafeAreaView
        className="flex-1"
        style={{ backgroundColor: isDark ? colors.background : colors.surfaceBase }}
      >
        <View className="flex-row items-center gap-2 px-4" style={{ minHeight: 48 }}>
          <Text className="flex-1 text-sm font-medium text-white" accessibilityRole="header">
            {`New session on ${name}`}
          </Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={18} color={colors.textSecondary} />
          </Pressable>
        </View>
        <View className="px-4">
          <NewCodeSession onStarted={onClose} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

export function AccountComputersCard({ connectedName }: { connectedName: string | null }) {
  const colors = useThemeColors();
  const cloudUnlocked = useWaitlistStore((state) => state.cloudUnlocked);
  const clerkUserId = useAuthStore((state) => state.clerkUserId);
  const [computers, setComputers] = useState<AccountComputer[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sheet, setSheet] = useState<{ action: ComputerSheetKind; name: string } | null>(null);
  const capabilities = useConnectionStore((state) => state.desktopMetadata?.capabilities);
  const connect = useConnectionStore((state) => state.connect);
  const canStartSession =
    Array.isArray(capabilities) && capabilities.includes('code-session-start');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setComputers(await listAccountComputers());
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (cloudUnlocked) void load();
  }, [cloudUnlocked, clerkUserId, load]);

  const openSheet = (action: ComputerSheetKind, name: string) => {
    if (action === 'start') void listCodeSessions();
    setSheet({ action, name });
  };

  if (!cloudUnlocked) return null;

  return (
    <View className="px-4 mb-3">
      <Card variant="elevated">
        <View className="flex-row items-center gap-2 mb-1">
          <Monitor size={15} color={colors.teal} />
          <Text className="flex-1 text-sm font-medium text-white" accessibilityRole="header">
            Your computers
          </Text>
          <Pressable
            onPress={() => void load()}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Refresh your computers"
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <RefreshCw size={14} color={colors.textSecondary} />
          </Pressable>
        </View>

        {computers === null ? (
          failed ? (
            <Text className="text-sm" style={{ color: colors.agentError }}>
              Your computers could not be loaded.
            </Text>
          ) : (
            <ActivityIndicator color={colors.textSecondary} />
          )
        ) : computers.length === 0 ? (
          <Text className="text-sm text-white/50">
            No computer is signed in to this account yet. Install AGI Desktop on a computer and sign
            in there.
          </Text>
        ) : (
          <View className="gap-1">
            {computers.map((computer) => {
              const connected = connectedName !== null && computer.name === connectedName;
              const displayName = computer.name ?? 'Computer';
              const action: ComputerSheetKind | null = connected
                ? canStartSession
                  ? 'start'
                  : null
                : connectedName === null && computer.presence === 'online'
                  ? 'pair'
                  : null;
              const status = connected ? 'connected' : PRESENCE_LABELS[computer.presence];
              const hint =
                action === 'start'
                  ? 'Starts a new session'
                  : action === 'pair'
                    ? 'Scan the code shown on this computer to pair'
                    : undefined;
              return (
                <Pressable
                  key={computer.id}
                  disabled={action === null}
                  onPress={action ? () => openSheet(action, displayName) : undefined}
                  accessibilityRole={action ? 'button' : undefined}
                  accessibilityHint={hint}
                  className="flex-row items-center gap-2"
                  style={{ minHeight: 44 }}
                  accessibilityLabel={`${displayName}, ${status}`}
                >
                  <View className="flex-1">
                    <Text className="text-sm font-medium text-white" numberOfLines={1}>
                      {computer.name ?? 'Computer'}
                    </Text>
                    <Text className="text-sm text-white/45" numberOfLines={1}>
                      {detailLine(computer)}
                    </Text>
                    {capabilityLine(computer) ? (
                      <Text className="text-sm text-white/45" numberOfLines={2}>
                        {capabilityLine(computer)}
                      </Text>
                    ) : null}
                  </View>
                  <Badge
                    label={connected ? 'Connected' : PRESENCE_LABELS[computer.presence]}
                    color={connected ? 'blue' : PRESENCE_COLORS[computer.presence]}
                  />
                </Pressable>
              );
            })}
          </View>
        )}
        {connectedName === null ? (
          <Text className="mt-2 text-sm text-white/45">
            To control one, open Remote on that computer and scan its code.
          </Text>
        ) : null}
      </Card>
      {sheet?.action === 'start' ? (
        <SessionSheet name={sheet.name} onClose={() => setSheet(null)} />
      ) : null}
      {sheet?.action === 'pair' ? (
        <Modal
          visible
          animationType="slide"
          onRequestClose={() => setSheet(null)}
          accessibilityViewIsModal
        >
          <QRScanner
            onScan={(code) => {
              setSheet(null);
              connect(code);
            }}
            onClose={() => setSheet(null)}
          />
        </Modal>
      ) : null}
    </View>
  );
}
