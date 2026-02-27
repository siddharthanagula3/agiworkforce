import { useCallback, useState } from 'react';
import { View, Pressable, Alert, Platform, Modal, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { MessageSquare, Pin } from 'lucide-react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Trash2 } from 'lucide-react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Text } from '@/components/ui/text';
import { useChatStore } from '@/stores/chatStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { colors } from '@/lib/theme';
import { formatRelativeTime, truncate } from '@agiworkforce/utils';
import type { ConversationSummary } from '@/types/chat';

interface ConversationItemProps {
  conversation: ConversationSummary;
  isActive: boolean;
}

/**
 * Single conversation row in the sidebar.
 * - Title + last message preview + relative time
 * - Swipe left to delete
 * - Long press for rename/delete menu
 * - Active state highlight with teal left border
 */
export function ConversationItem({ conversation, isActive }: ConversationItemProps) {
  const router = useRouter();
  const deleteConversation = useChatStore((s) => s.deleteConversation);
  const renameConversation = useChatStore((s) => s.renameConversation);
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const [renameVisible, setRenameVisible] = useState(false);
  const [renameText, setRenameText] = useState('');

  const handlePress = useCallback(() => {
    router.push(`/(app)/chat/${conversation.id}`);
  }, [router, conversation.id]);

  const handleDelete = useCallback(() => {
    Alert.alert(
      'Delete Conversation',
      `Are you sure you want to delete "${conversation.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteConversation(conversation.id),
        },
      ],
    );
  }, [conversation.id, conversation.title, deleteConversation]);

  const handleRename = useCallback(() => {
    if (Platform.OS === 'ios') {
      Alert.prompt(
        'Rename Conversation',
        undefined,
        (newTitle: string) => {
          const trimmed = newTitle.trim();
          if (trimmed && trimmed !== conversation.title) {
            renameConversation(conversation.id, trimmed);
          }
        },
        'plain-text',
        conversation.title,
      );
    } else {
      // Android: use Modal with TextInput (Alert.prompt is iOS-only)
      setRenameText(conversation.title);
      setRenameVisible(true);
    }
  }, [conversation.id, conversation.title, renameConversation]);

  const handleRenameSubmit = useCallback(() => {
    const trimmed = renameText.trim();
    if (trimmed && trimmed !== conversation.title) {
      renameConversation(conversation.id, trimmed);
    }
    setRenameVisible(false);
  }, [renameText, conversation.id, conversation.title, renameConversation]);

  const handleLongPress = useCallback(() => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    Alert.alert(conversation.title, undefined, [
      { text: 'Rename', onPress: handleRename },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: handleDelete,
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [conversation.title, hapticsEnabled, handleRename, handleDelete]);

  const renderRightActions = useCallback(
    () => (
      <Pressable
        onPress={handleDelete}
        style={{
          backgroundColor: colors.agentError,
          justifyContent: 'center',
          alignItems: 'center',
          width: 72,
          borderRadius: 8,
          marginLeft: 4,
        }}
        accessibilityLabel="Delete conversation"
        accessibilityRole="button"
      >
        <Trash2 size={18} color="#fff" />
      </Pressable>
    ),
    [handleDelete],
  );

  return (
    <>
    <Swipeable renderRightActions={renderRightActions} overshootRight={false}>
      <Animated.View entering={FadeIn.duration(200)}>
        <Pressable
          onPress={handlePress}
          onLongPress={handleLongPress}
          style={[
            {
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderRadius: 8,
            },
            isActive && {
              backgroundColor: 'rgba(33, 128, 141, 0.1)',
              borderLeftWidth: 2,
              borderLeftColor: colors.teal,
            },
          ]}
          accessibilityLabel={conversation.title}
          accessibilityRole="button"
        >
          <MessageSquare size={16} color={isActive ? colors.teal : colors.textMuted} />

          <View style={{ flex: 1, minWidth: 0 }}>
            {/* Title row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '500',
                  color: isActive ? colors.teal : 'rgba(255, 255, 255, 0.8)',
                  flex: 1,
                }}
                numberOfLines={1}
              >
                {conversation.title}
              </Text>
              {conversation.pinned && <Pin size={10} color={colors.teal} />}
            </View>

            {/* Preview + time row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
              <Text
                style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.3)', flex: 1 }}
                numberOfLines={1}
              >
                {conversation.lastMessage
                  ? truncate(conversation.lastMessage, 30)
                  : `${conversation.messageCount} messages`}
              </Text>
              <Text style={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.2)', marginLeft: 8 }}>
                {formatRelativeTime(conversation.updatedAt)}
              </Text>
            </View>
          </View>
        </Pressable>
      </Animated.View>
    </Swipeable>

      {/* Android rename modal */}
      {Platform.OS !== 'ios' && (
        <Modal visible={renameVisible} transparent animationType="fade" onRequestClose={() => setRenameVisible(false)}>
          <Pressable
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 }}
            onPress={() => setRenameVisible(false)}
          >
            <View
              style={{ backgroundColor: colors.surfaceElevated, borderRadius: 12, padding: 16 }}
              onStartShouldSetResponder={() => true}
            >
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.textPrimary, marginBottom: 12 }}>
                Rename Conversation
              </Text>
              <TextInput
                value={renameText}
                onChangeText={setRenameText}
                autoFocus
                style={{
                  backgroundColor: colors.surfaceBase,
                  borderRadius: 8,
                  padding: 12,
                  color: colors.textPrimary,
                  fontSize: 14,
                  borderWidth: 1,
                  borderColor: colors.border,
                  marginBottom: 16,
                }}
                selectionColor={colors.teal}
                onSubmitEditing={handleRenameSubmit}
                returnKeyType="done"
              />
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
                <Pressable onPress={() => setRenameVisible(false)} style={{ paddingVertical: 8, paddingHorizontal: 16 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 14 }}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleRenameSubmit}
                  style={{ paddingVertical: 8, paddingHorizontal: 16, backgroundColor: colors.teal, borderRadius: 8 }}
                >
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>Rename</Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        </Modal>
      )}
    </>
  );
}
