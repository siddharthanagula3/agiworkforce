import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  API_ROOT,
  CLASSIFIER_FILE,
  SERVICES_ROOT,
  admissionSubjects,
  audit,
  auditVocabulary,
  declaredCategories,
  deliverySubjects,
  read,
  ruleCategories,
} from './lib/managed-safety-floor.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

const CLASSIFIER = [
  "export type ModerationCategory = 'csae' | 'likeness';",
  '',
  'const RULES: readonly ModerationRule[] = [',
  "  { id: 'csae.sexualized-minor', category: 'csae', weight: 100 },",
  "  { id: 'likeness.impersonation-request', category: 'likeness', weight: 100 },",
  '];',
].join('\n');

const GATED_ROUTE = [
  "import { createImageGenerationJob } from '@/lib/server/image-generation-jobs';",
  "import { moderateManagedPrompt } from '@/lib/moderation';",
  '',
  'export async function POST(request) {',
  '  const verdict = moderateManagedPrompt({ userId, segments: [prompt] });',
  '  if (!verdict.allowed) return refuse(verdict);',
  '  return createImageGenerationJob({ prompt });',
  '}',
].join('\n');

const SCREENED_DELIVERY = [
  "import { buildAiGeneratedProvenance } from '@/lib/compliance/ai-act';",
  "import { moderateGeneratedMedia } from '@/lib/moderation';",
  "import { insertMediaAsset } from '@/lib/server/media-assets';",
  '',
  'export async function deliver(bytes) {',
  '  const verdict = await moderateGeneratedMedia({ bytes });',
  '  if (!verdict.allowed) return verdict;',
  '  return insertMediaAsset({ metadata: { aiAct: buildAiGeneratedProvenance({}) } });',
  '}',
].join('\n');

function tree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'managed-safety-floor-'));
  for (const [relative, contents] of Object.entries(files)) {
    const absolute = path.join(root, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, contents);
  }
  return root;
}

const WHOLE = {
  [CLASSIFIER_FILE]: CLASSIFIER,
  [`${API_ROOT}/media/image/generate/route.ts`]: GATED_ROUTE,
  [`${SERVICES_ROOT}/image-delivery.ts`]: SCREENED_DELIVERY,
};

const EMPTY_BASELINE = { unscreened: {} };

test('a synthetic tree with every control in place passes', () => {
  const verdict = audit(tree(WHOLE), EMPTY_BASELINE);
  assert.deepEqual(verdict.problems, []);
  assert.equal(verdict.admission.length, 1);
  assert.equal(verdict.delivery.length, 1);
});

test('a declared policy area that no rule carries fails', () => {
  const problems = auditVocabulary({
    declared: ['csae', 'likeness', 'targeted_violence'],
    rules: [{ id: 'csae.sexualized-minor', category: 'csae' }],
  });
  assert.ok(problems.some((problem) => problem.includes('likeness')));
  assert.ok(problems.some((problem) => problem.includes('targeted_violence')));
});

test('a rule carrying a category the union does not declare fails', () => {
  const problems = auditVocabulary({
    declared: ['csae'],
    rules: [
      { id: 'csae.sexualized-minor', category: 'csae' },
      { id: 'ip.copyright', category: 'copyright' },
    ],
  });
  assert.equal(problems.length, 1);
  assert.ok(problems[0].includes('ip.copyright'));
});

test('an entry point that creates a job without classifying the prompt fails', () => {
  const root = tree({
    ...WHOLE,
    [`${API_ROOT}/media/video/generate/route.ts`]: [
      "import { createVideoGenerationJob } from '@/lib/server/video-generation-jobs';",
      'export async function POST() {',
      '  return createVideoGenerationJob({ prompt });',
      '}',
    ].join('\n'),
  });
  const verdict = audit(root, EMPTY_BASELINE);
  assert.equal(verdict.problems.length, 1);
  assert.ok(verdict.problems[0].includes('video/generate/route.ts'));
  assert.ok(verdict.problems[0].includes('createVideoGenerationJob'));
});

test('an entry point that classifies after the job already exists fails', () => {
  const root = tree({
    ...WHOLE,
    [`${API_ROOT}/media/image/generate/route.ts`]: [
      'export async function POST() {',
      '  const job = await createImageGenerationJob({ prompt });',
      '  const verdict = moderateManagedPrompt({ segments: [prompt] });',
      '  return verdict.allowed ? job : refuse(verdict);',
      '}',
    ].join('\n'),
  });
  const verdict = audit(root, EMPTY_BASELINE);
  assert.equal(verdict.problems.length, 1);
  assert.ok(verdict.problems[0].includes('after it has already created the job'));
});

test('an import of the gate is not a call to it', () => {
  const root = tree({
    ...WHOLE,
    [`${API_ROOT}/media/image/generate/route.ts`]: [
      "import { moderateManagedPrompt } from '@/lib/moderation';",
      'export async function POST() {',
      '  return createImageGenerationJob({ prompt });',
      '}',
    ].join('\n'),
  });
  const verdict = audit(root, EMPTY_BASELINE);
  assert.equal(verdict.problems.length, 1);
  assert.ok(verdict.problems[0].includes('without classifying the prompt'));
});

test('a delivery path that stores generated bytes unscreened fails when it is not baselined', () => {
  const root = tree({
    ...WHOLE,
    [`${SERVICES_ROOT}/video-delivery.ts`]: [
      "import { buildAiGeneratedProvenance } from '@/lib/compliance/ai-act';",
      "import { upsertVideoMediaAsset } from '@/lib/server/media-assets';",
      'export async function deliver() {',
      '  return upsertVideoMediaAsset({ metadata: { aiAct: buildAiGeneratedProvenance({}) } });',
      '}',
    ].join('\n'),
  });
  const verdict = audit(root, EMPTY_BASELINE);
  assert.equal(verdict.problems.length, 1);
  assert.ok(verdict.problems[0].includes('video-delivery.ts'));
  assert.ok(verdict.problems[0].includes('without screening the bytes'));
});

test('a baselined delivery path needs a reason and the file that fixes it', () => {
  const root = tree({
    ...WHOLE,
    [`${SERVICES_ROOT}/video-delivery.ts`]: [
      "import { buildAiGeneratedProvenance } from '@/lib/compliance/ai-act';",
      "import { upsertVideoMediaAsset } from '@/lib/server/media-assets';",
      'export async function deliver() {',
      '  return upsertVideoMediaAsset({ metadata: { aiAct: buildAiGeneratedProvenance({}) } });',
      '}',
    ].join('\n'),
  });
  const named = `${SERVICES_ROOT}/video-delivery.ts`;
  const bare = audit(root, { unscreened: { [named]: {} } });
  assert.ok(bare.problems.some((problem) => problem.includes('needs a reason')));

  const reasoned = audit(root, {
    unscreened: { [named]: { reason: 'the screen lands in the next release', fixIn: named } },
  });
  assert.deepEqual(reasoned.problems, []);
  assert.deepEqual(reasoned.baseline.grown, []);
});

test('a baselined path that started screening is reported so the entry cannot linger', () => {
  const root = tree(WHOLE);
  const named = `${SERVICES_ROOT}/image-delivery.ts`;
  const verdict = audit(root, {
    unscreened: { [named]: { reason: 'historic', fixIn: named } },
  });
  assert.deepEqual(verdict.baseline.fixed, [named]);
});

test('a tree with no generation entry point at all refuses rather than reporting clean', () => {
  const verdict = audit(tree({ [CLASSIFIER_FILE]: CLASSIFIER }), EMPTY_BASELINE);
  assert.ok(verdict.problems.some((problem) => problem.includes('measuring nothing')));
});

test('the repository classifier declares a policy area for minors and for likeness', () => {
  const classifier = read(REPO_ROOT, CLASSIFIER_FILE);
  const declared = declaredCategories(classifier);
  assert.ok(declared.includes('csae'));
  assert.ok(declared.includes('likeness'));
  assert.deepEqual(auditVocabulary({ declared, rules: ruleCategories(classifier) }), []);
});

test('every managed generation entry point in the repository classifies before it dispatches', () => {
  const subjects = admissionSubjects(REPO_ROOT);
  assert.ok(subjects.length > 0);
  for (const subject of subjects) {
    assert.equal(subject.gatedBeforeDispatch, true, `${subject.file} dispatches unclassified`);
  }
});

test('the repository delivery paths are the ones this check knows about', () => {
  const subjects = deliverySubjects(REPO_ROOT);
  assert.ok(subjects.length > 0);
  assert.ok(subjects.some((subject) => subject.screened));
});
