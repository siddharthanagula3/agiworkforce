/**
 * ChatInputArea Component
 *
 * Main chat input component that composes multiple sub-components for a complete
 * chat input experience including attachments, voice input, slash commands, and more.
 */

import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke, isTauri } from '../../lib/tauri-mock';
import { useSlashCommands } from '../../hooks/useSlashCommands';
import { useSlashCommandAutocomplete } from '../../hooks/useSlashCommandAutocomplete';
import { useApiPromptCompletion } from '../../hooks/useApiPromptCompletion';
import type { CaptureResult } from '../../types/capture';

import { getModelMetadata } from '../../constants/llm';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useVoiceTranscription } from '../../hooks/useVoiceTranscription';
import { cn } from '../../lib/utils';
import { getSimpleErrorMessage } from '../../lib/errorMessages';
import { useAccountStore } from '../../stores/accountStore';
import { useModelStore } from '../../stores/modelStore';
import {
  FocusMode,
  useUnifiedChatStore,
  Attachment,
  ContextItem,
  PendingUserMessage,
  uuidToDbId,
} from '../../stores/unifiedChatStore';
import { SubscriptionGateResult, type SubscriptionStatus } from '../../utils/subscriptionGate';
import { SubscriptionLockDialog } from '../Subscription';
import { useBillingUsageStore } from '../../stores/billingUsage';
import { useBillingStore } from '../../stores/auth';
import { useSettingsStore } from '../../stores/settingsStore';
import { useSimpleModeStore, selectIsSimpleMode } from '../../stores/ui';

// Sub-components
import { AttachmentPreview } from './AttachmentPreview';
import { BrowserActivityBadge } from './BrowserActivityBadge';
import { ContextDisplay } from './ContextDisplay';
import { DragOverlay } from './DragOverlay';
import { FocusModeButtons, getFocusModePlaceholder } from './FocusModeButtons';
import { InputFooter } from './InputFooter';
import { InputToolbar } from './InputToolbar';
import { InlineSuggestion } from './InlineSuggestion';
import { ModelSelectorButton } from './ModelSelectorButton';
import { PendingMessagesIndicator } from './PendingMessagesIndicator';
import { SendButton } from './SendButton';
import { SkillMentionPicker, MentionSkill } from './SkillMentionPicker';
import { SlashCommandMenu } from './SlashCommandMenu';
import { VoiceRecordingStatus } from './VoiceRecordingStatus';

// Hooks
import {
  useAttachments,
  useDragAndDrop,
  useKeyboardShortcuts,
  useClickOutside,
  useAutoResize,
} from './hooks';

const PLAN_CREDIT_LIMITS = {
  hobby: { monthly: 1.0, daily: 0.3 },
  pro: { monthly: 20.0, daily: 6.0 },
  max: { monthly: 250.0, daily: 75.0 },
};

export interface SendOptions {
  attachments?: Attachment[];
  context?: ContextItem[];
  modelOverride?: string;
  providerOverride?: string;
  focusMode?: FocusMode;
}

export interface ChatInputAreaProps {
  onSend: (content: string, options: SendOptions) => Promise<void> | void;
  onStopGeneration?: () => void;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
  enableAttachments?: boolean;
  className?: string;
}

const MAX_ROWS = 10;
const DEFAULT_CHAT_MAX_LENGTH = 20000;

export const ChatInputArea: React.FC<ChatInputAreaProps> = ({
  onSend,
  onStopGeneration,
  disabled = false,
  placeholder: defaultPlaceholder = 'Ask me anything...',
  maxLength = DEFAULT_CHAT_MAX_LENGTH,
  enableAttachments = true,
  className = '',
}) => {
  // Core input state
  const [content, setContent] = useState('');
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showLockDialog, setShowLockDialog] = useState(false);
  const [lockGateResult, setLockGateResult] = useState<SubscriptionGateResult | undefined>(
    undefined,
  );

  // Slash command state
  const [showSlashAutocomplete, setShowSlashAutocomplete] = useState(false);
  const [slashAutocompleteIndex, setSlashAutocompleteIndex] = useState(-1);

  // Inline suggestion state
  const [inlineSuggestion, setInlineSuggestion] = useState<string>('');

  // Research panel state
  const [researchOpen, setResearchOpen] = useState(false);

  // @mention skill picker state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);

  // Voice transcription state
  // AUDIT-VOICE-043 fix: Renamed to preferWhisperCloud for clarity (true = Whisper Cloud, false = Web Speech)
  const [preferWhisperCloud, setPreferWhisperCloud] = useState(false);
  const [showTranscriptionModeSelector, setShowTranscriptionModeSelector] = useState(false);

  // Refs
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modelSelectorRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const sendAbortControllerRef = useRef<AbortController | null>(null);
  const userModifiedContentRef = useRef(false);
  const pendingAutoSendIdsRef = useRef<Set<string>>(new Set());

  // Initialize hooks
  const { isSlashCommandInput } = useSlashCommands();
  const { getAutocomplete } = useSlashCommandAutocomplete();
  const prefersReducedMotion = useReducedMotion();

  // Get prompt completion setting from store
  const promptCompletionEnabled = useSettingsStore(
    (state) => state.chatPreferences?.promptCompletionEnabled ?? true,
  );

  // Store selectors
  const activeContext = useUnifiedChatStore((state) => state.activeContext ?? []);
  const removeContextItem = useUnifiedChatStore((state) => state.removeContextItem);
  const isLoading = useUnifiedChatStore((state) => state.isLoading);
  const isStreaming = useUnifiedChatStore((state) => state.isStreaming);
  const messages = useUnifiedChatStore((state) => state.messages);
  const focusMode = useUnifiedChatStore((state) => state.focusMode);
  const setFocusMode = useUnifiedChatStore((state) => state.setFocusMode);
  const tokenUsage = useUnifiedChatStore((state) => state.tokenUsage);
  const draftContent = useUnifiedChatStore((state) => state.draftContent);
  const editingMessageId = useUnifiedChatStore((state) => state.editingMessageId);
  const setDraftContent = useUnifiedChatStore((state) => state.setDraftContent);
  const cancelEditing = useUnifiedChatStore((state) => state.cancelEditing);
  const pendingMessages = useUnifiedChatStore((state) => state.pendingMessages);
  const addPendingMessage = useUnifiedChatStore((state) => state.addPendingMessage);
  const activeConversationUuid = useUnifiedChatStore((state) => state.activeConversationId);

  const sidecarOpen = useUnifiedChatStore((state) => state.sidecar.isOpen);
  const sidecarWidth = useUnifiedChatStore((state) => state.sidecarWidth);
  const sidebarWidth = useUnifiedChatStore((state) => state.sidebarWidth);
  const sidebarCollapsed = useUnifiedChatStore((state) => state.sidebarCollapsed);

  const selectedModel = useModelStore((state) => state.selectedModel);
  const selectedProvider = useModelStore((state) => state.selectedProvider);
  const thinkingModeEnabled = useModelStore((state) => state.thinkingModeEnabled);
  const availableModels = useModelStore((state) => state.availableModels);

  const isSimpleMode = useSimpleModeStore(selectIsSimpleMode);

  // Attachment management
  const {
    attachments,
    isProcessingAttachments,
    handleFilesAdded,
    handlePaste: handleAttachmentPaste,
    removeAttachment,
    clearAttachments,
    setAttachments,
    cleanup: cleanupAttachments,
  } = useAttachments({
    selectedModel,
    onError: setSubmitError,
  });

  // Drag and drop
  const { isDragging } = useDragAndDrop({
    onFilesAdded: handleFilesAdded,
    enabled: enableAttachments,
  });

  // Memoize the suggestion change handler
  const handleSuggestionChange = useCallback(
    (suggestion: string) => {
      if (!showSlashAutocomplete && suggestion) {
        setInlineSuggestion(' ' + suggestion);
      } else if (!suggestion) {
        setInlineSuggestion('');
      }
    },
    [showSlashAutocomplete],
  );

  // AI-powered prompt completion
  const promptCompletion = useApiPromptCompletion(content, {
    enabled: promptCompletionEnabled,
    onSuggestionChange: handleSuggestionChange,
  });

  // Voice transcription
  const {
    isRecording: isListening,
    isTranscribing,
    isSupported: isVoiceSupported,
    interimTranscript,
    error: voiceError,
    availableLocalWhisper,
    toggleRecording,
  } = useVoiceTranscription({
    preferWhisperCloud: preferWhisperCloud,
    language: 'en',
    onResult: useCallback(
      (transcript: string) => {
        setContent((prev) => {
          const next = prev + (prev ? ' ' : '') + transcript;
          setDraftContent(next);
          return next;
        });
      },
      [setDraftContent],
    ),
    onError: useCallback((error: string) => {
      console.error('[ChatInputArea] Voice transcription error:', error);
    }, []),
  });

  // Wrap toggleRecording to handle async
  const toggleListening = useCallback(() => {
    toggleRecording().catch((err) => {
      console.error('[ChatInputArea] Failed to toggle recording:', err);
    });
  }, [toggleRecording]);

  // Get autocomplete suggestions
  const autocompleteResult = getAutocomplete(content, slashAutocompleteIndex);

  // Derived state
  const isInputDisabled = disabled || isSending;
  const isQueueMode = isLoading || isStreaming;
  const isEmptyState = messages.length === 0;
  const showFocusModeButtons = !isSimpleMode && isEmptyState;
  const showStopButton = (isStreaming || isLoading) && onStopGeneration;
  const pendingCount = pendingMessages.length;
  const placeholder = getFocusModePlaceholder(focusMode, defaultPlaceholder);
  const sidebarOffset = sidebarCollapsed ? 64 : sidebarWidth;

  // Model display name
  const modelDisplayName = useMemo(() => {
    if (isSimpleMode) {
      if (selectedModel?.startsWith('auto') || selectedModel === 'auto' || !selectedModel) {
        return 'Auto';
      }
      const metadata = getModelMetadata(selectedModel);
      if (metadata?.name) {
        return metadata.name.split(' ')[0] || 'AI';
      }
      return 'AI';
    }

    return selectedModel?.startsWith('auto')
      ? (getModelMetadata('managed-cloud-auto')?.name ?? 'Auto (Economy)')
      : selectedModel === 'auto'
        ? (getModelMetadata('managed-cloud-auto')?.name ?? 'Auto (Economy)')
        : selectedModel
          ? (getModelMetadata(selectedModel)?.name ??
            availableModels.find((m) => m.id === selectedModel)?.name ??
            selectedModel)
          : 'GPT-5.1 Instant';
  }, [selectedModel, isSimpleMode, availableModels]);

  // Credit usage calculations
  const getTokenCost = useBillingUsageStore((state) => state.getTokenCost);
  const subscription = useBillingStore((state) => state.subscription);
  const monthlyCost = getTokenCost();

  const planName = subscription?.plan_name?.toLowerCase() || '';
  let monthlyLimit = 0;
  if (planName.includes('hobby')) monthlyLimit = PLAN_CREDIT_LIMITS.hobby.monthly;
  else if (planName.includes('pro')) monthlyLimit = PLAN_CREDIT_LIMITS.pro.monthly;
  else if (planName.includes('max')) monthlyLimit = PLAN_CREDIT_LIMITS.max.monthly;

  const showCreditUsage = monthlyLimit > 0;
  const creditPercentage = showCreditUsage ? Math.min((monthlyCost / monthlyLimit) * 100, 100) : 0;
  const isLowBalance = showCreditUsage && monthlyLimit - monthlyCost < monthlyLimit * 0.1;

  // AUDIT-005-015 fix: Use ref to track current content to avoid stale closure
  // The content in deps was causing the effect to re-run unnecessarily and
  // could lead to stale closure issues in edge cases
  const contentRef = useRef(content);
  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  // Sync draft content from store
  useEffect(() => {
    // AUDIT-005-015 fix: Compare against ref instead of closure value
    if (draftContent && draftContent !== contentRef.current && !userModifiedContentRef.current) {
      setContent(draftContent);
    }
    if (draftContent === '') {
      userModifiedContentRef.current = false;
    }
  }, [draftContent]);

  // Keyboard shortcuts for model selector
  const toggleModelSelector = useCallback(() => setShowModelSelector((prev) => !prev), []);
  const closeModelSelector = useCallback(() => setShowModelSelector(false), []);

  useKeyboardShortcuts({
    onToggleModelSelector: toggleModelSelector,
    onEscape: closeModelSelector,
  });

  // Click outside to close model selector
  useClickOutside({
    ref: modelSelectorRef,
    onClickOutside: closeModelSelector,
    enabled: showModelSelector,
  });

  const sendPendingMessage = useCallback(
    async (pendingMessage: PendingUserMessage): Promise<boolean> => {
      const activeConversationDbId = activeConversationUuid
        ? uuidToDbId(activeConversationUuid)
        : undefined;
      const targetConversationId = pendingMessage.conversation_id ?? activeConversationDbId;

      if (!targetConversationId || targetConversationId !== activeConversationDbId) {
        console.log(
          '[ChatInputArea] Skipping pending auto-send for inactive conversation:',
          pendingMessage.id,
          pendingMessage.conversation_id,
          activeConversationDbId,
        );
        return false;
      }

      if (
        isSending ||
        disabled ||
        isQueueMode ||
        pendingAutoSendIdsRef.current.has(pendingMessage.id)
      ) {
        console.log('[ChatInputArea] Skipping auto-send - busy or disabled');
        return false;
      }

      pendingAutoSendIdsRef.current.add(pendingMessage.id);
      setIsSending(true);
      setSubmitError(null);

      try {
        const accountState = useAccountStore.getState();
        const plan = accountState.account?.plan?.toLowerCase() || 'free';
        const isManagedPlan = plan !== 'free' && plan !== 'none';
        const computedProviderOverride =
          isManagedPlan && selectedProvider !== 'ollama'
            ? 'managed_cloud'
            : selectedProvider || undefined;

        await onSend(pendingMessage.content, {
          attachments: undefined,
          context: activeContext.length > 0 ? activeContext : undefined,
          modelOverride: selectedModel || undefined,
          providerOverride: computedProviderOverride,
          focusMode,
        });

        // Clear local pending state first so UI is never stale
        useUnifiedChatStore.getState().removePendingMessage(pendingMessage.id);

        // Then clean up backend state (best-effort)
        if (isTauri) {
          try {
            await invoke<PendingUserMessage | null>('chat_pop_pending_message', {
              request: { conversation_id: targetConversationId },
            });
          } catch (backendErr) {
            console.warn(
              '[ChatInputArea] Failed to pop backend pending message (local state already cleared):',
              backendErr,
            );
          }
        }

        console.log('[ChatInputArea] Successfully sent pending message:', pendingMessage.id);
        return true;
      } catch (err) {
        console.error('[ChatInputArea] Failed to auto-send pending message:', err);
        return false;
      } finally {
        pendingAutoSendIdsRef.current.delete(pendingMessage.id);
        setIsSending(false);
      }
    },
    [
      onSend,
      activeConversationUuid,
      isSending,
      disabled,
      isQueueMode,
      activeContext,
      selectedModel,
      selectedProvider,
      focusMode,
    ],
  );

  // Auto-send pending messages
  useEffect(() => {
    const handleAutoSendPending = async (event: Event) => {
      const customEvent = event as CustomEvent<{ pendingMessage?: PendingUserMessage }>;
      const pendingMessage = customEvent.detail?.pendingMessage;
      if (!pendingMessage) {
        return;
      }

      console.log(
        '[ChatInputArea] Auto-sending pending message:',
        pendingMessage.id,
        pendingMessage.content.slice(0, 50),
      );

      await sendPendingMessage(pendingMessage);
    };

    window.addEventListener('chat:auto-send-pending', handleAutoSendPending);
    return () => window.removeEventListener('chat:auto-send-pending', handleAutoSendPending);
  }, [sendPendingMessage]);

  useEffect(() => {
    if (!activeConversationUuid || isSending || disabled || isQueueMode) {
      return;
    }

    const activeConversationDbId = uuidToDbId(activeConversationUuid);
    const nextPendingMessage = pendingMessages.find((pendingMessage) => {
      const pendingConversationId = pendingMessage.conversation_id ?? activeConversationDbId;
      return (
        pendingConversationId === activeConversationDbId &&
        !pendingAutoSendIdsRef.current.has(pendingMessage.id)
      );
    });

    if (!nextPendingMessage) {
      return;
    }

    void sendPendingMessage(nextPendingMessage);
  }, [
    activeConversationUuid,
    pendingMessages,
    isSending,
    disabled,
    isQueueMode,
    sendPendingMessage,
  ]);

  // Auto-resize textarea
  useAutoResize({
    ref: textareaRef,
    content,
    maxRows: MAX_ROWS,
  });

  // Cleanup on unmount
  useEffect(() => {
    return cleanupAttachments;
  }, [cleanupAttachments]);

  // Keep chat content above the fixed composer (including focus chips).
  useEffect(() => {
    const updateComposerReserve = () => {
      if (!composerRef.current) return;
      const rect = composerRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const bottomGap = Math.max(0, viewportHeight - rect.bottom);
      const reserve = Math.ceil(rect.height + bottomGap + 16);
      document.documentElement.style.setProperty('--agi-chat-input-reserve', `${reserve}px`);
    };

    updateComposerReserve();

    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => updateComposerReserve())
        : null;
    if (resizeObserver && composerRef.current) {
      resizeObserver.observe(composerRef.current);
    }

    window.addEventListener('resize', updateComposerReserve);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateComposerReserve);
      document.documentElement.style.removeProperty('--agi-chat-input-reserve');
    };
  }, [
    isEmptyState,
    sidecarOpen,
    sidecarWidth,
    sidebarWidth,
    sidebarCollapsed,
    showFocusModeButtons,
    attachments.length,
    editingMessageId,
    isQueueMode,
  ]);

  // Input change handler
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;

    if (value.length > maxLength) {
      setSubmitError(`Character limit exceeded by ${value.length - maxLength} characters`);
      return;
    }

    userModifiedContentRef.current = true;
    setContent(value);
    setDraftContent(value);

    const charPercentage = (value.length / maxLength) * 100;
    if (charPercentage > 90) {
      setSubmitError(
        `${maxLength - value.length} characters remaining (${charPercentage.toFixed(0)}% used)`,
      );
    } else if (
      submitError?.includes('Character limit') ||
      submitError?.includes('characters remaining')
    ) {
      setSubmitError(null);
    }

    const isSlashInput = isSlashCommandInput(value);
    setShowSlashAutocomplete(isSlashInput);
    if (!isSlashInput) {
      setSlashAutocompleteIndex(-1);
    } else {
      setSlashAutocompleteIndex(-1);
      setInlineSuggestion('');
      promptCompletion.clear();
    }

    // Detect @mention
    const mentionMatch = value.match(/@([\w-]*)$/);
    if (mentionMatch && !isSlashInput) {
      setMentionQuery(mentionMatch[1]);
    } else {
      setMentionQuery(null);
    }
  };

  // Screen capture handler - converts captured image to attachment
  const handleScreenCapture = useCallback(
    async (result: CaptureResult) => {
      try {
        // Read the captured image file and convert to base64
        const imageBytes = await invoke<number[]>('plugin:fs|read_file', {
          path: result.path,
        });

        // Convert number array to Uint8Array and then to base64.
        // Chunking avoids "Maximum call stack size exceeded" on large captures.
        const uint8Array = new Uint8Array(imageBytes);
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < uint8Array.length; i += chunkSize) {
          binary += String.fromCharCode(...uint8Array.subarray(i, i + chunkSize));
        }
        const base64 = btoa(binary);

        // Determine mime type from file format
        const mimeType = result.path.endsWith('.png')
          ? 'image/png'
          : result.path.endsWith('.jpg') || result.path.endsWith('.jpeg')
            ? 'image/jpeg'
            : 'image/png';

        // Create attachment from screenshot
        const attachment: Attachment = {
          id: result.id,
          type: 'image',
          name: `screenshot-${new Date().toISOString().split('T')[0]}.png`,
          mimeType,
          content: `data:${mimeType};base64,${base64}`,
          size: uint8Array.length,
        };

        // Add to attachments
        setAttachments([...attachments, attachment]);
        console.log('[ChatInputArea] Screenshot attached:', attachment.name);
      } catch (error) {
        console.error('[ChatInputArea] Failed to process screenshot:', error);
        setSubmitError('Failed to attach screenshot. Please try again.');
      }
    },
    [attachments, setAttachments],
  );

  // Detect "what's on my screen?" patterns and auto-capture
  const detectAndCaptureScreen = useCallback(
    async (messageContent: string): Promise<boolean> => {
      // Pattern matching for screen-related queries
      const screenPatterns = [
        /what'?s on (my|the) screen/i,
        /what (is|are) on (my|the) screen/i,
        /show (me )?(my|the) screen/i,
        /look at (my|the) screen/i,
        /see (my|the) screen/i,
        /describe (my|the) screen/i,
        /analyze (my|the) screen/i,
        /what (do|does) (you|u) see( on (my|the) screen)?/i,
        /can you see (my|the) screen/i,
      ];

      const matchesPattern = screenPatterns.some((pattern) => pattern.test(messageContent));

      if (matchesPattern) {
        console.log('[ChatInputArea] Detected screen query, auto-capturing...');
        try {
          // Auto-capture full screen
          await import('../../hooks/useScreenCapture'); // Keep import for side effects if needed, or remove if purely for unused function
          // AUDIT-CAPTURE-063 fix: Use imported uuidToDbId directly instead of store method
          const activeConversationId = useUnifiedChatStore.getState().activeConversationId;
          const conversationDbId = activeConversationId
            ? uuidToDbId(activeConversationId)
            : undefined;

          // Use the hook's capture function directly
          const result = await invoke<CaptureResult>('capture_screen_full', {
            conversation_id: conversationDbId,
          });

          await handleScreenCapture(result);
          return true;
        } catch (error) {
          console.error('[ChatInputArea] Auto-capture failed:', error);
          // Don't block message send on capture failure
          return false;
        }
      }

      return false;
    },
    [handleScreenCapture],
  );

  // Submit handler
  const handleSubmit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!content.trim() || isInputDisabled || isSending) return;

    const messageContent = content.trim();

    // Check for screen query patterns and auto-capture if detected
    await detectAndCaptureScreen(messageContent);

    // Queue mode handling
    if (isQueueMode) {
      // AUDIT-STREAM-062 fix: Pass active conversation ID when queueing
      const activeConversationId = useUnifiedChatStore.getState().activeConversationId;
      const conversationDbId = activeConversationId ? uuidToDbId(activeConversationId) : undefined;
      try {
        const pendingMsg = await invoke<PendingUserMessage>('chat_add_pending_message', {
          request: {
            content: messageContent,
            conversation_id: conversationDbId,
          },
        });

        addPendingMessage(pendingMsg);
        setContent('');
        setDraftContent('');

        console.log('[ChatInputArea] Message queued:', pendingMsg.id);
      } catch (error) {
        console.error('[ChatInputArea] Failed to queue message:', error);
        setSubmitError('Failed to queue message. Please try again.');
      }
      return;
    }

    // Abort any in-flight request
    if (sendAbortControllerRef.current) {
      sendAbortControllerRef.current.abort();
    }
    sendAbortControllerRef.current = new AbortController();

    // AUDIT-STREAM-061 fix: Also notify backend to stop generation
    const activeConversationId = useUnifiedChatStore.getState().activeConversationId;
    const conversationDbId = activeConversationId ? uuidToDbId(activeConversationId) : undefined;
    try {
      await invoke('chat_stop_generation', { conversationId: conversationDbId });
    } catch (error) {
      // Log but don't throw - generation may have already stopped
      console.warn('[ChatInputArea] Failed to stop generation:', error);
    }
    const currentAbortSignal = sendAbortControllerRef.current.signal;

    // Check for Auto Mode restrictions
    if (selectedModel === 'auto') {
      const { account } = useAccountStore.getState();
      const plan = account?.plan || 'free';
      const hasAccess = ['hobby', 'pro', 'max', 'enterprise'].includes(plan);

      if (!hasAccess) {
        setLockGateResult({
          hasAccess: false,
          reason: 'Auto Mode requires a Hobby plan or higher.',
          requiresUpgrade: true,
          currentTier: plan,
          currentStatus: ((account as { subscriptionStatus?: SubscriptionStatus } | null)
            ?.subscriptionStatus || 'none') as SubscriptionStatus,
        });
        setShowLockDialog(true);
        sendAbortControllerRef.current = null;
        return;
      }
      if (monthlyLimit > 0 && monthlyCost >= monthlyLimit * 0.99) {
        setSubmitError('Insufficient token credits for Auto Mode. Please upgrade plan.');
        sendAbortControllerRef.current = null;
        return;
      }
    } else {
      setLockGateResult(undefined);
    }

    setIsSending(true);
    setSubmitError(null);
    const messageAttachments = attachments.length > 0 ? attachments : undefined;

    userModifiedContentRef.current = false;
    setContent('');
    setDraftContent('');
    clearAttachments();

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
          setContent(messageContent);
          setDraftContent(messageContent);
          if (messageAttachments) setAttachments(messageAttachments);
          setSubmitError(
            'Insufficient credits to send message. Please upgrade your plan or wait for credits to refresh.',
          );
          setIsSending(false);
          sendAbortControllerRef.current = null;
          return;
        }

        if (dailyLimit_cents && dailyUsage_cents && dailyUsage_cents >= dailyLimit_cents) {
          setContent(messageContent);
          setDraftContent(messageContent);
          if (messageAttachments) setAttachments(messageAttachments);
          setSubmitError('Daily credit limit reached. Credits will reset at midnight UTC.');
          setIsSending(false);
          sendAbortControllerRef.current = null;
          return;
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
    } catch (error) {
      if (!currentAbortSignal.aborted) {
        setContent(messageContent);
        setDraftContent(messageContent);
        if (messageAttachments) setAttachments(messageAttachments);
        setSubmitError(getSimpleErrorMessage(error));
        console.error('[ChatInputArea] Send failed:', error);
      }
    } finally {
      if (!currentAbortSignal.aborted) {
        setIsSending(false);
      }
      sendAbortControllerRef.current = null;
    }
  };

  // Keyboard handler
  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Slash command navigation
    if (showSlashAutocomplete && autocompleteResult.suggestions.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSlashAutocompleteIndex((prev) =>
          prev === autocompleteResult.suggestions.length - 1 ? 0 : prev + 1,
        );
        return;
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSlashAutocompleteIndex((prev) =>
          prev === 0 ? autocompleteResult.suggestions.length - 1 : prev - 1,
        );
        return;
      } else if (event.key === 'Escape') {
        event.preventDefault();
        setShowSlashAutocomplete(false);
        setSlashAutocompleteIndex(-1);
        return;
      }
    }

    // Tab to accept inline suggestion
    if (inlineSuggestion && event.key === 'Tab' && !showSlashAutocomplete) {
      event.preventDefault();
      const accepted = promptCompletion.accept();
      if (accepted) {
        const newContent = content + ' ' + accepted;
        setContent(newContent);
        setDraftContent(newContent);
        setInlineSuggestion('');
      }
      textareaRef.current?.focus();
      return;
    }

    // Escape to dismiss suggestion
    if (inlineSuggestion && event.key === 'Escape') {
      event.preventDefault();
      promptCompletion.clear();
      setInlineSuggestion('');
      return;
    }

    // Enter to submit
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  };

  // File select handler
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    handleFilesAdded(files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Paste handler
  const handlePaste = (event: React.ClipboardEvent) => {
    handleAttachmentPaste(event);
  };

  // Slash command selection handler
  const handleSlashCommandSelect = useCallback(
    (suggestion: { command: string }) => {
      const newContent = content.replace(/\/\w*$/, suggestion.command);
      setContent(newContent + ' ');
      setDraftContent(newContent + ' ');
      setShowSlashAutocomplete(false);
      textareaRef.current?.focus();
    },
    [content, setDraftContent],
  );

  // @mention skill selection handler
  const handleSkillMentionSelect = useCallback(
    (skill: MentionSkill) => {
      const newContent = content.replace(/@[\w-]*$/, `@${skill.id} `);
      setContent(newContent);
      setDraftContent(newContent);
      setMentionQuery(null);
      textareaRef.current?.focus();
    },
    [content, setDraftContent],
  );

  return (
    <>
      {/* Drag overlay */}
      <DragOverlay isVisible={isDragging} />

      {/* Hidden file input - accepts images, audio, documents, and code files */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,audio/*,text/*,application/pdf,application/json,.md,.txt,.js,.jsx,.ts,.tsx,.py,.rs,.go,.java,.c,.cpp,.h,.html,.css,.xml,.yaml,.yml,.toml,.csv,.sql,.sh,.ps1"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Main input container */}
      <motion.div
        ref={composerRef}
        className={cn(
          'fixed z-40 w-full px-4',
          isEmptyState ? 'max-w-2xl' : 'max-w-5xl',
          className,
        )}
        initial={false}
        animate={{
          bottom: isEmptyState ? '50%' : '24px',
          left: `calc(${sidebarOffset}px + (100% - ${sidebarOffset}px - var(--agi-right-panel-offset, 0px)) / 2)`,
          x: '-50%',
          y: isEmptyState ? '50%' : '0%',
          maxWidth: isEmptyState ? '42rem' : '64rem',
        }}
        transition={
          prefersReducedMotion
            ? { duration: 0.15 }
            : { type: 'spring', stiffness: 350, damping: 30 }
        }
        style={{
          willChange: 'transform',
          width: `max(320px, calc(100% - ${sidebarOffset}px - var(--agi-right-panel-offset, 0px)))`,
        }}
      >
        {/* Focus modes - hidden in simple mode */}
        {showFocusModeButtons && (
          <FocusModeButtons
            focusMode={focusMode}
            onFocusModeChange={setFocusMode}
            prefersReducedMotion={prefersReducedMotion}
          />
        )}

        <div
          className={cn(
            'relative overflow-visible rounded-2xl',
            'bg-white/95 dark:bg-charcoal-800/95 backdrop-blur-xl',
            'border border-gray-200/80 dark:border-gray-700/80',
            'shadow-xl shadow-gray-200/50 dark:shadow-black/30',
            'transition-all duration-200 ease-out',
            'focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-primary/10',
            isEmptyState && 'shadow-2xl',
          )}
        >
          {/* Editing indicator */}
          {editingMessageId && (
            <div className="flex items-center justify-between gap-2 border-b border-amber-200/60 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-900/20 dark:text-amber-100">
              <span>Editing previous message</span>
              <button
                type="button"
                className="text-xs font-semibold underline decoration-amber-500"
                onClick={cancelEditing}
              >
                Cancel
              </button>
            </div>
          )}

          {/* Context display */}
          <ContextDisplay items={activeContext} onRemove={removeContextItem} />

          {/* Attachment processing indicator */}
          {isProcessingAttachments && (
            <div
              className="border-b border-gray-100 dark:border-gray-700/50 px-4 py-3"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                <span>{isSimpleMode ? 'Adding your files...' : 'Processing attachments...'}</span>
              </div>
            </div>
          )}

          {/* Attachments preview */}
          <AttachmentPreview attachments={attachments} onRemove={removeAttachment} />

          {/* Error display */}
          {submitError && (
            <div
              className="border-b border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-700 dark:border-rose-600/60 dark:bg-rose-900/20 dark:text-rose-100"
              role="alert"
              aria-live="assertive"
            >
              {submitError}
            </div>
          )}

          {/* Textarea area - full width at top */}
          <div className="relative px-3 pt-3">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              aria-label="Message"
              placeholder={
                isQueueMode
                  ? isSimpleMode
                    ? "I'm working on your request. Type here and I'll respond when ready..."
                    : 'Type to queue a message while AI is working...'
                  : placeholder
              }
              disabled={isInputDisabled}
              rows={1}
              className={cn(
                'w-full resize-none bg-transparent py-2 px-1',
                'text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500',
                'focus:outline-hidden',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'text-[15px] leading-6',
              )}
              style={{ maxHeight: `${24 * MAX_ROWS}px` }}
            />

            {/* Slash command menu */}
            <SlashCommandMenu
              show={showSlashAutocomplete}
              suggestions={autocompleteResult.suggestions}
              selectedIndex={slashAutocompleteIndex}
              onSelect={handleSlashCommandSelect}
              onHover={setSlashAutocompleteIndex}
            />

            {/* @mention skill picker */}
            {mentionQuery !== null && !showSlashAutocomplete && (
              <SkillMentionPicker
                query={mentionQuery}
                onSelect={handleSkillMentionSelect}
                onClose={() => setMentionQuery(null)}
              />
            )}

            {/* Inline suggestion */}
            {!showSlashAutocomplete && (
              <InlineSuggestion
                content={content}
                suggestion={inlineSuggestion}
                isLoading={promptCompletion.isLoading}
              />
            )}
          </div>

          {/* Toolbar row - below textarea */}
          <div className="flex items-center justify-between px-3 pb-2 pt-1">
            {/* Left toolbar + browser activity badge */}
            <div className="flex items-center gap-2">
              <InputToolbar
                // Keep tool affordances available while generation is in-flight.
                disabled={disabled}
                enableAttachments={enableAttachments}
                selectedModel={selectedModel}
                isSimpleMode={isSimpleMode}
                isVoiceSupported={isVoiceSupported}
                isRecording={isListening}
                isTranscribing={isTranscribing}
                preferWhisperCloud={preferWhisperCloud}
                availableLocalWhisper={availableLocalWhisper}
                showTranscriptionModeSelector={showTranscriptionModeSelector}
                onAttachClick={() => fileInputRef.current?.click()}
                onToggleRecording={toggleListening}
                onModeSelectorChange={setShowTranscriptionModeSelector}
                onPreferWhisperCloudChange={setPreferWhisperCloud}
                onScreenCapture={handleScreenCapture}
                conversationId={(() => {
                  const activeId = useUnifiedChatStore.getState().activeConversationId;
                  return activeId ? uuidToDbId(activeId) : undefined;
                })()}
                researchOpen={researchOpen}
                onToggleResearch={() => setResearchOpen((prev) => !prev)}
              />
              <BrowserActivityBadge />
            </div>

            {/* Right side controls */}
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'text-xs font-medium',
                  content.length > maxLength * 0.9
                    ? 'text-orange-500 dark:text-orange-400'
                    : 'text-gray-400 dark:text-gray-500',
                )}
              >
                {content.length} / {maxLength}
              </div>

              <ModelSelectorButton
                modelDisplayName={modelDisplayName}
                thinkingModeEnabled={thinkingModeEnabled}
                isOpen={showModelSelector}
                onOpenChange={setShowModelSelector}
                isSimpleMode={isSimpleMode}
                containerRef={modelSelectorRef}
              />

              <PendingMessagesIndicator count={pendingCount} isSimpleMode={isSimpleMode} />

              <SendButton
                showStopButton={!!showStopButton}
                isSending={isSending}
                isQueueMode={isQueueMode}
                disabled={isInputDisabled}
                hasContent={!!content.trim()}
                isSimpleMode={isSimpleMode}
                onSend={() => handleSubmit()}
                onStop={onStopGeneration}
              />
            </div>
          </div>

          {/* Voice recording status */}
          <VoiceRecordingStatus
            isRecording={isListening}
            isTranscribing={isTranscribing}
            interimTranscript={interimTranscript}
            preferWhisperCloud={preferWhisperCloud}
            voiceError={voiceError}
          />

          {/* Footer */}
          <InputFooter
            isSimpleMode={isSimpleMode}
            hasInlineSuggestion={!!inlineSuggestion}
            showCreditUsage={showCreditUsage}
            creditPercentage={creditPercentage}
            isLowBalance={isLowBalance}
            tokenCurrent={tokenUsage?.current}
            tokenMax={tokenUsage?.max}
          />
        </div>
      </motion.div>

      {/* Subscription lock dialog */}
      <SubscriptionLockDialog
        open={showLockDialog}
        onOpenChange={setShowLockDialog}
        gateResult={lockGateResult}
      />
    </>
  );
};

export default ChatInputArea;
