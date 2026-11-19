import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Monitor, RefreshCw, X } from 'lucide-react-native';
import type { DevicePresence } from '@agiworkforce/cloud-contracts';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
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
  const [sheet, setSheet] = useState<{
    action: ComputerSheetKind;
    name: string;
    computerId: string | null;
    pairedName: string | null;
  } | null>(null);
  const requestRevision = useRef(0);
  const capabilities = useConnectionStore((state) => state.desktopMetadata?.capabilities);
  const connect = useConnectionStore((state) => state.connect);
  const canStartSession =
    Array.isArray(capabilities) && capabilities.includes('code-session-start');

  const load = useCallback(async () => {
    const revision = ++requestRevision.current;
    setLoading(true);
    try {
      const list = await listAccountComputers();
      if (revision !== requestRevision.current) return;
      setComputers(list);
      setFailed(false);
    } catch {
      if (revision !== requestRevision.current) return;
      setFailed(true);
    } finally {
      if (revision === requestRevision.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    requestRevision.current += 1;
    setComputers(null);
    setFailed(false);
    setLoading(false);
    setSheet(null);
    if (cloudUnlocked) void load();
  }, [cloudUnlocked, clerkUserId, load]);

  useEffect(() => {
    setSheet((current) =>
      current?.action === 'start' && current.pairedName !== connectedName ? null : current,
    );
  }, [connectedName]);

  const namesake =
    connectedName === null || computers === null
      ? []
      : computers.filter((computer) => computer.name === connectedName);
  const pairedComputer = namesake.length === 1 ? (namesake[0] ?? null) : null;
  const pairedAmbiguous = namesake.length > 1;

  const openSheet = (action: ComputerSheetKind, name: string, computerId: string | null = null) => {
    if (action === 'start') void listCodeSessions();
    setSheet({ action, name, computerId, pairedName: connectedName });
  };

  if (!cloudUnlocked) return null;

  const startSheetOpen =
    sheet?.action === 'start' &&
    sheet.pairedName === connectedName &&
    (sheet.computerId === null ? pairedAmbiguous : pairedComputer?.id === sheet.computerId);

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
            <LoadingIndicator />
          )
        ) : computers.length === 0 ? (
          failed ? (
            <Text className="text-sm" style={{ color: colors.agentError }}>
              Could not refresh your computers. The last load found none.
            </Text>
          ) : (
            <Text className="text-sm text-white/50">
              No computer is signed in to this account yet. Install AGI Desktop on a computer and
              sign in there.
            </Text>
          )
        ) : (
          <View className="gap-1">
            {failed ? (
              <Text className="text-sm" style={{ color: colors.agentError }}>
                Could not refresh. This is the list from your last successful load.
              </Text>
            ) : null}
            {pairedAmbiguous && connectedName !== null ? (
              <View>
                <Pressable
                  disabled={!canStartSession}
                  onPress={canStartSession ? () => openSheet('start', connectedName) : undefined}
                  accessibilityRole={canStartSession ? 'button' : undefined}
                  accessibilityHint={canStartSession ? 'Starts a new session' : undefined}
                  className="flex-row items-center gap-2"
                  style={{ minHeight: 44 }}
                  accessibilityLabel={`${connectedName}, connected`}
                >
                  <Text className="flex-1 text-sm font-medium text-white" numberOfLines={1}>
                    {connectedName}
                  </Text>
                  <Badge label="Connected" color="blue" />
                </Pressable>
                <Text className="text-sm text-white/45">
                  More than one computer on this account has this name, so none of the rows below is
                  marked as connected.
                </Text>
              </View>
            ) : null}
            {computers.map((computer) => {
              const connected = pairedComputer?.id === computer.id;
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
                  onPress={action ? () => openSheet(action, displayName, computer.id) : undefined}
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
      {startSheetOpen && sheet ? (
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
