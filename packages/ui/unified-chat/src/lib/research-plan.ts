import { normalizeResearchDeliverable, type ResearchRunConfig } from '@agiworkforce/types';

export const MAX_PLAN_QUESTIONS = 3;
export const MAX_PLAN_QUESTION_CHARS = 200;

export function parseResearchPlanQuestions(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return [];
  const raw = (payload as { questions?: unknown }).questions;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .map((entry) => entry.trim().slice(0, MAX_PLAN_QUESTION_CHARS))
    .slice(0, MAX_PLAN_QUESTIONS);
}

export function researchAnswersGuidance(
  questions: readonly string[],
  answers: readonly string[],
): string | null {
  const answered = questions
    .map((question, index) => ({ question, answer: answers[index]?.trim() ?? '' }))
    .filter((entry) => entry.answer.length > 0);
  if (answered.length === 0) return null;
  return answered.map((entry) => `Q: ${entry.question}\nA: ${entry.answer}`).join('\n\n');
}

export const MAX_RUN_CONFIG_ENTRIES = 32;

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .slice(0, MAX_RUN_CONFIG_ENTRIES);
}

export function parseResearchRunConfig(payload: unknown): ResearchRunConfig | null {
  if (!payload || typeof payload !== 'object') return null;
  const run = (payload as { run?: unknown }).run;
  if (!run || typeof run !== 'object') return null;
  const wire = run as Record<string, unknown>;
  return {
    sources: {
      files: wire['files'] === true,
      allowDomains: stringList(wire['allow_domains']),
      denyDomains: stringList(wire['deny_domains']),
      connectors: stringList(wire['connectors']),
    },
    deliverable: normalizeResearchDeliverable(wire['deliverable']),
  };
}
