import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Send, Paperclip, Mic, Camera, X, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useUnifiedChatStore, ContextItem, Attachment } from '../../stores/unifiedChatStore';
import { ScreenCaptureButton } from '../ScreenCapture/ScreenCaptureButton';
import type { CaptureResult } from '../../types/capture';
import { cn } from '../../lib/utils';

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
}

const MAX_ROWS = 10;
const APPROX_TOKENS_PER_CHAR = 0.25;

export const ChatInputArea: React.FC<ChatInputAreaProps> = ({
  onSend,
  disabled = false,
  placeholder = 'Type a message…',
  maxLength = 10000,
  enableAttachments = true,
  enableVoice = true,
  enableScreenshot = true,
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
      name: `${label} • ${new Date(capture.createdAt).toLocaleTimeString()}`,
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
        'rounded-[28px] border border-white/10 bg-[#0b0e16]/90 text-white shadow-[0_25px_80px_rgba(5,6,12,0.65)] backdrop-blur',
        className,
      )}
    >
      {activeContext.length > 0 && (
        <div className="border-b border-white/10 px-4 py-2">
          <div className="flex flex-wrap.items-center gap-2">
            <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Context</span>
            {activeContext.map((item) => (
              <div
                key={item.id}
                className="inline-flex items-center gap-1 rounded-md bg-indigo-500/10 px-2 py-1 text-xs text-indigo-200"
              >
                <span>{item.icon ?? '⊙'}</span>
                <span className="max-w-[160px] truncate">{item.name}</span>
                <button
                  type="button"
                  onClick={() => removeContextItem(item.id)}
                  className="ml-1 text-indigo-200/70 hover:text-white"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {attachments.length > 0 && (
        <div className="border-b border-white/10 px-4 py-2">
          <div className="flex flex-wrap.items-center gap-2">
            {attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="inline-flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm text-white"
              >
                {attachment.type === 'image' ? (
                  <ImageIcon size={16} className="text-slate-300" />
                ) : attachment.type === 'screenshot' ? (
                  <Camera size={16} className="text-slate-300" />
                ) : attachment.mimeType?.startsWith('audio/') ? (
                  <Mic size={16} className="text-slate-300" />
                ) : (
                  <Paperclip size={16} className="text-slate-300" />
                )}
                <span className="max-w-[180px] truncate">{attachment.name}</span>
                {attachment.size && (
                  <span className="text-xs text-slate-400">
                    ({Math.round(attachment.size / 1024)}KB)
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeAttachment(attachment.id)}
                  className="rounded p-1 hover:bg-white/10"
                >
                  <X size={14} className="text-slate-200" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="flex flex-wrap items-end gap-3 px-4 py-3">
          {enableAttachments && (
            <>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isDisabled}
                className="flex-shrink-0 rounded-xl p-2 transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
                title="Attach files"
              >
                <Paperclip size={20} className="text-slate-300" />
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

          <div className="relative flex-1">
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
              className="w-full resize-none rounded-2xl border border-white/10 bg-transparent px-4 py-3 pr-24 text-base text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-white/30 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ minHeight: '48px' }}
            />
            <div className="pointer-events-none absolute bottom-2 right-3 flex items-center gap-2 text-xs text-slate-500">
              <span>{estimatedTokens} tokens</span>
              <span className={charCount > maxLength * 0.9 ? 'text-orange-400' : ''}>
                {charCount}/{maxLength}
              </span>
            </div>
          </div>

          {enableScreenshot && (
            <ScreenCaptureButton
              variant="ghost"
              size="icon"
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
                'flex-shrink-0 rounded-xl p-2 transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                isRecordingVoice ? 'bg-red-500/20 text-red-200' : 'hover:bg-white/5',
              )}
              title={isRecordingVoice ? 'Click to finish recording' : 'Record a quick voice note'}
            >
              <Mic size={20} className={isRecordingVoice ? 'text-red-200' : 'text-slate-300'} />
            </button>
          )}

          <div className="flex items-center gap-2">
            {rightAccessory}
            <button
              type="submit"
              disabled={!content.trim() || isDisabled}
              className="flex h-11 min-w-[44px] items-center justify-center rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-500 px-4 text-sm font-semibold text-white shadow disabled:cursor-not-allowed disabled:bg-gray-500 disabled:text-gray-200"
              title="Send message"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </form>

      <div className="px-4 pb-3 text-xs text-slate-500">
        Press <span className="font-mono text-slate-300">Enter</span> to send,{' '}
        <span className="font-mono text-slate-300">Shift+Enter</span> for a new line
      </div>
    </div>
  );
};

export default ChatInputArea;
