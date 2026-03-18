import { useCallback, useState } from 'react';
import { View, useWindowDimensions, RefreshControl, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { ArrowLeft, Bot } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { AgentCard } from '@/components/agents/AgentCard';
import { useAgentStore } from '@/stores/agentStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { colors } from '@/lib/theme';

export default function AgentsScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const numColumns = isTablet ? 3 : 2;

  const agents = useAgentStore((s) => s.agents);
  const selectAgent = useAgentStore((s) => s.selectAgent);
  const clearCompleted = useAgentStore((s) => s.clearCompleted);

  const activeCount = agents.filter((a) => a.status === 'running' || a.status === 'waiting').length;

  const handleAgentPress = useCallback(
    (id: string) => {
      selectAgent(id);
      router.push(`/(app)/agents/${id}` as Parameters<typeof router.push>[0]);
    },
    [selectAgent, router],
  );

  const sendControl = useConnectionStore((s) => s.sendControl);
  const connectionStatus = useConnectionStore((s) => s.status);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(() => {
    if (connectionStatus !== 'connected') return;
    setRefreshing(true);
    // Request the desktop to push a fresh agents snapshot
    sendControl('request_agents_refresh');
    // Auto-clear the spinner after a short delay since the response
    // arrives via the WebRTC data channel (no direct await)
    setTimeout(() => setRefreshing(false), 1500);
  }, [connectionStatus, sendControl]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)' as Parameters<typeof router.replace>[0]);
  }, [router]);

  return (
    <SafeAreaView className="flex-1 bg-surface-base">
      {/* Header */}
      <View className="flex-row items-center px-3 h-12 gap-3">
        <Pressable
          onPress={handleBack}
          className="p-2 rounded-lg active:bg-white/5"
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ArrowLeft size={20} color={colors.textSecondary} />
        </Pressable>

        <View className="flex-row items-center gap-2 flex-1">
          <Text variant="subheading" className="text-white">
            Active Agents
          </Text>
          {agents.length > 0 ? (
            <View
              className="px-2 py-0.5 rounded-full"
              style={{ backgroundColor: `${colors.agentActive}25` }}
            >
              <Text className="text-[11px] font-semibold" style={{ color: colors.agentActive }}>
                {activeCount > 0 ? activeCount : agents.length}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Clear completed button */}
        {agents.some((a) => a.status === 'completed') ? (
          <Pressable onPress={clearCompleted} className="px-3 py-1 rounded-lg active:bg-white/5">
            <Text className="text-[12px] text-white/40">Clear done</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Agent grid or empty state */}
      {agents.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <View
            className="w-16 h-16 rounded-2xl items-center justify-center mb-4"
            style={{ backgroundColor: `${colors.agentActive}15` }}
          >
            <Bot size={32} color={colors.agentActive} />
          </View>
          <Text className="text-[15px] text-white/60 text-center leading-[22px]">
            No active agents.{'\n'}Connect your desktop to see agents here.
          </Text>
        </View>
      ) : (
        <FlashList
          data={agents}
          numColumns={numColumns}
          contentContainerStyle={{ padding: 12 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.teal}
            />
          }
          renderItem={({ item, index }) => (
            <View className="flex-1 p-1.5">
              <AgentCard agent={item} index={index} onPress={handleAgentPress} />
            </View>
          )}
          keyExtractor={(item) => item.id}
        />
      )}
    </SafeAreaView>
  );
}
