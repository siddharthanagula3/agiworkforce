#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import process from 'node:process';

const root = process.cwd();
const GUARD = path.join(root, 'scripts/check-model-catalog-integrity.mjs');
const FIXTURE = path.join(root, 'apps/cli/test-fixture-stale-model-id.md');
const LABEL_FIXTURE = path.join(root, 'apps/cli/test-fixture-stale-model-label.ts');
const DOC_LABEL_FIXTURE = path.join(root, 'docs/test-fixture-retired-opus-label.md');
const TEST_LABEL_FIXTURE = path.join(root, 'apps/cli/tests/test-fixture-retired-opus-label.ts');
const curation = JSON.parse(
  fs.readFileSync(
    path.join(root, 'packages/ai/model-registry/catalog/models.curation.json'),
    'utf8',
  ),
);
const currentOpenAIModel = curation.providers?.openai?.defaultModel;
if (typeof currentOpenAIModel !== 'string') {
  throw new Error('Canonical OpenAI default model is missing');
}
const currentMajor = Number(currentOpenAIModel.match(/^gpt-(\d+)/i)?.[1]);
if (!Number.isInteger(currentMajor) || currentMajor < 2) {
  throw new Error('Canonical OpenAI default model does not expose a numeric generation');
}
const retiredFixtureId = `gpt-${currentMajor - 1}.fixture-retired`;

function runGuard() {
  try {
    const stdout = execFileSync(process.execPath, [GUARD], { cwd: root, stdio: 'pipe' }).toString();
    return { exitCode: 0, output: stdout };
  } catch (e) {
    return { exitCode: e.status ?? 1, output: (e.stderr ?? e.stdout ?? '').toString() };
  }
}

const FIXTURE_REL = path.relative(root, FIXTURE).replace(/\\/g, '/');

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}`);
    failed++;
  }
}

console.log('test: guard detects a catalog-absent numeric GPT identifier in .md files');

try {
  fs.writeFileSync(
    FIXTURE,
    [
      '# Fixture — stale model ID test',
      '',
      'This file is created and deleted by test-model-catalog-integrity-md.mjs.',
      '',
      '```bash',
      '# The following line contains a removed model ID that the guard must catch:',
      `agi -m ${retiredFixtureId} "hello"`,
      '```',
      '',
      `<!-- this HTML comment line is skipped: ${retiredFixtureId} should NOT produce a violation here -->`,
      '',
    ].join('\n'),
  );
  const { output: outStale } = runGuard();
  assert(
    'guard output mentions fixture .md file when it contains a catalog-absent GPT identifier',
    outStale.includes(FIXTURE_REL),
  );

  fs.writeFileSync(
    FIXTURE,
    ['# Fixture — clean version', '', '```bash', 'agi -m fixture-model "hello"', '```', ''].join(
      '\n',
    ),
  );
  const { output: outClean } = runGuard();
  assert(
    'guard output does not mention fixture .md file after it is cleaned up',
    !outClean.includes(FIXTURE_REL),
  );

  fs.writeFileSync(
    FIXTURE,
    [
      '# Fixture — stale id only in HTML comment',
      '',
      `<!-- ${retiredFixtureId} appears ONLY inside a comment; must not trigger a violation -->`,
      '',
    ].join('\n'),
  );
  const { output: outComment } = runGuard();
  assert(
    'guard skips HTML comment lines in .md (no false positive for fixture)',
    !outComment.includes(FIXTURE_REL),
  );

  const removedOpusLabel = ['Claude', 'Opus', ['4', '8'].join('.')].join(' ');
  fs.writeFileSync(LABEL_FIXTURE, `export const modelLabel = '${removedOpusLabel}';\n`);
  const { output: outLabel } = runGuard();
  assert(
    'guard rejects retired human-readable Opus labels in live TypeScript',
    outLabel.includes(path.relative(root, LABEL_FIXTURE).replace(/\\/g, '/')),
  );

  fs.writeFileSync(DOC_LABEL_FIXTURE, `# ${removedOpusLabel}\n`);
  const { output: outDocLabel } = runGuard();
  assert(
    'guard rejects the specifically removed Opus predecessor in repo documentation',
    outDocLabel.includes(path.relative(root, DOC_LABEL_FIXTURE).replace(/\\/g, '/')),
  );

  fs.writeFileSync(TEST_LABEL_FIXTURE, `export const modelLabel = '${removedOpusLabel}';\n`);
  const { output: outTestLabel } = runGuard();
  assert(
    'guard rejects the specifically removed Opus predecessor in test directories',
    outTestLabel.includes(path.relative(root, TEST_LABEL_FIXTURE).replace(/\\/g, '/')),
  );
} finally {
  for (const fixture of [FIXTURE, LABEL_FIXTURE, DOC_LABEL_FIXTURE, TEST_LABEL_FIXTURE]) {
    try {
      fs.unlinkSync(fixture);
    } catch {
      // ignore
    }
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
