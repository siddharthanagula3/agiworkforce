import type { StudyLevel, StudyMode, StudySession } from '../lib/study-session';

export interface StudyApi {
  list: () => Promise<StudySession[]>;
  forConversation: (conversationId: string) => Promise<StudySession | null>;
  start: (input: {
    conversationId: string;
    topic: string;
    mode: StudyMode;
    level: StudyLevel;
  }) => Promise<StudySession>;
  end: (conversationId: string) => Promise<StudySession>;
}

const ENDPOINT = '/api/study/sessions';

async function readJson<T>(response: Response): Promise<T> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string'
        ? (body as { error: string }).error
        : 'Study mode is unavailable right now.';
    throw new Error(message);
  }
  return body as T;
}

export const studyApi: StudyApi = {
  async list() {
    const response = await fetch(ENDPOINT, { credentials: 'include' });
    return (await readJson<{ sessions: StudySession[] }>(response)).sessions;
  },
  async forConversation(conversationId) {
    const response = await fetch(
      `${ENDPOINT}?conversationId=${encodeURIComponent(conversationId)}`,
      { credentials: 'include' },
    );
    return (await readJson<{ sessions: StudySession[] }>(response)).sessions[0] ?? null;
  },
  async start(input) {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return (await readJson<{ session: StudySession }>(response)).session;
  },
  async end(conversationId) {
    const response = await fetch(ENDPOINT, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId }),
    });
    return (await readJson<{ session: StudySession }>(response)).session;
  },
};
