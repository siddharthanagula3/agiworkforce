'use client';

import type { ReactNode } from 'react';
import { SectionErrorBoundary } from '@agiworkforce/ui';

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
 */
export function ChatConversationBoundary({ children }: { children: ReactNode }) {
  return (
    <SectionErrorBoundary
      sectionName="Conversation"
      fallbackRender={({ error, resetError }) => (
        <ChatFailureNotice error={error} onRetry={resetError} />
      )}
    >
      {children}
    </SectionErrorBoundary>
  );
}
