import { useCallback } from 'react';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { CodeSessionView } from '@/src/features/companion/components/CodeSessionView';
import { useConnectionStore } from '@/stores/connectionStore';
import { useThemeColors } from '@/src/ui/theme';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { FeatureUnavailable } from '@/src/shared/components/FeatureUnavailable';

export default function CodeSessionScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { threadId, rootId } = useLocalSearchParams<{ threadId: string; rootId: string }>();
  const connected = useConnectionStore((state) => state.status === 'connected');

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/companion' as Parameters<typeof router.replace>[0]);
  }, [router]);

  if (!FEATURES.companion) return <FeatureUnavailable feature="Remote" />;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.surfaceBase }}>
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
          AGI Code
        </Text>
      </View>
      {connected && threadId && rootId ? (
        <CodeSessionView rootId={rootId} threadId={threadId} />
      ) : (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-center text-sm text-white/50">
            Reconnect to Desktop to follow this session.
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}
