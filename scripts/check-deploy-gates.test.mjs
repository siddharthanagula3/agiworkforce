import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

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
const stagingWorkflow = readWorkflow(REPO_ROOT, 'deploy-staging.yml');

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
  writeFileSync(path.join(root, WORKFLOW_DIR, 'deploy-staging.yml'), stringify(stagingWorkflow));
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

function runStagingStep(step, env = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'staging-verdict-'));
  roots.push(root);
  const argumentsFile = path.join(root, 'gh-arguments');
  const result = spawnSync(
    'bash',
    [
      '-c',
      `gh() {
  printf '%s\\0' "$@" >> "$GH_API_ARGUMENTS"
  printf '%s' "$STAGING_VERDICT"
  return "$GH_API_EXIT"
}
sleep() { exit 86; }
${step.run}`,
    ],
    {
      cwd: REPO_ROOT,
      env: {
        PATH: process.env.PATH,
        HEAD_SHA: 'a'.repeat(40),
        REPOSITORY: 'fixture/repository',
        GH_API_ARGUMENTS: argumentsFile,
        GH_API_EXIT: '0',
        STAGING_VERDICT: '',
        ...env,
      },
      encoding: 'utf8',
      timeout: 2000,
    },
  );
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  return {
    ...result,
    apiArguments: readFileSync(argumentsFile, 'utf8').split('\0').slice(0, -1),
  };
}

test('unconfigured staging reports both eligible triggers on their actual candidate', () => {
  const job = stagingWorkflow.jobs.unprovisioned;
  const step = job.steps.find(
    (entry) => entry.name === 'Report no staging verification for this commit',
  );
  const completedRun = {
    conclusion: 'success',
    event: 'push',
    head_branch: 'main',
    head_sha: 'a'.repeat(40),
    head_repository: { full_name: 'fixture/repository' },
  };
  for (const [eventName, stagingUrl, run, expected] of [
    ['workflow_dispatch', '', {}, true],
    ['workflow_run', '', completedRun, true],
    ['workflow_dispatch', 'https://staging.example.invalid', {}, false],
    ['workflow_run', 'https://staging.example.invalid', completedRun, false],
    ['workflow_run', '', { ...completedRun, conclusion: 'failure' }, false],
    ['workflow_run', '', { ...completedRun, conclusion: 'cancelled' }, false],
    ['workflow_run', '', { ...completedRun, event: 'pull_request' }, false],
    ['workflow_run', '', { ...completedRun, head_branch: 'feature' }, false],
    [
      'workflow_run',
      '',
      { ...completedRun, head_repository: { full_name: 'attacker/fork' } },
      false,
    ],
  ]) {
    const context = {
      vars: { STAGING_WEB_URL: stagingUrl },
      github: {
        event_name: eventName,
        sha: 'b'.repeat(40),
        repository: 'fixture/repository',
        event: { workflow_run: run },
      },
    };
    assert.equal(runInNewContext(job.if, context, { timeout: 1000 }), expected);
    if (!expected) continue;
    const shaExpression = step.env.HEAD_SHA.replace(/^\$\{\{\s*|\s*\}\}$/g, '');
    const candidate = runInNewContext(shaExpression, context, { timeout: 1000 });
    assert.equal(candidate, eventName === 'workflow_dispatch' ? 'b'.repeat(40) : 'a'.repeat(40));
    const result = runStagingStep(step, { HEAD_SHA: candidate });
    assert.equal(result.status, 1);
    assert.ok(result.apiArguments.includes(`repos/fixture/repository/statuses/${candidate}`));
    assert.ok(result.apiArguments.includes('state=error'));
  }
});

test('unconfigured staging posts an error for the exact candidate and fails', () => {
  const step = stagingWorkflow.jobs.unprovisioned.steps.find(
    (entry) => entry.name === 'Report no staging verification for this commit',
  );
  const result = runStagingStep(step);
  assert.equal(result.status, 1);
  assert.ok(result.apiArguments.includes(`repos/fixture/repository/statuses/${'a'.repeat(40)}`));
  assert.ok(result.apiArguments.includes('state=error'));
  assert.ok(result.apiArguments.includes('context=staging-web'));
  assert.ok(!result.apiArguments.includes('state=success'));
  assert.match(result.stdout, /::error::.*staging verification is required/);
});

test('production rejects an unverified legacy staging success', () => {
  const step = workflow.jobs['staging-gate'].steps.find(
    (entry) => entry.name === 'Wait for the staging verdict on this commit',
  );
  const result = runStagingStep(step, {
    STAGING_VERDICT: 'success\tstaging tier not provisioned; nothing was verified',
  });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /::error::.*nothing was verified/);
});

test('production accepts verified staging and rejects failed or unavailable verdicts', () => {
  const step = workflow.jobs['staging-gate'].steps.find(
    (entry) => entry.name === 'Wait for the staging verdict on this commit',
  );
  const verified = runStagingStep(step, {
    STAGING_VERDICT: 'success\tstaging served this commit and verified it',
  });
  assert.equal(verified.status, 0);
  assert.ok(
    verified.apiArguments.includes(`repos/fixture/repository/commits/${'a'.repeat(40)}/status`),
  );
  for (const state of ['failure', 'error']) {
    assert.equal(runStagingStep(step, { STAGING_VERDICT: `${state}\trejected` }).status, 1);
  }
  assert.equal(runStagingStep(step, { STAGING_VERDICT: 'none\t' }).status, 86);
  assert.equal(runStagingStep(step, { GH_API_EXIT: '1' }).status, 86);
});

test('staging publishes success only after its serving-path verification succeeds', () => {
  const step = stagingWorkflow.jobs.deploy.steps.find(
    (entry) => entry.name === 'Publish the staging verdict for this commit',
  );
  assert.equal(step.if, '${{ always() }}');
  for (const outcome of ['success', 'failure', 'skipped', 'cancelled', '']) {
    const result = runStagingStep(step, {
      VERIFY_OUTCOME: outcome,
      RECORD_OUTCOME: 'success',
      JOB_STATUS: 'success',
      WORKFLOW_RUN_URL: 'https://github.com/fixture/repository/actions/runs/1',
    });
    assert.equal(result.status, 0);
    assert.ok(
      result.apiArguments.includes(`state=${outcome === 'success' ? 'success' : 'failure'}`),
    );
    assert.ok(result.apiArguments.includes(`repos/fixture/repository/statuses/${'a'.repeat(40)}`));
  }
});

test('an unconfigured staging status cannot pass when its API call fails', () => {
  const step = stagingWorkflow.jobs.unprovisioned.steps.find(
    (entry) => entry.name === 'Report no staging verification for this commit',
  );
  assert.equal(runStagingStep(step, { GH_API_EXIT: '1' }).status, 1);
});

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

const stagingDatabase = 'postgresql://staging.example.invalid/staging';
const otherDatabase = 'postgresql://other.example.invalid/other';

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function runStagingDeployment(preview, expected = stagingDatabase) {
  const root = mkdtempSync(path.join(tmpdir(), 'staging-database-'));
  roots.push(root);
  mkdirSync(path.join(root, 'scripts'));
  const helper = path.join(REPO_ROOT, 'scripts/verify-staging-database.mjs');
  try {
    writeFileSync(path.join(root, 'scripts/verify-staging-database.mjs'), readFileSync(helper));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const callsPath = path.join(root, 'calls.jsonl');
  writeFileSync(callsPath, '');
  const names = new Set([
    'Pull preview project settings',
    'Verify the staging database binding',
    'Apply pending migrations to the staging database',
    'Build the staging artifact',
    'Deploy the prebuilt artifact',
  ]);
  const resolveEnv = (value) => {
    if (value === '${{ secrets.AGI_STAGING_DATABASE_URL }}') return expected;
    if (value === '${{ secrets.VERCEL_TOKEN }}') return 'fixture-token';
    if (value === '${{ secrets.VERCEL_ORG_ID }}') return 'fixture-org';
    if (value === '${{ secrets.VERCEL_PROJECT_ID }}') return 'fixture-project';
    if (value === '${{ vars.STAGING_WEB_URL }}') return 'https://staging.example.invalid';
    throw new Error('unrecognized staging environment binding');
  };
  const steps = stagingWorkflow.jobs.deploy.steps.filter((step) => names.has(step.name));
  const script = `set -euo pipefail
record() {
  node -e 'const fs=require("node:fs"); fs.appendFileSync(process.env.CALLS_PATH,JSON.stringify({args:process.argv.slice(1),agi:process.env.AGI_DATABASE_URL,database:process.env.DATABASE_URL})+String.fromCharCode(10))' "$@"
}
pnpm() { record pnpm "$@"; }
vercel() {
  record vercel "$@"
  if [ "$1" = pull ]; then
    mkdir -p .vercel
    printf '%s' "$PREVIEW_DATABASE_ENV" > .vercel/.env.preview.local
  fi
  if [ "$1" = deploy ]; then printf '%s\n' https://fixture-deployment.vercel.app; fi
}
${steps
  .map(
    (step) => `(
${Object.entries(step.env ?? {})
  .map(([key, value]) => `export ${key}=${shellQuote(resolveEnv(value))}`)
  .join('\n')}
${step.run}
)`,
  )
  .join('\n')}`;
  const result = spawnSync('bash', ['-c', script], {
    cwd: root,
    env: {
      PATH: process.env.PATH,
      CALLS_PATH: callsPath,
      PREVIEW_DATABASE_ENV: preview,
      GITHUB_OUTPUT: path.join(root, 'outputs'),
      ...Object.fromEntries(
        Object.entries(stagingWorkflow.jobs.deploy.env).map(([key, value]) => [
          key,
          resolveEnv(value),
        ]),
      ),
    },
    encoding: 'utf8',
    timeout: 5000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  return {
    ...result,
    fixtureRoot: root,
    calls: readFileSync(callsPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line)),
  };
}

test('staging refuses missing or conflicting preview database aliases before migration or build', () => {
  for (const preview of [
    '',
    `AGI_DATABASE_URL=${otherDatabase}\n`,
    `DATABASE_URL=${otherDatabase}\n`,
    `AGI_DATABASE_URL=${stagingDatabase}\nDATABASE_URL=${otherDatabase}\n`,
    `AGI_DATABASE_URL=${otherDatabase}\nDATABASE_URL=${stagingDatabase}\n`,
    `AGI_DATABASE_URL=\nDATABASE_URL=${stagingDatabase}\n`,
    `AGI_DATABASE_URL=${stagingDatabase}\nDATABASE_URL=\n`,
  ]) {
    const result = runStagingDeployment(preview);
    assert.notEqual(result.status, 0);
    assert.ok(result.calls.every((call) => call.args[0] === 'vercel' && call.args[1] === 'pull'));
    assert.ok(!`${result.stdout}${result.stderr}`.includes(stagingDatabase));
    assert.ok(!`${result.stdout}${result.stderr}`.includes(otherDatabase));
  }
});

test('staging binds build and prebuilt runtime aliases to the verified secret', () => {
  for (const preview of [
    `AGI_DATABASE_URL=${stagingDatabase}\n`,
    `DATABASE_URL=${stagingDatabase}\n`,
    `AGI_DATABASE_URL="${stagingDatabase}"\nDATABASE_URL='${stagingDatabase}'\n`,
  ]) {
    const result = runStagingDeployment(preview);
    assert.equal(result.status, 0);
    const build = result.calls.find((call) => call.args[1] === 'build');
    const deploy = result.calls.find((call) => call.args[1] === 'deploy');
    for (const call of [build, deploy]) {
      assert.ok(call);
      assert.equal(call.agi, stagingDatabase);
      assert.equal(call.database, stagingDatabase);
    }
    assert.ok(deploy.args.includes('--prebuilt'));
    assert.ok(deploy.args.includes('--archive=tgz'));
    assert.equal(deploy.args.filter((value) => value === '--env').length, 2);
    for (const name of ['AGI_DATABASE_URL', 'DATABASE_URL']) {
      assert.ok(
        deploy.args.some((value, index) => value === '--env' && deploy.args[index + 1] === name),
      );
    }
    assert.ok(!deploy.args.some((value) => value.includes(stagingDatabase)));
  }
});

test('staging rejects a missing protected database secret without reaching mutations', () => {
  const result = runStagingDeployment(`DATABASE_URL=${stagingDatabase}\n`, '');
  assert.notEqual(result.status, 0);
  assert.ok(result.calls.every((call) => call.args[1] === 'pull'));
});

test('staging parses quoted dotenv values without executing their contents', () => {
  const expected = `${stagingDatabase}?application_name=$(touch sentinel)#staging`;
  const result = runStagingDeployment(`DATABASE_URL="${expected}"\n`, expected);
  assert.equal(result.status, 0);
  assert.ok(result.calls.find((call) => call.args[1] === 'deploy'));
  assert.equal(existsSync(path.join(result.fixtureRoot, 'sentinel')), false);
});

test('staging verdict refuses any failed migration record or failed job after serving succeeds', () => {
  const step = stagingWorkflow.jobs.deploy.steps.find(
    (entry) => entry.name === 'Publish the staging verdict for this commit',
  );
  for (const [jobStatus, recordOutcome] of [
    ['failure', 'success'],
    ['cancelled', 'success'],
    ['success', 'failure'],
    ['success', 'skipped'],
    ['success', 'cancelled'],
    ['success', ''],
  ]) {
    const result = runStagingStep(step, {
      VERIFY_OUTCOME: 'success',
      RECORD_OUTCOME: recordOutcome,
      JOB_STATUS: jobStatus,
      WORKFLOW_RUN_URL: 'https://github.com/fixture/repository/actions/runs/1',
    });
    assert.equal(result.status, 0);
    assert.ok(result.apiArguments.includes('state=failure'));
    assert.ok(!result.apiArguments.includes('state=success'));
  }
});

function errorsAfterStaging(mutate) {
  const root = fixture(() => {});
  const document = clone(stagingWorkflow);
  mutate(document);
  writeFileSync(path.join(root, WORKFLOW_DIR, 'deploy-staging.yml'), stringify(document));
  return checkDeployGates(root).errors;
}

test('the deployment guard rejects a missing or advisory staging database validator', () => {
  for (const mutate of [
    (document) => {
      document.jobs.deploy.steps = document.jobs.deploy.steps.filter(
        (step) => step.id !== 'database',
      );
    },
    (document) => {
      const step = document.jobs.deploy.steps.find((step) => step.id === 'database');
      if (step) step['continue-on-error'] = true;
    },
    (document) => {
      const step = document.jobs.deploy.steps.find((step) => step.id === 'database');
      if (step) step.if = 'false';
    },
    (document) => {
      const step = document.jobs.deploy.steps.find((step) => step.id === 'database');
      if (step) step.run = `echo ${step.run}`;
    },
  ]) {
    assert.ok(errorsAfterStaging(mutate).some((error) => /staging database binding/.test(error)));
  }
});

test('the deployment guard rejects inconsistent aliases or a bypassable staging verdict', () => {
  for (const mutate of [
    (document) => {
      delete document.jobs.deploy.env.DATABASE_URL;
    },
    (document) => {
      document.jobs.deploy.env.AGI_DATABASE_URL = '${{ secrets.DATABASE_URL }}';
    },
    (document) => {
      const step = document.jobs.deploy.steps.find((entry) => entry.id === 'deploy');
      step.run = step.run.replace('--env DATABASE_URL', '');
    },
    (document) => {
      const step = document.jobs.deploy.steps.find(
        (entry) => entry.name === 'Publish the staging verdict for this commit',
      );
      delete step.env.RECORD_OUTCOME;
    },
    (document) => {
      const step = document.jobs.deploy.steps.find(
        (entry) => entry.name === 'Publish the staging verdict for this commit',
      );
      step.env.JOB_STATUS = 'success';
    },
  ]) {
    assert.ok(
      errorsAfterStaging(mutate).some((error) =>
        /staging database binding|staging verdict/.test(error),
      ),
    );
  }
});
