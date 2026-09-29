import { useCallback } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { CodeSessionView } from '@/src/features/companion/components/CodeSessionView';
import { manualReconnect } from '@/services/companion';
import { useConnectionStore } from '@/stores/connectionStore';
import { useThemeColors } from '@/src/ui/theme';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { FeatureUnavailable } from '@/src/shared/components/FeatureUnavailable';

const OFFLINE_EXPLANATION =
  'Remote access stops while the computer is asleep, offline, or has AGI Workforce closed. The session stays on the computer, and you can follow it again once it is back.';
const UNPAIRED_EXPLANATION =
  'This phone is no longer paired with a computer. Pair again from the computer to follow its sessions.';

function DesktopUnavailable({ onPair }: { onPair: () => void }) {
  const colors = useThemeColors();
  const status = useConnectionStore((state) => state.status);
  const paired = useConnectionStore((state) => state.pairingCode !== null);
  const computer = useConnectionStore((state) => state.desktopName) ?? 'Desktop';

  if (status === 'connecting' || status === 'reconnecting' || status === 'stale') {
    return (
      <View className="flex-1 items-center justify-center gap-3 px-8">
        <ActivityIndicator
          size="small"
          color={colors.teal}
          accessibilityLabel={`Reconnecting to ${computer}`}
        />
        <Text className="text-center" style={{ color: colors.textSecondary }}>
          {`Reconnecting to ${computer}…`}
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 items-center justify-center gap-3 px-8">
      <Text variant="subheading" className="text-center">
        {paired ? `${computer} is offline` : 'Not paired with a computer'}
      </Text>
      <Text className="text-center" style={{ color: colors.textSecondary }}>
        {paired ? OFFLINE_EXPLANATION : UNPAIRED_EXPLANATION}
      </Text>
      <Button
        title={paired ? 'Reconnect' : 'Pair with Desktop'}
        variant="secondary"
        onPress={paired ? manualReconnect : onPair}
      />
    </View>
  );
}

export default function CodeSessionScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { threadId, rootId, approvalId } = useLocalSearchParams<{
    threadId: string;
    rootId: string;
    approvalId?: string;
  }>();
  const connected = useConnectionStore((state) => state.status === 'connected');

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/companion' as Parameters<typeof router.replace>[0]);
  }, [router]);

  const handlePair = useCallback(() => {
    router.replace('/(app)/companion' as Parameters<typeof router.replace>[0]);
  }, [router]);

  if (!FEATURES.companion) return <FeatureUnavailable feature="Remote" />;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.surfaceBase }}>
      <View className="flex-row items-center px-3 h-12">
        <PressableBox
          onPress={handleBack}
          className="p-2 rounded-lg active:bg-white/5"
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ArrowLeft size={20} color={colors.textSecondary} />
        </PressableBox>
        <Text variant="subheading" className="ml-2 flex-1">
          AGI Code
        </Text>
      </View>
      {connected && threadId && rootId ? (
        <CodeSessionView
          rootId={rootId}
          threadId={threadId}
          {...(approvalId ? { focusApprovalId: approvalId } : {})}
        />
      ) : (
        <DesktopUnavailable onPair={handlePair} />
      )}
    </SafeAreaView>
  );
}
