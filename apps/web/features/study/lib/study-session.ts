import {
  ACCOUNT_INSTRUCTION,
  CURRENT_REQUEST,
  resolveInstructionConflicts,
  type InstructionCandidate,
  type InstructionConflict,
} from '@/lib/context/precedence';
import { STUDY_LEVEL_LABELS, type StudyLevel, type StudyMode } from '@agiworkforce/types';

export {
  MAX_STUDY_TOPIC_LENGTH,
  STUDY_LEVELS,
  STUDY_LEVEL_LABELS,
  STUDY_MODES,
  STUDY_MODE_DESCRIPTIONS,
  STUDY_MODE_LABELS,
  isStudyLevel,
  isStudyMode,
  isStudySessionActive,
  normalizeStudyTopic,
  sortStudySessions,
  studyConversationTitle,
  type StudyLevel,
  type StudyMode,
  type StudySession,
} from '@agiworkforce/types';

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

const TEACHING_PRACTICES = [
  'Open with a short numbered outline of the steps the session will follow, and say which step you are on as you go.',
  'When the user is stuck, give one hint at a time, each more specific than the last, before revealing the answer.',
  'When you introduce a method, show one worked example step by step, then give the user a similar problem to try.',
  'When an idea is visual, spatial or quantitative, show it with a diagram, or build a small interactive explanation as an HTML artifact with controls the user can change.',
  'For practice questions, write an interactive quiz: one ```markdown block whose first line is <!-- @artifact --> holding a ~~~quiz block of JSON {"title", "questions": [{"type": "multiple_choice", "question", "options", "answer": <index>, "explanation", "hints"}, {"type": "short_answer", "question", "answer", "accept", "explanation"}]}.',
  'For memorising terms, write flashcards the same way with a ~~~flashcards block of JSON {"title", "cards": [{"front", "back"}]}.',
  'When the user has attached course material or is studying inside a project, teach from that material and say where in it each point comes from.',
  'Now and then ask the user to explain an idea back in their own words, typed or spoken with the microphone, and give feedback on what was accurate, what was missing and what was wrong.',
  'When the subject is a language, practise it with short exercises: translation both ways, fill in the blank, choosing the right form, and replying to a short prompt in the language, correcting each answer and explaining the rule.',
].join(' ');
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
    TEACHING_PRACTICES,
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

export function studyPlanRequest(session: { topic: string; level: StudyLevel }): string {
  return [
    `Before we start, build me a personal study plan for ${session.topic}.`,
    `My level: ${STUDY_LEVEL_LABELS[session.level].toLowerCase()}.`,
    'List what to cover in order, roughly how long each part takes, how you will check I understood each part, and where my course material covers it if I have attached any.',
    'Then ask me how much time I have each week and adjust the plan to fit.',
  ].join(' ');
}
