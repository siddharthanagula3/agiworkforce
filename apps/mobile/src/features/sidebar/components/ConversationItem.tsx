import { useCallback, useState } from 'react';
import { View, Pressable, Alert, Platform, Modal, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { Pin, Trash2 } from 'lucide-react-native';
import { Swipeable } from 'react-native-gesture-handler';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Text } from '@/components/ui/text';
import { AutoTagBadge } from '@/src/features/sidebar/components/AutoTagBadge';
import { useChatStore } from '@/stores/chatStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { colors } from '@/src/ui/theme';
import { formatRelativeTime, truncate } from '@agiworkforce/utils/format';
import type { ConversationSummary } from '@/types/chat';
import type { ConversationTag } from '@/services/autotag';

interface ConversationItemProps {
  conversation: ConversationSummary;
  isActive: boolean;
  snippet?: string;
}

/**
 * Single conversation row in the sidebar.
 * - Title + last message preview + relative time
 * - Swipe left to delete
 * - Long press for rename/delete menu
 * - Active state highlight with teal left border
 */
export function ConversationItem({ conversation, isActive, snippet }: ConversationItemProps) {
  const router = useRouter();
  const deleteConversation = useChatStore((s) => s.deleteConversation);
  const renameConversation = useChatStore((s) => s.renameConversation);
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const reducedMotion = useReducedMotion();
  const [renameVisible, setRenameVisible] = useState(false);
  const [renameText, setRenameText] = useState('');

  const handlePress = useCallback(() => {
    router.push({ pathname: '/(app)/chat/[id]' as const, params: { id: conversation.id } });
  }, [router, conversation.id]);

  const handleDelete = useCallback(() => {
    Alert.alert('Delete Conversation', `Are you sure you want to delete "${conversation.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteConversation(conversation.id),
      },
    ]);
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

  const pinConversation = useChatStore((s) => s.pinConversation);

  const handlePin = useCallback(() => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    pinConversation(conversation.id);
  }, [conversation.id, pinConversation, hapticsEnabled]);

  const handleLongPress = useCallback(() => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    // No "Archive" entry here. Archiving is wired in DrawerContent, which is
    // the menu the app actually renders — this component is not mounted by any
    // screen. Adding it here would only have been a second copy to keep in
    // step, and its import of the archived-chats feature pulled the whole
    // cloud-contracts graph into this module for no reachable benefit.
    Alert.alert(conversation.title, undefined, [
      { text: conversation.pinned ? 'Unpin' : 'Pin', onPress: handlePin },
      { text: 'Rename', onPress: handleRename },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: handleDelete,
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [
    conversation.title,
    conversation.pinned,
    hapticsEnabled,
    handlePin,
    handleRename,
    handleDelete,
  ]);

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

  const renderLeftActions = useCallback(
    () => (
      <Pressable
        onPress={handlePin}
        style={{
          backgroundColor: colors.teal,
          justifyContent: 'center',
          alignItems: 'center',
          width: 72,
          borderRadius: 8,
          marginRight: 4,
        }}
        accessibilityLabel={conversation.pinned ? 'Unpin conversation' : 'Pin conversation'}
        accessibilityRole="button"
      >
        <Pin size={18} color="#fff" />
      </Pressable>
    ),
    [handlePin, conversation.pinned],
  );

  return (
    <>
      <Swipeable
        renderRightActions={renderRightActions}
        renderLeftActions={renderLeftActions}
        overshootRight={false}
        overshootLeft={false}
      >
        <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(200)}>
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
            {/* Avatar circle with first letter + unread dot */}
            <View style={{ position: 'relative' }}>
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: isActive ? colors.teal : colors.neutralSurface,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '600',
                    color: isActive ? colors.white : colors.textSecondary,
                  }}
                >
                  {conversation.title.trim().charAt(0).toUpperCase() || '?'}
                </Text>
              </View>
              {conversation.unread && (
                <View
                  style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: colors.teal,
                    borderWidth: 1.5,
                    borderColor: colors.surfaceBase,
                  }}
                  accessibilityLabel="Unread messages"
                />
              )}
            </View>

            <View style={{ flex: 1, minWidth: 0 }}>
              {/* Title row */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: conversation.unread ? '600' : '500',
                    color: isActive ? colors.teal : colors.textSecondary,
                    flex: 1,
                  }}
                  numberOfLines={1}
                >
                  {conversation.title}
                </Text>
                {conversation.tags?.[0] && (
                  <AutoTagBadge tag={conversation.tags[0] as ConversationTag} size="sm" />
                )}
                {conversation.pinned && <Pin size={10} color={colors.teal} />}
              </View>

              {/* Preview + time row */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginTop: 2,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    color: snippet ? 'rgba(33, 128, 141, 0.7)' : colors.textMuted,
                    flex: 1,
                  }}
                  numberOfLines={snippet ? 2 : 1}
                >
                  {snippet ??
                    (conversation.lastMessage
                      ? truncate(conversation.lastMessage, 30)
                      : `${conversation.messageCount} messages`)}
                </Text>
                <Text style={{ fontSize: 10, color: colors.textMuted, marginLeft: 8 }}>
                  {formatRelativeTime(conversation.updatedAt)}
                </Text>
              </View>
            </View>
          </Pressable>
        </Animated.View>
      </Swipeable>

      {/* Android rename modal */}
      {Platform.OS !== 'ios' && (
        <Modal
          visible={renameVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setRenameVisible(false)}
        >
          <Pressable
            style={{
              flex: 1,
              backgroundColor: colors.scrim,
              justifyContent: 'center',
              padding: 24,
            }}
            onPress={() => setRenameVisible(false)}
          >
            <View
              style={{ backgroundColor: colors.surfaceElevated, borderRadius: 12, padding: 16 }}
              onStartShouldSetResponder={() => true}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: '600',
                  color: colors.textPrimary,
                  marginBottom: 12,
                }}
              >
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
                <Pressable
                  onPress={() => setRenameVisible(false)}
                  style={{ paddingVertical: 8, paddingHorizontal: 16 }}
                  accessibilityLabel="Cancel rename"
                  accessibilityRole="button"
                >
                  <Text style={{ color: colors.textMuted, fontSize: 14 }}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleRenameSubmit}
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 16,
                    backgroundColor: colors.teal,
                    borderRadius: 8,
                  }}
                  accessibilityLabel="Confirm rename"
                  accessibilityRole="button"
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
