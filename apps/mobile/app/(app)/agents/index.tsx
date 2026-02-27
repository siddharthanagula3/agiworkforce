import { useCallback } from 'react';
import { View, useWindowDimensions, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, DrawerActions } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { Menu, Bot } from 'lucide-react-native';
import { Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import { AgentCard } from '@/components/agents/AgentCard';
import { useAgentStore } from '@/stores/agentStore';
import { colors } from '@/lib/theme';

export default function AgentsScreen() {
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const numColumns = isTablet ? 3 : 2;

  const agents = useAgentStore((s) => s.agents);
  const selectAgent = useAgentStore((s) => s.selectAgent);

  const handleAgentPress = useCallback(
    (id: string) => {
      selectAgent(id);
      // Future: navigate to agent detail screen
    },
    [selectAgent],
  );

  const handleRefresh = useCallback(() => {
    // Agents are synced from desktop companion via WebRTC.
    // Pull-to-refresh triggers a re-request to the desktop peer.
    // This is a no-op placeholder until WebRTC companion is wired.
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-surface-base">
      {/* Header */}
      <View className="flex-row items-center px-4 h-12 gap-3">
        <Pressable
          onPress={() => navigation.dispatch(DrawerActions.toggleDrawer())}
          className="p-2 -ml-2 rounded-lg active:bg-white/5"
        >
          <Menu size={22} color={colors.textSecondary} />
        </Pressable>
        <Text variant="subheading" className="text-white">
          Agents
        </Text>
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
          estimatedItemSize={160}
          contentContainerStyle={{ padding: 12 }}
          refreshControl={
            <RefreshControl
              refreshing={false}
              onRefresh={handleRefresh}
              tintColor={colors.teal}
            />
          }
          renderItem={({ item, index }) => (
            <View className="flex-1 p-1.5">
              <AgentCard
                agent={item}
                index={index}
                onPress={handleAgentPress}
              />
            </View>
          )}
          keyExtractor={(item) => item.id}
        />
      )}
    </SafeAreaView>
  );
}
