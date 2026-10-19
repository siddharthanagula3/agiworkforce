import { z } from 'zod';
import {
  STUDY_LEVELS,
  STUDY_MODES,
  type StudyLevel,
  type StudyMode,
  type StudySession,
} from '@agiworkforce/types';
import { api, apiFetch } from '@/services/api';
import { ApiHttpError } from '@/services/apiErrors';

const STUDY_SESSIONS_PATH = '/api/study/sessions';

const StudySessionSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  topic: z.string(),
  mode: z.enum(STUDY_MODES),
  level: z.enum(STUDY_LEVELS),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
});

const SessionResponseSchema = z.object({ session: StudySessionSchema });
const SessionsResponseSchema = z.object({ sessions: z.array(StudySessionSchema) });

export async function startStudySession(input: {
  conversationId: string;
  topic: string;
  mode: StudyMode;
  level: StudyLevel;
}): Promise<StudySession> {
  return SessionResponseSchema.parse(await api.post<unknown>(STUDY_SESSIONS_PATH, input)).session;
}

export async function listStudySessions(signal?: AbortSignal): Promise<StudySession[]> {
  return SessionsResponseSchema.parse(
    await api.get<unknown>(STUDY_SESSIONS_PATH, signal ? { signal } : undefined),
  ).sessions;
}

export async function studySessionForConversation(
  conversationId: string,
  signal?: AbortSignal,
): Promise<StudySession | null> {
  const response = SessionsResponseSchema.parse(
    await api.get<unknown>(
      `${STUDY_SESSIONS_PATH}?conversationId=${encodeURIComponent(conversationId)}`,
      signal ? { signal } : undefined,
    ),
  );
  return response.sessions[0] ?? null;
}

export async function endStudySession(conversationId: string): Promise<StudySession> {
  const response = await apiFetch(STUDY_SESSIONS_PATH, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationId }),
  });
  if (!response.ok) throw new ApiHttpError('Study mode could not be turned off.', response.status);
  return SessionResponseSchema.parse(await response.json()).session;
}
