import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '../../lib/tauri-mock';
import { useAuthStore } from '../../stores/auth';
import { useUnifiedChatStore, uuidToDbId } from '../../stores/unifiedChatStore';
import { cn } from '../../lib/utils';
import { Send, X, Maximize2, Loader2 } from 'lucide-react';

/**
 * FloatingChat - A compact chat interface for the floating window mode
 * Provides quick access to AGI Workforce from anywhere on the desktop
 */
export const FloatingChat = () => {
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const messages = useUnifiedChatStore((state) => state.messages);
  const isStreaming = useUnifiedChatStore((state) => state.isStreaming);
  const addMessage = useUnifiedChatStore((state) => state.addMessage);
  const activeConversationId = useUnifiedChatStore((state) => state.activeConversationId);
  const ensureActiveConversation = useUnifiedChatStore((state) => state.ensureActiveConversation);
  const userId = useAuthStore((state) => state.user?.id ?? null);

  // Initialize conversation on mount - run once, ensureActiveConversation is stable
  useEffect(() => {
    ensureActiveConversation();
  }, [ensureActiveConversation]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      const trimmed = input.trim();
      if (!trimmed || isStreaming || isSending) return;

      setInput('');
      setIsSending(true);

      try {
        // Add user message to UI immediately
        addMessage({
          role: 'user',
          content: trimmed,
        });

        if (!userId) {
          throw new Error('No authenticated user is available for floating chat');
        }

        // Send to backend
        await invoke('chat_send_message', {
          request: {
            content: trimmed,
            userId,
            attachments: [],
            conversationId: activeConversationId ? uuidToDbId(activeConversationId) : null,
            stream: true,
            enableTools: true,
          },
        });
      } catch (error) {
        console.error('Failed to send message:', error);
        addMessage({
          role: 'assistant',
          content: 'Something went wrong. Please try again.',
        });
      } finally {
        setIsSending(false);
      }
    },
    [input, isStreaming, isSending, addMessage, activeConversationId, userId],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void handleSubmit();
      }
    },
    [handleSubmit],
  );

  const handleClose = useCallback(async () => {
    try {
      await invoke('window_close_floating');
    } catch (error) {
      console.error('Failed to close floating window:', error);
    }
  }, []);

  const handleOpenMain = useCallback(async () => {
    try {
      await invoke('window_set_visibility', { visible: true });
      await invoke('window_close_floating');
    } catch (error) {
      console.error('Failed to open main window:', error);
    }
  }, []);

  // Get last few messages for display
  const recentMessages = messages.slice(-10);
  const isProcessing = isStreaming || isSending;

  return (
    <div className="flex flex-col h-screen w-full bg-zinc-900 text-white overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 bg-zinc-900/95 backdrop-blur-xs">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-linear-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <span className="text-xs font-bold">A</span>
          </div>
          <span className="text-sm font-medium text-zinc-300">Quick Chat</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleOpenMain}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
            title="Open main window"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            onClick={handleClose}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        {recentMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mb-3">
              <span className="text-2xl">✨</span>
            </div>
            <p className="text-sm text-zinc-400">Ask me anything! I'm AGI Workforce.</p>
            <p className="text-xs text-zinc-500 mt-1">
              Press{' '}
              <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-400">
                {typeof navigator !== 'undefined' && navigator.platform.includes('Mac')
                  ? 'Cmd'
                  : 'Ctrl'}
                +Shift+F
              </kbd>{' '}
              to toggle
            </p>
          </div>
        ) : (
          recentMessages.map((message) => (
            <div
              key={message.id}
              className={cn('flex flex-col', message.role === 'user' ? 'items-end' : 'items-start')}
            >
              <div
                className={cn(
                  'max-w-[85%] rounded-lg px-3 py-2 text-sm',
                  message.role === 'user' ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-200',
                )}
              >
                <p className="whitespace-pre-wrap break-words">{message.content}</p>
              </div>
            </div>
          ))
        )}
        {isProcessing && (
          <div className="flex items-start">
            <div className="bg-zinc-800 rounded-lg px-3 py-2">
              <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-zinc-800 p-3 bg-zinc-900/95 backdrop-blur-xs"
      >
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            disabled={isProcessing}
            rows={1}
            className={cn(
              'flex-1 resize-none bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm',
              'placeholder:text-zinc-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500 focus:border-blue-500',
              'max-h-24 min-h-[36px]',
              isProcessing && 'opacity-50 cursor-not-allowed',
            )}
            style={{
              height: 'auto',
              minHeight: '36px',
            }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = `${Math.min(target.scrollHeight, 96)}px`;
            }}
          />
          <button
            type="submit"
            disabled={!input.trim() || isProcessing}
            className={cn(
              'p-2 rounded-lg bg-blue-600 text-white transition-colors',
              'hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {isProcessing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default FloatingChat;
