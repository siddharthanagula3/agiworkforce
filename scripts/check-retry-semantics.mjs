#!/usr/bin/env node

// A retry that is not classified, not counted, not backed off and not jittered
// is a way to turn one failing dependency into an outage. This guard reads the
// policy defaults and the tool definition out of the tree and fails on a
// missing one rather than trusting the prose.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const CONTRACT_PATH = 'packages/contracts/types/src/retry-contract.json';

export function loadContract(repoRoot = REPO_ROOT) {
  return JSON.parse(readFileSync(path.join(repoRoot, CONTRACT_PATH), 'utf8'));
}

function readSource(repoRoot, relativePath) {
  try {
    return readFileSync(path.join(repoRoot, relativePath), 'utf8');
  } catch {
    return null;
  }
}

/** The defaults object as the policy module declares it. */
export function readPolicyDefaults({ repoRoot = REPO_ROOT, module, symbol }) {
  const source = readSource(repoRoot, module);
  if (source === null) return null;
  const block = new RegExp(`export const ${symbol} = \\{([\\s\\S]*?)\\n\\}`).exec(source);
  if (block === null) return null;
  const defaults = {};
  for (const match of block[1].matchAll(/([A-Za-z]+):\s*([^,\n]+)/g)) {
    defaults[match[1]] = match[2].trim().replace(/\s+as const$/, '');
  }
  return defaults;
}

function checkPolicyFields({ repoRoot, contract, errors }) {
  const { module, symbol } = contract.policy;
  const defaults = readPolicyDefaults({ repoRoot, module, symbol });
  if (defaults === null) {
    errors.push(
      `${CONTRACT_PATH}: the retry policy defaults live in ${module}::${symbol}, which is not there. ` +
        'Every field below is reading nothing.',
    );
    return;
  }

  for (const [name, field] of Object.entries(contract.policy.fields)) {
    if (typeof field.why !== 'string' || field.why.trim().length === 0) {
      errors.push(`${CONTRACT_PATH}: retry field "${name}" carries no reason.`);
    }
    const value = defaults[name];
    if (value === undefined) {
      errors.push(`${module}: ${symbol} declares no ${name}. ${field.why}`);
      continue;
    }
    if (field.forbiddenValue !== undefined && value.replace(/['"]/g, '') === field.forbiddenValue) {
      errors.push(
        `${module}: ${symbol}.${name} defaults to ${value}, which is the value that turns the ` +
          `protection off. ${field.why}`,
      );
    }
    if (field.minimum !== undefined) {
      const numeric = Number(value.replace(/_/g, ''));
      if (!Number.isFinite(numeric) || numeric < field.minimum) {
        errors.push(
          `${module}: ${symbol}.${name} is ${value}, below the floor of ${field.minimum}. ${field.why}`,
        );
      }
    }
  }
}

/** The reason a retry happened has to reach the caller, not just the log. */
function checkClassification({ repoRoot, contract, errors }) {
  const { module, evidence } = contract.classification;
  const source = readSource(repoRoot, module);
  if (source === null) {
    errors.push(`${CONTRACT_PATH}: retry classification lives in ${module}, which does not exist.`);
    return;
  }
  for (const marker of evidence) {
    if (!new RegExp(`export[^\\n]*\\b${marker}\\b|\\b${marker}\\s*:`).test(source)) {
      errors.push(
        `${module}: no longer carries ${marker}, so a caller is told that something failed and not ` +
          'whether trying again can help.',
      );
    }
  }
}

/** A tool says for itself whether running it twice is safe. */
function checkToolDefinition({ repoRoot, contract, errors }) {
  const { module, field, vocabulary } = contract.toolRetry;
  const source = readSource(repoRoot, module);
  if (source === null) {
    errors.push(`${CONTRACT_PATH}: the tool definition lives in ${module}, which does not exist.`);
    return;
  }
  if (!new RegExp(`${field}\\s*:`).test(source)) {
    errors.push(
      `${module}: a tool definition no longer carries ${field}, so nothing says whether a retried ` +
        'tool call would repeat a side effect.',
    );
  }
  const vocabularySource = readSource(repoRoot, vocabulary.module);
  if (vocabularySource === null) {
    errors.push(`${CONTRACT_PATH}: ${vocabulary.module} does not exist.`);
    return;
  }
  for (const member of vocabulary.members) {
    if (!vocabularySource.includes(`'${member}'`)) {
      errors.push(
        `${vocabulary.module}: no longer offers "${member}", so a tool cannot declare that case and ` +
          'the runtime has to guess.',
      );
    }
  }
}

/** When a retry is worth offering, the reader gets the offer. */
function checkUserVisibleRetry({ repoRoot, contract, errors }) {
  for (const surface of contract.userVisibleRetry) {
    const source = readSource(repoRoot, surface.module);
    if (source === null) {
      errors.push(
        `${CONTRACT_PATH}: ${surface.module} is named as a user-visible retry and does not exist.`,
      );
      continue;
    }
    if (typeof surface.why !== 'string' || surface.why.trim().length === 0) {
      errors.push(`${CONTRACT_PATH}: user-visible retry ${surface.module} carries no reason.`);
    }
    if (!new RegExp(surface.evidence).test(source)) {
      errors.push(
        `${surface.module}: is named as the place a reader can try again and offers nothing ` +
          `matching ${surface.evidence}.`,
      );
    }
  }
}

export function checkRetrySemantics(repoRoot = REPO_ROOT) {
  const errors = [];
  const contract = loadContract(repoRoot);

  checkPolicyFields({ repoRoot, contract, errors });
  checkClassification({ repoRoot, contract, errors });
  checkToolDefinition({ repoRoot, contract, errors });
  checkUserVisibleRetry({ repoRoot, contract, errors });

  return {
    errors,
    report: {
      fields: Object.keys(contract.policy.fields).length,
      markers: contract.classification.evidence.length,
      surfaces: contract.userVisibleRetry.length,
    },
  };
}

function main() {
  const { errors, report } = checkRetrySemantics(REPO_ROOT);

  if (errors.length > 0) {
    console.error('Retry semantics check failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log(
    `check-retry-semantics: OK (${report.fields} policy fields, ${report.markers} classification ` +
      `markers, ${report.surfaces} user-visible retry surfaces)`,
  );
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
