'use client';

import { useEffect, type ReactNode } from 'react';
import { SectionErrorBoundary } from '@agiworkforce/ui';
import { reportClientFailure } from '@agiworkforce/unified-chat';

import { installClientFailureReporting } from '@/lib/observability/client-failure-transport';

import { ChatFailureNotice } from './ChatFailureNotice';

/**
 * Keeps a broken conversation from taking the app shell with it.
 *
 * Next's route boundary at `app/chat/error.tsx` replaces everything the layout
 * renders, so a transcript that throws left the user with no sidebar, no
 * header and no other conversation to open. This boundary sits inside the
 * page, below the sidebar and the header, so the failure costs only the column
 * it happened in. `resetError` re-renders that column rather than reloading,
 * and the link out is the same one the route boundary offers.
 *
 * It also installs client failure reporting: the transcript mounts first on every chat page.
 */
export function ChatConversationBoundary({ children }: { children: ReactNode }) {
  useEffect(() => {
    installClientFailureReporting();
  }, []);

  return (
    <SectionErrorBoundary
      sectionName="Conversation"
      onError={() => reportClientFailure({ failure: 'markdown_render', detail: 'render' })}
      fallbackRender={({ error, resetError }) => (
        <ChatFailureNotice error={error} onRetry={resetError} />
      )}
    >
      {children}
    </SectionErrorBoundary>
  );
}
