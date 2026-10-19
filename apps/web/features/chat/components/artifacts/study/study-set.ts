export const QUIZ_BLOCK = 'quiz';
export const FLASHCARDS_BLOCK = 'flashcards';

export interface MultipleChoiceQuestion {
  kind: 'multiple_choice';
  question: string;
  options: string[];
  answer: number;
  explanation: string;
  hints: string[];
}

export interface ShortAnswerQuestion {
  kind: 'short_answer';
  question: string;
  answer: string;
  accept: string[];
  explanation: string;
  hints: string[];
}

export type QuizQuestion = MultipleChoiceQuestion | ShortAnswerQuestion;

export interface Quiz {
  title: string;
  questions: QuizQuestion[];
}

export interface Flashcard {
  front: string;
  back: string;
}

export interface FlashcardSet {
  title: string;
  cards: Flashcard[];
}

const MAX_QUESTIONS = 100;
const MAX_OPTIONS = 8;
const MAX_CARDS = 300;
const MAX_TEXT = 2_000;
const MAX_HINTS = 5;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, MAX_TEXT) : '';
}

function list(value: unknown, limit: number): string[] {
  return Array.isArray(value) ? value.map(text).filter(Boolean).slice(0, limit) : [];
}

function parseJson(source: string): unknown {
  try {
    return JSON.parse(source);
  } catch {
    return null;
  }
}

function parseQuestion(raw: unknown): QuizQuestion | null {
  if (!raw || typeof raw !== 'object') return null;
  const entry = raw as Record<string, unknown>;
  const question = text(entry['question']);
  if (!question) return null;
  const explanation = text(entry['explanation']);
  const hints = list(entry['hints'], MAX_HINTS);
  const options = list(entry['options'], MAX_OPTIONS);
  const kind = text(entry['type'] ?? entry['kind']);
  if (options.length >= 2 && kind !== 'short_answer') {
    const rawAnswer = entry['answer'];
    const index =
      typeof rawAnswer === 'number'
        ? rawAnswer
        : typeof rawAnswer === 'string'
          ? options.findIndex((option) => option.toLowerCase() === rawAnswer.trim().toLowerCase())
          : -1;
    if (!Number.isInteger(index) || index < 0 || index >= options.length) return null;
    return { kind: 'multiple_choice', question, options, answer: index, explanation, hints };
  }
  const answer = text(entry['answer']);
  if (!answer) return null;
  return {
    kind: 'short_answer',
    question,
    answer,
    accept: list(entry['accept'], 10),
    explanation,
    hints,
  };
}

export function parseQuiz(source: string): Quiz | null {
  const parsed = parseJson(source);
  const root = Array.isArray(parsed) ? { questions: parsed } : parsed;
  if (!root || typeof root !== 'object') return null;
  const entry = root as Record<string, unknown>;
  const questions = (Array.isArray(entry['questions']) ? entry['questions'] : [])
    .slice(0, MAX_QUESTIONS)
    .map(parseQuestion)
    .filter((question): question is QuizQuestion => question !== null);
  return questions.length > 0 ? { title: text(entry['title']), questions } : null;
}

export function parseFlashcards(source: string): FlashcardSet | null {
  const parsed = parseJson(source);
  const root = Array.isArray(parsed) ? { cards: parsed } : parsed;
  if (!root || typeof root !== 'object') return null;
  const entry = root as Record<string, unknown>;
  const cards = (Array.isArray(entry['cards']) ? entry['cards'] : [])
    .slice(0, MAX_CARDS)
    .flatMap((raw) => {
      if (!raw || typeof raw !== 'object') return [];
      const card = raw as Record<string, unknown>;
      const front = text(card['front'] ?? card['term'] ?? card['question']);
      const back = text(card['back'] ?? card['definition'] ?? card['answer']);
      return front && back ? [{ front, back }] : [];
    });
  return cards.length > 0 ? { title: text(entry['title']), cards } : null;
}

export function serializeQuiz(quiz: Quiz): string {
  return JSON.stringify(
    {
      title: quiz.title,
      questions: quiz.questions.map((question) =>
        question.kind === 'multiple_choice'
          ? {
              type: 'multiple_choice',
              question: question.question,
              options: question.options,
              answer: question.answer,
              explanation: question.explanation,
              ...(question.hints.length ? { hints: question.hints } : {}),
            }
          : {
              type: 'short_answer',
              question: question.question,
              answer: question.answer,
              ...(question.accept.length ? { accept: question.accept } : {}),
              explanation: question.explanation,
              ...(question.hints.length ? { hints: question.hints } : {}),
            },
      ),
    },
    null,
    2,
  );
}

export function serializeFlashcards(set: FlashcardSet): string {
  return JSON.stringify({ title: set.title, cards: set.cards }, null, 2);
}

function normalizeAnswer(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}.\-/ ]/gu, ' ')
    .replace(/\b(a|an|the)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\-/ ]+|[.\-/ ]+$/g, '');
}

export function gradeShortAnswer(question: ShortAnswerQuestion, response: string): boolean {
  const given = normalizeAnswer(response);
  if (!given) return false;
  return [question.answer, ...question.accept].some(
    (candidate) => normalizeAnswer(candidate) === given,
  );
}

export type StudySegment =
  | { kind: 'markdown'; text: string }
  | { kind: 'quiz'; source: string; start: number; end: number }
  | { kind: 'flashcards'; source: string; start: number; end: number };

const FENCE_OPEN = /^(`{3,}|~{3,})\s*([a-z-]+)\s*$/i;

export function studySegments(markdown: string): StudySegment[] {
  const lines = markdown.split('\n');
  const segments: StudySegment[] = [];
  let buffer: string[] = [];
  const flush = () => {
    const value = buffer.join('\n').trim();
    if (value) segments.push({ kind: 'markdown', text: value });
    buffer = [];
  };
  let index = 0;
  while (index < lines.length) {
    const open = FENCE_OPEN.exec(lines[index]!);
    const language = open?.[2]?.toLowerCase();
    if (!open || (language !== QUIZ_BLOCK && language !== FLASHCARDS_BLOCK)) {
      buffer.push(lines[index]!);
      index += 1;
      continue;
    }
    let close = index + 1;
    while (close < lines.length && lines[close]!.trim() !== open[1]) close += 1;
    flush();
    segments.push({
      kind: language,
      source: lines.slice(index + 1, close).join('\n'),
      start: index,
      end: close,
    });
    index = close + 1;
  }
  flush();
  return segments;
}

export function hasStudyBlocks(markdown: string): boolean {
  return studySegments(markdown).some((segment) => segment.kind !== 'markdown');
}

export function replaceStudyBlock(
  markdown: string,
  start: number,
  kind: 'quiz' | 'flashcards',
  source: string,
): string {
  const lines = markdown.split('\n');
  const segment = studySegments(markdown).find(
    (candidate) => candidate.kind !== 'markdown' && candidate.start === start,
  );
  if (!segment || segment.kind === 'markdown') return markdown;
  return [
    ...lines.slice(0, segment.start),
    `~~~${kind}`,
    source,
    '~~~',
    ...lines.slice(segment.end + 1),
  ].join('\n');
}
