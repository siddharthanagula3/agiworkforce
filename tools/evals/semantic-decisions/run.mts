import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  buildCandidateDecision,
  createDecisionEvaluator,
  selectDecisionCandidate,
  type DecisionPolicy,
  type DecisionQuestion,
  type DecisionOutcome,
} from '../../../packages/ai/agent-core/src/index';
import { createTypeSafeDecisionProvider } from '../../../packages/ai/provider-runtime/src/typesafe-decisions';
import { classifyTaskLocally } from '../../../packages/ai/routing/src/index';
import { matchSkillsForPrompt, type Skill } from '../../../packages/tools/skills/src/index';

const directory = fileURLToPath(new URL('.', import.meta.url));
const fixturesText = readFileSync(`${directory}/fixtures.json`, 'utf8');
const fixtures = JSON.parse(fixturesText) as {
  provenance: string;
  candidates: { id: string; description: string }[];
  cases: { id: string; area: string; prompt: string; expected: string; source: string }[];
};
const configText = readFileSync(`${directory}/policy.json`, 'utf8');
const config = JSON.parse(configText) as Omit<DecisionPolicy, 'model'> & {
  confidence: number;
  fitProbability: number;
  repetitions: number;
  maxRetries: number;
};
if (
  !Number.isSafeInteger(config.repetitions) ||
  config.repetitions < 1 ||
  new Set(fixtures.cases.map((c) => c.id)).size !== fixtures.cases.length
)
  throw new Error('Invalid evaluation fixture configuration');
const live = process.argv.includes('--live');
const envFile = process.env['JEV_EVAL_ENV_FILE'];
if (live && envFile) process.loadEnvFile(envFile);
function required(name: string): string {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(`Missing ${name}`);
  return value;
}
const model = live ? required('TYPESAFE_DEFAULT_MODEL') : 'offline-no-model';
const inputPrice = live ? Number(required('JEV_EVAL_INPUT_USD_PER_MILLION')) : 0;
if (!Number.isFinite(inputPrice) || inputPrice < 0) throw new Error('Invalid evaluation price');
const run = live
  ? createDecisionEvaluator({
      kind: 'eval_harness',
      policy: () => ({ ...config, model }),
      provider: createTypeSafeDecisionProvider({
        apiKey: required('TYPESAFE_API_KEY'),
        baseURL: required('TYPESAFE_BASE_URL'),
        model,
        timeoutMs: config.timeoutMs,
        maxRetries: config.maxRetries,
      }),
    })
  : undefined;
const skills: Skill[] = fixtures.candidates.map((c) => ({
  name: c.id,
  description: c.description,
  body: '',
  contentHash: '',
  filePath: '',
  source: 'bundled',
  metadata: {},
  frontmatter: {},
}));
const intentQuestions: Record<string, DecisionQuestion> = {
  intent: {
    kind: 'choice',
    instruction:
      'Classify the dominant task requested in the state, not topics merely mentioned. Return a task category; do not answer the request.',
    options: {
      coding: 'Implement, debug, review, or explain concrete source code.',
      reasoning:
        'A mathematical proof, derivation, or difficult logical problem, rather than implementation of code.',
      research: 'Find current external information or research evidence with sources.',
      creative_writing: 'Compose or edit prose, a story, poem, or correspondence.',
      image_generation: 'Actually create or edit an image, not discuss image tools.',
      agentic: 'Coordinate multiple tools or agents to execute a multi-step task.',
      simple_chat: 'A greeting, thanks, or brief social exchange.',
      general: 'An informational explanation or other request outside the listed categories.',
    },
  },
  complexity: {
    kind: 'score',
    instruction: 'How much reasoning does fulfilling the request require?',
    levels: [
      'A brief social response or direct fact.',
      'One familiar task with few dependencies.',
      'Several dependent steps or analysis of evidence.',
      'A difficult proof or extensive investigation with interacting constraints.',
    ],
  },
  current_information: {
    kind: 'boolean',
    instruction:
      'Does correctly fulfilling this request require information that may have changed recently?',
  },
  external_action: {
    kind: 'boolean',
    instruction:
      'Does the user ask for an external tool action rather than an explanation or generated text alone?',
  },
};
const rows: Record<string, unknown>[] = [];
for (let repetition = 0; repetition < config.repetitions; repetition += 1) {
  for (const fixture of fixtures.cases) {
    const started = performance.now();
    const baseline =
      fixture.area === 'skills'
        ? (matchSkillsForPrompt(skills, fixture.prompt)[0]?.skill.name ?? 'none')
        : classifyTaskLocally(fixture.prompt, []).type;
    const baselineMs = performance.now() - started;
    const request =
      fixture.area === 'skills'
        ? buildCandidateDecision(fixture.prompt, fixtures.candidates)
        : { state: fixture.prompt, questions: intentQuestions };
    let outcome: DecisionOutcome | undefined;
    if (run)
      outcome = await run(request, {
        trustMode: 'managed',
        providerAllowed: true,
        cohort: 0,
      });
    let prediction: string | null = null;
    let gated = baseline as string;
    let confidence: number | null = null;
    let fallback = true;
    if (outcome && outcome.status !== 'fallback') {
      const answer = outcome.result.answers[fixture.area === 'skills' ? 'candidate' : 'intent'];
      if (answer?.kind === 'choice') {
        confidence = answer.confidence;
        prediction =
          fixture.area === 'skills'
            ? (fixtures.candidates[Number(answer.value.replace('candidate_', ''))]?.id ?? 'none')
            : answer.value;
        if (fixture.area === 'skills') {
          const selection = selectDecisionCandidate(outcome, fixtures.candidates, config);
          if (selection.status !== 'fallback') {
            gated = selection.status === 'none' ? 'none' : selection.candidateId;
            fallback = false;
          }
        } else if (answer.confidence >= config.confidence) {
          gated = answer.value;
          fallback = false;
        }
      }
    }
    rows.push({
      id: fixture.id,
      area: fixture.area,
      repetition,
      expected: fixture.expected,
      baseline,
      prediction,
      gated,
      baselineCorrect: baseline === fixture.expected,
      candidateCorrect: prediction === fixture.expected,
      gatedCorrect: gated === fixture.expected,
      baselineMs,
      confidence,
      fallback,
      outcome: outcome ?? null,
      inputUsd:
        outcome && outcome.status !== 'fallback'
          ? (outcome.result.inputTokens * inputPrice) / 1_000_000
          : null,
    });
  }
}
function percentile(values: number[], fraction: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? null;
}
const summary = Object.fromEntries(
  ['skills', 'intent'].map((area) => {
    const subset = rows.filter((row) => row['area'] === area);
    const latencies = subset
      .map((r) => (r['outcome'] as DecisionOutcome | null)?.latencyMs)
      .filter((v): v is number => v !== undefined);
    const failures = subset.filter(
      (r) => (r['outcome'] as DecisionOutcome | null)?.status === 'fallback',
    ).length;
    const totalUsd = subset.reduce((sum, r) => sum + Number(r['inputUsd'] ?? 0), 0);
    return [
      area,
      {
        cases: subset.length,
        uniqueCases: new Set(subset.map((r) => r['id'])).size,
        providerOrValidationFailures: failures,
        unmeteredFailures: failures,
        agreement: live
          ? subset.filter((r) => r['prediction'] === r['baseline']).length / subset.length
          : null,
        gainedCases: subset
          .filter((r) => !r['baselineCorrect'] && r['gatedCorrect'])
          .map((r) => r['id']),
        lostCases: subset
          .filter((r) => r['baselineCorrect'] && !r['gatedCorrect'])
          .map((r) => r['id']),
        confidenceBins: [0, 0.5, 0.8, 0.9].map((lower, index, bins) => {
          const upper = bins[index + 1] ?? 1.01;
          const bin = subset.filter(
            (r) =>
              typeof r['confidence'] === 'number' &&
              r['confidence'] >= lower &&
              r['confidence'] < upper,
          );
          return {
            lower,
            upper,
            count: bin.length,
            accuracy: bin.length
              ? bin.filter((r) => r['candidateCorrect']).length / bin.length
              : null,
          };
        }),
        baselineAccuracy: subset.filter((r) => r['baselineCorrect']).length / subset.length,
        candidateAccuracy: live
          ? subset.filter((r) => r['candidateCorrect']).length / subset.length
          : null,
        gatedAccuracy: live ? subset.filter((r) => r['gatedCorrect']).length / subset.length : null,
        fallbackRate: live ? subset.filter((r) => r['fallback']).length / subset.length : null,
        baselineP50Ms: percentile(
          subset.map((r) => Number(r['baselineMs'])),
          0.5,
        ),
        decisionP50Ms: percentile(latencies, 0.5),
        decisionP95Ms: percentile(latencies, 0.95),
        decisionP99Ms: percentile(latencies, 0.99),
        totalMeasuredUsd: live ? totalUsd : null,
        addedUsdPer1000: live ? (totalUsd / subset.length) * 1000 : null,
        addedUsdPerMillion: live ? (totalUsd / subset.length) * 1_000_000 : null,
        existingClassifierModelCalls: 0,
        candidateCallsPerRequest: live ? 1 : 0,
        downstreamCallsAvoided: 0,
        endToEndLatency: null,
        downstreamCostDelta: null,
        contextTokenSavings: null,
      },
    ];
  }),
);
const output = {
  generatedAt: new Date().toISOString(),
  live,
  model,
  inputPrice,
  fixtureSha256: createHash('sha256').update(fixturesText).digest('hex'),
  policySha256: createHash('sha256').update(configText).digest('hex'),
  provenance: fixtures.provenance,
  limitations:
    'Development set, author labels, two repetitions are not independent cases. No threshold tuning or held-out quality claim. No downstream generation or production traffic. Classifier timing is not end-to-end latency. SDK retries disabled; no cached responses.',
  config,
  summary,
  rows,
};
const destination =
  process.env['JEV_EVAL_OUTPUT'] ?? `${directory}/${live ? 'live' : 'offline'}-results.json`;
writeFileSync(destination, JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({ destination, summary }, null, 2));
if (live && rows.every((r) => (r['outcome'] as DecisionOutcome)?.status === 'fallback'))
  process.exitCode = 1;
