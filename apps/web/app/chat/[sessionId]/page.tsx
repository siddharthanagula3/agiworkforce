import type { Metadata } from 'next';
import { WebChatRoot } from '@/features/chat/components/WebChatRoot';
import { conversationDocumentTitle } from '@/features/chat/lib/conversation-document-title';
import { readOwnConversationTitle } from '@/lib/server/conversation-title';

interface Props {
  params: Promise<{ sessionId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { sessionId } = await params;
  return {
    title: {
      absolute: conversationDocumentTitle(await readOwnConversationTitle(sessionId), true),
    },
  };
}

export default function Page() {
  return <WebChatRoot />;
}
