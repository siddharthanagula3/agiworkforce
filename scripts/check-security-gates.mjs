#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parse } from 'yaml';

const POLICY_PATH = '.github/security-gate-policy.json';
const DENY_PATH = 'deny.toml';

export function collectContinueOnErrorSteps(workflow) {
  const steps = [];
  for (const [job, definition] of Object.entries(workflow?.jobs ?? {})) {
    for (const step of definition?.steps ?? []) {
      if (step?.['continue-on-error'] === true) {
        steps.push({ job, step: step.name ?? '<unnamed step>' });
      }
    }
  }
  return steps;
}

export function findStep(workflow, job, name) {
  return (workflow?.jobs?.[job]?.steps ?? []).find((step) => step?.name === name);
}

export function parseDenyAdvisoryIgnores(denyToml) {
  const ignores = [];
  for (const section of denyToml.matchAll(/\[advisories\]([\s\S]*?)(?=\n\[|$)/gu)) {
    const ignore = /ignore\s*=\s*\[([\s\S]*?)\]/u.exec(section[1]);
    if (!ignore) continue;
    for (const match of ignore[1].matchAll(/"([^"]+)"/gu)) {
      ignores.push(match[1]);
    }
  }
  return ignores;
}

export function checkSecurityGates({ policy, workflow, denyToml }) {
  const failures = [];

  for (const gate of policy.gates ?? []) {
    const step = findStep(workflow, gate.job, gate.step);
    if (!step) {
      failures.push(`gate ${gate.id} is registered but job ${gate.job} has no step "${gate.step}"`);
      continue;
    }
    if (step['continue-on-error'] === true) {
      failures.push(`gate ${gate.id} is registered as blocking but the step is continue-on-error`);
    }
    if (!gate.blocksAt) {
      failures.push(`gate ${gate.id} does not document the severity it blocks at`);
    }
  }

  const registeredExclusions = new Map(
    (policy.exclusions ?? [])
      .filter((entry) => entry.kind === 'continue-on-error')
      .map((entry) => [`${entry.job}::${entry.step}`, entry]),
  );

  for (const found of collectContinueOnErrorSteps(workflow)) {
    const entry = registeredExclusions.get(`${found.job}::${found.step}`);
    if (!entry) {
      failures.push(
        `${found.job} step "${found.step}" is continue-on-error but is not registered in ${POLICY_PATH}`,
      );
      continue;
    }
    for (const field of ['reason', 'owner', 'tracking']) {
      if (!entry[field]) {
        failures.push(`exclusion ${entry.id} must state a ${field}`);
      }
    }
  }

  for (const entry of registeredExclusions.values()) {
    const found = findStep(workflow, entry.job, entry.step);
    if (!found) {
      failures.push(
        `exclusion ${entry.id} names a step that no longer exists: ${entry.job} / ${entry.step}`,
      );
    } else if (found['continue-on-error'] !== true) {
      failures.push(`exclusion ${entry.id} is stale: the step now blocks and must be deregistered`);
    }
  }

  const registeredIgnores = new Set(
    (policy.exclusions ?? [])
      .filter((entry) => entry.kind === 'cargo-deny-advisory-ignore')
      .flatMap((entry) => entry.advisories ?? []),
  );
  for (const advisory of parseDenyAdvisoryIgnores(denyToml)) {
    if (!registeredIgnores.has(advisory)) {
      failures.push(`${DENY_PATH} ignores ${advisory} without registering it in ${POLICY_PATH}`);
    }
  }

  return failures;
}

function main() {
  const root = process.cwd();
  const policy = JSON.parse(fs.readFileSync(path.join(root, POLICY_PATH), 'utf8'));
  const workflow = parse(fs.readFileSync(path.join(root, policy.workflow), 'utf8'));
  const denyToml = fs.readFileSync(path.join(root, DENY_PATH), 'utf8');

  const failures = checkSecurityGates({ policy, workflow, denyToml });
  for (const entry of policy.exclusions ?? []) {
    if (entry.kind === 'allowlist-file' && !fs.existsSync(path.join(root, entry.path))) {
      failures.push(`exclusion ${entry.id} points at a missing allowlist: ${entry.path}`);
    }
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      process.stderr.write(`ERROR: ${failure}\n`);
    }
    process.exit(1);
  }
  process.stdout.write(
    `${(policy.gates ?? []).length} security gates blocking as documented, ${(policy.exclusions ?? []).length} exclusions registered\n`,
  );
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main();
}
