import { useEffect, useRef, useCallback } from 'react';
import {
  useChatStore,
  selectMessages,
  selectActiveConversationId,
  uuidToDbId,
} from '../../stores/chat';
import type { EnhancedMessage } from '../../stores/chat';
import { ThinkingPill } from './ThinkingPill';
import { InlineArtifactChip } from './InlineArtifactChip';
import { ResponseActionRow } from './ResponseActionRow';

// ─── user message bubble ──────────────────────────────────────────────────────

function UserBubble({ message }: { message: EnhancedMessage }) {
  return (
    <div
      data-v3-msg-user=""
      style={{
        display: 'flex',
        justifyContent: 'flex-end',
        padding: '4px 0',
      }}
    >
      <div
        style={{
          maxWidth: '72%',
          padding: '10px 14px',
          borderRadius: 16,
          borderBottomRightRadius: 4,
          background: 'var(--chat-surface-hover)',
          color: 'var(--chat-text-primary)',
          fontSize: 14,
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {message.content}
      </div>
    </div>
  );
}

// ─── AI response row ──────────────────────────────────────────────────────────

function AiResponseRow({
  message,
  onOpenArtifact,
  onRegenerate,
  onBranch,
  onReact,
}: {
  message: EnhancedMessage;
  onOpenArtifact?: (artifactId: string) => void;
  onRegenerate?: (messageId: string) => void;
  onBranch?: (messageId: string) => void;
  onReact?: (messageId: string, reaction: 'thumbsUp' | 'thumbsDown') => void;
}) {
  const thinking = message.metadata?.thinking;
  const artifacts = message.artifacts ?? [];

  // Derive current reaction from reactions array (using first thumbsUp or thumbsDown)
  const currentReaction = message.reactions?.includes('thumbsUp')
    ? ('thumbsUp' as const)
    : message.reactions?.includes('thumbsDown')
      ? ('thumbsDown' as const)
      : null;

  return (
    <div
      data-v3-msg-ai=""
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: '4px 0',
        maxWidth: '85%',
      }}
    >
      {/* Thinking pill */}
      {thinking && <ThinkingPill summary={thinking.title} details={thinking.details} />}

      {/* Prose body — no bubble, left-aligned */}
      <div
        style={{
          fontSize: 14,
          lineHeight: 1.7,
          color: 'var(--chat-text-primary)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {message.content}
        {message.streaming && (
          <span
            style={{
              display: 'inline-block',
              width: 8,
              height: 14,
              background: 'var(--chat-text-muted)',
              borderRadius: 2,
              marginLeft: 2,
              animation: 'v3-cursor-blink 1s step-end infinite',
            }}
          />
        )}
      </div>

      {/* Inline artifact chips */}
      {artifacts.map((artifact) => (
        <InlineArtifactChip
          key={artifact.id}
          title={artifact.title ?? 'Artifact'}
          meta={artifact.language ? `${artifact.language} · interactive` : 'interactive'}
          onOpen={onOpenArtifact ? () => onOpenArtifact(artifact.id) : undefined}
        />
      ))}

      {/* Action row */}
      {!message.streaming && (
        <ResponseActionRow
          content={message.content}
          currentReaction={currentReaction}
          onRegenerate={onRegenerate ? () => onRegenerate(message.id) : undefined}
          onBranch={onBranch ? () => onBranch(message.id) : undefined}
          onReact={onReact ? (r) => onReact(message.id, r) : undefined}
        />
      )}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export interface ActiveChatProps {
  onOpenArtifact?: (artifactId: string) => void;
  onRegenerate?: (messageId: string) => void;
  onBranch?: (messageId: string) => void;
  onReact?: (messageId: string, reaction: 'thumbsUp' | 'thumbsDown') => void;
}

export function ActiveChat({ onOpenArtifact, onRegenerate, onBranch, onReact }: ActiveChatProps) {
  const messages = useChatStore(selectMessages);
  const activeConversationId = useChatStore(selectActiveConversationId);
  const editAndRegenerateFromMessage = useChatStore((s) => s.editAndRegenerateFromMessage);
  const forkAndRegenerate = useChatStore((s) => s.forkAndRegenerate);
  const toggleMessageReaction = useChatStore((s) => s.toggleMessageReaction);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  const handleReact = useCallback(
    (messageId: string, reaction: 'thumbsUp' | 'thumbsDown') => {
      if (onReact) {
        onReact(messageId, reaction);
      } else {
        toggleMessageReaction(messageId, reaction);
      }
    },
    [onReact, toggleMessageReaction],
  );

  const handleRegenerate = useCallback(
    (messageId: string) => {
      if (onRegenerate) {
        onRegenerate(messageId);
      } else {
        const msg = messages.find((m) => m.id === messageId);
        if (msg) editAndRegenerateFromMessage(messageId, msg.content);
      }
    },
    [onRegenerate, messages, editAndRegenerateFromMessage],
  );

  const handleBranch = useCallback(
    (messageId: string) => {
      if (onBranch) {
        onBranch(messageId);
      } else if (activeConversationId) {
        const dbConvId = uuidToDbId(activeConversationId);
        const msg = messages.find((m) => m.id === messageId);
        if (dbConvId != null && msg) {
          const dbMsgId = parseInt(messageId, 10);
          if (!isNaN(dbMsgId)) {
            void forkAndRegenerate(dbConvId, dbMsgId, msg.content);
          }
        }
      }
    },
    [onBranch, activeConversationId, messages, forkAndRegenerate],
  );

  if (messages.length === 0) return null;

  return (
    <>
      {/* Cursor blink keyframes injected once */}
      <style>{`
        @keyframes v3-cursor-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>

      <div
        ref={scrollRef}
        data-v3-active-chat=""
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px 0',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            maxWidth: 720,
            margin: '0 auto',
            width: '100%',
            padding: '0 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {messages.map((msg) => {
            if (msg.role === 'system') return null;
            if (msg.role === 'user') return <UserBubble key={msg.id} message={msg} />;
            return (
              <AiResponseRow
                key={msg.id}
                message={msg}
                onOpenArtifact={onOpenArtifact}
                onRegenerate={handleRegenerate}
                onBranch={handleBranch}
                onReact={handleReact}
              />
            );
          })}
        </div>
      </div>
    </>
  );
}
