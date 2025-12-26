import { AnimatePresence, motion } from 'framer-motion';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/Popover';
import {
  Camera,
  ChevronDown,
  Image as ImageIcon,
  Loader2,
  Mic,
  MicOff,
  Paperclip,
  Send,
  Square,
  X,
  Brain,
} from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { getModelMetadata } from '../../constants/llm';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useVoiceInput } from '../../hooks/useVoiceInput';
import { cn } from '../../lib/utils';
import { useAccountStore } from '../../stores/accountStore';
import { useModelStore } from '../../stores/modelStore';
import {
  FocusMode,
  useUnifiedChatStore,
  Attachment,
  ContextItem,
} from '../../stores/unifiedChatStore';
import { QuickModelSelector } from './QuickModelSelector';
import { checkAutoModeAccess, SubscriptionGateResult } from '../../utils/subscriptionGate';
import { SubscriptionLockDialog } from '../SubscriptionLockDialog';
import { useUsageStore } from '../../stores/usageStore';
import { useBillingStore } from '../../stores/billingStore';

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

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileReadersRef = useRef<FileReader[]>([]);
  const modelSelectorRef = useRef<HTMLDivElement>(null);

  const activeContext = useUnifiedChatStore((state) => state.activeContext) || [];
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
  const { account: _account, isPro: _isPro } = useAccountStore();
  const prefersReducedMotion = useReducedMotion();

  const {
    isListening,
    isSupported: isVoiceSupported,
    interimTranscript,
    error: voiceError,
    toggleListening,
  } = useVoiceInput({
    continuous: false,
    interimResults: true,
    language: 'en-US',
    onResult: useCallback(
      (transcript: string, isFinal: boolean) => {
        if (isFinal) {
          setContent((prev) => {
            const next = prev + (prev ? ' ' : '') + transcript;
            setDraftContent(next);
            return next;
          });
        }
      },
      [setDraftContent],
    ),
  });

  const modelDisplayName =
    selectedModel === 'auto'
      ? 'Auto'
      : selectedModel
        ? (getModelMetadata(selectedModel)?.name ?? 'GPT-5.1 Instant')
        : 'GPT-5.1 Instant';

  const isDisabled = disabled || isLoading || isSending || isStreaming;
  const isEmptyState = messages.length === 0;
  const showStopButton = isStreaming && onStopGeneration;

  useEffect(() => {
    if (draftContent !== content) {
      setContent(draftContent);
    }
  }, [draftContent, content]);

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
    setShowModelSelector(false);
  }, [selectedModel]);

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

  useEffect(() => {
    return () => {
      fileReadersRef.current.forEach((reader) => {
        if (reader.readyState === FileReader.LOADING) {
          reader.abort();
        }
      });
      fileReadersRef.current = [];
      attachments.forEach((attachment) => {
        if (attachment.path && attachment.path.startsWith('blob:')) {
          URL.revokeObjectURL(attachment.path);
        }
      });
    };
  }, [attachments]);

  const handleFilesAdded = useCallback(
    (files: File[]) => {
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

        const newAttachments: Attachment[] = nonImageFiles.map((file) => ({
          id: crypto.randomUUID(),
          type: 'file', // Treat as generic file
          name: file.name,
          size: file.size,
          mimeType: file.type,
          path: URL.createObjectURL(file), // Still create object URL for generic file preview if needed
        }));
        setAttachments((prev) => [...prev, ...newAttachments]);
        return;
      }

      const newAttachments: Attachment[] = files.map((file) => ({
        id: crypto.randomUUID(),
        type: file.type.startsWith('image/') ? 'image' : 'file',
        name: file.name,
        size: file.size,
        mimeType: file.type,
        path: URL.createObjectURL(file),
      }));
      setAttachments((prev) => [...prev, ...newAttachments]);
      setSubmitError(null); // Clear error on success
    },
    [selectedModel],
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
    if (value.length <= maxLength) {
      setContent(value);
      setDraftContent(value);
    }
  };

  const handleSubmit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!content.trim() || isDisabled) return;

    // Check for Auto Mode restrictions
    if (selectedModel === 'auto') {
      const autoModeGate = checkAutoModeAccess();
      if (!autoModeGate.hasAccess) {
        setLockGateResult(autoModeGate);
        setShowLockDialog(true);
        return;
      }

      // Start token check (optional, but good practice for Auto Mode)
      if (monthlyLimit > 0 && monthlyCost >= monthlyLimit * 0.99) {
        setSubmitError('Insufficient token credits for Auto Mode. Please upgrade plan.');
        return;
      }
    } else {
      // Clear any specific gate result if not auto mode, fall back to global check if needed
      // but currently we unblocked everyone except for Auto Mode.
      setLockGateResult(undefined);
    }

    setIsSending(true);
    setSubmitError(null);
    const messageContent = content;
    const messageAttachments = attachments.length > 0 ? attachments : undefined;

    setContent('');
    setDraftContent('');
    setAttachments([]);

    try {
      await onSend(messageContent, {
        attachments: messageAttachments,
        context: activeContext.length > 0 ? activeContext : undefined,
        focusMode: focusMode,
        modelOverride: selectedModel ? selectedModel : undefined,
        providerOverride: selectedProvider ? selectedProvider : undefined,
      });
      cancelEditing();
    } catch (error) {
      setContent(messageContent);
      setDraftContent(messageContent);
      if (messageAttachments) setAttachments(messageAttachments);
      setSubmitError(error instanceof Error ? error.message : String(error));
      console.error('[ChatInputArea] Send failed:', error);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
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

    items.forEach((item) => {
      const file = item.getAsFile();
      if (!file) return;
      const reader = new FileReader();
      fileReadersRef.current.push(reader);
      reader.onload = (e) => {
        const base64 = e.target?.result as string;
        const attachment: Attachment = {
          id: crypto.randomUUID(),
          type: 'image',
          name: 'pasted-image.png',
          size: file.size,
          mimeType: file.type,
          content: base64,
        };
        setAttachments((prev) => [...prev, attachment]);
        fileReadersRef.current = fileReadersRef.current.filter((r) => r !== reader);
      };
      reader.readAsDataURL(file);
    });
  };

  const tokenPercentage =
    tokenUsage?.current != null && tokenUsage?.max != null && tokenUsage.max > 0
      ? Math.min((tokenUsage.current / tokenUsage.max) * 100, 100)
      : 0;

  const { getTokenCost } = useUsageStore();
  const { subscription } = useBillingStore();
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
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
          >
            <div className="flex h-full items-center justify-center">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                className="flex flex-col items-center gap-4"
              >
                <div className="rounded-full bg-primary/10 p-8">
                  <Paperclip className="h-16 w-16 text-primary" />
                </div>
                <p className="text-2xl font-medium text-white">Drop to Attach</p>
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
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
      />
      <motion.div
        className={cn(
          'fixed z-40 w-full px-4',
          isEmptyState
            ? 'bottom-1/2 translate-y-1/2 max-w-2xl left-1/2 -translate-x-1/2'
            : 'bottom-6 max-w-5xl left-1/2 -translate-x-1/2',
          className,
        )}
        initial={false}
        animate={{
          bottom: isEmptyState ? '50%' : '24px',
          left: sidecarOpen
            ? `calc(50% + ${(sidebarCollapsed ? 64 : sidebarWidth) / 2}px - ${sidecarWidth / 2}px)`
            : `calc(50% + ${(sidebarCollapsed ? 64 : sidebarWidth) / 2}px)`,
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

          {}
          {attachments.length > 0 && (
            <div className="border-b border-gray-100 dark:border-gray-700/50 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                {attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-charcoal-700 px-3 py-2 text-sm"
                  >
                    {attachment.type === 'image' ? (
                      <ImageIcon size={16} className="text-gray-400" />
                    ) : attachment.type === 'screenshot' ? (
                      <Camera size={16} className="text-gray-400" />
                    ) : attachment.mimeType?.startsWith('audio/') ? (
                      <Mic size={16} className="text-gray-400" />
                    ) : (
                      <Paperclip size={16} className="text-gray-400" />
                    )}
                    <span className="truncate max-w-[150px] text-gray-700 dark:text-gray-300">
                      {attachment.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeAttachment(attachment.id)}
                      className="text-gray-400 hover:text-gray-600 transition"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
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
                  disabled={isDisabled}
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
              <button
                type="button"
                onClick={toggleListening}
                disabled={isDisabled || !isVoiceSupported}
                className={cn(
                  'p-2 rounded-lg transition-all duration-200',
                  isListening
                    ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/25'
                    : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-charcoal-700',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
                title={isListening ? 'Stop recording' : 'Voice input'}
              >
                {isListening ? <MicOff size={18} /> : <Mic size={18} />}
              </button>
            </div>

            {}
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={content}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder={placeholder}
                disabled={isDisabled}
                rows={1}
                className={cn(
                  'w-full resize-none bg-transparent py-2 px-2',
                  'text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500',
                  'focus:outline-none',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  'text-[15px] leading-6',
                )}
                style={{ maxHeight: `${24 * MAX_ROWS}px` }}
              />
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
                  disabled={isDisabled || !content.trim()}
                  className={cn(
                    'p-2 rounded-lg transition-all duration-200',
                    content.trim() && !isDisabled
                      ? 'bg-terra-cotta-500 hover:bg-terra-cotta-600 text-white shadow-md'
                      : 'bg-gray-100 dark:bg-charcoal-700 text-gray-400 cursor-not-allowed',
                  )}
                  title="Send message"
                >
                  {isSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              )}
            </div>
          </div>

          {}
          <AnimatePresence>
            {(isListening || interimTranscript) && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="px-4 py-2 border-t border-gray-100 dark:border-gray-700/50 bg-red-50 dark:bg-red-900/10"
              >
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                    </span>
                    <span className="text-xs font-medium text-red-600 dark:text-red-400">
                      Recording
                    </span>
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

          {}
          <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100 dark:border-gray-700/50">
            <span className="text-xs text-gray-400 dark:text-gray-500">
              Enter to send / Shift+Enter for newline
            </span>

            {showCreditUsage ? (
              <div
                className="flex items-center gap-2"
                title={`Monthly Usage: $${monthlyCost.toFixed(2)} / $${monthlyLimit.toFixed(2)}`}
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
                  ${monthlyCost.toFixed(2)} / ${monthlyLimit.toFixed(0)}
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
