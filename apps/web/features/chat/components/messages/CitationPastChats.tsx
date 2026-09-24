'use client';

import { MessagesSquare } from 'lucide-react';
import type { PastChatCitation } from '@/lib/past-chat-citation';

/** Where the reader goes to check the claim: the chat it came from, at that message. */
export function pastChatCitationHref(citation: PastChatCitation): string {
  const params = new URLSearchParams({ highlightMessage: citation.messageId });
  return `/chat/${encodeURIComponent(citation.conversationId)}?${params.toString()}`;
}

function citationDate(createdAt: string): string | null {
  const parsed = Date.parse(createdAt);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * The previous chats an answer drew on. Recall is otherwise invisible: without
 * this the reader cannot tell a remembered fact from an invented one, nor open
 * the conversation it came from.
 */
export function CitationPastChats({ citations }: { citations: readonly PastChatCitation[] }) {
  if (citations.length === 0) return null;

  return (
    <nav
      className="flex flex-wrap items-center gap-1.5"
      aria-label="Previous chats this answer used"
    >
      {citations.map((citation) => {
        const date = citationDate(citation.createdAt);
        return (
          <a
            key={citation.id}
            href={pastChatCitationHref(citation)}
            aria-label={
              date
                ? `Open the source conversation ${citation.title}, ${date}`
                : `Open the source conversation ${citation.title}`
            }
            className="inline-flex h-7 max-w-[16rem] items-center gap-1 rounded-full border border-[var(--chat-border)] bg-[var(--chat-surface-hover)] px-2.5 align-middle text-xs font-medium text-[var(--chat-text-secondary)] no-underline transition-colors duration-instant hover:bg-[var(--chat-surface-elevated)] hover:text-[var(--chat-text-primary)]"
          >
            <MessagesSquare
              className="h-3.5 w-3.5 shrink-0 text-[var(--chat-text-muted)]"
              aria-hidden="true"
            />
            <span className="truncate">{citation.title}</span>
            {date && (
              <>
                <span aria-hidden="true" className="shrink-0 text-[var(--chat-text-muted)]">
                  &middot;
                </span>
                <span className="shrink-0 whitespace-nowrap">{date}</span>
              </>
            )}
          </a>
        );
      })}
    </nav>
  );
}
