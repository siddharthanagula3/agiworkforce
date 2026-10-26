import type * as vscode from 'vscode';

const ANSWER_VARIANTS_KEY = 'agiWorkforce.answerVariants';
const MAX_THREADS = 50;
const MAX_PREVIOUS_ANSWERS = 5;
const MAX_ANSWER_LENGTH = 100_000;

interface ThreadAnswerVariants {
  touchedAt: number;
  previous: Record<string, string[]>;
}

type AnswerVariantStore = Record<string, ThreadAnswerVariants>;

function readStore(memento: vscode.Memento): AnswerVariantStore {
  const stored = memento.get<unknown>(ANSWER_VARIANTS_KEY);
  return typeof stored === 'object' && stored !== null ? (stored as AnswerVariantStore) : {};
}

export function previousAnswersFor(
  memento: vscode.Memento,
  threadId: string,
  questionIndex: number,
): string[] {
  const answers = readStore(memento)[threadId]?.previous[String(questionIndex)];
  return Array.isArray(answers) ? answers.filter((answer) => typeof answer === 'string') : [];
}

/**
 * Regenerate rewinds the session to just before the question and asks it
 * again, so the session keeps one line of history. The answers it replaced are
 * kept here, keyed by the question's position, so the transcript can still
 * offer them as earlier versions of the same answer.
 */
export async function rememberReplacedAnswer(
  memento: vscode.Memento,
  threadId: string,
  questionIndex: number,
  answer: string,
): Promise<string[]> {
  const store = readStore(memento);
  const thread = store[threadId] ?? { touchedAt: 0, previous: {} };
  const kept = previousAnswersFor(memento, threadId, questionIndex);
  const trimmed = answer.trim();
  const next =
    trimmed.length === 0 || trimmed.length > MAX_ANSWER_LENGTH
      ? kept
      : [...kept, trimmed].slice(-MAX_PREVIOUS_ANSWERS);
  thread.previous[String(questionIndex)] = next;
  for (const key of Object.keys(thread.previous)) {
    if (Number(key) > questionIndex) delete thread.previous[key];
  }
  thread.touchedAt = Date.now();
  store[threadId] = thread;
  const threads = Object.entries(store).sort(([, a], [, b]) => b.touchedAt - a.touchedAt);
  await memento.update(ANSWER_VARIANTS_KEY, Object.fromEntries(threads.slice(0, MAX_THREADS)));
  return next;
}
