/**
 * BudgetTracker — invisible component that observes the latest chat message
 * and increments token usage in the budget store.
 *
 * Hosts mount this once inside ChatInterface (or equivalent). It reads
 * messages from `useChatStore` and budget state from `useBudgetStore`,
 * deduplicating already-counted message ids via a ref-held Set.
 */
import { useEffect, useRef } from 'react';
import { useBudgetStore, selectBudget } from '../stores/budgetStore';
import { useChatStore } from '../stores/chatStore';

export const BudgetTracker = (): null => {
  const budget = useBudgetStore(selectBudget);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const messages = useChatStore((state) =>
    activeConversationId ? state.messagesByConversation[activeConversationId] : undefined,
  );
  const addTokenUsage = useBudgetStore((state) => state.addTokenUsage);
  const countedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!budget.enabled || !messages || messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (!last) return;
    const id = String(last.id ?? '');
    if (!id || countedIdsRef.current.has(id)) return;
    if (last.isStreaming) return;

    const tokens = Math.ceil((last.content?.length ?? 0) * 0.25);
    addTokenUsage(tokens);
    countedIdsRef.current.add(id);
  }, [messages, budget.enabled, addTokenUsage]);

  return null;
};

export default BudgetTracker;
