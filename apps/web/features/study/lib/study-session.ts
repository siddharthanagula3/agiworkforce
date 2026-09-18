import {
  ACCOUNT_INSTRUCTION,
  CURRENT_REQUEST,
  resolveInstructionConflicts,
  type InstructionCandidate,
  type InstructionConflict,
} from '@/lib/context/precedence';

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

const MODE_INSTRUCTIONS: Readonly<Record<StudyMode, string>> = {
  learn:
    'Teach this subject one idea at a time. Introduce a single concept, check it landed with one question, and only move on once the user has answered. Never present the whole subject at once.',
  practice:
    'Ask the user questions on this subject, one at a time. Wait for an answer before saying whether it is right, say exactly where a wrong answer went wrong, and then ask the next question.',
  review:
    'Revise this subject with the user. Start from what they already covered, ask what they remember before telling them, and concentrate on the parts they get wrong.',
};

const LEVEL_INSTRUCTIONS: Readonly<Record<StudyLevel, string>> = {
  beginner: 'The user is new to this subject. Define every term before using it.',
  intermediate: 'The user knows the basics. Skip introductions and name things precisely.',
  expert:
    'The user knows this subject well. Go straight to the difficult parts and assume the vocabulary.',
};

const STUDY_RULE =
  'Do not give the answer to a question you have just asked until the user has attempted it.';

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

export function composeStudyInstruction(session: {
  topic: string;
  mode: StudyMode;
  level: StudyLevel;
}): string {
  return [
    `The user is studying ${session.topic}.`,
    MODE_INSTRUCTIONS[session.mode],
    LEVEL_INSTRUCTIONS[session.level],
    STUDY_RULE,
  ].join(' ');
}

export interface StudyPromptInput {
  session: { topic: string; mode: StudyMode; level: StudyLevel };
  accountInstruction: string | null;
  currentRequest: string | null;
}

export interface StudyPrompt {
  instructions: string[];
  conflicts: InstructionConflict[];
}

/**
 * Study mode states how to teach, the account instruction states how the user
 * likes to be answered, and the two can disagree about the same thing. Routing
 * both through the shared resolver is what keeps Study mode from being a second
 * place where instruction precedence is decided.
 */
export function composeStudyPrompt(input: StudyPromptInput): StudyPrompt {
  const candidates: InstructionCandidate[] = [
    {
      id: 'study',
      entry: 'template_instruction',
      text: composeStudyInstruction(input.session),
    },
  ];
  if (input.accountInstruction) {
    candidates.push({
      id: 'account',
      entry: ACCOUNT_INSTRUCTION,
      text: input.accountInstruction,
    });
  }
  if (input.currentRequest) {
    candidates.push({ id: 'request', entry: CURRENT_REQUEST, text: input.currentRequest });
  }

  const resolved = resolveInstructionConflicts(candidates);
  return {
    instructions: resolved.applied.map((candidate) => candidate.text),
    conflicts: resolved.conflicts,
  };
}

export function isStudySessionActive(session: Pick<StudySession, 'endedAt'>): boolean {
  return session.endedAt === null;
}

export function sortStudySessions(sessions: readonly StudySession[]): StudySession[] {
  return [...sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}
