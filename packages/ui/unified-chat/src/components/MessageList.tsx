import { useRef, useEffect, useState, useCallback } from 'react';
import { useUiTranslation } from '@agiworkforce/ui';
import { useChatStore } from '../stores/chatStore';
import { useModelStore } from '../stores/modelStore';
import { MessageBubble, StreamingThinkingStatus } from './MessageBubble';
import { ProvenanceFooter } from './ProvenanceFooter';
import { ResearchStatusChip, readMessageResearchStatus } from './ResearchStatusChip';
import {
  isMessageContinuable,
  hasStreamError,
  getStreamErrorMessage,
} from '../lib/continue-generation';
import type { Artifact, MessageArtifactProjection, MessageRouting } from '../lib/types';

interface MessageListProps {
  conversationId: string;
  onArtifactClick?: (artifact: Artifact) => void;
  artifactProjections?: ReadonlyMap<string, MessageArtifactProjection> | null;
  showProvenanceFooter?: boolean;
  onContinueGeneration?: (assistantMessageId: string) => void;
  onRegenerateMessage?: (assistantMessageId: string) => void;
  onToolApprove?: (messageId: string, toolCallId: string) => void;
  onToolReject?: (messageId: string, toolCallId: string) => void;
  approvalTurnExpired?: boolean;
  onEditMessage?: (messageId: string, newContent: string) => void;
}

const STICK_TO_BOTTOM_THRESHOLD_PX = 120;

export function MessageList({
  conversationId,
  onArtifactClick,
  artifactProjections,
  showProvenanceFooter = true,
  onContinueGeneration,
  onRegenerateMessage,
  onToolApprove,
  onToolReject,
  approvalTurnExpired,
  onEditMessage,
}: MessageListProps) {
  const { t } = useUiTranslation('chat');
  const messages = useChatStore((s) => s.messagesByConversation[conversationId] ?? []);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const selectModel = useModelStore((s) => s.selectModel);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const [isNearBottom, setIsNearBottom] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const lastSeenLengthRef = useRef(0);

  const checkNearBottom = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setIsNearBottom(distanceFromBottom <= STICK_TO_BOTTOM_THRESHOLD_PX);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        checkNearBottom();
        ticking = false;
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    checkNearBottom();
    return () => el.removeEventListener('scroll', onScroll);
  }, [checkNearBottom]);

  useEffect(() => {
    const len = messages.length;
    const prevLen = lastSeenLengthRef.current;
    if (len > prevLen) {
      if (isNearBottom) {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        setUnreadCount(0);
      } else {
        setUnreadCount((c) => c + (len - prevLen));
      }
    }
    lastSeenLengthRef.current = len;
  }, [messages.length, isNearBottom]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setIsNearBottom(true);
    setUnreadCount(0);
    lastSeenLengthRef.current = messages.length;
    // Intentionally only on conversationId; messages.length handled above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  const handlePinModel = useCallback(
    (routing: MessageRouting) => {
      if (!routing.pinModel) return;
      selectModel(routing.pinModel);
    },
    [selectModel],
  );

  const handleJumpToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    setUnreadCount(0);
  }, []);

  const showJumpButton = !isNearBottom;

  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : undefined;
  const hasStreamingAssistant = messages.some(
    (message) => message.role === 'assistant' && message.isStreaming,
  );
  const showDetachedThinkingStatus = isStreaming && !hasStreamingAssistant;
  const showContinue =
    !isStreaming && !!onContinueGeneration && !!lastMessage && isMessageContinuable(lastMessage);

  const showStreamErrorNotice =
    !isStreaming &&
    !showContinue &&
    !!lastMessage &&
    !lastMessage.isStreaming &&
    hasStreamError(lastMessage);

  return (
    <div className="relative h-full">
      {/* Flat conversation feed (web parity): no per-role row striping, generous
          vertical rhythm via per-row py-3, and every row's content centred in a
          readable max-w-3xl column that lines up with the composer. */}
      <div ref={scrollerRef} className="h-full overflow-y-auto py-2">
        {messages.map((msg) => {
          const research =
            msg.role === 'assistant' ? readMessageResearchStatus(msg.metadata) : null;
          return (
            <div key={msg.id} data-message-row={msg.role} className="px-4 py-3">
              <div className="mx-auto w-full max-w-3xl">
                <div
                  className={
                    msg.role === 'user' ? 'flex justify-end' : 'flex flex-col items-stretch'
                  }
                >
                  {research && <ResearchStatusChip status={research} />}
                  <MessageBubble
                    message={msg}
                    artifactProjection={artifactProjections?.get(msg.id) ?? null}
                    onArtifactClick={onArtifactClick}
                    onRetry={onRegenerateMessage}
                    onToolApprove={onToolApprove}
                    onToolReject={onToolReject}
                    approvalTurnExpired={approvalTurnExpired}
                    onResendApproval={onRegenerateMessage}
                    onEdit={onEditMessage}
                  />
                  {showProvenanceFooter && msg.role === 'assistant' && !msg.isStreaming && (
                    <ProvenanceFooter message={msg} onPinModel={handlePinModel} />
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {showDetachedThinkingStatus ? (
          <div className="px-4 py-3" data-message-row="assistant-status">
            <div className="mx-auto w-full max-w-3xl">
              <StreamingThinkingStatus />
            </div>
          </div>
        ) : null}
        {showContinue && lastMessage ? (
          <div className="px-4 pb-3">
            <div className="mx-auto flex w-full max-w-3xl justify-start">
              <button
                type="button"
                onClick={() => onContinueGeneration?.(lastMessage.id)}
                aria-label={t(
                  'list.continueGeneratingAria',
                  'Continue generating the previous response',
                )}
                className="
                  inline-flex items-center gap-2
                  rounded-full border px-3 py-1.5
                  text-xs font-medium
                  transition hover:scale-[1.02] active:scale-[0.98]
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
                "
                style={{
                  background: 'var(--chat-surface-elevated)',
                  color: 'var(--chat-text-primary)',
                  borderColor: 'var(--chat-border-strong)',
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.25"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5 3l14 9-14 9V3z" />
                </svg>
                <span>{t('list.continueGenerating', 'Continue generating')}</span>
              </button>
            </div>
          </div>
        ) : null}
        {showStreamErrorNotice && lastMessage ? (
          <div className="px-4 pb-3">
            <div
              className="mx-auto flex w-full max-w-3xl items-center gap-2 rounded-lg border px-3 py-1.5 text-xs"
              style={{
                background: 'var(--chat-surface-elevated)',
                borderColor: 'var(--chat-destructive)',
                color: 'var(--chat-text-secondary)',
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--chat-destructive)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="shrink-0"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>
                {getStreamErrorMessage(lastMessage)
                  ? t('list.incompleteWithReason', 'Response may be incomplete: {{reason}}', {
                      reason: getStreamErrorMessage(lastMessage),
                    })
                  : t(
                      'list.incomplete',
                      'This response may be incomplete — the connection to the model was interrupted.',
                    )}
              </span>
              {onRegenerateMessage && (
                <button
                  type="button"
                  onClick={() => onRegenerateMessage(lastMessage.id)}
                  aria-label={t('list.regenerateAria', 'Regenerate this response')}
                  className="ml-auto shrink-0 rounded-md px-2 py-1 font-medium transition hover:bg-[var(--chat-surface-hover)]"
                  style={{ color: 'var(--chat-destructive-text)' }}
                >
                  {t('retry', 'Retry')}
                </button>
              )}
            </div>
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>

      {showJumpButton ? (
        <button
          type="button"
          onClick={handleJumpToBottom}
          aria-label={
            unreadCount > 0
              ? t('list.scrollToLatestUnread', 'Scroll to latest ({{count}} new)', {
                  count: unreadCount,
                })
              : t('list.scrollToLatest', 'Scroll to latest')
          }
          className="
            absolute bottom-4 left-1/2 z-10 -translate-x-1/2
            inline-flex items-center gap-2
            rounded-full border px-3 py-1.5
            text-xs font-medium
            shadow-lg transition
            hover:scale-[1.02] active:scale-[0.98]
            focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
          "
          style={{
            background: 'var(--chat-surface-elevated)',
            color: 'var(--chat-text-primary)',
            borderColor: 'var(--chat-border-strong)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          }}
        >
          {unreadCount > 0 ? (
            <span
              className="inline-flex items-center justify-center rounded-full px-1.5 text-[12px] font-semibold leading-tight"
              style={{
                background: 'var(--chat-accent-primary)',
                color: 'var(--chat-surface-elevated)',
                minWidth: '1.25rem',
                height: '1.25rem',
              }}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          ) : null}
          <span>
            {unreadCount > 0
              ? t('stream.newMessages', 'New messages')
              : t('list.scrollToLatest', 'Scroll to latest')}
          </span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 5v14" />
            <path d="m19 12-7 7-7-7" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
