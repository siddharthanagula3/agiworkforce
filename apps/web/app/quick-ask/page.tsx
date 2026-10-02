import { WebChatRoot } from '@/features/chat/components/WebChatRoot';
import { NEW_CHAT_METADATA } from '@/features/chat/lib/conversation-document-title';

export const metadata = NEW_CHAT_METADATA;

export default function QuickAskPage() {
  return <WebChatRoot compact />;
}
