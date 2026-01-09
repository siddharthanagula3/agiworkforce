import { AnimatePresence, motion } from 'framer-motion';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/Popover';
import {
  ChevronDown,
  Loader2,
  Mic,
  MicOff,
  Paperclip,
  Send,
  Square,
  X,
  Brain,
  Clock,
  Radio,
  Waves,
} from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '../../lib/tauri-mock';
import { useSlashCommands } from '../../hooks/useSlashCommands';
import { useSlashCommandAutocomplete } from '../../hooks/useSlashCommandAutocomplete';
import { useApiPromptCompletion } from '../../hooks/useApiPromptCompletion';

import { getModelMetadata } from '../../constants/llm';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useVoiceTranscription } from '../../hooks/useVoiceTranscription';
import { cn } from '../../lib/utils';
import { AudioPreview } from './AudioPreview';
import { useAccountStore } from '../../stores/accountStore';
import { useModelStore } from '../../stores/modelStore';
import {
  FocusMode,
  useUnifiedChatStore,
  Attachment,
  ContextItem,
  PendingUserMessage,
} from '../../stores/unifiedChatStore';
import { QuickModelSelector } from './QuickModelSelector';
import { SubscriptionGateResult } from '../../utils/subscriptionGate';
import { SubscriptionLockDialog } from '../SubscriptionLockDialog';
import { useUsageStore } from '../../stores/usageStore';
import { useBillingStore } from '../../stores/billingStore';
import { useSettingsStore } from '../../stores/settingsStore';

const PLAN_CREDIT_LIMITS = {
  hobby: { monthly: 1.0, daily: 0.3 },
  pro: { monthly: 20.0, daily: 6.0 },
  max: { monthly: 250.0, daily: 75.0 },
};

const ATTACHMENT_LIMITS = {
  MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB per file
  MAX_TOTAL_SIZE: 200 * 1024 * 1024, // 200MB total
  MAX_COUNT: 10, // Maximum 10 attachments per message
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

const FOCUS_MODES: { value: FocusMode; label: string; placeholder: string }[] = [
  { value: 'web', label: 'Web', placeholder: 'Search the web for information...' },
  { value: 'academic', label: 'Academic', placeholder: 'Search academic papers and research...' },
  {
    value: 'code',
    label: 'Code',
    placeholder: 'Ask about code, GitHub repos, or technical docs...',
  },
  { value: 'reasoning', label: 'Writing', placeholder: 'Help me write or edit content...' },
  {
    value: 'deep-research',
    label: 'Deep Research',
    placeholder: 'Conduct in-depth research on a topic...',
  },
  { value: null, label: 'All', placeholder: 'Ask me anything...' },
];

export const ChatInputArea: React.FC<ChatInputAreaProps> = ({
  onSend,
  onStopGeneration,
  disabled = false,
  placeholder: defaultPlaceholder = 'Ask me anything...',
  maxLength = 10000,
  enableAttachments = true,
  className = '',
}) => {
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showLockDialog, setShowLockDialog] = useState(false);
  const [lockGateResult, setLockGateResult] = useState<SubscriptionGateResult | undefined>(
    undefined,
  );
  const [showSlashAutocomplete, setShowSlashAutocomplete] = useState(false);
  const [slashAutocompleteIndex, setSlashAutocompleteIndex] = useState(-1);
  // Current inline suggestion (not a dropdown)
  const [inlineSuggestion, setInlineSuggestion] = useState<string>('');

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileReadersRef = useRef<FileReader[]>([]);
  const modelSelectorRef = useRef<HTMLDivElement>(null);
  const sendAbortControllerRef = useRef<AbortController | null>(null);

  // Initialize slash command hooks
  const { isSlashCommandInput } = useSlashCommands();
  const { getAutocomplete } = useSlashCommandAutocomplete();

  // Get autocomplete suggestions based on current input
  const autocompleteResult = getAutocomplete(content, slashAutocompleteIndex);

  // Get prompt completion setting from store
  const promptCompletionEnabled = useSettingsStore(
    (state) => state.chatPreferences?.promptCompletionEnabled ?? true,
  );

  // Memoize the suggestion change handler to prevent infinite re-renders
  const handleSuggestionChange = useCallback(
    (suggestion: string) => {
      // Only update inline suggestion when not showing slash autocomplete
      if (!showSlashAutocomplete && suggestion) {
        setInlineSuggestion(' ' + suggestion);
      } else if (!suggestion) {
        setInlineSuggestion('');
      }
    },
    [showSlashAutocomplete],
  );

  // Get AI-powered prompt completion (ghost text) - similar to Gemini CLI
  const promptCompletion = useApiPromptCompletion(content, {
    enabled: promptCompletionEnabled,
    onSuggestionChange: handleSuggestionChange,
  });

  // Move the || [] inside the selector to maintain stable reference
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

  const sidecarOpen = useUnifiedChatStore((state) => state.sidecar.isOpen);
  const sidecarWidth = useUnifiedChatStore((state) => state.sidecarWidth);
  const sidebarWidth = useUnifiedChatStore((state) => state.sidebarWidth);
  const sidebarCollapsed = useUnifiedChatStore((state) => state.sidebarCollapsed);

  const selectedModel = useModelStore((state) => state.selectedModel);
  const selectedProvider = useModelStore((state) => state.selectedProvider);
  const thinkingModeEnabled = useModelStore((state) => state.thinkingModeEnabled);
  const availableModels = useModelStore((state) => state.availableModels);
  const prefersReducedMotion = useReducedMotion();

  // Voice transcription state
  const [preferLocalWhisper, setPreferLocalWhisper] = useState(false);
  const [showTranscriptionModeSelector, setShowTranscriptionModeSelector] = useState(false);

  const {
    isRecording: isListening,
    isTranscribing,
    isSupported: isVoiceSupported,
    interimTranscript,
    error: voiceError,
    availableLocalWhisper,
    toggleRecording,
    clearTranscript: _resetVoiceTranscript,
  } = useVoiceTranscription({
    preferLocal: preferLocalWhisper,
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

  // Wrap toggleRecording to handle the async nature
  const toggleListening = useCallback(() => {
    toggleRecording().catch((err) => {
      console.error('[ChatInputArea] Failed to toggle recording:', err);
    });
  }, [toggleRecording]);

  const modelDisplayName = selectedModel?.startsWith('auto')
    ? (getModelMetadata('managed-cloud-auto')?.name ?? 'Auto (Smart Routing)')
    : selectedModel === 'auto'
      ? (getModelMetadata('managed-cloud-auto')?.name ?? 'Auto (Best Value)')
      : selectedModel
        ? (getModelMetadata(selectedModel)?.name ??
          availableModels.find((m) => m.id === selectedModel)?.name ??
          selectedModel)
        : 'GPT-5.1 Instant';

  // Allow typing while streaming - only disable when actually sending
  const isInputDisabled = disabled || isSending;
  // Track if we're in "queue mode" - AI is busy but user can still type
  const isQueueMode = isLoading || isStreaming;
  const isEmptyState = messages.length === 0;
  const showStopButton = isStreaming && onStopGeneration;

  // Get pending messages from store
  const pendingMessages = useUnifiedChatStore((state) => state.pendingMessages);
  const addPendingMessage = useUnifiedChatStore((state) => state.addPendingMessage);
  const pendingCount = pendingMessages.length;

  // Sync draft content from store, but don't overwrite if user is actively editing
  useEffect(() => {
    // Only update content if draft is different AND content is empty or draft is more recent
    // This prevents overwriting user input while they're typing
    if (draftContent && draftContent !== content && content === '') {
      setContent(draftContent);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Intentional: only run when draft changes, not on every content change to avoid circular updates
  }, [draftContent]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setShowModelSelector((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modelSelectorRef.current && !modelSelectorRef.current.contains(event.target as Node)) {
        setShowModelSelector(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowModelSelector(false);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);

  // Listen for auto-send events from pending message queue
  // This is triggered when the AI finishes processing and pending messages are ready
  useEffect(() => {
    const handleAutoSendPending = async (event: Event) => {
      const customEvent = event as CustomEvent<{ content: string; pendingId: string }>;
      const { content: pendingContent, pendingId } = customEvent.detail;

      console.log(
        '[ChatInputArea] Auto-sending pending message:',
        pendingId,
        pendingContent.slice(0, 50),
      );

      // Don't send if we're currently sending or disabled
      if (isSending || disabled) {
        console.log('[ChatInputArea] Skipping auto-send - busy or disabled');
        return;
      }

      // Don't send if AI is still busy (queue mode)
      if (isQueueMode) {
        console.log('[ChatInputArea] Skipping auto-send - still in queue mode');
        return;
      }

      try {
        // Call onSend directly with the pending message content
        await onSend(pendingContent, {
          attachments: undefined,
          context: activeContext.length > 0 ? activeContext : undefined,
          modelOverride: selectedModel || undefined,
          providerOverride: selectedProvider || undefined,
          focusMode: focusMode,
        });
        console.log('[ChatInputArea] Successfully sent pending message:', pendingId);
      } catch (err) {
        console.error('[ChatInputArea] Failed to auto-send pending message:', err);
      }
    };

    window.addEventListener('chat:auto-send-pending', handleAutoSendPending);
    return () => window.removeEventListener('chat:auto-send-pending', handleAutoSendPending);
  }, [
    onSend,
    isSending,
    disabled,
    isQueueMode,
    activeContext,
    selectedModel,
    selectedProvider,
    focusMode,
  ]);

  const placeholder =
    FOCUS_MODES.find((m) => m.value === focusMode)?.placeholder || defaultPlaceholder;

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const scrollHeight = textarea.scrollHeight;
      const lineHeight = 24;
      const maxHeight = lineHeight * MAX_ROWS;
      textarea.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
    }
  }, [content]);

  // Cleanup function for FileReaders (using base64 content instead of blob URLs)
  const cleanup = useCallback(() => {
    // Abort any in-progress FileReaders
    fileReadersRef.current.forEach((reader) => {
      try {
        if (reader.readyState === FileReader.LOADING) {
          reader.abort();
        }
      } catch (err) {
        console.error('[ChatInputArea] Error aborting FileReader:', err);
      }
    });
    fileReadersRef.current = [];
  }, []);

  // Cleanup on component unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  // Helper to read a file as base64 data URL
  const readFileAsBase64 = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      fileReadersRef.current.push(reader);

      reader.onload = () => {
        fileReadersRef.current = fileReadersRef.current.filter((r) => r !== reader);
        resolve(reader.result as string);
      };

      reader.onerror = () => {
        fileReadersRef.current = fileReadersRef.current.filter((r) => r !== reader);
        reject(new Error(`Failed to read file: ${file.name}`));
      };

      reader.readAsDataURL(file);
    });
  }, []);

  const handleFilesAdded = useCallback(
    async (files: File[]) => {
      // Validate file sizes
      const oversizedFiles: string[] = [];
      let totalSize = 0;

      for (const file of files) {
        if (file.size > ATTACHMENT_LIMITS.MAX_FILE_SIZE) {
          oversizedFiles.push(`${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
        }
        totalSize += file.size;
      }

      if (oversizedFiles.length > 0) {
        setSubmitError(`File(s) exceed 50MB limit: ${oversizedFiles.join(', ')}`);
        return;
      }

      // Check total attachment count
      const totalAttachments = attachments.length + files.length;
      if (totalAttachments > ATTACHMENT_LIMITS.MAX_COUNT) {
        setSubmitError(
          `Maximum ${ATTACHMENT_LIMITS.MAX_COUNT} attachments allowed (${totalAttachments} provided)`,
        );
        return;
      }

      // Check total size across all attachments
      const currentTotalSize = attachments.reduce((sum, att) => sum + (att.size || 0), 0);
      if (currentTotalSize + totalSize > ATTACHMENT_LIMITS.MAX_TOTAL_SIZE) {
        setSubmitError(`Total attachment size would exceed 200MB limit`);
        return;
      }

      // Check for image files
      const hasImages = files.some((f) => f.type.startsWith('image/'));
      const metadata = selectedModel ? getModelMetadata(selectedModel) : null;

      // If we have images and the model explicitly doesn't support vision
      if (hasImages && metadata && metadata.capabilities.vision === false) {
        setSubmitError(
          `The model "${metadata.name}" does not support image attachments. Please switch to a vision-capable model like GPT-5.2 or Claude Sonnet.`,
        );
        // Filter out images, but allow other files if any
        const nonImageFiles = files.filter((f) => !f.type.startsWith('image/'));
        if (nonImageFiles.length === 0) return;

        // Convert non-image files to base64
        const newAttachments: Attachment[] = await Promise.all(
          nonImageFiles.map(async (file) => {
            const base64Content = await readFileAsBase64(file);
            return {
              id: crypto.randomUUID(),
              type: 'file' as const,
              name: file.name,
              size: file.size,
              mimeType: file.type,
              content: base64Content, // Base64 data URL for backend
            };
          }),
        );
        setAttachments((prev) => [...prev, ...newAttachments]);
        return;
      }

      // Convert all files to base64 for backend compatibility
      try {
        const newAttachments: Attachment[] = await Promise.all(
          files.map(async (file) => {
            const base64Content = await readFileAsBase64(file);
            // Determine attachment type based on MIME type
            let attachmentType: 'image' | 'audio' | 'file' = 'file';
            if (file.type.startsWith('image/')) {
              attachmentType = 'image';
            } else if (file.type.startsWith('audio/')) {
              attachmentType = 'audio';
            }
            return {
              id: crypto.randomUUID(),
              type: attachmentType,
              name: file.name,
              size: file.size,
              mimeType: file.type,
              content: base64Content, // Base64 data URL for backend
            };
          }),
        );
        setAttachments((prev) => [...prev, ...newAttachments]);
        setSubmitError(null); // Clear error on success
      } catch (error) {
        console.error('[ChatInputArea] Error reading files:', error);
        setSubmitError('Failed to process one or more files. Please try again.');
      }
    },
    [selectedModel, attachments, readFileAsBase64],
  );

  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(true);
    };
    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      if (e.target === document.body) setIsDragging(false);
    };
    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = Array.from(e.dataTransfer?.files || []);
      if (files.length > 0) handleFilesAdded(files);
    };

    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('dragleave', handleDragLeave);
    document.addEventListener('drop', handleDrop);
    return () => {
      document.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('dragleave', handleDragLeave);
      document.removeEventListener('drop', handleDrop);
    };
  }, [handleFilesAdded]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;

    // Allow input but warn if exceeding limit
    if (value.length > maxLength) {
      setSubmitError(`Character limit exceeded by ${value.length - maxLength} characters`);
      return;
    }

    setContent(value);
    setDraftContent(value);

    // Show warning when approaching limit (90% threshold)
    const charPercentage = (value.length / maxLength) * 100;
    if (charPercentage > 90) {
      setSubmitError(
        `${maxLength - value.length} characters remaining (${charPercentage.toFixed(0)}% used)`,
      );
    } else if (
      submitError?.includes('Character limit') ||
      submitError?.includes('characters remaining')
    ) {
      // Clear previous character limit warnings
      setSubmitError(null);
    }

    // Update slash command autocomplete state
    const isSlashInput = isSlashCommandInput(value);
    setShowSlashAutocomplete(isSlashInput);
    if (!isSlashInput) {
      setSlashAutocompleteIndex(-1);
    } else {
      // Reset index when input changes
      setSlashAutocompleteIndex(-1);
      // Clear ghost text when typing slash commands
      setInlineSuggestion('');
      promptCompletion.clear();
    }
  };

  const handleSubmit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!content.trim() || isInputDisabled || isSending) return;

    const messageContent = content.trim();

    // If AI is currently processing, queue the message instead of sending
    if (isQueueMode) {
      try {
        // Queue message via Tauri backend
        const pendingMsg = await invoke<PendingUserMessage>('chat_add_pending_message', {
          request: {
            content: messageContent,
            conversation_id: null, // Will be associated with current conversation
          },
        });

        // Also update local store for immediate UI feedback
        addPendingMessage(pendingMsg);

        // Clear input
        setContent('');
        setDraftContent('');

        console.log('[ChatInputArea] Message queued:', pendingMsg.id);
      } catch (error) {
        console.error('[ChatInputArea] Failed to queue message:', error);
        setSubmitError('Failed to queue message. Please try again.');
      }
      return;
    }

    // Normal send flow when AI is not busy
    // Prevent concurrent sends - abort any in-flight request
    if (sendAbortControllerRef.current) {
      sendAbortControllerRef.current.abort();
    }
    sendAbortControllerRef.current = new AbortController();
    const currentAbortSignal = sendAbortControllerRef.current.signal;

    // Check for Auto Mode restrictions
    if (selectedModel === 'auto') {
      // Check access directly against account store to ensure freshness
      const { account } = useAccountStore.getState();
      const plan = account?.plan || 'free';
      const hasAccess = ['hobby', 'pro', 'max', 'enterprise'].includes(plan);

      if (!hasAccess) {
        setLockGateResult({
          hasAccess: false,
          reason: 'Auto Mode requires a Hobby plan or higher.',
          requiresUpgrade: true,
          currentTier: plan,
          currentStatus: (account as any)?.subscriptionStatus || 'none',
        });
        setShowLockDialog(true);
        sendAbortControllerRef.current = null;
        return;
      }
      // Start token check (optional, but good practice for Auto Mode)
      if (monthlyLimit > 0 && monthlyCost >= monthlyLimit * 0.99) {
        setSubmitError('Insufficient token credits for Auto Mode. Please upgrade plan.');
        sendAbortControllerRef.current = null;
        return;
      }
    } else {
      // Clear any specific gate result if not auto mode, fall back to global check if needed
      // but currently we unblocked everyone except for Auto Mode.
      setLockGateResult(undefined);
    }

    setIsSending(true);
    setSubmitError(null);
    const messageAttachments = attachments.length > 0 ? attachments : undefined;

    setContent('');
    setDraftContent('');
    setAttachments([]);

    try {
      // Only proceed if this abort signal is still valid (not cancelled)
      if (currentAbortSignal.aborted) {
        throw new Error('Message send was cancelled');
      }

      const state = useAccountStore.getState();
      const plan = state.account?.plan?.toLowerCase() || 'free';
      const isManagedPlan = plan !== 'free' && plan !== 'none';

      // Pre-flight Credit Check
      // Only apply to managed plans using cloud providers (not local ollama)
      if (isManagedPlan && selectedProvider !== 'ollama') {
        const { creditBalance_cents, dailyUsage_cents, dailyLimit_cents } =
          useBillingStore.getState();

        if (creditBalance_cents !== null && creditBalance_cents <= 0) {
          setSubmitError(
            'Insufficient credits to send message. Please upgrade your plan or wait for credits to refresh.',
          );
          sendAbortControllerRef.current = null;
          return;
        }

        if (dailyLimit_cents && dailyUsage_cents && dailyUsage_cents >= dailyLimit_cents) {
          setSubmitError('Daily credit limit reached. Credits will reset at midnight UTC.');
          sendAbortControllerRef.current = null;
          return;
        }
      }

      // Force managed_cloud for managed plans unless using local ollama
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

      // Only cancel editing if this send was not aborted
      if (!currentAbortSignal.aborted) {
        cancelEditing();
      }
    } catch (error) {
      // Don't restore content if the send was cancelled (user intentionally stopped it)
      if (!currentAbortSignal.aborted) {
        setContent(messageContent);
        setDraftContent(messageContent);
        if (messageAttachments) setAttachments(messageAttachments);
        setSubmitError(error instanceof Error ? error.message : String(error));
        console.error('[ChatInputArea] Send failed:', error);
      }
    } finally {
      if (!currentAbortSignal.aborted) {
        setIsSending(false);
      }
      sendAbortControllerRef.current = null;
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle slash command autocomplete navigation
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

    // Handle inline suggestion acceptance with Tab
    if (inlineSuggestion && event.key === 'Tab' && !showSlashAutocomplete) {
      event.preventDefault();
      // Accept the inline suggestion using the hook's accept method
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

    // Dismiss suggestion with Escape
    if (inlineSuggestion && event.key === 'Escape') {
      event.preventDefault();
      promptCompletion.clear();
      setInlineSuggestion('');
      return;
    }

    // Handle normal submit
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    handleFilesAdded(files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const attachment = prev.find((item) => item.id === id);
      if (attachment?.path?.startsWith('blob:')) URL.revokeObjectURL(attachment.path);
      return prev.filter((item) => item.id !== id);
    });
  };

  const handlePaste = (event: React.ClipboardEvent) => {
    const items = Array.from(event.clipboardData.items).filter((item) =>
      item.type.startsWith('image/'),
    );
    if (items.length === 0) return;

    // Check vision capability for pasted images
    const metadata = selectedModel ? getModelMetadata(selectedModel) : null;
    if (metadata && metadata.capabilities.vision === false) {
      event.preventDefault();
      setSubmitError(
        `The model "${metadata.name}" does not support image attachments. Please switch to a vision-capable model like GPT-5.2 or Claude Sonnet.`,
      );
      return;
    }

    event.preventDefault();
    setSubmitError(null); // Clear error

    const MAX_PASTE_FILE_SIZE = 10 * 1024 * 1024; // 10MB limit for paste
    const MAX_CONCURRENT_READS = 3; // Limit concurrent FileReaders

    items.forEach((item) => {
      const file = item.getAsFile();
      if (!file) return;

      // Skip files that are too large
      if (file.size > MAX_PASTE_FILE_SIZE) {
        setSubmitError(
          `Pasted file is too large (${(file.size / 1024 / 1024).toFixed(2)}MB). Maximum is 10MB.`,
        );
        return;
      }

      // Throttle concurrent reads to prevent memory exhaustion
      if (fileReadersRef.current.length >= MAX_CONCURRENT_READS) {
        setSubmitError('Too many files being processed. Please wait and try again.');
        return;
      }

      const reader = new FileReader();
      fileReadersRef.current.push(reader);

      reader.onerror = () => {
        setSubmitError('Failed to read pasted file. Please try again.');
        fileReadersRef.current = fileReadersRef.current.filter((r) => r !== reader);
      };

      reader.onload = (e) => {
        try {
          const base64 = e.target?.result as string;
          if (!base64 || base64.length === 0) {
            setSubmitError('Pasted file is empty or unreadable.');
            return;
          }

          const attachment: Attachment = {
            id: crypto.randomUUID(),
            type: 'image',
            name: 'pasted-image.png',
            size: file.size,
            mimeType: file.type,
            content: base64,
          };
          setAttachments((prev) => [...prev, attachment]);
        } catch (err) {
          console.error('[ChatInputArea] Error processing pasted file:', err);
          setSubmitError('Error processing pasted file. Please try again.');
        } finally {
          fileReadersRef.current = fileReadersRef.current.filter((r) => r !== reader);
        }
      };

      reader.readAsDataURL(file);
    });
  };

  const tokenPercentage =
    tokenUsage?.current != null && tokenUsage?.max != null && tokenUsage.max > 0
      ? Math.min((tokenUsage.current / tokenUsage.max) * 100, 100)
      : 0;

  // Use individual selectors to avoid re-renders on unrelated state changes
  const getTokenCost = useUsageStore((state) => state.getTokenCost);
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

  return (
    <>
      {}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md"
          >
            <div className="flex h-full items-center justify-center">
              <motion.div
                initial={{ scale: 0.8, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.8, opacity: 0, y: 20 }}
                transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                className="flex flex-col items-center gap-6"
              >
                {/* Animated border container */}
                <div className="relative">
                  <motion.div
                    className="absolute inset-0 rounded-3xl bg-linear-to-r from-primary via-purple-500 to-primary"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                    style={{ padding: '3px' }}
                  />
                  <div className="relative rounded-3xl bg-zinc-900 p-10">
                    <motion.div
                      animate={{ y: [0, -8, 0] }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                    >
                      <Paperclip className="h-16 w-16 text-primary" />
                    </motion.div>
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-semibold text-white mb-2">Drop files here</p>
                  <p className="text-sm text-zinc-400">Images, documents, and more</p>
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,audio/*"
        className="hidden"
        onChange={handleFileSelect}
      />
      <motion.div
        className={cn(
          'fixed z-40 w-full px-4',
          isEmptyState ? 'max-w-2xl' : 'max-w-5xl',
          className,
        )}
        initial={false}
        animate={{
          bottom: isEmptyState ? '50%' : '24px',
          left: sidecarOpen
            ? `calc(${sidebarCollapsed ? 64 : sidebarWidth}px + (100% - ${sidebarCollapsed ? 64 : sidebarWidth}px - ${sidecarWidth}px) / 2)`
            : `calc(${sidebarCollapsed ? 64 : sidebarWidth}px + (100% - ${sidebarCollapsed ? 64 : sidebarWidth}px) / 2)`,
          x: '-50%',
          y: isEmptyState ? '50%' : '0%',
          maxWidth: isEmptyState ? '42rem' : '64rem',
        }}
        transition={
          prefersReducedMotion
            ? { duration: 0.15 }
            : { type: 'spring', stiffness: 350, damping: 30 }
        }
        style={{ willChange: 'transform' }}
      >
        <motion.div
          initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: prefersReducedMotion ? 0.1 : 0.2 }}
          className="mb-3 flex items-center justify-center gap-2 flex-wrap"
        >
          {FOCUS_MODES.map((mode) => (
            <button
              key={mode.value || 'all'}
              onClick={() => setFocusMode(mode.value)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-full transition-all duration-200',
                focusMode === mode.value
                  ? 'bg-primary text-white shadow-md shadow-primary/25'
                  : 'bg-white/80 dark:bg-charcoal-800/80 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-charcoal-700 border border-gray-200 dark:border-gray-700',
              )}
              aria-pressed={focusMode === mode.value}
            >
              {mode.label}
            </button>
          ))}
        </motion.div>

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

          {}
          {activeContext.length > 0 && (
            <div className="border-b border-gray-100 dark:border-gray-700/50 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  Context
                </span>
                {activeContext.map((item) => (
                  <div
                    key={item.id}
                    className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 dark:bg-primary/20 px-2.5 py-1 text-xs text-primary dark:text-primary-foreground"
                  >
                    <span>{item.icon ?? 'CTX'}</span>
                    <span className="max-w-[180px] truncate">{item.name}</span>
                    <button
                      type="button"
                      onClick={() => removeContextItem(item.id)}
                      className="ml-0.5 text-primary/70 hover:text-primary transition"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Attachments with image and audio previews */}
          {attachments.length > 0 && (
            <div className="border-b border-gray-100 dark:border-gray-700/50 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                {attachments.map((attachment) => {
                  const isImage = attachment.type === 'image' || attachment.type === 'screenshot';
                  const isAudio =
                    attachment.type === 'audio' || attachment.mimeType?.startsWith('audio/');
                  const imageUrl = attachment.content || attachment.path;
                  const audioUrl = attachment.content || attachment.path;

                  // Render audio preview with playback controls
                  if (isAudio && audioUrl) {
                    return (
                      <AudioPreview
                        key={attachment.id}
                        src={audioUrl}
                        name={attachment.name}
                        duration={attachment.duration}
                        onRemove={() => removeAttachment(attachment.id)}
                        compact
                      />
                    );
                  }

                  return (
                    <div
                      key={attachment.id}
                      className={cn(
                        'group relative inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-charcoal-700 text-sm overflow-hidden',
                        isImage ? 'p-1' : 'px-3 py-2',
                      )}
                    >
                      {isImage && imageUrl ? (
                        <div className="relative">
                          <img
                            src={imageUrl}
                            alt={attachment.name}
                            className="h-16 w-16 object-cover rounded-md"
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors rounded-md" />
                        </div>
                      ) : (
                        <>
                          <Paperclip size={16} className="text-gray-400" />
                          <span className="truncate max-w-[150px] text-gray-700 dark:text-gray-300">
                            {attachment.name}
                          </span>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => removeAttachment(attachment.id)}
                        className={cn(
                          'transition',
                          isImage
                            ? 'absolute top-1 right-1 p-1 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100'
                            : 'text-gray-400 hover:text-gray-600',
                        )}
                      >
                        <X size={isImage ? 12 : 14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {submitError && (
            <div className="border-b border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-700 dark:border-rose-600/60 dark:bg-rose-900/20 dark:text-rose-100">
              {submitError}
            </div>
          )}

          {}
          <div className="flex items-end gap-2 p-3">
            {}
            <div className="flex items-center gap-1">
              {enableAttachments && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isInputDisabled}
                  className={cn(
                    'p-2 rounded-lg transition-colors',
                    'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300',
                    'hover:bg-gray-100 dark:hover:bg-charcoal-700',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    selectedModel &&
                      getModelMetadata(selectedModel)?.capabilities.vision === false &&
                      'opacity-50 cursor-not-allowed text-gray-300 dark:text-gray-600',
                  )}
                  title={
                    selectedModel && getModelMetadata(selectedModel)?.capabilities.vision === false
                      ? 'Current model does not support attachments'
                      : 'Attach files'
                  }
                >
                  <Paperclip size={18} />
                </button>
              )}
              {/* Voice recording button with mode selector */}
              <div className="relative">
                <Popover
                  open={showTranscriptionModeSelector}
                  onOpenChange={setShowTranscriptionModeSelector}
                >
                  <div className="flex items-center">
                    <button
                      type="button"
                      onClick={toggleListening}
                      disabled={isInputDisabled || !isVoiceSupported || isTranscribing}
                      className={cn(
                        'p-2 rounded-l-lg transition-all duration-200',
                        isListening
                          ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/25'
                          : isTranscribing
                            ? 'bg-amber-500 text-white animate-pulse'
                            : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-charcoal-700',
                        'disabled:opacity-50 disabled:cursor-not-allowed',
                      )}
                      title={
                        isListening
                          ? 'Stop recording'
                          : isTranscribing
                            ? 'Transcribing...'
                            : `Voice input (${preferLocalWhisper ? 'Whisper' : 'Live'})`
                      }
                    >
                      {isTranscribing ? (
                        <Loader2 size={18} className="animate-spin" />
                      ) : isListening ? (
                        <MicOff size={18} />
                      ) : (
                        <Mic size={18} />
                      )}
                    </button>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        disabled={isInputDisabled || !isVoiceSupported || isListening}
                        className={cn(
                          'p-2 rounded-r-lg border-l border-gray-200 dark:border-gray-600 transition-colors',
                          'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300',
                          'hover:bg-gray-100 dark:hover:bg-charcoal-700',
                          'disabled:opacity-50 disabled:cursor-not-allowed',
                        )}
                        title="Select transcription mode"
                      >
                        <ChevronDown size={12} />
                      </button>
                    </PopoverTrigger>
                  </div>
                  <PopoverContent align="start" side="top" sideOffset={8} className="w-64 p-2">
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 px-2 pb-1">
                        Transcription Mode
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setPreferLocalWhisper(false);
                          setShowTranscriptionModeSelector(false);
                        }}
                        className={cn(
                          'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors',
                          !preferLocalWhisper
                            ? 'bg-primary/10 text-primary'
                            : 'hover:bg-gray-100 dark:hover:bg-charcoal-700 text-gray-700 dark:text-gray-300',
                        )}
                      >
                        <Radio size={16} />
                        <div className="flex-1">
                          <div className="text-sm font-medium">Live (Web Speech)</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            Real-time transcription as you speak
                          </div>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPreferLocalWhisper(true);
                          setShowTranscriptionModeSelector(false);
                        }}
                        className={cn(
                          'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors',
                          preferLocalWhisper
                            ? 'bg-primary/10 text-primary'
                            : 'hover:bg-gray-100 dark:hover:bg-charcoal-700 text-gray-700 dark:text-gray-300',
                        )}
                      >
                        <Waves size={16} />
                        <div className="flex-1">
                          <div className="text-sm font-medium">
                            Whisper {availableLocalWhisper.length > 0 ? '(Local)' : '(Cloud)'}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            More accurate, processes after recording
                          </div>
                        </div>
                      </button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {}
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={content}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder={
                  isQueueMode ? 'Type to queue a message while AI is working...' : placeholder
                }
                disabled={isInputDisabled}
                rows={1}
                className={cn(
                  'w-full resize-none bg-transparent py-2 px-2 pr-12',
                  'text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500',
                  'focus:outline-hidden',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  'text-[15px] leading-6',
                )}
                style={{ maxHeight: `${24 * MAX_ROWS}px` }}
              />

              {/* Character count indicator */}
              <div
                className={cn(
                  'absolute bottom-2 right-2 text-xs font-medium pointer-events-none',
                  content.length > maxLength * 0.9
                    ? 'text-orange-500 dark:text-orange-400'
                    : 'text-gray-400 dark:text-gray-500',
                )}
              >
                {content.length} / {maxLength}
              </div>

              {/* Slash Command Autocomplete Dropdown */}
              <AnimatePresence>
                {showSlashAutocomplete && autocompleteResult.suggestions.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.15 }}
                    className="absolute bottom-full left-0 right-0 mb-2 rounded-xl bg-white dark:bg-charcoal-800 border border-gray-200 dark:border-gray-700 shadow-lg overflow-hidden z-50"
                  >
                    <div className="max-h-72 overflow-y-auto">
                      {autocompleteResult.suggestions.map((suggestion, index) => (
                        <button
                          key={suggestion.command}
                          onClick={() => {
                            const newContent = content.replace(/\/\w*$/, suggestion.command);
                            setContent(newContent + ' ');
                            setDraftContent(newContent + ' ');
                            setShowSlashAutocomplete(false);
                            textareaRef.current?.focus();
                          }}
                          onMouseEnter={() => setSlashAutocompleteIndex(index)}
                          className={cn(
                            'w-full text-left px-4 py-3 transition-colors border-b border-gray-100 dark:border-gray-700/50 last:border-b-0',
                            index === slashAutocompleteIndex
                              ? 'bg-primary/10 dark:bg-primary/10'
                              : 'hover:bg-gray-50 dark:hover:bg-charcoal-700',
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-lg">{suggestion.icon}</span>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <code className="text-sm font-semibold text-primary">
                                  {suggestion.command}
                                </code>
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  {suggestion.description}
                                </span>
                              </div>
                              <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                {suggestion.example}
                              </div>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                    <div className="px-4 py-2 bg-gray-50 dark:bg-charcoal-700/50 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
                      Use ↑↓ to navigate • Enter to select • Esc to close
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Inline Suggestion (Ghost Text) - AI-powered like Gemini CLI */}
              {(inlineSuggestion || promptCompletion.isLoading) && !showSlashAutocomplete && (
                <div
                  className="absolute top-2 left-2 text-[15px] leading-6 text-gray-400 dark:text-gray-600 pointer-events-none"
                  style={{
                    paddingLeft: '8px',
                    paddingRight: '8px',
                  }}
                >
                  <span className="invisible">{content}</span>
                  {promptCompletion.isLoading ? (
                    <span className="text-gray-300 dark:text-gray-700 animate-pulse">...</span>
                  ) : (
                    <span className="italic">{inlineSuggestion}</span>
                  )}
                </div>
              )}
            </div>

            {}
            <div className="flex items-center gap-2">
              {}
              <div className="relative" ref={modelSelectorRef}>
                <Popover open={showModelSelector} onOpenChange={setShowModelSelector}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        'flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium',
                        'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200',
                        'transition-colors duration-150',
                      )}
                    >
                      <span className="truncate max-w-[100px]">{modelDisplayName}</span>
                      {thinkingModeEnabled && <Brain size={12} className="text-purple-500" />}
                      <ChevronDown
                        size={12}
                        className={cn('transition-transform', showModelSelector && 'rotate-180')}
                      />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="end"
                    side="top"
                    sideOffset={12}
                    collisionPadding={16}
                    className="w-72 border-none bg-transparent p-0 shadow-none z-[100]"
                  >
                    <QuickModelSelector onClose={() => setShowModelSelector(false)} />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Pending messages indicator */}
              {pendingCount > 0 && (
                <div
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-medium"
                  title={`${pendingCount} message(s) queued`}
                >
                  <Clock size={12} />
                  <span>{pendingCount}</span>
                </div>
              )}

              {}
              {showStopButton ? (
                <button
                  type="button"
                  onClick={onStopGeneration}
                  className={cn(
                    'p-2 rounded-lg transition-all duration-200',
                    'bg-red-500 hover:bg-red-600 text-white',
                    'shadow-lg shadow-red-500/25 animate-pulse',
                  )}
                  title="Stop generation"
                >
                  <Square size={16} fill="currentColor" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleSubmit()}
                  disabled={isInputDisabled || !content.trim()}
                  className={cn(
                    'p-2 rounded-lg transition-all duration-200',
                    content.trim() && !isInputDisabled
                      ? isQueueMode
                        ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-md'
                        : 'bg-terra-cotta-500 hover:bg-terra-cotta-600 text-white shadow-md'
                      : 'bg-gray-100 dark:bg-charcoal-700 text-gray-400 cursor-not-allowed',
                  )}
                  title={isQueueMode ? 'Queue message' : 'Send message'}
                >
                  {isSending ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : isQueueMode ? (
                    <Clock size={16} />
                  ) : (
                    <Send size={16} />
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Recording / Transcribing status indicator */}
          <AnimatePresence>
            {(isListening || isTranscribing || interimTranscript) && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className={cn(
                  'px-4 py-2 border-t border-gray-100 dark:border-gray-700/50',
                  isTranscribing
                    ? 'bg-amber-50 dark:bg-amber-900/10'
                    : 'bg-red-50 dark:bg-red-900/10',
                )}
              >
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="relative flex h-2 w-2">
                      <span
                        className={cn(
                          'animate-ping absolute inline-flex h-full w-full rounded-full opacity-75',
                          isTranscribing ? 'bg-amber-400' : 'bg-red-400',
                        )}
                      />
                      <span
                        className={cn(
                          'relative inline-flex rounded-full h-2 w-2',
                          isTranscribing ? 'bg-amber-500' : 'bg-red-500',
                        )}
                      />
                    </span>
                    <span
                      className={cn(
                        'text-xs font-medium',
                        isTranscribing
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-red-600 dark:text-red-400',
                      )}
                    >
                      {isTranscribing ? 'Transcribing...' : 'Recording'}
                    </span>
                    {preferLocalWhisper && !isTranscribing && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">(Whisper)</span>
                    )}
                  </div>
                  {interimTranscript && (
                    <span className="text-xs text-gray-600 dark:text-gray-400 italic truncate flex-1">
                      {interimTranscript}
                    </span>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {}
          <AnimatePresence>
            {voiceError && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="px-4 py-2 border-t border-gray-100 dark:border-gray-700/50 bg-amber-50 dark:bg-amber-900/10"
              >
                <span className="text-xs text-amber-600 dark:text-amber-400">{voiceError}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100 dark:border-gray-700/50">
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {inlineSuggestion ? (
                <>Tab to accept suggestion / Esc to dismiss</>
              ) : (
                <>Enter to send / Shift+Enter for newline</>
              )}
            </span>

            {showCreditUsage ? (
              <div
                className="flex items-center gap-2"
                title={`Monthly Usage: ${creditPercentage.toFixed(1)}%`}
              >
                <div className="w-24 h-1.5 bg-gray-200 dark:bg-charcoal-700 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-300',
                      creditPercentage > 90
                        ? 'bg-red-500'
                        : creditPercentage > 75
                          ? 'bg-amber-500'
                          : 'bg-green-500',
                    )}
                    style={{ width: `${creditPercentage}%` }}
                  />
                </div>
                <span
                  className={cn(
                    'text-xs font-medium tabular-nums',
                    isLowBalance ? 'text-amber-500' : 'text-gray-400 dark:text-gray-500',
                  )}
                >
                  {creditPercentage.toFixed(1)}%
                </span>
              </div>
            ) : (
              tokenUsage && (
                <div className="flex items-center gap-2" title="Context Window Usage">
                  <div className="w-24 h-1.5 bg-gray-200 dark:bg-charcoal-700 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-300',
                        tokenPercentage > 90
                          ? 'bg-red-500'
                          : tokenPercentage > 70
                            ? 'bg-amber-500'
                            : 'bg-primary',
                      )}
                      style={{ width: `${tokenPercentage}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {(tokenUsage.current ?? 0).toLocaleString()} /{' '}
                    {(tokenUsage.max ?? 0).toLocaleString()}
                  </span>
                </div>
              )
            )}
          </div>
        </div>
      </motion.div>
      <SubscriptionLockDialog
        open={showLockDialog}
        onOpenChange={setShowLockDialog}
        gateResult={lockGateResult}
      />
    </>
  );
};

export default ChatInputArea;
