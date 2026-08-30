import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getModels } from '@agiworkforce/types';

import {
  apiCall,
  extractRuntimeToolEvents,
  invokedToolNames,
  loadedSkillNames,
  signIn,
} from './qa-capability-harness';

const OUT_DIR = process.env['QA_OUT_DIR'] ?? path.resolve(__dirname, '../../../.qa-evidence');

/** Cheapest tool-capable streaming chat model in the catalog; never a literal id. */
const TOOL_CAPABLE = getModels({ requireCapabilities: { tools: true, streaming: true } })
  .filter((model) => typeof model.inputCost === 'number' && (model.inputCost ?? 0) > 0)
  .sort((left, right) => (left.inputCost ?? Infinity) - (right.inputCost ?? Infinity));
const QA_MODEL = process.env['QA_MODEL'];
const TOOL_MODEL = QA_MODEL
  ? (TOOL_CAPABLE.find((model) => model.id === QA_MODEL) ?? TOOL_CAPABLE[0])
  : TOOL_CAPABLE[0];

const DIFF_SAMPLE = [
  '```diff',
  '--- a/auth.ts',
  '+++ b/auth.ts',
  '@@',
  '-  const token = req.headers.authorization?.split(" ")[1];',
  '-  if (!token) return res.status(401).end();',
  '-  const user = await verify(token);',
  '+  const token = req.query.token as string;',
  '+  const user = await verify(token);',
  '+  if (!user) return res.status(200).json({ ok: true });',
  '```',
].join('\n');

const CSV_SAMPLE = [
  'channel,signups,revenue',
  'organic,1204,18400',
  'paid,880,9100',
  'referral,310,7300',
  'email,455,2100',
].join('\n');

interface SkillCase {
  id: string;
  prompt: string;
  expectedSkill: string | null;
}

const SKILL_CASES: SkillCase[] = [
  {
    id: 'code-review',
    prompt: `Review this diff for correctness, security issues, regressions and unnecessary complexity.\n\n${DIFF_SAMPLE}`,
    expectedSkill: 'code-review',
  },
  {
    id: 'systematic-debugging',
    prompt:
      'This test is failing intermittently. Reproduce it, identify the root cause and fix it. The failure is in the checkout total calculation.',
    expectedSkill: 'systematic-debugging',
  },
  {
    id: 'data-analysis',
    prompt: `Analyze this CSV, identify important patterns and calculate the key statistics.\n\n${CSV_SAMPLE}`,
    expectedSkill: 'data-analysis',
  },
  {
    id: 'document-creation',
    prompt:
      'Create a polished Word report document from these notes: Q3 churn rose in the SMB segment, enterprise renewals held steady, and onboarding time fell by a fifth.',
    expectedSkill: 'document-creation',
  },
  {
    id: 'frontend-design-review',
    prompt:
      'Review this rendered screen for spacing, alignment, responsive behavior and accessibility problems before we ship it.',
    expectedSkill: 'frontend-design-review',
  },
  {
    id: 'literature-review',
    prompt:
      'Synthesize a literature review of the major approaches to retrieval augmented generation, separating evidence from open questions.',
    expectedSkill: 'literature-review',
  },
  {
    id: 'research-and-citations',
    prompt:
      'Research the current state of WebGPU browser support using authoritative sources and cite every claim you make.',
    expectedSkill: 'research-and-citations',
  },
  {
    id: 'presentation-creation',
    prompt:
      'Turn this material into a concise PowerPoint presentation with a clear narrative: our migration cut p95 latency in half and halved infrastructure spend.',
    expectedSkill: 'presentation-creation',
  },
  {
    id: 'skill-creator',
    prompt: 'Create a new reusable skill for performing a repository migration safely.',
    expectedSkill: 'skill-creator',
  },
  { id: 'negative-arithmetic', prompt: 'What is 2 + 2?', expectedSkill: null },
  {
    id: 'negative-greeting',
    prompt: 'Hello, how are you doing today?',
    expectedSkill: null,
  },
];

interface CaseResult extends SkillCase {
  model: string;
  httpStatus: number;
  skillToolOffered: boolean;
  offeredSkillNames: string[];
  invokedTools: string[];
  loadedSkills: string[];
  verdict: 'PASS' | 'FAIL';
  note: string;
}

test.describe('QA phase 3 — real skill invocation from real prompts', () => {
  test.setTimeout(15 * 60 * 1000);

  test('each skill is reached by a natural prompt, and neutral prompts load none', async ({
    page,
  }) => {
    expect(TOOL_MODEL, 'catalog must expose a tool-capable streaming model').toBeTruthy();
    await signIn(page);

    const results: CaseResult[] = [];

    const only = process.env['QA_CASE'];
    const cases = only ? SKILL_CASES.filter((c) => c.id === only) : SKILL_CASES;
    expect(cases.length, `QA_CASE=${only} matched no case`).toBeGreaterThan(0);

    for (const testCase of cases) {
      const response = await apiCall(page, '/api/llm/v1/chat/completions', {
        method: 'POST',
        idempotencyKey: `qa-skill-${testCase.id}-${Date.now()}`,
        body: {
          model: TOOL_MODEL!.id,
          stream: true,
          messages: [{ role: 'user', content: testCase.prompt }],
        },
      });

      const body = response.body;
      const events = extractRuntimeToolEvents(body);
      const invokedTools = invokedToolNames(events);
      const loadedSkills = loadedSkillNames(events);
      // The offer injects a system preamble listing the matched skills; the
      // skill tool itself only appears once at least one skill matched.
      const skillToolOffered = body.includes('"skill"') || invokedTools.includes('skill');

      const expected = testCase.expectedSkill;
      const verdict: 'PASS' | 'FAIL' = expected
        ? loadedSkills.includes(expected)
          ? 'PASS'
          : 'FAIL'
        : loadedSkills.length === 0
          ? 'PASS'
          : 'FAIL';

      results.push({
        ...testCase,
        model: TOOL_MODEL!.id,
        httpStatus: response.status,
        skillToolOffered,
        offeredSkillNames: [],
        invokedTools,
        loadedSkills,
        verdict,
        note: expected
          ? `expected skill ${expected}; loaded [${loadedSkills.join(', ') || 'none'}]`
          : `expected no skill; loaded [${loadedSkills.join(', ') || 'none'}]`,
      });

      mkdirSync(path.join(OUT_DIR, 'raw'), { recursive: true });
      writeFileSync(path.join(OUT_DIR, 'raw', `skill-${testCase.id}.sse.txt`), body);

      console.log(
        `[qa] ${testCase.id.padEnd(24)} http=${response.status} tools=[${invokedTools.join(',')}] skills=[${loadedSkills.join(',')}] -> ${verdict}`,
      );
    }

    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(
      path.join(OUT_DIR, 'skill-invocation-results.json'),
      JSON.stringify({ model: TOOL_MODEL!.id, results }, null, 2),
    );

    const failures = results.filter((entry) => entry.verdict === 'FAIL');
    console.log(
      `[qa] skill invocation: ${results.length - failures.length}/${results.length} pass`,
    );
    expect(
      failures.map((entry) => `${entry.id}: ${entry.note}`),
      'every prompt must reach (or correctly avoid) its skill',
    ).toEqual([]);
  });
});
