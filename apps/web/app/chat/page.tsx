import { headers } from 'next/headers';
import { WebChatRoot } from '@/features/chat/components/WebChatRoot';
import { NEW_CHAT_METADATA } from '@/features/chat/lib/conversation-document-title';

const AGI_WORK_PATH = '/agi-work';

export const metadata = NEW_CHAT_METADATA;

export default async function Page() {
  const requestHeaders = await headers();
  const requestedPath = requestHeaders.get('x-agi-pathname') ?? '';
  const initialWorkMode =
    requestedPath === AGI_WORK_PATH || requestedPath.startsWith(`${AGI_WORK_PATH}?`)
      ? 'agiwork'
      : undefined;
  return <WebChatRoot initialWorkMode={initialWorkMode} />;
}
