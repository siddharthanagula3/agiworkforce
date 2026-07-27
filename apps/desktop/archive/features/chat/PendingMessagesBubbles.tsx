/**
 * PendingMessagesBubbles
 *
 * Renders queued/pending messages as dimmed bubbles above the input.
 * These messages are waiting to be consumed after the current agentic loop finishes.
 */
import React from 'react';
import { useChatStore, selectPendingMessages } from '../../stores/chat/chatStore';
import type { PendingUserMessage } from '../../stores/chat/types';

export const PendingMessagesBubbles: React.FC = () => {
  const pendingMessages = useChatStore(selectPendingMessages);

  if (!pendingMessages || pendingMessages.length === 0) {
    return null;
  }

  return (
    <div
      className="flex flex-col gap-1.5 px-4 py-2 border-t border-white/5"
      aria-label="Queued messages"
    >
      {pendingMessages.map((msg: PendingUserMessage) => (
        <div
          key={msg.id}
          className="self-end max-w-[80%] px-3 py-2 rounded-2xl rounded-br-md bg-violet-900/20 border border-violet-500/15 text-xs text-violet-300/50 italic truncate"
          title={msg.content}
          aria-label={`Queued message: ${msg.content}`}
        >
          {msg.content}
        </div>
      ))}
    </div>
  );
};
