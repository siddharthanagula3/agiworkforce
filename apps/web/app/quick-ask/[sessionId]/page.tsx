import type { Metadata } from 'next';
import { WebChatRoot } from '@/features/chat/components/WebChatRoot';
import { conversationMetadata } from '@/lib/server/conversation-title';

interface Props {
  params: Promise<{ sessionId: string }>;
}

export function generateMetadata({ params }: Props): Promise<Metadata> {
  return conversationMetadata(params);
}

export default function QuickAskConversationPage() {
  return <WebChatRoot compact />;
}
