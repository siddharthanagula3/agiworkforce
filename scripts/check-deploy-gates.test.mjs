import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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
  const relayWorkflow = contract.releaseReadiness.relay.workflow;
  writeFileSync(
    path.join(root, WORKFLOW_DIR, relayWorkflow),
    stringify(readWorkflow(REPO_ROOT, relayWorkflow)),
  );
  writeFileSync(
    path.join(root, CONTRACT_PATH),
    JSON.stringify({ ...contract, ...contractOverrides }),
  );
  return root;
}

function errorsAfter(mutate, contractOverrides) {
  return checkDeployGates(fixture(mutate, contractOverrides)).errors;
}

function errorsAfterRelay(mutate) {
  const root = fixture(() => {});
  const file = contract.releaseReadiness.relay.workflow;
  const document = readWorkflow(root, file);
  mutate(document);
  writeFileSync(path.join(root, WORKFLOW_DIR, file), stringify(document));
  return checkDeployGates(root).errors;
}

test('web promotion cannot remove or bypass the candidate release dependency', () => {
  for (const mutate of [
    (document) => {
      document.jobs['deploy-web'].needs = ['scope', 'staging-gate'];
    },
    (document) => {
      document.jobs['deploy-web'].if += ' && always()';
    },
    (document) => {
      document.jobs['release-gate']['continue-on-error'] = true;
    },
    (document) => {
      document.jobs['release-gate'].steps.at(-1).if = 'false';
    },
  ]) {
    assert.ok(errorsAfter(mutate).some((error) => /release-readiness/.test(error)));
  }
});

test('relay deployment gates use the candidate and the actual blocking checker', () => {
  for (const job of ['deploy-fly', 'deploy-railway']) {
    for (const mutate of [
      (step) => {
        step.env.GITHUB_SHA = '${{ github.sha }}';
      },
      (step) => {
        step.run = 'echo scan passed';
      },
      (step) => {
        step['continue-on-error'] = true;
      },
      (step) => {
        step.if = 'false';
      },
    ]) {
      const errors = errorsAfterRelay((document) =>
        mutate(
          document.jobs[job].steps.find(
            (step) => step.name === 'Require green scanning for this commit',
          ),
        ),
      );
      assert.ok(errors.some((error) => /candidate CI and scanning/.test(error)));
    }
  }
});

test('a relay receipt cannot omit serving verification or use workflow head identity', () => {
  for (const mutate of [
    (document) => {
      document.jobs['deploy-fly'].steps.at(-1).run = 'curl -sf example.invalid/health';
    },
    (document) => {
      document.jobs['relay-verdict'].needs = ['gate'];
    },
    (document) => {
      document.jobs['relay-verdict'].if = "github.event_name == 'workflow_dispatch'";
    },
    (document) => {
      document.jobs['relay-verdict'].steps.at(-1).env.GITHUB_SHA = '${{ github.sha }}';
    },
    (document) => {
      document.jobs['relay-verdict'].steps.at(-1).env.RELAY_DEPLOY_RESULT = 'success';
    },
  ]) {
    assert.ok(
      errorsAfterRelay(mutate).some((error) =>
        /serving candidate|candidate relay verdict/.test(error),
      ),
    );
  }
});

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

test('the web and sandbox writes cannot skip their fresh readiness checks', () => {
  for (const gate of contract.gates.filter((gate) => gate.command)) {
    for (const mutate of [
      (step) => {
        step.run = `echo "${gate.command}"`;
      },
      (step) => {
        step.if = 'false';
      },
      (step) => {
        step.env.GITHUB_SHA = '${{ github.sha }}';
      },
    ]) {
      const errors = errorsAfter((document) =>
        mutate(document.jobs[gate.job].steps.find((step) => step.name === gate.step)),
      );
      assert.ok(errors.some((error) => error.includes(gate.id)));
    }
  }
});

test('web promotion shares the serving relay deployment lock without cancellation', () => {
  const errors = errorsAfter((document) => {
    document.jobs['deploy-web'].concurrency.group = 'unrelated';
  });
  assert.ok(errors.some((error) => /serialize with the serving relay/.test(error)));
});

test('release CLI refuses an abbreviated candidate before it can contact GitHub', () => {
  const result = spawnSync(
    process.execPath,
    [path.join(REPO_ROOT, 'scripts/production-deploy-scope.mjs'), '--release-ready'],
    {
      env: {
        ...process.env,
        GITHUB_REPOSITORY: 'fixture/repository',
        GITHUB_TOKEN: 'fixture',
        GITHUB_SHA: 'a'.repeat(7),
      },
      input: '',
      encoding: 'utf8',
      timeout: 2000,
    },
  );
  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /full candidate commit/);
});

test('echoing a trusted command cannot satisfy any relay security gate', () => {
  for (const [job, stepName] of [
    ['deploy-fly', 'Require green scanning for this commit'],
    ['deploy-railway', 'Require green scanning for this commit'],
    [
      'deploy-fly',
      `${contract.releaseReadiness.relay.verificationStepPrefix}${'${{ needs.gate.outputs.sha }}'}`,
    ],
    ['relay-verdict', 'Publish the relay verdict for this commit'],
  ]) {
    const errors = errorsAfterRelay((document) => {
      const step = document.jobs[job].steps.find((step) => step.name === stepName);
      assert.ok(step, `${job} contains the real security step`);
      step.run = `echo ${step.run}`;
    });
    assert.ok(errors.length > 0, `${job} rejects a checker it never executed`);
  }
});

test('expressions cannot turn a deployment security gate into advisory behavior', () => {
  for (const value of [true, '${{ true }}', '${{ vars.ADVISORY }}', 'false']) {
    for (const mutate of [
      (document) => {
        document.jobs['deploy-fly']['continue-on-error'] = value;
      },
      (document) => {
        document.jobs['relay-verdict']['continue-on-error'] = value;
      },
      (document) => {
        document.jobs['deploy-fly'].steps.at(-1)['continue-on-error'] = value;
      },
      (document) => {
        document.jobs['relay-verdict'].steps.at(-1)['continue-on-error'] = value;
      },
    ]) {
      assert.ok(errorsAfterRelay(mutate).length > 0);
    }
    assert.ok(
      errorsAfter((document) => {
        document.jobs['release-gate']['continue-on-error'] = value;
      }).length > 0,
    );
  }
});

test('literal false cannot skip a trusted security command', () => {
  assert.ok(
    errorsAfterRelay((document) => {
      document.jobs['deploy-fly'].steps.at(-1).if = false;
    }).length > 0,
  );
  assert.ok(
    errorsAfter((document) => {
      document.jobs['release-gate'].steps.at(-1).if = false;
    }).length > 0,
  );
});
