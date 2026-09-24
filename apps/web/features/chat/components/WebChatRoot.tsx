'use client';

import dynamic from 'next/dynamic';

import { useNewChatEntry } from '@features/chat/hooks/use-new-chat';
import { ChatLoadingSkeleton } from './ChatLoadingSkeleton';
import type { ComposerWorkMode } from './Composer/ChatComposerNew';

const WebChatPage = dynamic(() => import('@features/chat/pages/WebChatPage'), {
  ssr: false,
  loading: () => <ChatLoadingSkeleton />,
});

export function WebChatRoot({
  compact = false,
  initialWorkMode,
}: {
  compact?: boolean;
  initialWorkMode?: ComposerWorkMode;
}) {
  useNewChatEntry();
  return <WebChatPage compact={compact} initialWorkMode={initialWorkMode} />;
}
