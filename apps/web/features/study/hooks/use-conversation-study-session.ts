'use client';

import { useCallback, useEffect, useState } from 'react';

import { toUserMessage } from '@/lib/user-error-message';

import type { StudySession } from '../lib/study-session';
import { studyApi, type StudyApi } from '../services/study-api';

export interface ConversationStudySession {
  session: StudySession | null;
  /** The session was ended from this view, so turning it back on is one click away. */
  endedHere: boolean;
  pending: boolean;
  error: string | null;
  leave: () => Promise<void>;
  resume: () => Promise<void>;
}

export function resumeStudySession(api: StudyApi, session: StudySession): Promise<StudySession> {
  return api.start({
    conversationId: session.conversationId,
    topic: session.topic,
    mode: session.mode,
    level: session.level,
  });
}

export function useConversationStudySession(
  conversationId: string | null,
  api: StudyApi = studyApi,
): ConversationStudySession {
  const [session, setSession] = useState<StudySession | null>(null);
  const [endedHere, setEndedHere] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSession(null);
    setEndedHere(false);
    setPending(false);
    setError(null);
    if (!conversationId) return undefined;
    let cancelled = false;
    api
      .forConversation(conversationId)
      .then((found) => {
        if (!cancelled) setSession(found);
      })
      .catch(() => {
        if (!cancelled) setSession(null);
      });
    return () => {
      cancelled = true;
    };
  }, [api, conversationId]);

  const leave = useCallback(async () => {
    if (!session || pending) return;
    setPending(true);
    setError(null);
    try {
      setSession(await api.end(session.conversationId));
      setEndedHere(true);
    } catch (cause) {
      setError(toUserMessage(cause, 'Study mode could not be turned off.'));
    } finally {
      setPending(false);
    }
  }, [api, pending, session]);

  const resume = useCallback(async () => {
    if (!session || pending) return;
    setPending(true);
    setError(null);
    try {
      setSession(await resumeStudySession(api, session));
      setEndedHere(false);
    } catch (cause) {
      setError(toUserMessage(cause, 'Study mode could not be turned back on.'));
    } finally {
      setPending(false);
    }
  }, [api, pending, session]);

  return { session, endedHere, pending, error, leave, resume };
}
