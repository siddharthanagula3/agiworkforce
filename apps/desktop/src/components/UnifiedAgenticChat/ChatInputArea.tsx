import React, { useEffect, useRef, useState } from 'react';
import { Camera, Image as ImageIcon, Mic, Paperclip, Send, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { cn } from '../../lib/utils';
import { Attachment, ContextItem, useUnifiedChatStore } from '../../stores/unifiedChatStore';
import { FocusSelector } from './FocusSelector';
import { useReducedMotion } from '../../hooks/useReducedMotion';

export interface SendOptions {
  attachments?: Attachment[];
  context?: ContextItem[];
  modelId?: string;
  providerId?: string;
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

export const ChatInputArea: React.FC<ChatInputAreaProps> = ({
  onSend,
  disabled = false,
  placeholder = 'Type a message...',
  maxLength = 10000,
  enableAttachments = true,
  className = '',
  rightAccessory,
}) => {
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileReadersRef = useRef<FileReader[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const activeContext = useUnifiedChatStore((state) => state.activeContext) || [];
  const removeContextItem = useUnifiedChatStore((state) => state.removeContextItem);
  const isLoading = useUnifiedChatStore((state) => state.isLoading);
  const messages = useUnifiedChatStore((state) => state.messages);
  const focusMode = useUnifiedChatStore((state) => state.focusMode);
  const tokenUsage = useUnifiedChatStore((state) => state.tokenUsage);
  const prefersReducedMotion = useReducedMotion();

  const isDisabled = disabled || isLoading;
  const isEmptyState = messages.length === 0 && !content.trim();

  // Determine halo effect based on focus mode
  const getHaloShadow = () => {
    switch (focusMode) {
      case 'deep-research':
        return 'shadow-halo-research';
      case 'code':
        return 'shadow-halo-coder';
      case 'web':
        return 'shadow-halo-web';
      case 'academic':
        return 'shadow-halo-academic';
      case 'reasoning':
        return 'shadow-halo-terra';
      default:
        return 'shadow-halo-default';
    }
  };

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

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      mediaRecorderRef.current = null;
      recordedChunksRef.current = [];
    };
  }, []);

  const handleSubmit = (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!content.trim() || isDisabled) return;

    onSend(content, {
      attachments: attachments.length > 0 ? attachments : undefined,
      context: activeContext.length > 0 ? activeContext : undefined,
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
    const newAttachments: Attachment[] = files.map((file) => ({
      id: crypto.randomUUID(),
      type: file.type.startsWith('image/') ? 'image' : 'file',
      name: file.name,
      size: file.size,
      mimeType: file.type,
      path: URL.createObjectURL(file),
    }));
    setAttachments((prev) => [...prev, ...newAttachments]);
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
      reader.onerror = () => {
        fileReadersRef.current = fileReadersRef.current.filter((r) => r !== reader);
      };
      reader.readAsDataURL(file);
    });
  };

  return (
    <motion.div
      layoutId="cockpit-input"
      className={cn(
        'w-full mx-auto relative z-20',
        isEmptyState ? 'h-[50vh] flex items-center justify-center max-w-2xl' : 'max-w-3xl mb-6',
      )}
      transition={
        prefersReducedMotion
          ? { duration: 0.15 }
          : {
              type: 'spring',
              stiffness: 350,
              damping: 30,
            }
      }
      style={{ willChange: prefersReducedMotion ? 'auto' : 'transform' }}
    >
      {/* FocusSelector - visible only in active state */}
      <AnimatePresence>
        {!isEmptyState && (
          <motion.div
            initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
            transition={{ duration: prefersReducedMotion ? 0.1 : 0.2 }}
            className="mb-3"
            style={{ willChange: prefersReducedMotion ? 'auto' : 'opacity, transform' }}
          >
            <FocusSelector />
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        className={cn(
          'border border-zinc-700/50 bg-zinc-800/90 text-zinc-100 shadow-2xl backdrop-blur-xl transition-all duration-300',
          isEmptyState ? 'rounded-3xl' : 'rounded-2xl',
          getHaloShadow(),
          className,
        )}
        layout
        style={{ willChange: prefersReducedMotion ? 'auto' : 'transform' }}
      >
        {activeContext.length > 0 && (
          <div className="border-b border-white/5 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs uppercase tracking-[0.18em] text-zinc-400">Context</span>
              {activeContext.map((item) => (
                <div
                  key={item.id}
                  className="inline-flex items-center gap-1 rounded-md bg-indigo-500/10 px-2 py-1 text-xs text-indigo-100"
                >
                  <span>{item.icon ?? '[ctx]'}</span>
                  <span className="max-w-[180px] truncate">{item.name}</span>
                  <button
                    type="button"
                    onClick={() => removeContextItem(item.id)}
                    className="ml-1 text-indigo-200/70 transition hover:text-white"
                    aria-label={`Remove ${item.name} from context`}
                  >
                    <X size={12} aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {attachments.length > 0 && (
          <div className="border-b border-white/5 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              {attachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className="inline-flex min-w-[220px] items-center gap-3 rounded-xl border border-white/10 bg-zinc-900/80 px-3 py-3 text-sm text-zinc-100 shadow-inner shadow-black/20"
                >
                  {attachment.type === 'image' ? (
                    <ImageIcon size={18} className="text-zinc-300" />
                  ) : attachment.type === 'screenshot' ? (
                    <Camera size={18} className="text-zinc-300" />
                  ) : attachment.mimeType?.startsWith('audio/') ? (
                    <Mic size={18} className="text-zinc-300" />
                  ) : (
                    <Paperclip size={18} className="text-zinc-300" />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">{attachment.name}</span>
                    <span className="text-xs text-zinc-500">
                      {attachment.size
                        ? `${Math.round(attachment.size / 1024)}KB`
                        : attachment.mimeType}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeAttachment(attachment.id)}
                    className="rounded p-1 text-zinc-300 transition hover:bg-zinc-800"
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
          <div className="px-4 pt-4">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={placeholder}
              disabled={isDisabled}
              maxLength={maxLength}
              rows={1}
              className="w-full resize-none rounded-xl bg-transparent px-3 py-2 text-base leading-relaxed text-zinc-100 placeholder:text-zinc-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
              style={{ minHeight: '72px' }}
              aria-label="Message input"
              aria-describedby={tokenUsage.percentage > 0 ? 'token-usage-gauge' : undefined}
            />
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-white/5 px-3 py-3">
            <div className="flex items-center gap-2">
              {enableAttachments && (
                <>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isDisabled}
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/5 bg-zinc-900/70 text-zinc-200 transition hover:border-zinc-600 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
                    title="Attach files"
                    aria-label="Attach files to message"
                  >
                    <Paperclip size={18} aria-hidden="true" />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                    accept="*/*"
                    aria-label="File upload input"
                  />
                </>
              )}
            </div>

            <div className="flex items-center gap-3">
              {rightAccessory ? <div className="hidden sm:block">{rightAccessory}</div> : null}
              <button
                type="submit"
                disabled={!content.trim() || isDisabled}
                className="inline-flex h-11 min-w-[46px] items-center justify-center rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-500 px-4 text-sm font-semibold text-white shadow disabled:cursor-not-allowed disabled:from-zinc-700 disabled:to-zinc-700 disabled:text-zinc-300"
                title="Send message"
                aria-label="Send message"
              >
                <Send size={18} aria-hidden="true" />
              </button>
            </div>
          </div>
        </form>

        {/* Context Fuel Gauge */}
        <motion.div
          id="token-usage-gauge"
          className={cn(
            'h-0.5 w-full rounded-b-2xl overflow-hidden',
            isEmptyState && 'rounded-b-3xl',
          )}
          initial={{ opacity: 0 }}
          animate={{ opacity: tokenUsage.percentage > 0 ? 1 : 0 }}
          transition={{ duration: prefersReducedMotion ? 0.1 : 0.2 }}
          style={{ willChange: prefersReducedMotion ? 'auto' : 'opacity' }}
          role="progressbar"
          aria-label="Token usage"
          aria-valuenow={tokenUsage.percentage}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <motion.div
            className={cn(
              'h-full transition-colors duration-300',
              tokenUsage.percentage < 50 && 'bg-emerald-500',
              tokenUsage.percentage >= 50 && tokenUsage.percentage < 80 && 'bg-amber-500',
              tokenUsage.percentage >= 80 && 'bg-rose-500',
            )}
            initial={{ width: 0 }}
            animate={{ width: `${tokenUsage.percentage}%` }}
            transition={
              prefersReducedMotion
                ? { duration: 0.2 }
                : { type: 'spring', stiffness: 100, damping: 20 }
            }
            style={{ willChange: prefersReducedMotion ? 'auto' : 'width' }}
          />
        </motion.div>
      </motion.div>
    </motion.div>
  );
};

export default ChatInputArea;
