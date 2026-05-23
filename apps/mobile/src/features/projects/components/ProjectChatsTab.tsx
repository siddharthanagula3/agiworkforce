/**
 * ProjectChatsTab — shows conversations belonging to this project
 * and provides a new-chat CTA.
 *
 * Conversations are filtered by projectId from the local store; no
 * network call is required in v1 LOCAL-ONLY mode.
 */

import { useCallback } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { MessageSquare, Plus, Clock } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { useChatMessageStore } from '@/stores/chatStore';
import { useProjectStore } from '@/src/features/projects/store';
import { formatRelativeTime } from '@agiworkforce/utils/format';

interface ProjectChatsTabProps {
  projectId: string;
}

function EmptyState({ onNewChat }: { onNewChat: () => void }) {
  const colors = useThemeColors();
  return (
    <View className="items-center justify-center py-16 px-6">
      <View
        className="w-16 h-16 rounded-2xl items-center justify-center mb-4"
        style={{ backgroundColor: `${colors.textMuted}14` }}
      >
        <MessageSquare size={28} color={colors.textMuted} />
      </View>
      <Text
        className="text-[15px] font-semibold text-center mb-2"
        style={{ color: colors.textPrimary }}
      >
        No chats yet
      </Text>
      <Text
        className="text-[13px] text-center leading-[19px] mb-6"
        style={{ color: colors.textSecondary }}
      >
        Start a conversation in this project.
      </Text>
      <Pressable
        onPress={onNewChat}
        className="flex-row items-center gap-2 px-5 py-2.5 rounded-xl"
        style={{
          backgroundColor: `${colors.teal}18`,
          borderWidth: 1,
          borderColor: `${colors.teal}35`,
        }}
        accessibilityRole="button"
        accessibilityLabel="New chat"
      >
        <Plus size={15} color={colors.teal} />
        <Text className="text-[13px] font-semibold" style={{ color: colors.teal }}>
          New chat
        </Text>
      </Pressable>
    </View>
  );
}

export function ProjectChatsTab({ projectId }: ProjectChatsTabProps) {
  const colors = useThemeColors();
  const router = useRouter();

  const conversations = useChatMessageStore((s) =>
    s.conversations.filter((c) => c.projectId === projectId),
  );

  const setActiveProject = useProjectStore((s) => s.setActiveProject);

  const handleNewChat = useCallback(() => {
    // Activate the project so the chat tab picks it up, then navigate to the
    // main chat surface. There is no dedicated chat/new route in v1.
    setActiveProject(projectId);
    router.push('/(app)/(tabs)/chat' as Parameters<typeof router.push>[0]);
  }, [router, projectId, setActiveProject]);

  const handleOpenChat = useCallback(
    (id: string) => {
      router.push({ pathname: '/(app)/chat/[id]' as const, params: { id } });
    },
    [router],
  );

  return (
    <View className="flex-1">
      {/* New chat button */}
      <View className="px-4 pt-4 pb-2">
        <Pressable
          onPress={handleNewChat}
          className="flex-row items-center justify-center gap-2 py-3 rounded-xl"
          style={{
            backgroundColor: `${colors.teal}18`,
            borderWidth: 1,
            borderColor: `${colors.teal}35`,
          }}
          accessibilityRole="button"
          accessibilityLabel="New chat in this project"
        >
          <Plus size={16} color={colors.teal} />
          <Text className="text-[14px] font-semibold" style={{ color: colors.teal }}>
            New chat
          </Text>
        </Pressable>
      </View>

      {conversations.length === 0 ? (
        <EmptyState onNewChat={handleNewChat} />
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {conversations.map((convo) => (
            <Pressable
              key={convo.id}
              onPress={() => handleOpenChat(convo.id)}
              className="flex-row items-start gap-3 px-4 py-3 rounded-xl mb-2 active:opacity-75"
              style={{
                backgroundColor: colors.surfaceElevated,
                borderWidth: 1,
                borderColor: colors.border,
              }}
              accessibilityRole="button"
              accessibilityLabel={`Open chat: ${convo.title}`}
            >
              {/* Icon */}
              <View
                className="w-9 h-9 rounded-lg items-center justify-center mt-0.5"
                style={{ backgroundColor: `${colors.textMuted}14` }}
              >
                <MessageSquare size={17} color={colors.textMuted} />
              </View>

              {/* Title + meta */}
              <View className="flex-1">
                <Text
                  className="text-[14px] font-medium"
                  style={{ color: colors.textPrimary }}
                  numberOfLines={1}
                >
                  {convo.title}
                </Text>
                {convo.lastMessage ? (
                  <Text
                    className="text-[12px] mt-0.5 leading-[17px]"
                    style={{ color: colors.textSecondary }}
                    numberOfLines={2}
                  >
                    {convo.lastMessage}
                  </Text>
                ) : null}
                <View className="flex-row items-center gap-1 mt-1">
                  <Clock size={10} color={colors.textMuted} />
                  <Text className="text-[11px]" style={{ color: colors.textMuted }}>
                    {formatRelativeTime(convo.updatedAt)}
                  </Text>
                </View>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
