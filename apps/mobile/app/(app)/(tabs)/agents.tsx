import { useCallback, useState, useMemo } from 'react';
import { View, RefreshControl, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { Bot } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { AgentCard } from '@/src/features/agents/components/AgentCard';
import { ConnectionStatusBar } from '@/src/shared/components/ConnectionStatus';
import { useAgentStore } from '@/stores/agentStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { useThemeColors } from '@/src/ui/theme';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { FeatureUnavailable } from '@/src/shared/components/FeatureUnavailable';
import { useResponsiveLayout } from '@/src/shared/hooks/useResponsiveLayout';

/**
 * Agents tab. The unimplemented Dispatch fallback was removed; disabled
 * releases render the honest unavailable state below.
 */
export default function AgentsTabScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const agents = useAgentStore((s) => s.agents);

  const { gridColumns } = useResponsiveLayout();

  const selectAgent = useAgentStore((s) => s.selectAgent);
  const clearCompleted = useAgentStore((s) => s.clearCompleted);
  // Select the raw (stable-reference) array and filter in a memo — filtering
  // inline inside the selector returns a brand-new array on every store read,
  // which Zustand's default reference equality treats as "changed" every
  // render, causing an infinite resubscribe/re-render loop ("Maximum update
  // depth exceeded" — this exact pattern crashed app/(app)/companion/index.tsx
  // and app/(app)/agents/[id].tsx, fixed the same way there).
  const allApprovals = useAgentStore((s) => s.pendingApprovals);
  const pendingApprovals = useMemo(
    () => allApprovals.filter((r) => r.status === 'pending'),
    [allApprovals],
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

  if (!FEATURES.agents) return <FeatureUnavailable feature="Agents" />;

  return (
    <SafeAreaView
      className="flex-1"
      edges={['top']}
      style={{ backgroundColor: colors.surfaceBase }}
    >
      {/* Header */}
      <View className="flex-row items-center px-4 h-12 gap-3">
        <View className="flex-row items-center gap-2 flex-1">
          <Text variant="subheading" style={{ color: colors.textPrimary }}>
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
          <Pressable
            onPress={clearCompleted}
            className="px-3 py-1 rounded-lg"
            style={({ pressed }) => pressed && { backgroundColor: colors.surfaceHover }}
          >
            <Text className="text-[12px]" style={{ color: colors.textMuted }}>
              Clear done
            </Text>
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
          style={{ backgroundColor: colors.dangerSurface }}
        >
          <Badge label={`${pendingApprovals.length}`} color="red" />
          <Text className="text-[12px] flex-1" style={{ color: colors.agentError }}>
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
            style={{ backgroundColor: colors.accentSurface }}
          >
            <Bot size={32} color={colors.agentActive} />
          </View>
          <Text
            className="text-[15px] text-center leading-[22px]"
            style={{ color: colors.textSecondary }}
          >
            No active agents.{'\n'}Connect your desktop to see agents here.
          </Text>
        </View>
      ) : (
        <FlashList
          key={`agents-${gridColumns}`}
          data={agents}
          numColumns={gridColumns}
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
