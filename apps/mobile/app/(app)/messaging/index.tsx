import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Pressable, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, DrawerActions } from '@react-navigation/native';
import type GorhomBottomSheet from '@gorhom/bottom-sheet';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Menu, MessageCircle } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { PlatformCard } from '@/components/messaging/PlatformCard';
import { PlatformSetupSheet } from '@/components/messaging/PlatformSetupSheet';
import { useMessagingStore, type MessagingPlatform } from '@/stores/messagingStore';
import { colors } from '@/lib/theme';

export default function MessagingScreen() {
  const navigation = useNavigation();
  const setupSheetRef = useRef<GorhomBottomSheet>(null);

  const {
    platforms,
    loading,
    error,
    fetchPlatforms,
    connectPlatform,
    disconnectPlatform,
    clearError,
  } = useMessagingStore();

  const [selectedPlatform, setSelectedPlatform] =
    useState<MessagingPlatform | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Initial fetch
  useEffect(() => {
    fetchPlatforms();
  }, [fetchPlatforms]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchPlatforms();
    } finally {
      setRefreshing(false);
    }
  }, [fetchPlatforms]);

  const handleConnect = useCallback(
    (platform: MessagingPlatform) => {
      clearError();
      setSelectedPlatform(platform);
      setupSheetRef.current?.snapToIndex(0);
    },
    [clearError],
  );

  const handleDisconnect = useCallback(
    (platform: MessagingPlatform) => {
      disconnectPlatform(platform.id);
    },
    [disconnectPlatform],
  );

  const handleSetupConnect = useCallback(
    async (config: Record<string, string>) => {
      if (!selectedPlatform) return;
      await connectPlatform(selectedPlatform.id, config);
    },
    [selectedPlatform, connectPlatform],
  );

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
          Messaging Platforms
        </Text>
      </View>

      {/* Subtitle */}
      <Animated.View entering={FadeIn.duration(300)} className="px-4 mb-4">
        <Text className="text-sm text-white/50 leading-5">
          Connect your messaging apps to let AI respond on your behalf
        </Text>
      </Animated.View>

      {/* Error banner */}
      {error && (
        <View className="mx-4 mb-3 bg-red-500/10 rounded-lg p-3 flex-row items-center justify-between">
          <Text className="text-sm text-red-400 flex-1">{error}</Text>
          <Pressable onPress={clearError} className="ml-2 p-1">
            <Text className="text-xs text-red-400/70">Dismiss</Text>
          </Pressable>
        </View>
      )}

      {/* Platform cards */}
      <ScrollView
        className="flex-1 px-4"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.teal}
            progressBackgroundColor={colors.surfaceElevated}
          />
        }
      >
        {platforms.map((platform) => (
          <PlatformCard
            key={platform.id}
            platform={platform}
            onConnect={() => handleConnect(platform)}
            onDisconnect={() => handleDisconnect(platform)}
          />
        ))}

        {/* Info text at bottom */}
        <View className="items-center mt-6 px-4">
          <MessageCircle size={20} color={colors.textMuted} />
          <Text className="text-xs text-white/30 text-center mt-2 leading-4">
            Connected platforms allow your AI agents to send and receive
            messages. All credentials are encrypted and stored securely.
          </Text>
        </View>
      </ScrollView>

      {/* Setup bottom sheet */}
      <PlatformSetupSheet
        sheetRef={setupSheetRef}
        platform={selectedPlatform}
        onConnect={handleSetupConnect}
      />
    </SafeAreaView>
  );
}
