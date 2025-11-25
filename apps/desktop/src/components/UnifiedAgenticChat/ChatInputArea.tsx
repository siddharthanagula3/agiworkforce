import { AnimatePresence, motion } from 'framer-motion';
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
} from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { getModelMetadata } from '../../constants/llm';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useVoiceInput } from '../../hooks/useVoiceInput';
import { cn } from '../../lib/utils';
import { useModelStore } from '../../stores/modelStore';
import {
  Attachment,
  ContextItem,
  FocusMode,
  useUnifiedChatStore,
} from '../../stores/unifiedChatStore';
import { QuickModelSelector } from './QuickModelSelector';

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

// Focus mode configuration - matching Claude Desktop
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
  const selectedModel = useModelStore((state) => state.selectedModel);
  const selectedProvider = useModelStore((state) => state.selectedProvider);
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

  const modelDisplayName = selectedModel
    ? (getModelMetadata(selectedModel)?.name ?? 'GPT-5.1 Instant')
    : 'GPT-5.1 Instant';

  const isDisabled = disabled || isLoading || isSending || isStreaming;
  const isEmptyState = messages.length === 0;
  const showStopButton = isStreaming && onStopGeneration;

  // Keep local content aligned with shared draft (for edit/resend flows)
  useEffect(() => {
    if (draftContent !== content) {
      setContent(draftContent);
    }
  }, [draftContent, content]);

  useEffect(() => {
    setShowModelSelector(false);
  }, [selectedModel]);

  // Close model selector when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modelSelectorRef.current && !modelSelectorRef.current.contains(event.target as Node)) {
        setShowModelSelector(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close the model selector with Escape for quick dismissal
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

  // Auto-resize textarea
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

  // Cleanup file readers and blob URLs
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

  // Drag and drop handlers
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
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    if (value.length <= maxLength) {
      setContent(value);
      setDraftContent(value);
    }
  };

  const handleFilesAdded = (files: File[]) => {
    const newAttachments: Attachment[] = files.map((file) => ({
      id: crypto.randomUUID(),
      type: file.type.startsWith('image/') ? 'image' : 'file',
      name: file.name,
      size: file.size,
      mimeType: file.type,
      path: URL.createObjectURL(file),
    }));
    setAttachments((prev) => [...prev, ...newAttachments]);
  };

  const handleSubmit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!content.trim() || isDisabled) return;

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

    event.preventDefault();
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

  // Calculate token usage percentage
  const tokenPercentage =
    tokenUsage?.current != null && tokenUsage?.max != null && tokenUsage.max > 0
      ? Math.min((tokenUsage.current / tokenUsage.max) * 100, 100)
      : 0;

  return (
    <>
      {/* Drag & Drop Overlay */}
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
                <div className="rounded-full bg-teal-500/20 p-8">
                  <Paperclip className="h-16 w-16 text-teal-500" />
                </div>
                <p className="text-2xl font-medium text-white">Drop to Attach</p>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,application/pdf,.doc,.docx,.txt,.md"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Main Input Container - Claude Desktop Style */}
      <motion.div
        className={cn(
          'fixed z-40 w-full px-4',
          isEmptyState
            ? 'bottom-1/2 translate-y-1/2 max-w-2xl left-1/2 -translate-x-1/2'
            : 'bottom-6 max-w-3xl left-1/2 -translate-x-1/2',
          className,
        )}
        initial={false}
        animate={{
          bottom: isEmptyState ? '50%' : '24px',
          left: '50%',
          x: '-50%',
          y: isEmptyState ? '50%' : '0%',
          maxWidth: isEmptyState ? '42rem' : '48rem',
        }}
        transition={
          prefersReducedMotion
            ? { duration: 0.15 }
            : { type: 'spring', stiffness: 350, damping: 30 }
        }
        style={{ willChange: 'transform' }}
      >
        {/* Focus Mode Pills - Above input */}
        <motion.div
          initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
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
                  ? 'bg-teal-500 text-white shadow-md shadow-teal-500/25'
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
            'focus-within:border-teal-500/50 focus-within:ring-4 focus-within:ring-teal-500/10',
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

          {/* Context Items */}
          {activeContext.length > 0 && (
            <div className="border-b border-gray-100 dark:border-gray-700/50 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  Context
                </span>
                {activeContext.map((item) => (
                  <div
                    key={item.id}
                    className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 dark:bg-teal-900/20 px-2.5 py-1 text-xs text-teal-700 dark:text-teal-300"
                  >
                    <span>{item.icon ?? 'CTX'}</span>
                    <span className="max-w-[180px] truncate">{item.name}</span>
                    <button
                      type="button"
                      onClick={() => removeContextItem(item.id)}
                      className="ml-0.5 text-teal-500 hover:text-teal-700 transition"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Attachments */}
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

          {/* Main Input Row */}
          <div className="flex items-end gap-2 p-3">
            {/* Model Selector - Inside Input */}
            <div className="relative" ref={modelSelectorRef}>
              <button
                type="button"
                onClick={() => setShowModelSelector(!showModelSelector)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium',
                  'bg-gray-100 dark:bg-charcoal-700 hover:bg-gray-200 dark:hover:bg-charcoal-600',
                  'text-gray-700 dark:text-gray-300',
                  'transition-colors duration-150',
                  'border border-transparent hover:border-gray-300 dark:hover:border-gray-600',
                )}
              >
                <span className="truncate max-w-[120px]">{modelDisplayName}</span>
                <ChevronDown
                  size={14}
                  className={cn('transition-transform', showModelSelector && 'rotate-180')}
                />
              </button>

              {/* Model Selector Dropdown */}
              <AnimatePresence>
                {showModelSelector && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute bottom-full left-0 z-50 mb-3 w-80"
                  >
                    <QuickModelSelector onClose={() => setShowModelSelector(false)} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Textarea */}
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
                  'w-full resize-none bg-transparent py-2 px-1',
                  'text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500',
                  'focus:outline-none',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  'text-[15px] leading-6',
                )}
                style={{ maxHeight: `${24 * MAX_ROWS}px` }}
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-1">
              {/* Attachment Button */}
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
                  )}
                  title="Attach files"
                >
                  <Paperclip size={18} />
                </button>
              )}

              {/* Mic Button - Voice Input */}
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
                title={
                  isListening
                    ? 'Stop recording'
                    : isVoiceSupported
                      ? 'Voice input'
                      : 'Voice input not supported'
                }
              >
                {isListening ? <MicOff size={18} /> : <Mic size={18} />}
              </button>

              {/* Send / Stop Button */}
              {showStopButton ? (
                <button
                  type="button"
                  onClick={onStopGeneration}
                  className={cn(
                    'p-2.5 rounded-xl transition-all duration-200',
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
                    'p-2.5 rounded-xl transition-all duration-200',
                    content.trim() && !isDisabled
                      ? 'bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white shadow-lg shadow-teal-500/25'
                      : 'bg-gray-200 dark:bg-charcoal-700 text-gray-400 cursor-not-allowed',
                  )}
                  title="Send message"
                >
                  {isSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              )}
            </div>
          </div>

          {/* Voice Recording Indicator */}
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

          {/* Voice Error Display */}
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

          {/* Hint Text & Token Usage */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100 dark:border-gray-700/50">
            <span className="text-xs text-gray-400 dark:text-gray-500">
              Enter to send / Shift+Enter for newline
            </span>

            {tokenUsage && (
              <div className="flex items-center gap-2">
                <div className="w-24 h-1.5 bg-gray-200 dark:bg-charcoal-700 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-300',
                      tokenPercentage > 90
                        ? 'bg-red-500'
                        : tokenPercentage > 70
                          ? 'bg-amber-500'
                          : 'bg-teal-500',
                    )}
                    style={{ width: `${tokenPercentage}%` }}
                  />
                </div>
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {(tokenUsage.current ?? 0).toLocaleString()} /{' '}
                  {(tokenUsage.max ?? 0).toLocaleString()}
                </span>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </>
  );
};

export default ChatInputArea;
