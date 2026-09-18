#!/usr/bin/env node
/**
 * Which product prompts a corpus measures, and which none does.
 *
 * `evals.yml` now runs on changes to the web app's prompt files, but a trigger
 * only decides that something runs, not that anything covers the thing that
 * changed. A corpus declares the prompt it measures as `promptId`; this pairs
 * those declarations with the prompt manifest itself and fails on the two ways
 * the pairing rots:
 *
 * - a corpus naming a prompt id the manifest no longer defines, which measures
 *   a prompt that no longer ships;
 * - a prompt in the manifest that no corpus covers and that the ledger below
 *   does not already record as uncovered, which is how an unmeasured prompt
 *   arrives without anyone deciding to accept one.
 *
 * The ledger (`prompt-coverage.json`) is a ratchet, not an excuse: it holds the
 * prompts that were already uncovered when the check landed, each with the
 * reason, and shrinks. Adding to it is a decision someone makes in review.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const EVALS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATASETS_DIR = path.join(EVALS_ROOT, 'datasets');
export const LEDGER_FILE = path.join(EVALS_ROOT, 'prompt-coverage.json');
export const PROMPT_MANIFEST_FILE = path.resolve(
  EVALS_ROOT,
  '../../apps/web/lib/prompts/prompt-manifest.ts',
);

const MANIFEST_ENTRY = /^ {2}'([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+)':\s*\{/gmu;

/**
 * The manifest is read as text on purpose: `tools/` is outside every workspace
 * glob, so it cannot import an `@agiworkforce` module or resolve the web app's
 * path aliases. Reading it as text means it can also lie, so a read that finds
 * no prompt at all is treated as a broken instrument rather than an empty
 * manifest.
 */
export function manifestPromptIds(source) {
  const ids = [...source.matchAll(MANIFEST_ENTRY)].map((match) => match[1]);
  if (ids.length === 0) {
    throw new Error(
      'the prompt manifest parsed to no prompt ids; the manifest moved or changed shape, and this check is measuring nothing',
    );
  }
  return [...new Set(ids)].sort();
}

export function corpusPromptIds(datasetsDir = DATASETS_DIR) {
  const covered = new Map();
  for (const name of fs.readdirSync(datasetsDir).filter((entry) => entry.endsWith('.json'))) {
    const dataset = JSON.parse(fs.readFileSync(path.join(datasetsDir, name), 'utf8'));
    if (typeof dataset.promptId !== 'string') continue;
    if (!covered.has(dataset.promptId)) covered.set(dataset.promptId, []);
    covered.get(dataset.promptId).push(dataset.suite);
  }
  return covered;
}

export function evaluateCoverage({ manifestIds, covered, ledger }) {
  const accepted = new Set(Object.keys(ledger.uncovered ?? {}));
  const problems = [];
  const manifest = new Set(manifestIds);

  for (const [promptId, suites] of covered) {
    if (!manifest.has(promptId)) {
      problems.push(
        `${suites.join(', ')} measure prompt ${promptId}, which the manifest no longer defines`,
      );
    }
  }
  const uncovered = manifestIds.filter((promptId) => !covered.has(promptId));
  for (const promptId of uncovered) {
    if (!accepted.has(promptId)) {
      problems.push(
        `prompt ${promptId} has no eval corpus and is not recorded in prompt-coverage.json; give it a corpus with "promptId": "${promptId}", or record why it has none`,
      );
    }
  }
  for (const promptId of accepted) {
    if (covered.has(promptId)) {
      problems.push(
        `prompt ${promptId} is recorded as uncovered but ${covered.get(promptId).join(', ')} now cover it; drop it from prompt-coverage.json`,
      );
    } else if (!manifest.has(promptId)) {
      problems.push(`prompt ${promptId} is recorded as uncovered but is not in the manifest`);
    }
  }
  return { passed: problems.length === 0, problems, covered, uncovered };
}

/** The corpora to run for a set of changed prompt ids. */
export function corporaForPrompts(promptIds, covered) {
  return [...new Set(promptIds.flatMap((promptId) => covered.get(promptId) ?? []))].sort();
}

function main() {
  const manifestIds = manifestPromptIds(fs.readFileSync(PROMPT_MANIFEST_FILE, 'utf8'));
  const covered = corpusPromptIds();
  const ledger = JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf8'));
  const verdict = evaluateCoverage({ manifestIds, covered, ledger });

  for (const [promptId, suites] of [...covered].sort()) {
    process.stdout.write(`covered ${promptId} -> ${suites.join(', ')}\n`);
  }
  for (const promptId of verdict.uncovered) {
    process.stdout.write(
      `uncovered ${promptId}: ${ledger.uncovered?.[promptId] ?? 'not recorded'}\n`,
    );
  }
  for (const problem of verdict.problems) process.stdout.write(`FAIL ${problem}\n`);
  process.stdout.write(
    `[evals prompts] ${covered.size} of ${manifestIds.length} product prompts have a corpus\n`,
  );
  process.exitCode = verdict.passed ? 0 : 1;
}

const isEntrypoint =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isEntrypoint) main();
