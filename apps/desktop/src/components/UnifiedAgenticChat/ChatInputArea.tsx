import { AnimatePresence, motion } from 'framer-motion';
import { Camera, ChevronDown, Image as ImageIcon, Mic, Paperclip, Send, X } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

import { getModelMetadata } from '../../constants/llm';
import { useReducedMotion } from '../../hooks/useReducedMotion';
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
  onSend: (content: string, options: SendOptions) => void;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
  enableAttachments?: boolean;
  className?: string;
  rightAccessory?: React.ReactNode;
}

const MAX_ROWS = 10;

// Focus mode configuration
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
  disabled = false,
  placeholder: defaultPlaceholder = 'Type a message...',
  maxLength = 10000,
  enableAttachments = true,
  className = '',
  rightAccessory,
}) => {
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [showModelSelector, setShowModelSelector] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileReadersRef = useRef<FileReader[]>([]);

  const activeContext = useUnifiedChatStore((state) => state.activeContext) || [];
  const removeContextItem = useUnifiedChatStore((state) => state.removeContextItem);
  const isLoading = useUnifiedChatStore((state) => state.isLoading);
  const messages = useUnifiedChatStore((state) => state.messages);
  const focusMode = useUnifiedChatStore((state) => state.focusMode);
  const setFocusMode = useUnifiedChatStore((state) => state.setFocusMode);
  const tokenUsage = useUnifiedChatStore((state) => state.tokenUsage);
  const selectedModel = useModelStore((state) => state.selectedModel);
  const selectedProvider = useModelStore((state) => state.selectedProvider);
  const prefersReducedMotion = useReducedMotion();

  // Get model display name
  const modelDisplayName = selectedModel
    ? (getModelMetadata(selectedModel)?.name ?? 'Claude')
    : 'Claude';

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    if (value.length <= maxLength) {
      setContent(value);
    }
  };

  const isDisabled = disabled || isLoading;
  const isEmptyState = messages.length === 0;

  // Close model selector when model changes
  useEffect(() => {
    setShowModelSelector(false);
  }, [selectedModel]);

  // Get dynamic placeholder based on focus mode
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

  // Handle drag and drop
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(true);
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      if (e.target === document.body) {
        setIsDragging(false);
      }
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer?.files || []);
      if (files.length > 0) {
        handleFilesAdded(files);
      }
    };

    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('dragleave', handleDragLeave);
    document.addEventListener('drop', handleDrop);

    return () => {
      document.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('dragleave', handleDragLeave);
      document.removeEventListener('drop', handleDrop);
    };
    // handleFilesAdded is stable (doesn't depend on props/state), safe to omit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const handleSubmit = (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!content.trim() || isDisabled) return;

    onSend(content, {
      attachments: attachments.length > 0 ? attachments : undefined,
      context: activeContext.length > 0 ? activeContext : undefined,
      focusMode: focusMode,
      modelOverride: selectedModel ? selectedModel : undefined,
      providerOverride: selectedProvider ? selectedProvider : undefined,
    });
    setContent('');
    setAttachments([]);
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
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const attachment = prev.find((item) => item.id === id);
      if (attachment?.path && attachment.path.startsWith('blob:')) {
        URL.revokeObjectURL(attachment.path);
      }
      return prev.filter((item) => item.id !== id);
    });
  };

  const _handlePaste = (event: React.ClipboardEvent) => {
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
      reader.onerror = () => {
        fileReadersRef.current = fileReadersRef.current.filter((r) => r !== reader);
      };
      reader.readAsDataURL(file);
    });
  };

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
            : {
                type: 'spring',
                stiffness: 350,
                damping: 30,
              }
        }
        style={{ willChange: 'transform' }}
      >
        {/* Focus Mode Pills - Above input, always visible */}
        <motion.div
          initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
          transition={{ duration: prefersReducedMotion ? 0.1 : 0.2 }}
          className="mb-3 flex items-center justify-center gap-2"
        >
          {FOCUS_MODES.map((mode) => (
            <button
              key={mode.value || 'all'}
              onClick={() => setFocusMode(mode.value)}
              className={cn(
                'focus-pill',
                focusMode === mode.value ? 'focus-pill-active' : 'focus-pill-inactive',
              )}
              aria-pressed={focusMode === mode.value}
              aria-label={`Set focus mode to ${mode.label}`}
            >
              {mode.label}
            </button>
          ))}
        </motion.div>

        <div
          className={cn(
            'floating-input-container relative overflow-hidden rounded-2xl bg-white dark:bg-gray-900',
            'border border-gray-200 dark:border-gray-700',
            'shadow-lg transition-all duration-200 ease-out',
            'focus-within:border-teal-500 focus-within:ring-4 focus-within:ring-teal-500/20',
            isEmptyState ? 'shadow-2xl' : 'shadow-xl',
          )}
        >
          {/* Context Items */}
          {activeContext.length > 0 && (
            <div className="border-b border-gray-200 dark:border-gray-700 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Context
                </span>
                {activeContext.map((item) => (
                  <div
                    key={item.id}
                    className="inline-flex items-center gap-1 rounded-full bg-teal-100 dark:bg-teal-900/30 px-2.5 py-1 text-xs text-teal-800 dark:text-teal-200"
                  >
                    <span>{item.icon ?? '📎'}</span>
                    <span className="max-w-[180px] truncate">{item.name}</span>
                    <button
                      type="button"
                      onClick={() => removeContextItem(item.id)}
                      className="ml-1 text-teal-600 dark:text-teal-300 transition hover:text-teal-800 dark:hover:text-teal-100"
                      aria-label={`Remove ${item.name} from context`}
                    >
                      <X size={12} aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Attachments */}
          {attachments.length > 0 && (
            <div className="border-b border-gray-200 dark:border-gray-700 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                {attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="inline-flex min-w-[220px] items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm"
                  >
                    {attachment.type === 'image' ? (
                      <ImageIcon size={18} className="text-gray-500" />
                    ) : attachment.type === 'screenshot' ? (
                      <Camera size={18} className="text-gray-500" />
                    ) : attachment.mimeType?.startsWith('audio/') ? (
                      <Mic size={18} className="text-gray-500" />
                    ) : (
                      <Paperclip size={18} className="text-gray-500" />
                    )}
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">{attachment.name}</span>
                      <span className="text-xs text-gray-500">
                        {attachment.size
                          ? `${Math.round(attachment.size / 1024)}KB`
                          : attachment.mimeType}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAttachment(attachment.id)}
                      className="rounded p-1 text-gray-500 transition hover:bg-gray-200 dark:hover:bg-gray-700"
                      aria-label={`Remove ${attachment.name} attachment`}
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col">
            <div className="flex items-start px-4 pt-4">
              {/* Model Selector (Left side inside input) */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowModelSelector(!showModelSelector)}
                  className="mt-2 mr-2 flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
                  aria-label="Select model"
                  aria-expanded={showModelSelector}
                >
                  <span className="font-medium truncate max-w-[200px]">{modelDisplayName}</span>
                  <ChevronDown
                    size={14}
                    className={cn('transition-transform', showModelSelector && 'rotate-180')}
                  />
                </button>

                {/* Model Selector Popover */}
                <AnimatePresence>
                  {showModelSelector && (
                    <>
                      {/* Backdrop */}
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setShowModelSelector(false)}
                        aria-hidden="true"
                      />
                      {/* Popover */}
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.15 }}
                        className="absolute left-0 top-full z-50 mt-2 w-[280px] rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-charcoal-800 p-4 shadow-lg"
                      >
                        <QuickModelSelector className="w-full max-w-none" />
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>

              {/* Text Input */}
              <textarea
                ref={textareaRef}
                value={content}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={isDisabled}
                className="chat-input flex-1 resize-none border-none bg-transparent py-3 pr-3 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-0 dark:text-gray-100 dark:placeholder-gray-400"
                rows={1}
                style={{
                  maxHeight: '200px',
                  overflowY: content.length > 100 ? 'auto' : 'hidden',
                }}
                aria-label="Message input"
                aria-describedby={tokenUsage.percentage > 0 ? 'token-usage-gauge' : undefined}
              />

              {/* Right side icons cluster */}
              <div className="mt-2 ml-2 flex items-center gap-1">
                {enableAttachments && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isDisabled}
                    className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                    title="Attach files"
                    aria-label="Attach files to message"
                  >
                    <Paperclip size={18} aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  disabled={isDisabled}
                  className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                  title="Record audio"
                  aria-label="Record audio message"
                >
                  <Mic size={18} aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Bottom bar with send button */}
            <div className="mt-3 flex items-center justify-between px-4 pb-4">
              <div className="flex items-center gap-2">{rightAccessory}</div>

              <button
                type="submit"
                disabled={!content.trim() || isDisabled}
                className={cn(
                  'inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-medium transition-all',
                  'bg-teal-500 text-white hover:bg-teal-600 disabled:bg-gray-300 dark:disabled:bg-gray-700',
                  'disabled:cursor-not-allowed disabled:text-gray-500 dark:disabled:text-gray-400',
                )}
                title="Send message"
                aria-label="Send message"
              >
                <Send size={18} aria-hidden="true" />
              </button>
            </div>
          </form>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileSelect}
            className="hidden"
            accept="*/*"
            aria-label="File upload input"
          />

          {/* Context Fuel Gauge */}
          <div
            id="token-usage-gauge"
            className="token-gauge absolute bottom-0 left-0 right-0"
            role="progressbar"
            aria-label="Token usage"
            aria-valuenow={tokenUsage.percentage}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={cn(
                'token-gauge-fill',
                tokenUsage.percentage < 50 && 'token-gauge-safe',
                tokenUsage.percentage >= 50 && tokenUsage.percentage < 80 && 'token-gauge-warning',
                tokenUsage.percentage >= 80 && 'token-gauge-danger',
              )}
              style={{ width: `${tokenUsage.percentage}%` }}
            />
          </div>
        </div>
      </motion.div>
    </>
  );
};

export default ChatInputArea;
