import { useRef, useEffect } from 'react';
import { useChatStore } from '../stores/chatStore';
import type { ChatMessage } from '../lib/types';

interface MessageListProps {
  conversationId: string;
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
          isUser
            ? 'bg-[var(--chat-accent-primary)] text-white'
            : 'bg-[var(--chat-surface-hover)] text-[var(--chat-fg)]'
        }`}
      >
        {message.content}
      </div>
    </div>
  );
}

export function MessageList({ conversationId }: MessageListProps) {
  const messages = useChatStore((s) => s.messages[conversationId] ?? []);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  return (
    <div className="h-full overflow-y-auto px-4 py-4">
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
