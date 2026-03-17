import { useCallback, useEffect } from 'react';
import { View, ScrollView, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  MessageSquarePlus,
  Bot,
  Smartphone,
  ChevronRight,
  Zap,
  Clock,
  QrCode,
} from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ConnectionStatusBar } from '@/components/shared/ConnectionStatus';
import { AgentCard } from '@/components/agents/AgentCard';
import { useChatStore } from '@/stores/chatStore';
import { useAgentStore } from '@/stores/agentStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { useAuthStore } from '@/stores/authStore';
import { colors } from '@/lib/theme';

/**
 * HomeScreen -- Dashboard showing active agents, recent conversations, quick actions.
 * Serves as the landing screen for the app after sign-in.
 */
export default function HomeScreen() {
  const router = useRouter();

  const conversations = useChatStore((s) => s.conversations);
  const loadConversations = useChatStore((s) => s.loadConversations);
  const agents = useAgentStore((s) => s.agents);
  const connectionStatus = useConnectionStore((s) => s.status);
  const user = useAuthStore((s) => s.user);

  const activeAgents = agents.filter((a) => a.status === 'running' || a.status === 'waiting');
  const recentConversations = conversations.slice(0, 5);
  const pendingApprovals = useAgentStore((s) =>
    s.pendingApprovals.filter((r) => r.status === 'pending'),
  );

  const [refreshing, setRefreshing] = React.useState(false);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadConversations();
    setRefreshing(false);
  }, [loadConversations]);

  const handleNewChat = useCallback(() => {
    router.push('/(app)/chat/new' as Parameters<typeof router.push>[0]);
  }, [router]);

  const handleOpenChat = useCallback(
    (id: string) => {
      router.push(`/(app)/chat/${id}` as Parameters<typeof router.push>[0]);
    },
    [router],
  );

  const handleOpenAgents = useCallback(() => {
    router.push('/(app)/(tabs)/agents' as Parameters<typeof router.push>[0]);
  }, [router]);

  const handleOpenCompanion = useCallback(() => {
    router.push('/(app)/companion' as Parameters<typeof router.push>[0]);
  }, [router]);

  const handleOpenProfile = useCallback(() => {
    router.push('/(app)/profile' as Parameters<typeof router.push>[0]);
  }, [router]);

  return (
    <SafeAreaView className="flex-1 bg-surface-base">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 h-14">
        <View>
          <Text variant="heading">Home</Text>
          {user?.email && (
            <Text variant="caption" className="text-white/40 mt-0.5">
              {user.email}
            </Text>
          )}
        </View>
        <Pressable
          onPress={handleOpenProfile}
          className="w-9 h-9 rounded-full bg-teal-500/20 items-center justify-center"
          accessibilityLabel="Profile"
          accessibilityRole="button"
        >
          <Text className="text-sm font-bold text-teal-400">
            {user?.email?.[0]?.toUpperCase() ?? 'U'}
          </Text>
        </Pressable>
      </View>

      {/* Connection status */}
      <View className="px-4 mb-2">
        <ConnectionStatusBar />
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.teal}
          />
        }
      >
        {/* Quick Actions */}
        <Animated.View entering={FadeInDown.duration(250).delay(0)}>
          <Text variant="caption" className="uppercase tracking-wider mb-3 mt-2">
            Quick Actions
          </Text>
          <View className="flex-row gap-3">
            <QuickAction
              icon={<MessageSquarePlus size={20} color={colors.teal} />}
              label="New Chat"
              onPress={handleNewChat}
            />
            <QuickAction
              icon={<Bot size={20} color={colors.agentActive} />}
              label="Agents"
              badge={activeAgents.length > 0 ? `${activeAgents.length}` : undefined}
              onPress={handleOpenAgents}
            />
            <QuickAction
              icon={<QrCode size={20} color={colors.warmPeach} />}
              label="Pair"
              onPress={handleOpenCompanion}
            />
          </View>
        </Animated.View>

        {/* Pending Approvals */}
        {pendingApprovals.length > 0 && (
          <Animated.View entering={FadeInDown.duration(250).delay(60)}>
            <View className="flex-row items-center justify-between mt-5 mb-3">
              <Text variant="caption" className="uppercase tracking-wider">
                Pending Approvals
              </Text>
              <Badge label={`${pendingApprovals.length}`} color="red" />
            </View>
            <Card variant="outline" className="border-red-500/20">
              {pendingApprovals.slice(0, 3).map((approval, i) => (
                <View key={approval.id}>
                  {i > 0 && <Separator className="my-2" />}
                  <View className="flex-row items-center gap-2">
                    <Zap size={14} color={colors.agentWarning} />
                    <View className="flex-1">
                      <Text className="text-[13px] text-white" numberOfLines={1}>
                        {approval.toolName}
                      </Text>
                      <Text className="text-[11px] text-white/50" numberOfLines={1}>
                        {approval.description}
                      </Text>
                    </View>
                    <Badge
                      label={approval.riskLevel}
                      color={approval.riskLevel === 'high' ? 'red' : 'yellow'}
                    />
                  </View>
                </View>
              ))}
              {pendingApprovals.length > 3 && (
                <Text className="text-[11px] text-white/40 mt-2 text-center">
                  +{pendingApprovals.length - 3} more
                </Text>
              )}
            </Card>
          </Animated.View>
        )}

        {/* Active Agents */}
        {activeAgents.length > 0 && (
          <Animated.View entering={FadeInDown.duration(250).delay(120)}>
            <View className="flex-row items-center justify-between mt-5 mb-3">
              <Text variant="caption" className="uppercase tracking-wider">
                Active Agents
              </Text>
              <Pressable onPress={handleOpenAgents} className="flex-row items-center gap-1">
                <Text className="text-[11px] text-teal-400">View all</Text>
                <ChevronRight size={12} color={colors.teal} />
              </Pressable>
            </View>
            {activeAgents.slice(0, 3).map((agent, i) => (
              <View key={agent.id} className="mb-2">
                <AgentCard
                  agent={agent}
                  index={i}
                  onPress={(id) =>
                    router.push(`/(app)/agents/${id}` as Parameters<typeof router.push>[0])
                  }
                />
              </View>
            ))}
          </Animated.View>
        )}

        {/* Recent Conversations */}
        <Animated.View entering={FadeInDown.duration(250).delay(180)}>
          <View className="flex-row items-center justify-between mt-5 mb-3">
            <Text variant="caption" className="uppercase tracking-wider">
              Recent Conversations
            </Text>
          </View>
          {recentConversations.length === 0 ? (
            <Card>
              <View className="items-center py-6">
                <MessageSquarePlus size={28} color={colors.textMuted} />
                <Text className="text-white/50 text-sm mt-3">No conversations yet</Text>
                <Text className="text-white/30 text-xs mt-1">Start a new chat to get going</Text>
              </View>
            </Card>
          ) : (
            <Card>
              {recentConversations.map((conv, i) => (
                <View key={conv.id}>
                  {i > 0 && <Separator className="my-1.5" />}
                  <Pressable
                    onPress={() => handleOpenChat(conv.id)}
                    className="flex-row items-center gap-3 py-2 active:bg-white/5 rounded-lg px-1"
                    accessibilityLabel={`Open conversation: ${conv.title}`}
                    accessibilityRole="button"
                  >
                    <View className="w-8 h-8 rounded-lg bg-white/5 items-center justify-center">
                      <MessageSquarePlus size={14} color={colors.textMuted} />
                    </View>
                    <View className="flex-1">
                      <Text className="text-[13px] text-white font-medium" numberOfLines={1}>
                        {conv.title}
                      </Text>
                      {conv.lastMessage && (
                        <Text className="text-[11px] text-white/40 mt-0.5" numberOfLines={1}>
                          {conv.lastMessage}
                        </Text>
                      )}
                    </View>
                    <View className="flex-row items-center gap-1">
                      <Clock size={10} color={colors.textMuted} />
                      <Text className="text-[10px] text-white/30">
                        {formatRelativeShort(conv.updatedAt)}
                      </Text>
                    </View>
                  </Pressable>
                </View>
              ))}
            </Card>
          )}
        </Animated.View>

        {/* Desktop connection prompt */}
        {connectionStatus === 'disconnected' && (
          <Animated.View entering={FadeInDown.duration(250).delay(240)}>
            <Pressable onPress={handleOpenCompanion}>
              <Card variant="outline" className="mt-5 border-teal-500/20">
                <View className="flex-row items-center gap-3">
                  <View className="w-10 h-10 rounded-xl bg-teal-500/15 items-center justify-center">
                    <Smartphone size={20} color={colors.teal} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-medium text-white">Connect to Desktop</Text>
                    <Text className="text-xs text-white/40 mt-0.5">
                      Scan QR to control agents from your phone
                    </Text>
                  </View>
                  <ChevronRight size={16} color={colors.textMuted} />
                </View>
              </Card>
            </Pressable>
          </Animated.View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Quick Action Button
// ---------------------------------------------------------------------------

import React from 'react';

interface QuickActionProps {
  icon: React.ReactNode;
  label: string;
  badge?: string;
  onPress: () => void;
}

function QuickAction({ icon, label, badge, onPress }: QuickActionProps) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-1 items-center gap-2 py-3 rounded-xl active:opacity-80"
      style={{ backgroundColor: colors.surfaceElevated }}
      accessibilityLabel={label}
      accessibilityRole="button"
    >
      <View className="relative">
        {icon}
        {badge && (
          <View className="absolute -top-1 -right-2 bg-red-500 rounded-full min-w-[16px] h-4 items-center justify-center px-1">
            <Text className="text-[9px] font-bold text-white">{badge}</Text>
          </View>
        )}
      </View>
      <Text className="text-[11px] text-white/70 font-medium">{label}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeShort(dateStr: string): string {
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    if (diff < 0) return 'now';

    const minutes = Math.floor(diff / 60_000);
    if (minutes < 1) return 'now';
    if (minutes < 60) return `${minutes}m`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;

    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;

    return `${Math.floor(days / 7)}w`;
  } catch {
    return '';
  }
}
