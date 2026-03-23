import { useRef, useEffect } from 'react';
import { useChatStore } from '../stores/chatStore';
import { MessageBubble } from './MessageBubble';

interface MessageListProps {
  conversationId: string;
}

export function MessageList({ conversationId }: MessageListProps) {
  const messages = useChatStore((s) => s.messages[conversationId] ?? []);
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
          <MessageBubble message={msg} isLast={idx === messages.length - 1} />
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
