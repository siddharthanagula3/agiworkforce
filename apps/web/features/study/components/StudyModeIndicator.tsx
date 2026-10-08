'use client';

import { useId } from 'react';
import { BookOpen } from '@agiworkforce/icons';

import { STUDY_MODE_LABELS, isStudySessionActive } from '../lib/study-session';
import type { ConversationStudySession } from '../hooks/use-conversation-study-session';

export const LEAVE_STUDY_MODE_DESCRIPTION =
  'Turns off tutoring for this chat. The chat and its messages stay.';
export const STUDY_MODE_OFF_NOTE = 'Study mode is off. This chat and its messages stay.';

const ACTION_CLASS =
  'ms-auto inline-flex h-7 shrink-0 touch-manipulation items-center rounded-md px-2 text-[13px] font-medium text-[var(--chat-text-secondary)] transition-colors hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)] disabled:cursor-not-allowed disabled:opacity-60 [@media(hover:none)]:h-11';

export function StudyModeIndicator({
  session,
  endedHere,
  pending,
  error,
  leave,
  resume,
}: ConversationStudySession) {
  const descriptionId = useId();
  if (!session) return null;
  const active = isStudySessionActive(session);
  if (!active && !endedHere) return null;

  return (
    <div data-testid="study-mode-indicator" className="mb-2 flex flex-col gap-1 px-1">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[var(--chat-text-secondary)]">
        <div className="flex min-w-0 flex-1 basis-48 items-center gap-2">
          <BookOpen className="h-4 w-4 shrink-0 text-[var(--chat-text-muted)]" aria-hidden="true" />
          {active ? (
            <p role="status" className="min-w-0 flex-1 truncate">
              <span className="font-medium text-[var(--chat-text-primary)]">
                Studying: {session.topic}
              </span>{' '}
              · {STUDY_MODE_LABELS[session.mode]}
            </p>
          ) : (
            <p role="status" className="min-w-0 flex-1">
              {STUDY_MODE_OFF_NOTE}
            </p>
          )}
        </div>
        {active ? (
          <button
            type="button"
            onClick={() => void leave()}
            disabled={pending}
            aria-describedby={descriptionId}
            title={LEAVE_STUDY_MODE_DESCRIPTION}
            className={ACTION_CLASS}
          >
            Leave study mode
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void resume()}
            disabled={pending}
            className={ACTION_CLASS}
          >
            Turn study mode back on
          </button>
        )}
        {active && (
          <span id={descriptionId} className="sr-only">
            {LEAVE_STUDY_MODE_DESCRIPTION}
          </span>
        )}
      </div>
      {error !== null && (
        <p role="alert" className="ps-6 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
