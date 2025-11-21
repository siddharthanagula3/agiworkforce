import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Cpu,
  Globe,
  Image as ImageIcon,
  Mic,
  Paperclip,
  Send,
  Shield,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '../../lib/utils';
import type { CaptureResult } from '../../types/capture';
import { ScreenCaptureButton } from '../ScreenCapture/ScreenCaptureButton';
import { Attachment, ContextItem, useUnifiedChatStore } from '../../stores/unifiedChatStore';
import { Switch } from '../ui/Switch';

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
  enableVoice?: boolean;
  enableScreenshot?: boolean;
  className?: string;
  rightAccessory?: React.ReactNode;
  modelLabel?: string;
  capabilityState?: { computer: boolean; internet: boolean; safe: boolean };
  onCapabilityChange?: (
    key: keyof NonNullable<ChatInputAreaProps['capabilityState']>,
    value: boolean,
  ) => void;
  isAutonomousMode?: boolean;
  onAutonomousToggle?: (value: boolean) => void;
}

const MAX_ROWS = 10;
const APPROX_TOKENS_PER_CHAR = 0.25;

export const ChatInputArea: React.FC<ChatInputAreaProps> = ({
  onSend,
  disabled = false,
  placeholder = 'Type a message...',
  maxLength = 10000,
  enableAttachments = true,
  enableVoice = true,
  enableScreenshot = true,
  className = '',
  rightAccessory,
  modelLabel,
  capabilityState,
  onCapabilityChange,
  isAutonomousMode = false,
  onAutonomousToggle,
}) => {
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [capabilities, setCapabilities] = useState(
    capabilityState ?? { computer: true, internet: false, safe: true },
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileReadersRef = useRef<FileReader[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const activeContext = useUnifiedChatStore((state) => state.activeContext) || [];
  const removeContextItem = useUnifiedChatStore((state) => state.removeContextItem);
  const isLoading = useUnifiedChatStore((state) => state.isLoading);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);

  const isDisabled = disabled || isLoading;

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
    if (capabilityState) {
      setCapabilities(capabilityState);
    }
  }, [capabilityState]);

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

  const estimatedTokens = useMemo(
    () => Math.ceil(content.length * APPROX_TOKENS_PER_CHAR),
    [content.length],
  );
  const charCount = content.length;

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

  const handleScreenCaptureComplete = (capture: CaptureResult) => {
    if (!capture.path) {
      toast.error('Unable to attach screenshot: missing file path');
      return;
    }

    const label = capture.metadata.windowTitle?.trim()
      ? capture.metadata.windowTitle.trim()
      : capture.captureType === 'region'
        ? 'Region capture'
        : 'Screen capture';
    const attachment: Attachment = {
      id: capture.id || crypto.randomUUID(),
      type: 'screenshot',
      name: `${label} - ${new Date(capture.createdAt).toLocaleTimeString()}`,
      path: capture.path,
      mimeType: 'image/png',
    };

    setAttachments((prev) => [...prev, attachment]);
    toast.success('Screenshot attached');
  };

  const startVoiceRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error('Voice recording is not supported in this environment');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      recordedChunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;

        const chunks = recordedChunksRef.current;
        recordedChunksRef.current = [];
        if (chunks.length === 0) return;

        const blob = new Blob(chunks, { type: 'audio/webm' });
        const fileName = `voice-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
        const objectUrl = URL.createObjectURL(blob);
        const attachment: Attachment = {
          id: crypto.randomUUID(),
          type: 'file',
          name: fileName,
          size: blob.size,
          mimeType: 'audio/webm',
          path: objectUrl,
        };

        setAttachments((prev) => [...prev, attachment]);
        toast.success('Voice note added');
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecordingVoice(true);
    } catch (error) {
      console.error('Voice recording failed:', error);
      toast.error('Unable to access microphone');
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecordingVoice(false);
  };

  const handleVoiceButtonClick = () => {
    if (isRecordingVoice) {
      stopVoiceRecording();
    } else {
      void startVoiceRecording();
    }
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
    <div
      className={cn(
        'rounded-2xl border border-zinc-700 bg-zinc-800/50 text-zinc-100 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-sm',
        className,
      )}
    >
      {modelLabel ? (
        <div className="flex items-center gap-2 border-b border-zinc-700/60 px-4 py-2 text-xs text-zinc-300">
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-100">
            {modelLabel}
          </span>
          <span className="text-zinc-500">Model router</span>
        </div>
      ) : null}

      {activeContext.length > 0 && (
        <div className="border-b border-zinc-700/60 px-4 py-3">
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
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {attachments.length > 0 && (
        <div className="border-b border-zinc-700/60 px-4 py-3">
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
                >
                  <X size={14} />
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
          />
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-zinc-700/60 px-3 py-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900/60 px-2 py-1">
              <Switch
                checked={isAutonomousMode}
                onCheckedChange={(val) => onAutonomousToggle?.(Boolean(val))}
                id="autonomous-switch"
              />
              <label htmlFor="autonomous-switch" className="text-xs font-medium text-zinc-200">
                Auto-Pilot
              </label>
            </div>
            {enableAttachments && (
              <>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isDisabled}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900/70 text-zinc-200 transition hover:border-zinc-600 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
                  title="Attach files"
                >
                  <Paperclip size={18} />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                  accept="*/*"
                />
              </>
            )}

            {enableScreenshot && (
              <ScreenCaptureButton
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-xl border border-zinc-700 bg-zinc-900/70 text-zinc-200 hover:border-zinc-600 hover:bg-zinc-800"
                onCaptureComplete={handleScreenCaptureComplete}
                disabled={isDisabled}
                suppressToasts
                mode="quick"
              />
            )}

            {enableVoice && (
              <button
                type="button"
                disabled={isDisabled}
                onClick={handleVoiceButtonClick}
                aria-pressed={isRecordingVoice}
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900/70 text-zinc-200 transition hover:border-zinc-600 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40',
                  isRecordingVoice && 'border-red-500/60 bg-red-500/10 text-red-200',
                )}
                title={isRecordingVoice ? 'Click to finish recording' : 'Record a quick voice note'}
              >
                <Mic size={18} />
              </button>
            )}

            <div className="ml-2 flex items-center gap-1 rounded-xl border border-zinc-700 bg-zinc-900/60 px-2 py-1">
              {(['computer', 'internet', 'safe'] as const).map((key) => {
                const Icon = key === 'computer' ? Cpu : key === 'internet' ? Globe : Shield;
                const enabled = capabilities[key];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      const next = { ...capabilities, [key]: !enabled };
                      setCapabilities(next);
                      onCapabilityChange?.(key, !enabled);
                    }}
                    className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-lg border border-transparent transition',
                      enabled
                        ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100'
                        : 'text-zinc-400 hover:text-white',
                    )}
                    title={
                      key === 'computer'
                        ? 'Enable computer use'
                        : key === 'internet'
                          ? 'Enable internet'
                          : 'Safe mode'
                    }
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 text-xs text-zinc-400 sm:flex">
              <span>{estimatedTokens} tokens</span>
              <span className={charCount > maxLength * 0.9 ? 'text-orange-400' : undefined}>
                {charCount}/{maxLength}
              </span>
            </div>
            {rightAccessory ? <div className="hidden sm:block">{rightAccessory}</div> : null}
            <button
              type="submit"
              disabled={!content.trim() || isDisabled}
              className="inline-flex h-11 min-w-[46px] items-center justify-center rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-500 px-4 text-sm font-semibold text-white shadow disabled:cursor-not-allowed disabled:from-zinc-700 disabled:to-zinc-700 disabled:text-zinc-300"
              title="Send message"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </form>

      <div className="px-4 pb-3 text-xs text-zinc-500">
        Press <span className="font-mono text-zinc-200">Enter</span> to send,{' '}
        <span className="font-mono text-zinc-200">Shift+Enter</span> for a new line
      </div>
    </div>
  );
};

export default ChatInputArea;
