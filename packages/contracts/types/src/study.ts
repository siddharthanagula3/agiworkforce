export const STUDY_MODES = ['learn', 'practice', 'review'] as const;
export type StudyMode = (typeof STUDY_MODES)[number];

export const STUDY_LEVELS = ['beginner', 'intermediate', 'expert'] as const;
export type StudyLevel = (typeof STUDY_LEVELS)[number];

export const MAX_STUDY_TOPIC_LENGTH = 200;

export interface StudySession {
  id: string;
  conversationId: string;
  topic: string;
  mode: StudyMode;
  level: StudyLevel;
  startedAt: string;
  endedAt: string | null;
}

export const STUDY_MODE_LABELS: Readonly<Record<StudyMode, string>> = {
  learn: 'Learn it',
  practice: 'Practise it',
  review: 'Revise it',
};

export const STUDY_MODE_DESCRIPTIONS: Readonly<Record<StudyMode, string>> = {
  learn: 'Work through the subject from the start, one idea at a time.',
  practice: 'Answer questions on it and get told where the answer went wrong.',
  review: 'Go back over what you covered before and find the gaps.',
};

export const STUDY_LEVEL_LABELS: Readonly<Record<StudyLevel, string>> = {
  beginner: 'New to it',
  intermediate: 'Some background',
  expert: 'Know it well',
};

export function isStudyMode(value: unknown): value is StudyMode {
  return typeof value === 'string' && (STUDY_MODES as readonly string[]).includes(value);
}

export function isStudyLevel(value: unknown): value is StudyLevel {
  return typeof value === 'string' && (STUDY_LEVELS as readonly string[]).includes(value);
}

export function normalizeStudyTopic(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, MAX_STUDY_TOPIC_LENGTH);
  return trimmed.length > 0 ? trimmed : null;
}

export function studyConversationTitle(topic: string, mode: StudyMode): string {
  return `${STUDY_MODE_LABELS[mode]}: ${topic}`;
}

export function isStudySessionActive(session: Pick<StudySession, 'endedAt'>): boolean {
  return session.endedAt === null;
}

export function sortStudySessions(sessions: readonly StudySession[]): StudySession[] {
  return [...sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}
