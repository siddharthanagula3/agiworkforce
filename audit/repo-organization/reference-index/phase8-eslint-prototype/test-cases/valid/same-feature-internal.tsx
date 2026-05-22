// FILE: apps/mobile/src/features/chat/MessageList.tsx
// PASSES: features/X → features/X (same feature, internal module) is fine.

import { useChatMessages } from '@/src/features/chat/hooks';
import { MessageBubble } from '@/src/features/chat/MessageBubble';

export function MessageList() {
  const messages = useChatMessages();
  return messages.map((m) => <MessageBubble key={m.id} message={m} />);
}
