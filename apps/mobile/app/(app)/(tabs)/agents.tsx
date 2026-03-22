import { useCallback, useState, useEffect } from 'react';
import { View, useWindowDimensions, RefreshControl, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { Bot } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { AgentCard } from '@/components/agents/AgentCard';
import { ConnectionStatusBar } from '@/components/shared/ConnectionStatus';
import { useAgentStore } from '@/stores/agentStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { colors } from '@/lib/theme';

/**
 * Agents tab -- redirects to Dispatch when no agents are active.
 * When agents are running, shows the full agent grid with monitoring.
 */
export default function AgentsTabScreen() {
  const router = useRouter();
  const agents = useAgentStore((s) => s.agents);

  // Redirect to Dispatch when no agents are active
  useEffect(() => {
    if (agents.length === 0) {
      router.replace('/(app)/dispatch' as Parameters<typeof router.replace>[0]);
    }
  }, [agents.length, router]);
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const numColumns = isTablet ? 3 : 2;

  const selectAgent = useAgentStore((s) => s.selectAgent);
  const clearCompleted = useAgentStore((s) => s.clearCompleted);
  const pendingApprovals = useAgentStore((s) =>
    s.pendingApprovals.filter((r) => r.status === 'pending'),
  );

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
    sendControl('request_agents_refresh');
    setTimeout(() => setRefreshing(false), 1500);
  }, [connectionStatus, sendControl]);

  return (
    <SafeAreaView className="flex-1 bg-surface-base" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center px-4 h-12 gap-3">
        <View className="flex-row items-center gap-2 flex-1">
          <Text variant="subheading" className="text-white">
            Agents
          </Text>
          {agents.length > 0 && (
            <Badge
              label={activeCount > 0 ? `${activeCount} active` : `${agents.length}`}
              color={activeCount > 0 ? 'blue' : 'gray'}
            />
          )}
        </View>

        {agents.some((a) => a.status === 'completed') && (
          <Pressable onPress={clearCompleted} className="px-3 py-1 rounded-lg active:bg-white/5">
            <Text className="text-[12px] text-white/40">Clear done</Text>
          </Pressable>
        )}
      </View>

      {/* Connection status */}
      <View className="px-4 mb-2">
        <ConnectionStatusBar />
      </View>

      {/* Pending approvals banner */}
      {pendingApprovals.length > 0 && (
        <Pressable
          onPress={() => router.push('/(app)/agents' as Parameters<typeof router.push>[0])}
          className="mx-4 mb-2 px-3 py-2 rounded-lg flex-row items-center gap-2"
          style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)' }}
        >
          <Badge label={`${pendingApprovals.length}`} color="red" />
          <Text className="text-[12px] text-red-400 flex-1">
            {pendingApprovals.length === 1
              ? '1 action needs approval'
              : `${pendingApprovals.length} actions need approval`}
          </Text>
        </Pressable>
      )}

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
