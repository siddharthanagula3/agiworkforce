/**
 * useChatSubmit Hook
 *
 * Handles chat message submission logic including queue mode,
 * credit checks, and abort handling.
 */

import { useCallback, useRef, useState } from 'react';
import { invoke } from '@/lib/tauri-mock';
import { formatErrorForChat } from '@/lib/friendlyErrors';
import { useAccountStore } from '@/stores/unified/accountStore';
import { useBillingStore } from '@/stores/unified/auth';
import {
  Attachment,
  ContextItem,
  FocusMode,
  PendingUserMessage,
} from '@/stores/unified/unifiedChatStore';
import { SubscriptionGateResult, type SubscriptionStatus } from '@/utils/subscriptionGate';

export interface SendOptions {
  attachments?: Attachment[];
  context?: ContextItem[];
  modelOverride?: string;
  providerOverride?: string;
  focusMode?: FocusMode;
}

export interface UseChatSubmitOptions {
  onSend: (content: string, options: SendOptions) => Promise<void> | void;
  selectedModel: string | null;
  selectedProvider: string | null;
  focusMode: FocusMode;
  activeContext: ContextItem[];
  attachments: Attachment[];
  monthlyLimit: number;
  monthlyCost: number;
  isQueueMode: boolean;
  conversationId?: number | null;
  onQueueMessage: (msg: PendingUserMessage) => void;
  onClearContent: () => void;
  onClearAttachments: () => void;
  onRestoreContent: (content: string) => void;
  onRestoreAttachments: (attachments: Attachment[]) => void;
  onError: (error: string) => void;
  onShowLockDialog: (result: SubscriptionGateResult) => void;
  cancelEditing: () => void;
}

export interface UseChatSubmitReturn {
  handleSubmit: (content: string) => Promise<boolean>;
  abortSubmit: () => void;
  isSending: boolean;
}

export function useChatSubmit(options: UseChatSubmitOptions): UseChatSubmitReturn {
  const {
    onSend,
    selectedModel,
    selectedProvider,
    focusMode,
    activeContext,
    attachments,
    monthlyLimit,
    monthlyCost,
    isQueueMode,
    conversationId,
    onQueueMessage,
    onClearContent,
    onClearAttachments,
    onRestoreContent,
    onRestoreAttachments,
    onError,
    onShowLockDialog,
    cancelEditing,
  } = options;

  const sendAbortControllerRef = useRef<AbortController | null>(null);
  const [isSending, setIsSending] = useState(false);

  const abortSubmit = useCallback(() => {
    if (sendAbortControllerRef.current) {
      sendAbortControllerRef.current.abort();
      sendAbortControllerRef.current = null;
    }
    setIsSending(false);
  }, []);

  const handleSubmit = useCallback(
    async (content: string): Promise<boolean> => {
      const messageContent = content.trim();
      if (!messageContent || isSending) {
        return false;
      }

      // Queue mode handling
      if (isQueueMode) {
        try {
          const pendingMsg = await invoke<PendingUserMessage>('chat_add_pending_message', {
            request: {
              content: messageContent,
              conversation_id: conversationId ?? null,
            },
          });

          onQueueMessage(pendingMsg);
          onClearContent();

          return true;
        } catch (error) {
          console.error('[useChatSubmit] Failed to queue message:', error);
          onError('Failed to queue message. Please try again.');
          return false;
        }
      }

      // Abort any in-flight request
      if (sendAbortControllerRef.current) {
        sendAbortControllerRef.current.abort();
      }
      sendAbortControllerRef.current = new AbortController();
      const currentAbortSignal = sendAbortControllerRef.current.signal;

      // Check for Auto Mode restrictions
      if (selectedModel === 'auto') {
        const { account } = useAccountStore.getState();
        const plan = account?.plan || 'free';
        const hasAccess = ['hobby', 'pro', 'max', 'enterprise'].includes(plan);

        if (!hasAccess) {
          onShowLockDialog({
            hasAccess: false,
            reason: 'Auto Mode requires a Hobby plan or higher.',
            requiresUpgrade: true,
            currentTier: plan,
            currentStatus: ((account as { subscriptionStatus?: SubscriptionStatus } | null)
              ?.subscriptionStatus || 'none') as SubscriptionStatus,
          });
          sendAbortControllerRef.current = null;
          return false;
        }
        if (monthlyLimit > 0 && monthlyCost >= monthlyLimit * 0.99) {
          onError('Insufficient token credits for Auto Mode. Please upgrade plan.');
          sendAbortControllerRef.current = null;
          return false;
        }
      }

      setIsSending(true);
      const messageAttachments = attachments.length > 0 ? [...attachments] : undefined;

      onClearContent();
      onClearAttachments();

      try {
        if (currentAbortSignal.aborted) {
          throw new Error('Message send was cancelled');
        }

        const state = useAccountStore.getState();
        const plan = state.account?.plan?.toLowerCase() || 'free';
        const isManagedPlan = plan !== 'free' && plan !== 'none';

        // Pre-flight Credit Check
        if (isManagedPlan && selectedProvider !== 'ollama') {
          const { creditBalance_cents, dailyUsage_cents, dailyLimit_cents } =
            useBillingStore.getState();

          if (creditBalance_cents !== null && creditBalance_cents <= 0) {
            onRestoreContent(messageContent);
            if (messageAttachments) onRestoreAttachments(messageAttachments);
            onError(
              'Insufficient credits to send message. Please upgrade your plan or wait for credits to refresh.',
            );
            setIsSending(false);
            sendAbortControllerRef.current = null;
            return false;
          }

          if (dailyLimit_cents && dailyUsage_cents && dailyUsage_cents >= dailyLimit_cents) {
            onRestoreContent(messageContent);
            if (messageAttachments) onRestoreAttachments(messageAttachments);
            onError('Daily credit limit reached. Credits will reset at midnight UTC.');
            setIsSending(false);
            sendAbortControllerRef.current = null;
            return false;
          }
        }

        const computedProviderOverride =
          isManagedPlan && selectedProvider !== 'ollama'
            ? 'managed_cloud'
            : selectedProvider || undefined;

        await onSend(messageContent, {
          attachments: messageAttachments,
          context: activeContext.length > 0 ? activeContext : undefined,
          focusMode: focusMode,
          modelOverride: selectedModel ? selectedModel : undefined,
          providerOverride: computedProviderOverride,
        });

        if (!currentAbortSignal.aborted) {
          cancelEditing();
        }

        return true;
      } catch (error) {
        if (!currentAbortSignal.aborted) {
          onRestoreContent(messageContent);
          if (messageAttachments) onRestoreAttachments(messageAttachments);
          const rawMessage = error instanceof Error ? error.message : String(error);
          console.error('[useChatSubmit] Send failed:', error);
          onError(formatErrorForChat(rawMessage, true));
        }
        return false;
      } finally {
        if (!currentAbortSignal.aborted) {
          setIsSending(false);
        }
        sendAbortControllerRef.current = null;
      }
    },
    [
      isSending,
      isQueueMode,
      conversationId,
      selectedModel,
      selectedProvider,
      focusMode,
      activeContext,
      attachments,
      monthlyLimit,
      monthlyCost,
      onSend,
      onQueueMessage,
      onClearContent,
      onClearAttachments,
      onRestoreContent,
      onRestoreAttachments,
      onError,
      onShowLockDialog,
      cancelEditing,
    ],
  );

  return {
    handleSubmit,
    abortSubmit,
    isSending,
  };
}

export default useChatSubmit;
