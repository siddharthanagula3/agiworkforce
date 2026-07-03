import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, RefreshCw, HelpCircle } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { QRScanner } from '@/src/features/companion/components/QRScanner';
import { PairingStatus } from '@/src/features/companion/components/PairingStatus';
import {
  CompanionDemoWalkthrough,
  useDemoStore,
} from '@/src/features/companion/components/CompanionDemoWalkthrough';
import {
  StaleApprovalBanner,
  DisconnectedDesktopBanner,
  ReconnectingBanner,
} from '@/src/features/companion/components/StatusBanners';
import {
  DisconnectedView,
  ConnectingView,
  ErrorView,
  SessionExpiredView,
} from '@/src/features/companion/components/ConnectionStateViews';
import { DesktopInfoCard } from '@/src/features/companion/components/DesktopInfoCard';
import { ApprovalModal, useApprovalModal } from '@/src/shared/components/ApprovalModal';
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
import { getCurrentUserId } from '@/services/authSession';
import { useThemeColors } from '@/src/ui/theme';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { FeatureUnavailable } from '@/src/shared/components/FeatureUnavailable';

export default function CompanionScreen() {
  const colors = useThemeColors();
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

  // Select the raw (stable-reference) array and filter in a memo — filtering
  // inline inside the selector (`s.pendingApprovals.filter(...)`) returns a
  // brand-new array on every store read, which Zustand's default reference
  // equality treats as "changed" every render, causing an infinite
  // resubscribe/re-render loop ("Maximum update depth exceeded").
  const allApprovals = useAgentStore((s) => s.pendingApprovals);
  const pendingApprovals = useMemo(
    () => allApprovals.filter((r) => r.status === 'pending'),
    [allApprovals],
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
    if (!FEATURES.companion || !FEATURES.dispatch) return;
    if (deepLinkCode && status === 'disconnected') {
      connect(deepLinkCode);
    }
  }, [deepLinkCode, status, connect]);

  useEffect(() => {
    if (!FEATURES.companion || !FEATURES.dispatch) return;
    const cleanup = setupCompanionNotifications();
    return cleanup;
  }, []);

  useEffect(() => {
    if (!FEATURES.companion || !FEATURES.dispatch) return;
    const stopHeartbeat = startMobileHeartbeat();
    return stopHeartbeat;
  }, []);

  useEffect(() => {
    if (!FEATURES.companion || !FEATURES.dispatch) return;
    if (status === 'connected') {
      startHealthChecks();
      requestAgentRefresh();
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
      if (!FEATURES.companion || !FEATURES.dispatch) return;
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
        { text: 'Disconnect', style: 'destructive', onPress: disconnect },
      ],
    );
  }, [disconnect, desktopName]);

  const handleRetry = useCallback(() => {
    if (!FEATURES.companion || !FEATURES.dispatch) return;
    clearError();
    if (pairingCode) connect(pairingCode);
    else setShowScanner(true);
  }, [clearError, pairingCode, connect]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)' as Parameters<typeof router.replace>[0]);
  }, [router]);

  const handleApprove = useCallback(
    async (id: string) => {
      approvalModalApprove(id);
      const toolName = currentApproval?.toolName ?? id;
      const userId = await getCurrentUserId();
      if (userId) void logApprovalDecision(userId, toolName, true);
    },
    [approvalModalApprove, currentApproval],
  );

  const handleReject = useCallback(
    async (id: string, reason?: string) => {
      approvalModalReject(id, reason);
      const toolName = currentApproval?.toolName ?? id;
      const userId = await getCurrentUserId();
      if (userId) void logApprovalDecision(userId, toolName, false, reason);
    },
    [approvalModalReject, currentApproval],
  );

  if (!FEATURES.companion) return <FeatureUnavailable feature="Desktop companion" />;

  if (showScanner) {
    return <QRScanner onScan={handleScan} onClose={() => setShowScanner(false)} />;
  }

  const isConnectedOrActive =
    status === 'connected' || status === 'stale' || status === 'reconnecting';

  return (
    <SafeAreaView className="flex-1 bg-surface-base">
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

      <View className="px-4 mb-3">
        <PairingStatus
          status={status}
          desktopName={desktopName}
          error={error}
          connectionQuality={connectionQuality}
          latencyMs={lastHeartbeatLatencyMs}
        />
      </View>

      {status === 'connected' && lastHeartbeatAt !== null && (
        <StaleApprovalBanner lastHeartbeatAt={lastHeartbeatAt} />
      )}

      {status === 'stale' && (
        <View className="mx-4 mb-3">
          <DisconnectedDesktopBanner onReconnect={manualReconnect} />
        </View>
      )}

      {status === 'reconnecting' && (
        <View className="mx-4 mb-3">
          <ReconnectingBanner countdown={reconnectCountdown} onReconnect={manualReconnect} />
        </View>
      )}

      {status === 'disconnected' && <DisconnectedView onScanPress={() => setShowScanner(true)} />}
      {status === 'connecting' && <ConnectingView />}
      {status === 'error' && <ErrorView error={error} onRetry={handleRetry} />}
      {status === 'session_expired' && <SessionExpiredView onRePair={() => setShowScanner(true)} />}
      {isConnectedOrActive && (
        <DesktopInfoCard
          desktopName={desktopName}
          desktopMetadata={desktopMetadata}
          onDisconnect={handleDisconnect}
        />
      )}

      <ApprovalModal
        approval={currentApproval}
        onApprove={handleApprove}
        onReject={handleReject}
        onDismiss={approvalModalDismiss}
      />

      <CompanionDemoWalkthrough visible={showDemo} onDone={() => setShowDemo(false)} />
    </SafeAreaView>
  );
}
