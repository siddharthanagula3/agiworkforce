import { useRef, useEffect } from 'react';
import { useChatStore } from '../stores/chatStore';
import { MessageBubble } from './MessageBubble';
import type { Artifact } from '../lib/types';

interface MessageListProps {
  conversationId: string;
  onArtifactClick?: (artifact: Artifact) => void;
}

export function MessageList({ conversationId, onArtifactClick }: MessageListProps) {
  const messages = useChatStore((s) => s.messagesByConversation[conversationId] ?? []);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  return (
    <div className="h-full overflow-y-auto px-4 py-4">
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
  );
}
