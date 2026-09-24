import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { classifyTaskLocally } from '../../../../../packages/ai/routing/src/index';
import { applyImplicitManagedToolIntent } from '@/app/api/llm/v1/chat/completions/lib/request-processor';
import { resolveWebSearchRequirement } from '@/lib/web-search/required-search';
import { loadSuite, scoreRows, type ScoredRow } from '../score.mts';
import type { Split } from '../split.mts';

const suiteDir = fileURLToPath(new URL('.', import.meta.url));
const { cases, labels } = loadSuite(suiteDir);

type Field = 'family' | 'needs_current_info' | 'needs_external_tools' | 'needs_code' | 'complexity';
const FIELDS: Field[] = [
  'family',
  'needs_current_info',
  'needs_external_tools',
  'needs_code',
  'complexity',
];

interface Predicted {
  family: string;
  needs_current_info: boolean;
  needs_external_tools: boolean;
  needs_code: boolean;
  /** No production component answers this one; see README. */
  complexity: null;
  searchSource: string | null;
  flags: Record<string, boolean>;
}

/**
 * The three production components, called the way the chat route calls them.
 * `researchTask` is derived from the classifier because that is what
 * request-processor.ts:4049 passes it, and the tool intents are applied to a
 * streaming request with every flag unset, which is the state a turn arrives in.
 */
function predict(message: string): Predicted {
  const family = classifyTaskLocally(message, []).type;
  const requirement = resolveWebSearchRequirement({
    webSearchEnabled: undefined,
    searchRequested: false,
    agiWorkRun: false,
    researchTask: family === 'research',
    userMessage: message,
  });
  const request = { messages: [], stream: true } as unknown as Parameters<
    typeof applyImplicitManagedToolIntent
  >[0];
  applyImplicitManagedToolIntent(request, { prompt: message, taskType: family, planTier: 'pro' });
  const record = request as unknown as Record<string, boolean | undefined>;
  const flags = {
    web_search: record['web_search'] === true,
    web_fetch: record['web_fetch'] === true,
    office_creation: record['office_creation'] === true,
    code_execution: record['code_execution'] === true,
  };
  return {
    family,
    needs_current_info: requirement.required,
    needs_external_tools: Object.values(flags).some(Boolean),
    needs_code: flags.code_execution,
    complexity: null,
    searchSource: requirement.source,
    flags,
  };
}

const predictions = new Map<string, Predicted>();
const byField: Record<Field, ScoredRow[]> = {
  family: [],
  needs_current_info: [],
  needs_external_tools: [],
  needs_code: [],
  complexity: [],
};

for (const one of cases.cases) {
  const input = one.input as { message: string; previousUserMessage?: string };
  const predicted = predict(input.message);
  predictions.set(one.id, predicted);
  const author = labels.labels[one.id]! as unknown as {
    label: Record<Field, string | boolean>;
    ambiguous?: Partial<Record<Field, (string | boolean)[]>>;
  };
  for (const field of FIELDS) {
    const expected = author.label[field];
    const alternatives = author.ambiguous?.[field];
    const value = predicted[field];
    const measurable = value !== null;
    byField[field].push({
      id: one.id,
      split: one.meta.split as Split,
      tags: one.meta.tags,
      expected: String(expected),
      ...(alternatives ? { alternatives: alternatives.map(String) } : {}),
      prediction: value === null ? 'not-measured' : String(value),
      scored: measurable && !alternatives,
      correct: measurable && !alternatives && String(value) === String(expected),
      defensible: Boolean(alternatives) && alternatives!.map(String).includes(String(value)),
    });
  }
}

const output = {
  suite: cases.suite,
  generatedAt: new Date().toISOString(),
  baseline: {
    family:
      'classifyTaskLocally, packages/ai/routing/src/classify.ts, called with the latest user message and empty history',
    needs_current_info:
      'resolveWebSearchRequirement, apps/web/lib/web-search/required-search.ts, with researchTask derived from the classifier as request-processor.ts:4049 does',
    needs_external_tools:
      'applyImplicitManagedToolIntent, apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:516, any of web_search, web_fetch, office_creation, code_execution',
    needs_code: 'the code_execution flag set by the same call',
    complexity:
      'no production component answers this, so it is recorded as not-measured rather than guessed',
    note: 'Every function above is the real one, imported and called. No regex was copied into this script.',
  },
  summary: Object.fromEntries(FIELDS.map((field) => [field, scoreRows(byField[field])])),
  rows: cases.cases.map((one) => ({
    id: one.id,
    split: one.meta.split,
    tags: one.meta.tags,
    predicted: predictions.get(one.id),
    expected: (labels.labels[one.id] as unknown as { label: unknown }).label,
  })),
};

writeFileSync(resolve(suiteDir, 'baseline.json'), `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ suite: output.suite, summary: output.summary }, null, 2));
