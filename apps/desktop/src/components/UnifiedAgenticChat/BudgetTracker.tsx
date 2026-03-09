/**
 * BudgetTracker Component
 *
 * Moves message-based budget calculations out of the main UnifiedAgenticChat
 * to prevent full-tree re-renders on every message update.
 */
import React, { useRef, useEffect } from 'react';
import { useBillingUsageStore, selectBudget } from '../../stores/billingUsage';
import { useChatStore } from '../../stores/chat/chatStore';

export const BudgetTracker: React.FC = () => {
  const budget = useBillingUsageStore(selectBudget);
  // BUG-IX-05 fix: use useChatStore (canonical source) instead of useUnifiedChatStore for messages
  const messages = useChatStore((state) => state.messages);
  const addTokenUsage = useBillingUsageStore((state) => state.addTokenUsage);
  const countedMessageIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!budget.enabled) return;
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) return;
    const messageId = String(lastMessage.id ?? crypto.randomUUID());
    if (countedMessageIdsRef.current.has(messageId)) {
      return;
    }
    // Only count tokens for completed assistant messages or user messages
    if (lastMessage.metadata?.streaming) return;

    const tokens =
      lastMessage.metadata?.tokenCount ?? Math.ceil((lastMessage.content?.length ?? 0) * 0.25);
    addTokenUsage(tokens);
    countedMessageIdsRef.current.add(messageId);
  }, [messages, budget.enabled, addTokenUsage]);

  return null;
};
