import { useRef, useEffect, useState, useCallback } from 'react';
import { useUiTranslation } from '@agiworkforce/ui';
import { useChatStore } from '../stores/chatStore';
import { MessageBubble, StreamingThinkingStatus } from './MessageBubble';
import { ProvenanceFooter } from './ProvenanceFooter';
import {
  isMessageContinuable,
  hasStreamError,
  getStreamErrorMessage,
} from '../lib/continue-generation';
import type { Artifact, MessageArtifactProjection } from '../lib/types';

interface MessageListProps {
  conversationId: string;
  onArtifactClick?: (artifact: Artifact) => void;
  /**
   * Per-message artifact projections keyed by message id, computed once by
   * `ChatInterface` from the host's `deriveMessageArtifacts` capability. Absent
   * (or missing an entry) means "render this message exactly as stored" — the
   * behaviour for hosts that wire no derivation.
   */
  artifactProjections?: ReadonlyMap<string, MessageArtifactProjection> | null;
  /**
   * When true (default), assistant messages render a `ProvenanceFooter`
   * below their bubble. Pass `false` to suppress.
   */
  showProvenanceFooter?: boolean;
  /**
   * Continue Generation (cloud mode): resume the LAST assistant turn when it
   * was truncated at the token cap or user-stopped with partial content.
   * When omitted, the Continue control is not rendered (e.g. surfaces whose
   * runtime exposes no finish signal — no fake affordance).
   */
  onContinueGeneration?: (assistantMessageId: string) => void;
  /**
   * Re-run the user turn that produced an assistant message, replacing the old
   * exchange. Drives THREE affordances that all die together when it is
   * omitted: the mid-stream-error notice's Retry (see `hasStreamError`), the
   * per-message Retry in `ActionBar`, and the resend on an expired
   * tool-approval card. When omitted every one of them is hidden rather than
   * rendered dead — no fake affordance.
   */
  onRegenerateMessage?: (assistantMessageId: string) => void;
  /** Forwarded to `MessageBubble` — see its doc comments. */
  onToolApprove?: (messageId: string, toolCallId: string) => void;
  onToolReject?: (messageId: string, toolCallId: string) => void;
  /**
   * True when this conversation's suspended approval turn is no longer live
   * (see `ChatRuntime.hasLiveApprovalTurn`'s doc comment) -- awaiting_approval
   * cards render an expired notice instead of live Approve/Reject buttons,
   * which would otherwise render wired but silently no-op.
   */
  approvalTurnExpired?: boolean;
}

/**
 * Distance from the bottom (in pixels) within which we still consider the
 * user "at the bottom" and auto-scroll on new messages. 120px is roughly
 * one message bubble's worth of clearance — stays out of the way when the
 * user has clearly scrolled up to re-read history.
 */
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
}: MessageListProps) {
  const { t } = useUiTranslation('chat');
  const messages = useChatStore((s) => s.messagesByConversation[conversationId] ?? []);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // UX-MSGLIST-01: don't yank the user back to the bottom while they're
  // reading history. We track whether they're "near bottom" and only
  // auto-scroll when so; otherwise we surface a floating button + an
  // unread-count badge for them to opt back in. Mirrors the pattern in
  // Claude Desktop's chat surface (reference: 04_chat-layout_scroll-to-
  // bottom-floating-button.png).
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const lastSeenLengthRef = useRef(0);

  const checkNearBottom = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setIsNearBottom(distanceFromBottom <= STICK_TO_BOTTOM_THRESHOLD_PX);
  }, []);

  // Recompute on any user scroll. Throttling via rAF keeps this cheap
  // even on long histories.
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
    // Initial measurement after layout settles.
    checkNearBottom();
    return () => el.removeEventListener('scroll', onScroll);
  }, [checkNearBottom]);

  // When messages arrive: if the user is near the bottom, follow them.
  // Otherwise increment the unread badge so they can see how much they're
  // missing without losing their reading position.
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

  // Conversation switch: snap straight to bottom (no animation) and
  // reset the unread tracker, since the user explicitly chose this view.
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

  const handleJumpToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    setUnreadCount(0);
  }, []);

  const showJumpButton = !isNearBottom;

  // Continue-Generation control: offered only for the LAST message, when it is
  // a continuable assistant turn (truncated/user-stopped with partial content),
  // nothing is currently streaming, and the host wired a handler. Continuing an
  // earlier turn would fork history, so it is strictly the tail message.
  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : undefined;
  const hasStreamingAssistant = messages.some(
    (message) => message.role === 'assistant' && message.isStreaming,
  );
  // A host bridge may persist only durable/non-empty messages. Keep the
  // lifecycle indicator at the shared list boundary as a fallback so a real
  // in-flight turn never looks idle while its empty assistant placeholder is
  // absent from the rendered snapshot.
  const showDetachedThinkingStatus = isStreaming && !hasStreamingAssistant;
  const showContinue =
    !isStreaming && !!onContinueGeneration && !!lastMessage && isMessageContinuable(lastMessage);

  // Mid-stream provider failure notice: the turn otherwise looks like a
  // clean completion (server still ends the stream normally), so this is
  // the only signal telling the user their answer may be cut off. Offered
  // only on the last message, only once streaming has stopped, and mutually
  // exclusive with Continue — see hasStreamError's doc comment.
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
        {messages.map((msg) => (
          <div key={msg.id} data-message-row={msg.role} className="px-4 py-3">
            <div className="mx-auto w-full max-w-3xl">
              <div
                className={msg.role === 'user' ? 'flex justify-end' : 'flex flex-col items-stretch'}
              >
                <MessageBubble
                  message={msg}
                  artifactProjection={artifactProjections?.get(msg.id) ?? null}
                  onArtifactClick={onArtifactClick}
                  onRetry={onRegenerateMessage}
                  onToolApprove={onToolApprove}
                  onToolReject={onToolReject}
                  approvalTurnExpired={approvalTurnExpired}
                  onResendApproval={onRegenerateMessage}
                />
                {showProvenanceFooter && msg.role === 'assistant' && !msg.isStreaming && (
                  <ProvenanceFooter message={msg} />
                )}
              </div>
            </div>
          </div>
        ))}
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
                  style={{ color: 'var(--chat-destructive)' }}
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
              className="inline-flex items-center justify-center rounded-full px-1.5 text-[10px] font-semibold leading-tight"
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
