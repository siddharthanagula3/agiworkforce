import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, Maximize2, Square, X } from 'lucide-react';
import { MarkdownContent, toUserMessage, type StreamEvent } from '@agiworkforce/unified-chat';
import { Spinner } from '@/ui/Spinner';
import { invoke } from '../../lib/tauri-mock';
import { cn } from '../../lib/utils';
import { TauriRuntime } from '../../runtime/TauriRuntime';
import { selectPrivacyMode, useAppModeStore } from '../../stores/appModeStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { resolveQuickChatModel, type QuickChatModel } from './quickChatModel';

interface QuickChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  error?: string;
}

type ModelState =
  | { status: 'loading' }
  | { status: 'ready'; model: QuickChatModel }
  | { status: 'missing' }
  | { status: 'failed'; reason: string };

const REPLY_FAILED = 'The reply could not be generated.';

function userMessage(error: unknown, fallback: string): string {
  return toUserMessage(error instanceof Error ? error : new Error(String(error)), fallback);
}

const ICON_BUTTON =
  'flex h-8 w-8 items-center justify-center rounded-lg text-[var(--chat-text-secondary)] transition-colors hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]';

function useSavedTheme() {
  const theme = useSettingsStore((state) => state.windowPreferences.theme);
  useEffect(() => {
    const dark =
      theme === 'dark' ||
      (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
  }, [theme]);
}

export const FloatingChat = () => {
  useSavedTheme();
  const privacyMode = useAppModeStore(selectPrivacyMode);
  const runtime = useMemo(() => new TauriRuntime(), []);
  const conversationId = useMemo(() => crypto.randomUUID(), []);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<QuickChatMessage[]>([]);
  const [streamingReplyId, setStreamingReplyId] = useState<string | null>(null);
  const [modelState, setModelState] = useState<ModelState>({ status: 'loading' });
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeReplyId = useRef<string | null>(null);
  const isStreaming = streamingReplyId !== null;

  const loadModel = useCallback(() => {
    setModelState({ status: 'loading' });
    resolveQuickChatModel().then(
      (model) => setModelState(model ? { status: 'ready', model } : { status: 'missing' }),
      (error: unknown) =>
        setModelState({
          status: 'failed',
          reason: userMessage(error, 'The models on this device could not be listed.'),
        }),
    );
  }, []);

  useEffect(() => {
    if (privacyMode === 'local') loadModel();
  }, [loadModel, privacyMode]);

  useEffect(
    () =>
      runtime.onStream((event: StreamEvent) => {
        const replyId = activeReplyId.current;
        if (!replyId) return;
        if (event.type === 'content') {
          setMessages((current) =>
            current.map((message) =>
              message.id === replyId
                ? { ...message, content: message.content + event.content }
                : message,
            ),
          );
        } else if (event.type === 'error') {
          setMessages((current) =>
            current.map((message) =>
              message.id === replyId
                ? { ...message, error: userMessage(event.error, REPLY_FAILED) }
                : message,
            ),
          );
        }
      }),
    [runtime],
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [modelState.status]);

  const model = modelState.status === 'ready' ? modelState.model : null;

  const send = useCallback(async () => {
    const content = input.trim();
    if (!content || isStreaming || !model) return;

    const replyId = crypto.randomUUID();
    activeReplyId.current = replyId;
    setStreamingReplyId(replyId);
    setInput('');
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: 'user', content },
      { id: replyId, role: 'assistant', content: '' },
    ]);

    try {
      await runtime.sendMessage(conversationId, content, {
        model: model.id,
        provider: model.provider,
      });
    } catch (error) {
      const reason = userMessage(error, REPLY_FAILED);
      setMessages((current) =>
        current.map((message) =>
          message.id === replyId ? { ...message, error: reason } : message,
        ),
      );
    } finally {
      activeReplyId.current = null;
      setStreamingReplyId(null);
    }
  }, [conversationId, input, isStreaming, model, runtime]);

  const stop = useCallback(() => {
    runtime.stopGeneration(conversationId);
  }, [conversationId, runtime]);

  const closeWindow = useCallback(() => {
    void invoke('window_close_floating').catch((error: unknown) => {
      console.error('[FloatingChat] Failed to close the quick chat window:', error);
    });
  }, []);

  const openMainWindow = useCallback(() => {
    void invoke('window_set_visibility', { visible: true })
      .then(() => invoke('window_close_floating'))
      .catch((error: unknown) => {
        console.error('[FloatingChat] Failed to open the main window:', error);
      });
  }, []);

  const notice =
    privacyMode !== 'local'
      ? 'Quick chat runs on this device only. Open the main window to chat in Cloud.'
      : modelState.status === 'missing'
        ? 'No model is running on this device. Start one from the main window, then try again.'
        : modelState.status === 'failed'
          ? modelState.reason
          : null;
  const canRetryModel = privacyMode === 'local' && notice !== null;

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-[var(--chat-bg)] text-[var(--chat-text-primary)]">
      <header className="flex items-center justify-between gap-2 border-b border-[var(--chat-border)] px-3 py-2">
        <div className="min-w-0">
          <h1 className="text-sm font-medium">Quick chat</h1>
          {model ? (
            <p className="truncate text-xs text-[var(--chat-text-secondary)]" title={model.name}>
              {model.name} · on this device
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={openMainWindow}
            className={ICON_BUTTON}
            aria-label="Open main window"
            title="Open main window"
          >
            <Maximize2 className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={closeWindow}
            className={ICON_BUTTON}
            aria-label="Close quick chat"
            title="Close"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </header>

      <div
        role="log"
        aria-live="polite"
        aria-label="Quick chat messages"
        className="flex-1 space-y-3 overflow-y-auto px-3 py-3"
      >
        {notice ? (
          <div role="alert" className="space-y-2 px-1 py-2">
            <p className="text-sm text-[var(--chat-text-primary)]">{notice}</p>
            <div className="flex gap-2">
              {canRetryModel ? (
                <button
                  type="button"
                  onClick={loadModel}
                  className="rounded-lg border border-[var(--chat-border-strong)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--chat-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]"
                >
                  Try again
                </button>
              ) : null}
              <button
                type="button"
                onClick={openMainWindow}
                className="rounded-lg border border-[var(--chat-border-strong)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--chat-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]"
              >
                Open main window
              </button>
            </div>
          </div>
        ) : modelState.status === 'loading' ? (
          <Spinner size="sm" className="text-[var(--chat-text-muted)]" />
        ) : messages.length === 0 ? (
          <p className="px-1 py-2 text-sm text-[var(--chat-text-secondary)]">
            Ask anything. The chat is saved to your Local history.
          </p>
        ) : (
          messages.map((message) =>
            message.role === 'user' ? (
              <div key={message.id} className="flex justify-end">
                <p className="max-w-[75%] whitespace-pre-wrap break-words rounded-2xl bg-[var(--chat-user-bubble-bg)] px-4 py-2.5 text-sm">
                  {message.content}
                </p>
              </div>
            ) : (
              <div key={message.id} className="min-w-0 text-sm">
                {message.content ? (
                  <MarkdownContent
                    content={message.content}
                    isStreaming={streamingReplyId === message.id}
                  />
                ) : message.error ? null : (
                  <Spinner size="sm" className="text-[var(--chat-text-muted)]" />
                )}
                {message.error ? (
                  <p role="alert" className="mt-1 text-sm text-[var(--chat-destructive-text)]">
                    {message.error}
                  </p>
                ) : null}
              </div>
            ),
          )
        )}
        <div ref={messagesEndRef} />
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
        className="border-t border-[var(--chat-border)] p-3"
      >
        <div className="flex items-end gap-2 rounded-2xl border border-[var(--chat-border-strong)] bg-[var(--chat-surface-elevated)] px-3 py-2 focus-within:ring-2 focus-within:ring-[var(--chat-focus-ring)]">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void send();
              }
            }}
            aria-label="Message"
            placeholder="Message"
            disabled={!model}
            rows={1}
            className="max-h-24 min-h-[24px] flex-1 resize-none bg-transparent text-sm text-[var(--chat-text-primary)] outline-none placeholder:text-[var(--chat-text-placeholder)] disabled:cursor-not-allowed"
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={stop}
              aria-label="Stop generating"
              className={cn(
                ICON_BUTTON,
                'border border-[var(--chat-border-strong)] text-[var(--chat-text-primary)]',
              )}
            >
              <Square className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim() || !model}
              aria-label="Send message"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--chat-accent-primary)] text-[var(--chat-accent-on-primary)] transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowUp className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </form>
    </div>
  );
};

export default FloatingChat;
