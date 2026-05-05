import { useRef, useEffect, useState, useCallback } from 'react';
import { useChatStore } from '../stores/chatStore';
import { MessageBubble } from './MessageBubble';
import type { Artifact } from '../lib/types';

interface MessageListProps {
  conversationId: string;
  onArtifactClick?: (artifact: Artifact) => void;
}

/**
 * Distance from the bottom (in pixels) within which we still consider the
 * user "at the bottom" and auto-scroll on new messages. 120px is roughly
 * one message bubble's worth of clearance — stays out of the way when the
 * user has clearly scrolled up to re-read history.
 */
const STICK_TO_BOTTOM_THRESHOLD_PX = 120;

export function MessageList({ conversationId, onArtifactClick }: MessageListProps) {
  const messages = useChatStore((s) => s.messagesByConversation[conversationId] ?? []);
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

  return (
    <div className="relative h-full">
      <div ref={scrollerRef} className="h-full overflow-y-auto px-4 py-4">
        {messages.map((msg, idx) => (
          <div
            key={msg.id}
            className={`mb-4 ${msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'}`}
          >
            <MessageBubble
              message={msg}
              isLast={idx === messages.length - 1}
              onArtifactClick={onArtifactClick}
            />
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {showJumpButton ? (
        <button
          type="button"
          onClick={handleJumpToBottom}
          aria-label={
            unreadCount > 0
              ? `Scroll to latest (${unreadCount} new ${
                  unreadCount === 1 ? 'message' : 'messages'
                })`
              : 'Scroll to latest'
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
          <span>{unreadCount > 0 ? 'New messages' : 'Scroll to latest'}</span>
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
