import { useCallback } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';

let focusedConversationId: string | null = null;

export function setFocusedConversation(conversationId: string | null): void {
  focusedConversationId = conversationId;
}

export function releaseFocusedConversation(conversationId: string): void {
  if (focusedConversationId === conversationId) focusedConversationId = null;
}

export function isConversationOpenInForeground(conversationId: unknown): boolean {
  return (
    typeof conversationId === 'string' &&
    conversationId !== '' &&
    conversationId === focusedConversationId &&
    AppState.currentState === 'active'
  );
}

export function useReplyNoticeFocus(conversationId: string | null | undefined): void {
  useFocusEffect(
    useCallback(() => {
      if (!conversationId) return undefined;
      setFocusedConversation(conversationId);
      return () => releaseFocusedConversation(conversationId);
    }, [conversationId]),
  );
}
