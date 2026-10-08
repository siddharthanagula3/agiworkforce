'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, Trash2 } from '@agiworkforce/icons';
import { Spinner, useConfirmAction } from '@agiworkforce/ui';

import { toUserMessage } from '@/lib/user-error-message';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { useConversations } from '@/lib/hooks/useConversations';
import { PaneTitle } from '@shared/components/PaneTitle';
import {
  conversationDeleteConfirm,
  runSessionRowAction,
} from '@shared/components/layout/sidebar-session-actions';

import {
  MAX_STUDY_TOPIC_LENGTH,
  STUDY_LEVELS,
  STUDY_LEVEL_LABELS,
  STUDY_MODES,
  STUDY_MODE_DESCRIPTIONS,
  STUDY_MODE_LABELS,
  composeStudyInstruction,
  normalizeStudyTopic,
  sortStudySessions,
  studyConversationTitle,
  type StudyLevel,
  type StudyMode,
  type StudySession,
} from '../lib/study-session';
import { studyApi, type StudyApi } from '../services/study-api';
import { resumeStudySession } from '../hooks/use-conversation-study-session';

export interface StudyPageProps {
  api?: StudyApi;
  /** Creates the conversation a session runs in. Injected so the page can be driven in a test. */
  createConversation?: (title: string) => Promise<string>;
}

const ROW_ACTION_CLASS =
  'min-h-11 shrink-0 rounded-md border border-border px-3 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60';

const SELECT_CLASS =
  'w-full cursor-pointer rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none disabled:cursor-not-allowed disabled:opacity-60 focus:ring-1 focus:ring-ring';

async function createConversationForStudy(title: string): Promise<string> {
  const response = await fetch('/api/chat/conversations', {
    method: 'POST',
    credentials: 'include',
    headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ title }),
  });
  const body: unknown = await response.json().catch(() => null);
  const id =
    body && typeof body === 'object'
      ? ((body as { id?: unknown; conversation?: { id?: unknown } }).id ??
        (body as { conversation?: { id?: unknown } }).conversation?.id)
      : null;
  if (!response.ok || typeof id !== 'string') {
    throw new Error('The study conversation could not be created.');
  }
  return id;
}

export function StudyPage({
  api = studyApi,
  createConversation = createConversationForStudy,
}: StudyPageProps) {
  const router = useRouter();
  const { conversations, deleteConversation } = useConversations();
  const { confirm, dialog: confirmDialog } = useConfirmAction();
  const [topic, setTopic] = useState('');
  const [mode, setMode] = useState<StudyMode>('learn');
  const [level, setLevel] = useState<StudyLevel>('beginner');
  const [sessions, setSessions] = useState<StudySession[] | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    try {
      setSessions(sortStudySessions(await api.list()));
    } catch (cause) {
      setSessions([]);
      setError(toUserMessage(cause, 'Your study history could not be loaded.'));
    }
  }, [api]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const normalizedTopic = normalizeStudyTopic(topic);

  async function handleStart() {
    if (!normalizedTopic || starting) return;
    setStarting(true);
    setError(null);
    try {
      const conversationId = await createConversation(
        studyConversationTitle(normalizedTopic, mode),
      );
      const session = await api.start({ conversationId, topic: normalizedTopic, mode, level });
      router.push(`/chat/${session.conversationId}`);
    } catch (cause) {
      setError(toUserMessage(cause, 'The study session could not be started.'));
      setStarting(false);
    }
  }

  async function handleEnd(session: StudySession) {
    setError(null);
    try {
      await api.end(session.conversationId);
      await loadSessions();
    } catch (cause) {
      setError(toUserMessage(cause, 'The study session could not be closed.'));
    }
  }

  async function handleResume(session: StudySession) {
    setError(null);
    try {
      await resumeStudySession(api, session);
      router.push(`/chat/${session.conversationId}`);
    } catch (cause) {
      setError(toUserMessage(cause, 'Study mode could not be turned back on.'));
    }
  }

  function handleDelete(session: StudySession) {
    const title =
      conversations.find((conversation) => conversation.id === session.conversationId)?.title ??
      studyConversationTitle(session.topic, session.mode);
    confirm({
      ...conversationDeleteConfirm(title),
      onConfirm: async () => {
        const deleted = await runSessionRowAction('delete', () =>
          deleteConversation(session.conversationId),
        );
        if (deleted) {
          setSessions((current) =>
            (current ?? []).filter((entry) => entry.conversationId !== session.conversationId),
          );
        }
      },
    });
  }

  const active = (sessions ?? []).filter((session) => session.endedAt === null);
  const past = (sessions ?? []).filter((session) => session.endedAt !== null);

  return (
    <div className="mx-auto flex w-full max-w-[768px] flex-col gap-8 px-gutter-compact py-8 md:px-gutter-regular">
      <header className="flex flex-col gap-2">
        <PaneTitle className="flex items-center gap-2">
          <BookOpen aria-hidden="true" className="h-5 w-5" />
          Study
        </PaneTitle>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Work through a subject with the model instead of asking it for the answer. A study session
          is an ordinary conversation, so everything you cover stays in your chat history.
        </p>
      </header>

      <section aria-labelledby="study-start" className="flex flex-col gap-4">
        <h2 id="study-start" className="text-h5 text-foreground">
          Start a session
        </h2>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-foreground">What are you studying?</span>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value.slice(0, MAX_STUDY_TOPIC_LENGTH))}
            maxLength={MAX_STUDY_TOPIC_LENGTH}
            placeholder="e.g. eigenvalues, the Krebs cycle, German dative case"
            disabled={starting}
            className="rounded-md border border-border bg-background px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground outline-none disabled:cursor-not-allowed disabled:opacity-60 focus:ring-1 focus:ring-ring"
          />
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-[13px] font-medium text-foreground">How</legend>
          <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="How">
            {STUDY_MODES.map((entry) => (
              <button
                key={entry}
                type="button"
                role="radio"
                aria-checked={mode === entry}
                disabled={starting}
                onClick={() => setMode(entry)}
                className={`flex min-h-11 flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-start transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                  mode === entry
                    ? 'border-transparent bg-accent text-accent-foreground ring-1 ring-inset ring-primary'
                    : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className="text-[13px] font-medium">{STUDY_MODE_LABELS[entry]}</span>
                <span className="text-xs leading-snug">{STUDY_MODE_DESCRIPTIONS[entry]}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-foreground">Where you are with it</span>
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as StudyLevel)}
            disabled={starting}
            className={SELECT_CLASS}
          >
            {STUDY_LEVELS.map((entry) => (
              <option key={entry} value={entry}>
                {STUDY_LEVEL_LABELS[entry]}
              </option>
            ))}
          </select>
        </label>

        {normalizedTopic !== null && (
          <p className="rounded-md border border-border px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            {composeStudyInstruction({ topic: normalizedTopic, mode, level })}
          </p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void handleStart()}
            disabled={normalizedTopic === null || starting}
            className="min-h-11 rounded-md bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-50 hover:opacity-90"
          >
            {starting ? 'Starting...' : 'Start studying'}
          </button>
          {starting && <Spinner size="sm" aria-label="Starting the study session" />}
        </div>

        {error !== null && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
      </section>

      <section aria-labelledby="study-history" className="flex flex-col gap-3">
        <h2 id="study-history" className="text-h5 text-foreground">
          Your sessions
        </h2>

        {sessions === null ? (
          <Spinner size="sm" aria-label="Loading your study history" />
        ) : sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing yet. The subjects you study will be listed here so you can pick one back up.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {[...active, ...past].map((session) => (
              <li
                key={session.id}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md border border-border px-3 py-2"
              >
                <button
                  type="button"
                  onClick={() => router.push(`/chat/${session.conversationId}`)}
                  className="flex min-h-11 min-w-0 flex-1 basis-40 flex-col items-start gap-0.5 text-start"
                >
                  <span className="max-w-full truncate text-[13px] font-medium text-foreground">
                    {session.topic}
                  </span>
                  <span className="max-w-full truncate text-xs text-muted-foreground">
                    {STUDY_MODE_LABELS[session.mode]} · {STUDY_LEVEL_LABELS[session.level]}
                    {session.endedAt === null ? ' · running' : ''}
                  </span>
                </button>
                <div className="ms-auto flex shrink-0 items-center gap-1">
                  {session.endedAt === null ? (
                    <button
                      type="button"
                      onClick={() => void handleEnd(session)}
                      className={ROW_ACTION_CLASS}
                    >
                      Leave study mode
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleResume(session)}
                      className={ROW_ACTION_CLASS}
                    >
                      Resume study mode
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(session)}
                    aria-label={`Delete conversation: ${session.topic}`}
                    title="Delete conversation"
                    className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {confirmDialog}
    </div>
  );
}
