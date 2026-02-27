import { useState, useEffect, useCallback } from 'react';
import { View, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, DrawerActions } from '@react-navigation/native';
import Animated, {
  FadeIn,
  SlideInDown,
} from 'react-native-reanimated';
import {
  Menu,
  QrCode,
  Monitor,
  Wifi,
  WifiOff,
  Unlink,
  RefreshCw,
  Cpu,
  HardDrive,
} from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { QRScanner } from '@/components/companion/QRScanner';
import { PairingStatus } from '@/components/companion/PairingStatus';
import { AgentDashboard } from '@/components/companion/AgentDashboard';
import { useConnectionStore } from '@/stores/connectionStore';
import {
  startHealthChecks,
  stopHealthChecks,
  requestAgentRefresh,
} from '@/services/companion';
import { colors } from '@/lib/theme';

export default function CompanionScreen() {
  const navigation = useNavigation();
  const [showScanner, setShowScanner] = useState(false);

  const {
    status,
    desktopName,
    desktopMetadata,
    error,
    pairingCode,
    connect,
    disconnect,
    clearError,
  } = useConnectionStore();

  // Start/stop health checks based on connection status
  useEffect(() => {
    if (status === 'connected') {
      startHealthChecks();
      // Request initial agent list
      requestAgentRefresh();
    } else {
      stopHealthChecks();
    }
    return () => {
      stopHealthChecks();
    };
  }, [status]);

  const handleScan = useCallback(
    (code: string) => {
      setShowScanner(false);
      connect(code);
    },
    [connect],
  );

  const handleDisconnect = useCallback(() => {
    Alert.alert(
      'Disconnect',
      `Are you sure you want to disconnect from ${desktopName ?? 'Desktop'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: disconnect,
        },
      ],
    );
  }, [disconnect, desktopName]);

  const handleRetry = useCallback(() => {
    clearError();
    if (pairingCode) {
      connect(pairingCode);
    } else {
      setShowScanner(true);
    }
  }, [clearError, pairingCode, connect]);

  // Full-screen QR scanner
  if (showScanner) {
    return <QRScanner onScan={handleScan} onClose={() => setShowScanner(false)} />;
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-base">
      {/* Header */}
      <View className="flex-row items-center px-4 h-12">
        <Pressable
          onPress={() => navigation.dispatch(DrawerActions.toggleDrawer())}
          className="p-2 -ml-2 rounded-lg active:bg-white/5"
        >
          <Menu size={22} color={colors.textSecondary} />
        </Pressable>
        <Text variant="subheading" className="ml-2 flex-1">
          Desktop Companion
        </Text>
        {status === 'connected' && (
          <Pressable
            onPress={() => requestAgentRefresh()}
            className="p-2 rounded-lg active:bg-white/5"
            accessibilityLabel="Refresh agents"
          >
            <RefreshCw size={18} color={colors.textSecondary} />
          </Pressable>
        )}
      </View>

      {/* Connection status bar */}
      <View className="px-4 mb-3">
        <PairingStatus
          status={status}
          desktopName={desktopName}
          error={error}
        />
      </View>

      {/* Content based on connection state */}
      {status === 'disconnected' && (
        <DisconnectedView onScanPress={() => setShowScanner(true)} />
      )}
      {status === 'connecting' && <ConnectingView />}
      {status === 'error' && <ErrorView error={error} onRetry={handleRetry} />}
      {status === 'connected' && (
        <ConnectedView
          desktopName={desktopName}
          desktopMetadata={desktopMetadata}
          onDisconnect={handleDisconnect}
        />
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Disconnected State
// ---------------------------------------------------------------------------

function DisconnectedView({ onScanPress }: { onScanPress: () => void }) {
  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      className="flex-1 items-center justify-center px-8"
    >
      <View className="w-24 h-24 rounded-3xl bg-white/5 items-center justify-center mb-6">
        <QrCode size={44} color={colors.teal} />
      </View>

      <Text variant="heading" className="text-center mb-2">
        Pair with Desktop
      </Text>
      <Text className="text-white/50 text-center text-sm mb-8 leading-5">
        Scan the QR code shown in your AGI Workforce desktop app to connect and
        control your agents remotely.
      </Text>

      <Button
        title="Scan QR Code"
        variant="primary"
        size="lg"
        onPress={onScanPress}
        className="w-full mb-3"
      />

      <View className="flex-row items-center gap-3 mt-6 px-4">
        <View className="flex-1 h-px bg-white/10" />
        <Text className="text-xs text-white/30">HOW IT WORKS</Text>
        <View className="flex-1 h-px bg-white/10" />
      </View>

      <View className="mt-5 gap-4 w-full">
        <StepRow number={1} text="Open AGI Workforce on your desktop" />
        <StepRow number={2} text='Go to Settings and select "Mobile Companion"' />
        <StepRow number={3} text="Scan the QR code displayed on screen" />
      </View>
    </Animated.View>
  );
}

function StepRow({ number, text }: { number: number; text: string }) {
  return (
    <View className="flex-row items-center gap-3">
      <View className="w-7 h-7 rounded-full bg-teal-500/20 items-center justify-center">
        <Text className="text-xs font-bold text-teal-400">{number}</Text>
      </View>
      <Text className="text-sm text-white/60 flex-1">{text}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Connecting State
// ---------------------------------------------------------------------------

function ConnectingView() {
  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      className="flex-1 items-center justify-center px-8"
    >
      <View className="w-20 h-20 rounded-2xl bg-amber-500/10 items-center justify-center mb-6">
        <Wifi size={36} color={colors.agentWarning} />
      </View>

      <Text variant="subheading" className="text-center mb-2">
        Connecting to Desktop...
      </Text>
      <Text className="text-white/50 text-center text-sm">
        Make sure AGI Workforce is open on your desktop and both devices are on
        the same network.
      </Text>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Error State
// ---------------------------------------------------------------------------

function ErrorView({
  error,
  onRetry,
}: {
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      className="flex-1 items-center justify-center px-8"
    >
      <View className="w-20 h-20 rounded-2xl bg-red-500/10 items-center justify-center mb-6">
        <WifiOff size={36} color={colors.agentError} />
      </View>

      <Text variant="subheading" className="text-center mb-2">
        Connection Failed
      </Text>
      <Text className="text-white/50 text-center text-sm mb-6">
        {error ?? 'Unable to connect to the desktop.'}
      </Text>

      <Button
        title="Try Again"
        variant="primary"
        size="md"
        onPress={onRetry}
        className="w-48"
      />
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Connected State
// ---------------------------------------------------------------------------

interface ConnectedViewProps {
  desktopName: string | null;
  desktopMetadata: Record<string, unknown> | null;
  onDisconnect: () => void;
}

function ConnectedView({
  desktopName,
  desktopMetadata,
  onDisconnect,
}: ConnectedViewProps) {
  return (
    <Animated.View
      entering={SlideInDown.duration(300).springify()}
      className="flex-1"
    >
      {/* Desktop info card */}
      <View className="px-4 mb-3">
        <Card variant="elevated">
          <View className="flex-row items-center gap-3 mb-3">
            <View className="w-10 h-10 rounded-xl bg-teal-500/20 items-center justify-center">
              <Monitor size={20} color={colors.teal} />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-medium text-white">
                {desktopName ?? 'Desktop'}
              </Text>
              <Text className="text-xs text-white/40">
                {desktopMetadata?.platform
                  ? `${desktopMetadata.platform}`
                  : 'Connected'}
                {desktopMetadata?.version
                  ? ` v${desktopMetadata.version}`
                  : ''}
              </Text>
            </View>
            <Badge label="Paired" color="teal" />
          </View>

          {/* Desktop system info */}
          {desktopMetadata?.os != null && (
            <>
              <Separator className="my-2" />
              <View className="flex-row items-center gap-4">
                <View className="flex-row items-center gap-1.5">
                  <Cpu size={12} color={colors.textMuted} />
                  <Text className="text-[10px] text-white/40">
                    {String(desktopMetadata.os)}
                  </Text>
                </View>
                {desktopMetadata.arch != null && (
                  <View className="flex-row items-center gap-1.5">
                    <HardDrive size={12} color={colors.textMuted} />
                    <Text className="text-[10px] text-white/40">
                      {String(desktopMetadata.arch)}
                    </Text>
                  </View>
                )}
              </View>
            </>
          )}
        </Card>
      </View>

      {/* Agent dashboard (fills remaining space) */}
      <View className="flex-1">
        <AgentDashboard />
      </View>

      {/* Disconnect button at bottom */}
      <View className="px-4 pb-4 pt-2">
        <Pressable
          onPress={onDisconnect}
          className="flex-row items-center justify-center gap-2 py-3 rounded-xl bg-red-500/10 active:bg-red-500/20"
        >
          <Unlink size={16} color={colors.agentError} />
          <Text className="text-sm text-red-400 font-medium">Disconnect</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}
