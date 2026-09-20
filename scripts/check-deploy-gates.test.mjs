import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { stringify } from 'yaml';

import { WORKFLOW_DIR } from './check-workflow-hardening.mjs';
import {
  CONTRACT_PATH,
  REPO_ROOT,
  checkDeployGates,
  checkoutRefs,
  gateConditions,
  loadContract,
  readWorkflow,
  upstreamJobs,
} from './check-deploy-gates.mjs';

const roots = [];
const contract = loadContract(REPO_ROOT);
const workflow = readWorkflow(REPO_ROOT, contract.workflow);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/** A copy of the real workflow with one thing changed, so every test bites on production reality. */
function fixture(mutate, contractOverrides = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'deploy-gates-'));
  roots.push(root);
  mkdirSync(path.join(root, WORKFLOW_DIR), { recursive: true });
  mkdirSync(path.join(root, path.dirname(CONTRACT_PATH)), { recursive: true });
  const document = clone(workflow);
  mutate(document);
  writeFileSync(path.join(root, WORKFLOW_DIR, contract.workflow), stringify(document));
  writeFileSync(
    path.join(root, CONTRACT_PATH),
    JSON.stringify({ ...contract, ...contractOverrides }),
  );
  return root;
}

function errorsAfter(mutate, contractOverrides) {
  return checkDeployGates(fixture(mutate, contractOverrides)).errors;
}

function dropStep(document, job, name) {
  const steps = document.jobs[job].steps;
  const index = steps.findIndex((step) => step.name === name);
  assert.notEqual(index, -1, `the real workflow still has "${name}" in ${job}`);
  steps.splice(index, 1);
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('the real guard passes on the repository as it stands', () => {
  const { errors, report } = checkDeployGates(REPO_ROOT);
  assert.deepEqual(errors, []);
  assert.ok(report.deployingJobs > 0);
  assert.equal(report.gates, contract.gates.length);
});

test('the fixture round trips unchanged', () => {
  assert.deepEqual(
    errorsAfter(() => {}),
    [],
  );
});

test('dropping the CI-green condition fails', () => {
  const errors = errorsAfter((document) => {
    document.jobs.scope.if = "github.event.workflow_run.head_branch == 'main'";
  });
  assert.ok(errors.length >= 1);
  assert.ok(errors.some((error) => /conclusion == 'success'/.test(error)));
});

test('dropping the fork-repository condition fails', () => {
  const errors = errorsAfter((document) => {
    document.jobs.scope.if = document.jobs.scope.if.replace(
      /&&\s*github\.event\.workflow_run\.head_repository\.full_name == github\.repository/,
      '',
    );
  });
  assert.ok(errors.some((error) => /head_repository\.full_name/.test(error)));
});

test('promoting a ref CI never verified fails', () => {
  const errors = errorsAfter((document) => {
    for (const step of document.jobs['deploy-web'].steps) {
      if (typeof step.uses === 'string' && step.uses.startsWith('actions/checkout@')) {
        step.with = { ...step.with, ref: 'main' };
      }
    }
  });
  assert.ok(errors.some((error) => /can promote a commit CI never verified/.test(error)));
});

test('a promoting job with no environment fails', () => {
  const errors = errorsAfter((document) => {
    delete document.jobs['deploy-web'].environment;
  });
  assert.ok(errors.some((error) => /promotes without an environment/.test(error)));
});

test('cancelling an in-progress promotion fails', () => {
  const errors = errorsAfter((document) => {
    document.concurrency = { group: 'production-surfaces', 'cancel-in-progress': true };
  });
  assert.ok(errors.some((error) => /rollback step never fires/.test(error)));
});

test('dropping the concurrency group fails', () => {
  const errors = errorsAfter((document) => {
    delete document.concurrency;
  });
  assert.ok(errors.some((error) => /declares no concurrency group/.test(error)));
});

test('every declared gate fails when its step is removed', () => {
  for (const gate of contract.gates) {
    const errors = errorsAfter((document) => dropStep(document, gate.job, gate.step));
    assert.ok(
      errors.some((error) => error.includes(gate.step)),
      `removing "${gate.step}" is caught`,
    );
  }
});

test('a gate turned into a report rather than a gate fails', () => {
  const errors = errorsAfter((document) => {
    const steps = document.jobs['deploy-web'].steps;
    const step = steps.find((entry) => entry.name === 'Verify the production serving path');
    step['continue-on-error'] = true;
  });
  assert.ok(errors.some((error) => /reports rather than\s+gates/.test(error.replace(/\n/g, ' '))));
});

test('a gate moved after the step it must precede fails', () => {
  const errors = errorsAfter((document) => {
    const steps = document.jobs['deploy-web'].steps;
    const index = steps.findIndex(
      (step) => step.name === 'Canary the deployment before it takes the production domains',
    );
    const [canary] = steps.splice(index, 1);
    steps.push(canary);
  });
  assert.ok(errors.some((error) => /runs after "Promote the deployment/.test(error)));
});

test('a gate whose command changed fails', () => {
  const errors = errorsAfter((document) => {
    const step = document.jobs['deploy-web'].steps.find(
      (entry) => entry.name === 'Verify the production schema ledger without mutation',
    );
    step.run = 'echo skipping';
  });
  assert.ok(errors.some((error) => /no longer matches/.test(error)));
});

test('a rollback that does not run on failure fails', () => {
  const errors = errorsAfter((document) => {
    const step = document.jobs['deploy-web'].steps.find(
      (entry) => entry.name === contract.rollback.step,
    );
    step.if = "steps.deploy.outputs.url != ''";
  });
  assert.ok(errors.some((error) => /does not run on failure\(\)/.test(error)));
});

test('removing the rollback step entirely fails', () => {
  const errors = errorsAfter((document) =>
    dropStep(document, 'deploy-web', contract.rollback.step),
  );
  assert.ok(errors.some((error) => /leaves the bad build serving/.test(error)));
});

test('a workflow with nothing that promotes fails rather than passing vacuously', () => {
  const errors = errorsAfter((document) => {
    for (const job of Object.values(document.jobs)) {
      for (const step of job.steps ?? []) {
        if (typeof step.run === 'string') step.run = step.run.replace(/vercel/g, 'echo');
      }
    }
  });
  assert.ok(errors.some((error) => /declares no job that promotes/.test(error)));
});

test('a contract gate carrying no reason fails', () => {
  const errors = errorsAfter(() => {}, {
    gates: contract.gates.map((gate) => ({ ...gate, why: '' })),
  });
  assert.ok(errors.some((error) => /carries no reason/.test(error)));
});

test('a missing workflow is reported rather than silently passing', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'deploy-gates-missing-'));
  roots.push(root);
  mkdirSync(path.join(root, path.dirname(CONTRACT_PATH)), { recursive: true });
  writeFileSync(path.join(root, CONTRACT_PATH), JSON.stringify(contract));
  const { errors } = checkDeployGates(root);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /could not be read/);
});

test('the helpers read the graph the rules depend on', () => {
  assert.ok(upstreamJobs(workflow, 'deploy-web').has('scope'));
  assert.ok(upstreamJobs(workflow, 'deploy-web').has('staging-gate'));
  assert.ok(gateConditions(workflow, 'deploy-web').includes("conclusion == 'success'"));
  assert.deepEqual(checkoutRefs(workflow.jobs['deploy-web']), [contract.verifiedCommitRef]);
  assert.ok(readFileSync(path.join(REPO_ROOT, WORKFLOW_DIR, contract.workflow), 'utf8').length > 0);
});
