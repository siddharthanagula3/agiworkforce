import { useState, useEffect, useCallback } from 'react';
import { View, Pressable, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import {
  ArrowLeft,
  QrCode,
  Monitor,
  Wifi,
  WifiOff,
  Unlink,
  RefreshCw,
  Cpu,
  HardDrive,
  AlertTriangle,
  Clock,
  RotateCcw,
  SignalZero,
  HelpCircle,
} from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { QRScanner } from '@/components/companion/QRScanner';
import { PairingStatus } from '@/components/companion/PairingStatus';
import { AgentDashboard } from '@/components/companion/AgentDashboard';
import {
  CompanionDemoWalkthrough,
  useDemoStore,
} from '@/components/companion/CompanionDemoWalkthrough';
import { ApprovalModal, useApprovalModal } from '@/components/shared/ApprovalModal';
import { useConnectionStore } from '@/stores/connectionStore';
import { useAgentStore } from '@/stores/agentStore';
import {
  startHealthChecks,
  stopHealthChecks,
  requestAgentRefresh,
  manualReconnect,
} from '@/services/companion';
import { setupCompanionNotifications } from '@/services/companionNotifications';
import { startMobileHeartbeat, logApprovalDecision } from '@/services/heartbeat';
import { supabase } from '@/services/supabase';
import { colors } from '@/lib/theme';

export default function CompanionScreen() {
  const router = useRouter();
  // MOB-PAIRINGCODE-ORPHAN fix: read pairingCode pushed by deep-link handler
  // in _layout.tsx (`router.push('/(app)/companion?pairingCode=...')`).
  const { pairingCode: deepLinkCode } = useLocalSearchParams<{ pairingCode?: string }>();
  const [showScanner, setShowScanner] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const hasSeenDemo = useDemoStore((s) => s.hasSeenDemo);
  const {
    currentApproval,
    showApproval,
    handleApprove: approvalModalApprove,
    handleReject: approvalModalReject,
    handleDismiss: approvalModalDismiss,
  } = useApprovalModal();

  // Auto-show approval modal for the first pending approval
  const pendingApprovals = useAgentStore((s) =>
    s.pendingApprovals.filter((r) => r.status === 'pending'),
  );
  useEffect(() => {
    if (pendingApprovals.length > 0 && !currentApproval) {
      showApproval(pendingApprovals[0]);
    }
  }, [pendingApprovals, currentApproval, showApproval]);

  const {
    status,
    desktopName,
    desktopMetadata,
    error,
    pairingCode,
    reconnectCountdown,
    lastHeartbeatAt,
    lastHeartbeatLatencyMs,
    connectionQuality,
    connect,
    disconnect,
    clearError,
  } = useConnectionStore();

  // MOB-PAIRINGCODE-ORPHAN fix: auto-connect when a pairingCode param is
  // present (deep-link flow). Status guard prevents double-connect on re-render.
  useEffect(() => {
    if (deepLinkCode && status === 'disconnected') {
      connect(deepLinkCode);
    }
  }, [deepLinkCode, status, connect]);

  // Wire companion events to push notifications (runs for the lifetime of this screen)
  useEffect(() => {
    const cleanup = setupCompanionNotifications();
    return cleanup;
  }, []);

  // Start mobile surface heartbeat for the lifetime of the companion screen
  useEffect(() => {
    const stopHeartbeat = startMobileHeartbeat();
    return stopHeartbeat;
  }, []);

  // Start/stop health checks based on connection status
  useEffect(() => {
    if (status === 'connected') {
      startHealthChecks();
      // Request initial agent list
      requestAgentRefresh();
      // Show demo walkthrough on first successful connection
      if (!hasSeenDemo) {
        const timer = setTimeout(() => setShowDemo(true), 800);
        return () => {
          clearTimeout(timer);
          stopHealthChecks();
        };
      }
    } else {
      stopHealthChecks();
    }
    return () => {
      stopHealthChecks();
    };
  }, [status, hasSeenDemo]);

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

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)' as Parameters<typeof router.replace>[0]);
  }, [router]);

  const handleManualReconnect = useCallback(() => {
    manualReconnect();
  }, []);

  const handleRePair = useCallback(() => {
    setShowScanner(true);
  }, []);

  // Approval handlers with audit logging
  const handleApprove = useCallback(
    async (id: string) => {
      approvalModalApprove(id);
      const toolName = currentApproval?.toolName ?? id;
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user?.id;
      if (userId) {
        void logApprovalDecision(userId, toolName, true);
      }
    },
    [approvalModalApprove, currentApproval],
  );

  const handleReject = useCallback(
    async (id: string, reason?: string) => {
      approvalModalReject(id, reason);
      const toolName = currentApproval?.toolName ?? id;
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user?.id;
      if (userId) {
        void logApprovalDecision(userId, toolName, false, reason);
      }
    },
    [approvalModalReject, currentApproval],
  );

  // Full-screen QR scanner
  if (showScanner) {
    return <QRScanner onScan={handleScan} onClose={() => setShowScanner(false)} />;
  }

  const isConnectedOrActive =
    status === 'connected' || status === 'stale' || status === 'reconnecting';

  return (
    <SafeAreaView className="flex-1 bg-surface-base">
      {/* Header */}
      <View className="flex-row items-center px-3 h-12">
        <Pressable
          onPress={handleBack}
          className="p-2 rounded-lg active:bg-white/5"
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ArrowLeft size={20} color={colors.textSecondary} />
        </Pressable>
        <Text variant="subheading" className="ml-2 flex-1">
          Desktop Companion
        </Text>
        {/* Help button — shows walkthrough */}
        <Pressable
          onPress={() => setShowDemo(true)}
          className="p-2 rounded-lg active:bg-white/5"
          accessibilityLabel="Show companion walkthrough"
          accessibilityRole="button"
        >
          <HelpCircle size={18} color={colors.textSecondary} />
        </Pressable>
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
          connectionQuality={connectionQuality}
          latencyMs={lastHeartbeatLatencyMs}
        />
      </View>

      {/* Stale approval warning — shown inline when connected but heartbeat is old */}
      {status === 'connected' && lastHeartbeatAt !== null && (
        <StaleApprovalBanner lastHeartbeatAt={lastHeartbeatAt} />
      )}

      {/* Disconnected desktop banner — shown when stale/reconnecting */}
      {status === 'stale' && (
        <View className="mx-4 mb-3">
          <DisconnectedDesktopBanner onReconnect={handleManualReconnect} />
        </View>
      )}

      {/* Reconnecting countdown banner */}
      {status === 'reconnecting' && (
        <View className="mx-4 mb-3">
          <ReconnectingBanner countdown={reconnectCountdown} onReconnect={handleManualReconnect} />
        </View>
      )}

      {/* Content based on connection state */}
      {status === 'disconnected' && <DisconnectedView onScanPress={() => setShowScanner(true)} />}
      {status === 'connecting' && <ConnectingView />}
      {status === 'error' && <ErrorView error={error} onRetry={handleRetry} />}
      {status === 'session_expired' && <SessionExpiredView onRePair={handleRePair} />}
      {isConnectedOrActive && (
        <ConnectedView
          desktopName={desktopName}
          desktopMetadata={desktopMetadata}
          onDisconnect={handleDisconnect}
        />
      )}

      {/* Approval modal — triggered by pending approvals */}
      <ApprovalModal
        approval={currentApproval}
        onApprove={handleApprove}
        onReject={handleReject}
        onDismiss={approvalModalDismiss}
      />

      {/* Demo walkthrough — shown on first pair or from help button */}
      <CompanionDemoWalkthrough visible={showDemo} onDone={() => setShowDemo(false)} />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Stale Approval Banner
// ---------------------------------------------------------------------------

interface StaleApprovalBannerProps {
  lastHeartbeatAt: number;
}

function StaleApprovalBanner({ lastHeartbeatAt }: StaleApprovalBannerProps) {
  const STALE_THRESHOLD_MS = 90_000; // 90 seconds — 3 missed heartbeats
  const ageMs = Date.now() - lastHeartbeatAt;

  if (ageMs < STALE_THRESHOLD_MS) return null;

  const ageSeconds = Math.floor(ageMs / 1000);
  const ageLabel = ageSeconds >= 60 ? `${Math.floor(ageSeconds / 60)}m ago` : `${ageSeconds}s ago`;

  return (
    <Animated.View entering={FadeIn.duration(300)} className="mx-4 mb-3">
      <View className="flex-row items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25">
        <AlertTriangle size={14} color={colors.agentWarning} style={{ marginTop: 1 }} />
        <View className="flex-1">
          <Text className="text-xs font-semibold text-amber-400 mb-0.5">
            Approval may be outdated
          </Text>
          <Text className="text-[11px] text-amber-400/70 leading-4">
            Last desktop contact {ageLabel}. The desktop may have moved on.
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Disconnected Desktop Banner
// ---------------------------------------------------------------------------

interface DisconnectedDesktopBannerProps {
  onReconnect: () => void;
}

function DisconnectedDesktopBanner({ onReconnect }: DisconnectedDesktopBannerProps) {
  return (
    <Animated.View entering={FadeIn.duration(300)}>
      <View className="flex-row items-center gap-2.5 p-3 rounded-xl bg-red-500/10 border border-red-500/25">
        <SignalZero size={14} color={colors.agentError} />
        <View className="flex-1">
          <Text className="text-xs font-semibold text-red-400 mb-0.5">Desktop unreachable</Text>
          <Text className="text-[11px] text-red-400/70">Heartbeat missed. Auto-reconnecting.</Text>
        </View>
        <Pressable
          onPress={onReconnect}
          className="px-2.5 py-1.5 rounded-lg bg-red-500/20 active:bg-red-500/30"
          accessibilityLabel="Reconnect to desktop"
          accessibilityRole="button"
        >
          <Text className="text-xs text-red-400 font-medium">Reconnect</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Reconnecting Countdown Banner
// ---------------------------------------------------------------------------

interface ReconnectingBannerProps {
  countdown: number;
  onReconnect: () => void;
}

function ReconnectingBanner({ countdown, onReconnect }: ReconnectingBannerProps) {
  return (
    <Animated.View entering={FadeIn.duration(300)}>
      <View className="flex-row items-center gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25">
        <Clock size={14} color={colors.agentWarning} />
        <View className="flex-1">
          <Text className="text-xs font-semibold text-amber-400 mb-0.5">
            Reconnecting in {countdown}s
          </Text>
          <Text className="text-[11px] text-amber-400/70">Desktop connection lost.</Text>
        </View>
        <Pressable
          onPress={onReconnect}
          className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 active:bg-amber-500/30"
          accessibilityLabel="Reconnect now"
          accessibilityRole="button"
        >
          <RotateCcw size={13} color={colors.agentWarning} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Session Expired State
// ---------------------------------------------------------------------------

function SessionExpiredView({ onRePair }: { onRePair: () => void }) {
  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      className="flex-1 items-center justify-center px-8"
    >
      <View className="w-20 h-20 rounded-2xl bg-amber-500/10 items-center justify-center mb-6">
        <Clock size={36} color={colors.agentWarning} />
      </View>

      <Text variant="subheading" className="text-center mb-2">
        Session Expired
      </Text>
      <Text className="text-white/50 text-center text-sm mb-6 leading-5">
        Your pairing session has expired. Scan a new QR code from the desktop app to reconnect.
      </Text>

      <Button
        title="Scan New QR Code"
        variant="primary"
        size="lg"
        onPress={onRePair}
        className="w-full"
      />
    </Animated.View>
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
        Scan the QR code shown in your AGI Workforce desktop app to connect and control your agents
        remotely.
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
      <Text className="text-white/50 text-center text-sm mb-6">
        Make sure AGI Workforce is open on your desktop and both devices are on the same network.
      </Text>
      <ActivityIndicator size="small" color={colors.teal} />
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Error State
// ---------------------------------------------------------------------------

function ErrorView({ error, onRetry }: { error: string | null; onRetry: () => void }) {
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

      <Button title="Try Again" variant="primary" size="md" onPress={onRetry} className="w-48" />
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

function ConnectedView({ desktopName, desktopMetadata, onDisconnect }: ConnectedViewProps) {
  return (
    <Animated.View entering={SlideInDown.duration(300).springify()} className="flex-1">
      {/* Desktop info card */}
      <View className="px-4 mb-3">
        <Card variant="elevated">
          <View className="flex-row items-center gap-3 mb-3">
            <View className="w-10 h-10 rounded-xl bg-teal-500/20 items-center justify-center">
              <Monitor size={20} color={colors.teal} />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-medium text-white">{desktopName ?? 'Desktop'}</Text>
              <Text className="text-xs text-white/40">
                {desktopMetadata?.platform ? `${desktopMetadata.platform}` : 'Connected'}
                {desktopMetadata?.version ? ` v${desktopMetadata.version}` : ''}
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
                  <Text className="text-[10px] text-white/40">{String(desktopMetadata.os)}</Text>
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
