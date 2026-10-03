import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

import { stringify } from 'yaml';

import { WORKFLOW_DIR, isDeployJob } from './check-workflow-hardening.mjs';
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
const queueWorkflow = readWorkflow(REPO_ROOT, 'cleanup-production-queue.yml');

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
  for (const file of contract.releaseReadiness.workflows) {
    writeFileSync(path.join(root, WORKFLOW_DIR, file), stringify(readWorkflow(REPO_ROOT, file)));
  }
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
    apiArguments: existsSync(argumentsFile)
      ? readFileSync(argumentsFile, 'utf8').split('\0').slice(0, -1)
      : [],
  };
}

test('staging accepts both eligible triggers without a persistent URL and rejects untrusted runs', () => {
  const job = stagingWorkflow.jobs.deploy;
  const completedRun = {
    conclusion: 'success',
    event: 'push',
    head_branch: 'main',
    head_sha: 'a'.repeat(40),
    head_repository: { full_name: 'fixture/repository' },
  };
  for (const [eventName, run, expected] of [
    ['workflow_dispatch', {}, true],
    ['workflow_run', completedRun, true],
    ['workflow_run', { ...completedRun, conclusion: 'failure' }, false],
    ['workflow_run', { ...completedRun, conclusion: 'cancelled' }, false],
    ['workflow_run', { ...completedRun, event: 'pull_request' }, false],
    ['workflow_run', { ...completedRun, head_branch: 'feature' }, false],
    ['workflow_run', { ...completedRun, head_repository: { full_name: 'attacker/fork' } }, false],
  ]) {
    const context = {
      vars: {},
      github: {
        event_name: eventName,
        sha: 'b'.repeat(40),
        repository: 'fixture/repository',
        event: { workflow_run: run },
      },
    };
    assert.equal(runInNewContext(job.if, context, { timeout: 1000 }), expected);
  }
  assert.equal(job.environment.url, '${{ steps.deploy.outputs.url }}');
  assert.ok(!job.steps.some((step) => /vercel alias/.test(step.run ?? '')));
});

test('protected staging requires the bypass secret before migrations or deployment', () => {
  const step = stagingWorkflow.jobs.deploy.steps.find(
    (entry) => entry.name === 'Require the protected staging deployment contract',
  );
  const configured = {
    VERCEL_TOKEN: 'fixture-token',
    VERCEL_ORG_ID: 'fixture-org',
    VERCEL_PROJECT_ID: 'fixture-project',
    AGI_STAGING_DATABASE_URL: 'fixture-database',
    VERCEL_AUTOMATION_BYPASS_SECRET: 'fixture-bypass',
    STAGING_WEB_URL: 'https://old-staging.fixture.invalid',
  };
  for (const name of Object.keys(configured).filter((name) => name !== 'STAGING_WEB_URL')) {
    const result = runStagingStep(step, { ...configured, [name]: '' });
    assert.equal(result.status, 1, `${name} must be required`);
    assert.match(result.stdout, new RegExp(`${name} is required`));
  }
  assert.equal(runStagingStep(step, { ...configured, STAGING_WEB_URL: '' }).status, 0);
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

test('a staging verdict cannot pass when its API call fails', () => {
  const step = stagingWorkflow.jobs.deploy.steps.find(
    (entry) => entry.name === 'Publish the staging verdict for this commit',
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

function runStagingDeployment(preview, expected = stagingDatabase, environment = {}) {
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
      ...environment,
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
    'AGI_DATABASE_URL=[REDACTED]\n',
    'DATABASE_URL=[sensitive]\n',
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
    'AGI_DATABASE_URL=\n',
    'DATABASE_URL=\n',
    'AGI_DATABASE_URL=[SENSITIVE]\n',
    'DATABASE_URL=[SENSITIVE]\n',
    'AGI_DATABASE_URL=\nDATABASE_URL=[SENSITIVE]\n',
    `AGI_DATABASE_URL=\nDATABASE_URL=${stagingDatabase}\n`,
    `AGI_DATABASE_URL=${stagingDatabase}\nDATABASE_URL=\n`,
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

test('staging refuses absent or conflicting process database aliases before mutation', () => {
  for (const name of ['AGI_DATABASE_URL', 'DATABASE_URL']) {
    for (const value of [undefined, '', otherDatabase]) {
      const result = runStagingDeployment(`DATABASE_URL=${stagingDatabase}\n`, stagingDatabase, {
        [name]: value,
      });
      assert.notEqual(result.status, 0);
      assert.ok(result.calls.every((call) => call.args[1] === 'pull'));
      assert.ok(!`${result.stdout}${result.stderr}`.includes(stagingDatabase));
      assert.ok(!`${result.stdout}${result.stderr}`.includes(otherDatabase));
    }
  }
});

test('staging refuses an invalid protected database URL before mutation', () => {
  for (const expected of [
    'https://staging.example.invalid/staging',
    'postgresql://staging.example.invalid',
    `${stagingDatabase}\n`,
    ` ${stagingDatabase}`,
  ]) {
    const result = runStagingDeployment('DATABASE_URL=[SENSITIVE]\n', expected);
    assert.notEqual(result.status, 0);
    assert.ok(result.calls.every((call) => call.args[1] === 'pull'));
    assert.ok(!`${result.stdout}${result.stderr}`.includes(expected));
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

test('the deployment guard requires explicit protected aliases for build and deploy', () => {
  for (const id of ['build', 'deploy']) {
    for (const name of ['AGI_DATABASE_URL', 'DATABASE_URL']) {
      assert.ok(
        errorsAfterStaging((document) => {
          const step = document.jobs.deploy.steps.find((entry) => entry.id === id);
          if (step.env) delete step.env[name];
        }).some((error) => /staging database binding/.test(error)),
      );
    }
  }
});

test('candidate release workflows produce evidence for documentation-only main pushes', () => {
  for (const file of contract.releaseReadiness.workflows) {
    const push = readWorkflow(REPO_ROOT, file).on?.push;
    assert.ok(push?.branches?.includes('main'), `${file} must run on main`);
    for (const filter of ['paths', 'paths-ignore', 'branches-ignore']) {
      assert.equal(Object.hasOwn(push, filter), false, `${file} filters candidate evidence`);
    }
  }
});

test('the deployment guard rejects missing or filtered candidate release workflows', () => {
  for (const file of contract.releaseReadiness.workflows) {
    for (const mutate of [
      (document) => {
        delete document.on.push;
      },
      (document) => {
        document.on.push.paths = ['apps/**'];
      },
      (document) => {
        document.on.push['paths-ignore'] = ['docs/**'];
      },
      (document) => {
        document.on.push.branches = ['develop'];
      },
      (document) => {
        document.on.push.branches = ['main', '!main'];
      },
    ]) {
      const root = fixture(() => {});
      const document = readWorkflow(root, file);
      mutate(document);
      writeFileSync(path.join(root, WORKFLOW_DIR, file), stringify(document));
      assert.ok(checkDeployGates(root).errors.some((error) => error.startsWith(`${file}:`)));
    }
    const root = fixture(() => {});
    rmSync(path.join(root, WORKFLOW_DIR, file));
    assert.ok(checkDeployGates(root).errors.some((error) => error.startsWith(`${file}:`)));
  }
});

test('staging preview verification cannot substitute a persistent origin, candidate or bypass binding', () => {
  for (const mutate of [
    (step) => {
      step.env.DEPLOYMENT_URL = '${{ vars.STAGING_WEB_URL }}';
    },
    (step) => {
      step.env.HEAD_SHA = '${{ github.sha }}';
    },
    (step) => {
      delete step.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    },
    (step) => {
      step.run = 'node scripts/verify-deployment.mjs "$DEPLOYMENT_URL" "$HEAD_SHA"';
    },
  ]) {
    const root = fixture(() => {});
    const document = readWorkflow(root, 'deploy-staging.yml');
    mutate(document.jobs.deploy.steps.find((step) => step.id === 'verify'));
    writeFileSync(path.join(root, WORKFLOW_DIR, 'deploy-staging.yml'), stringify(document));
    assert.ok(
      checkDeployGates(root).errors.some((error) => /protected preview verifier/.test(error)),
    );
  }
});

const cleanupStep = queueWorkflow.jobs.cleanup.steps.find((step) =>
  step.uses?.startsWith('actions/github-script@'),
);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const executeCleanup = new AsyncFunction(
  'github',
  'context',
  'core',
  'require',
  'process',
  'setTimeout',
  cleanupStep.with.script,
);

function queueFixture() {
  const repository = 'fixture/repository';
  const head = 'a'.repeat(40);
  const old = 'b'.repeat(40);
  const identity = {
    repository: { full_name: repository },
    head_repository: { full_name: repository },
  };
  const source = {
    ...identity,
    id: 100,
    name: 'CI',
    path: '.github/workflows/ci.yml',
    head_sha: head,
    event: 'push',
    head_branch: 'main',
    status: 'completed',
    conclusion: 'success',
    run_attempt: 1,
    created_at: '2026-01-03T00:00:00Z',
  };
  const oldRun = (id, status, day) => ({
    ...clone(identity),
    id,
    workflow_id: 200,
    name: workflow.name,
    path: `.github/workflows/${contract.workflow}`,
    head_sha: old,
    event: 'workflow_run',
    head_branch: 'main',
    status,
    conclusion: null,
    run_attempt: 1,
    created_at: `2026-01-0${day}T00:00:00Z`,
  });
  const job = (id, name, status, steps = []) => ({
    id: id + 1000,
    run_id: 1,
    run_attempt: 1,
    name,
    status,
    steps,
    runner_id: 0,
    conclusion: status === 'completed' ? 'success' : null,
  });
  const state = {
    source,
    mainSha: head,
    runs: [oldRun(1, 'waiting', 1), oldRun(2, 'pending', 2)],
    jobs: {
      1: [
        job(1, workflow.jobs.scope.name, 'completed', [{ status: 'completed' }]),
        job(2, workflow.jobs['deploy-sandbox'].name, 'waiting'),
      ],
      2: [],
    },
    definition: stringify(workflow),
    cancelled: [],
    calls: [],
    logs: [],
    counts: {},
    listPages: {},
    jobPages: {},
    hooks: {},
    summary: '',
    summaryWritten: false,
  };
  const invoke = async (name, parameters, produce) => {
    assert.equal(
      parameters.request.timeout,
      contract.releaseReadiness.requestTimeoutSeconds * 1000,
    );
    assert.equal(parameters.owner, 'fixture');
    assert.equal(parameters.repo, 'repository');
    state.calls.push({ name, parameters: clone(parameters) });
    const key = `${name}:${parameters.run_id ?? parameters.status ?? ''}`;
    state.counts[key] = (state.counts[key] ?? 0) + 1;
    const override = state.hooks[name]?.(parameters, state.counts[key], state);
    if (override !== undefined) return override;
    return { data: clone(produce()), status: 200 };
  };
  const github = {
    rest: {
      git: {
        getRef: (parameters) =>
          invoke('getRef', parameters, () => ({
            ref: 'refs/heads/main',
            object: { type: 'commit', sha: state.mainSha },
          })),
      },
      repos: {
        compareCommitsWithBasehead: (parameters) =>
          invoke('compare', parameters, () => ({
            status: 'ahead',
            ahead_by: 1,
            behind_by: 0,
            base_commit: { sha: parameters.basehead.split('...')[0] },
            merge_base_commit: { sha: parameters.basehead.split('...')[0] },
          })),
        getContent: (parameters) =>
          invoke('getContent', parameters, () => ({
            type: 'file',
            path: parameters.path,
            encoding: 'base64',
            sha: 'e'.repeat(40),
            content: Buffer.from(state.definition).toString('base64'),
          })),
      },
      actions: {
        getWorkflowRun: (parameters) =>
          invoke('getRun', parameters, () =>
            parameters.run_id === source.id
              ? state.source
              : state.runs.find((run) => run.id === parameters.run_id),
          ),
        getWorkflow: (parameters) =>
          invoke('getWorkflow', parameters, () => ({
            id: 200,
            name: workflow.name,
            path: `.github/workflows/${contract.workflow}`,
          })),
        listWorkflowRuns: (parameters) =>
          invoke(
            'listRuns',
            parameters,
            () =>
              state.listPages[parameters.status]?.[parameters.page - 1] ?? {
                total_count: state.runs.filter((run) => run.status === parameters.status).length,
                workflow_runs: state.runs.filter((run) => run.status === parameters.status),
              },
          ),
        listJobsForWorkflowRun: (parameters) =>
          invoke(
            'listJobs',
            parameters,
            () =>
              state.jobPages[parameters.run_id]?.[parameters.page - 1] ?? {
                total_count: state.jobs[parameters.run_id].length,
                jobs: state.jobs[parameters.run_id],
              },
          ),
        cancelWorkflowRun: (parameters) =>
          invoke('cancel', parameters, () => {
            state.cancelled.push(parameters.run_id);
            const run = state.runs.find((entry) => entry.id === parameters.run_id);
            run.status = 'completed';
            run.conclusion = 'cancelled';
            return null;
          }).then((response) => ({
            ...response,
            status: response.status === 200 ? 202 : response.status,
          })),
      },
    },
  };
  const summary = {
    addHeading(value) {
      state.summary += value;
      return this;
    },
    addRaw(value) {
      state.summary += value;
      return this;
    },
    async write() {
      state.summaryWritten = true;
    },
  };
  const core = {
    summary,
    info: (value) => state.logs.push(value),
    notice: (value) => state.logs.push(value),
  };
  state.context = {
    repo: { owner: 'fixture', repo: 'repository' },
    eventName: 'workflow_run',
    sha: 'd'.repeat(40),
    payload: { workflow_run: clone(source) },
  };
  state.run = async () => {
    try {
      await executeCleanup(
        github,
        state.context,
        core,
        createRequire(import.meta.url),
        {
          env: { GITHUB_WORKSPACE: REPO_ROOT },
        },
        (callback) => callback(),
      );
      return { error: null, state };
    } catch (error) {
      return { error, state };
    }
  };
  return state;
}

async function rejectsCleanup(state, pattern) {
  const result = await state.run();
  assert.ok(result.error, 'unsafe or incomplete evidence must fail closed');
  if (pattern) assert.match(result.error.message, pattern);
  assert.deepEqual(state.cancelled, []);
}

test('production queue cleanup is isolated, least privileged, and checks out the verified CI source', () => {
  assert.doesNotMatch(cleanupStep.with.script, /\$\{\{/);
  assert.deepEqual(queueWorkflow.on.workflow_run, { workflows: ['CI'], types: ['completed'] });
  assert.deepEqual(queueWorkflow.permissions, { contents: 'read' });
  assert.deepEqual(queueWorkflow.jobs.cleanup.permissions, { contents: 'read', actions: 'write' });
  assert.ok(queueWorkflow.jobs.cleanup['timeout-minutes'] > 0);
  assert.equal(queueWorkflow.jobs.cleanup.environment, undefined);
  assert.equal(queueWorkflow.concurrency['cancel-in-progress'], false);
  const checkout = queueWorkflow.jobs.cleanup.steps.find((step) =>
    step.uses?.startsWith('actions/checkout@'),
  );
  assert.equal(checkout.with.ref, '${{ github.event.workflow_run.head_sha }}');
  assert.equal(checkout.with['persist-credentials'], false);
  const hardening = JSON.parse(
    readFileSync(path.join(REPO_ROOT, 'scripts/config/workflow-hardening.json')),
  );
  assert.equal(
    hardening.allowedWriteScopes.filter(
      (entry) => entry.id === 'cleanup-production-queue.yml:cleanup:actions',
    ).length,
    1,
  );
  assert.match(cleanupStep.uses, /@[0-9a-f]{40}$/);
});

test('cleanup cancels empty pending runs before waiting reviews and records asynchronous acceptance', async () => {
  const state = queueFixture();
  const { error } = await state.run();
  assert.equal(error, null);
  assert.deepEqual(state.cancelled, [2, 1]);
  assert.ok(state.summaryWritten);
  assert.match(state.summary, /Acceptance is asynchronous/);
  assert.ok(
    state.calls
      .filter((call) => call.name === 'compare')
      .every((call) => call.parameters.basehead.endsWith(state.source.head_sha)),
  );
  assert.ok(
    state.calls
      .filter((call) => call.name === 'listJobs')
      .every((call) => call.parameters.filter === 'latest'),
  );
  assert.ok(
    state.calls
      .filter((call) => call.name === 'cancel')
      .every((call, index) => state.calls[state.calls.indexOf(call) - 1].name === 'getRef'),
  );
});

test('cleanup rejects untrusted or unsuccessful source events and fresh source drift', async () => {
  for (const mutate of [
    (s) => {
      s.context.eventName = 'push';
    },
    (s) => {
      s.context.payload.workflow_run.event = 'pull_request';
    },
    (s) => {
      s.context.payload.workflow_run.head_branch = 'feature';
    },
    (s) => {
      s.context.payload.workflow_run.conclusion = 'failure';
    },
    (s) => {
      s.context.payload.workflow_run.head_repository.full_name = 'foreign/repository';
    },
    (s) => {
      s.context.payload.workflow_run.head_sha = 'short';
    },
    (s) => {
      s.source.status = 'in_progress';
      s.source.conclusion = null;
    },
    (s) => {
      s.source.run_attempt = 2;
    },
    (s) => {
      s.source.path = '.github/workflows/other.yml';
    },
  ]) {
    const state = queueFixture();
    mutate(state);
    await rejectsCleanup(state, /successful|trusted|Source CI/);
  }
});

test('cleanup preserves the queue when current main differs from verified CI', async () => {
  const state = queueFixture();
  state.mainSha = 'c'.repeat(40);
  assert.equal((await state.run()).error, null);
  assert.deepEqual(state.cancelled, []);
});

test('cleanup preserves current, newer, non-main, manual, scheduled, foreign and rerun candidates', async () => {
  for (const mutate of [
    (r, s) => {
      r.head_sha = s.source.head_sha;
    },
    (r) => {
      r.created_at = '2026-01-04T00:00:00Z';
    },
    (r) => {
      r.head_branch = 'feature';
    },
    (r) => {
      r.event = 'workflow_dispatch';
    },
    (r) => {
      r.event = 'schedule';
    },
    (r) => {
      r.repository.full_name = 'foreign/repository';
    },
    (r) => {
      r.head_repository.full_name = 'foreign/repository';
    },
    (r) => {
      r.run_attempt = 2;
    },
    (r) => {
      r.path = '.github/workflows/other.yml';
    },
    (r) => {
      r.workflow_id = 201;
    },
    (r) => {
      r.head_sha = 'short';
    },
  ]) {
    const state = queueFixture();
    state.runs = [state.runs[0]];
    mutate(state.runs[0], state);
    assert.equal((await state.run()).error, null);
    assert.deepEqual(state.cancelled, []);
  }
});

test('cleanup requires strict verified ancestry rather than an older timestamp alone', async () => {
  for (const comparison of [
    { status: 'behind', ahead_by: 0 },
    { status: 'diverged', ahead_by: 1 },
    { status: 'ahead', ahead_by: 0 },
    { status: 'ahead' },
    { status: 'ahead', ahead_by: 1, merge_base_commit: { sha: 'c'.repeat(40) } },
  ]) {
    const state = queueFixture();
    state.hooks.compare = (parameters) => ({
      data: {
        behind_by: 0,
        base_commit: { sha: parameters.basehead.split('...')[0] },
        merge_base_commit: { sha: parameters.basehead.split('...')[0] },
        ...comparison,
      },
    });
    assert.equal((await state.run()).error, null);
    assert.deepEqual(state.cancelled, []);
  }
});

test('cleanup preserves active jobs and every started production surface', async () => {
  for (const mutate of [
    (s) => {
      s.jobs[1][0].status = 'in_progress';
    },
    (s) => {
      s.jobs[1][0].status = 'queued';
    },
    (s) => {
      s.jobs[1][1].steps = [{ status: 'completed' }];
    },
    (s) => {
      s.jobs[1][1].runner_id = 123;
    },
    (s) => {
      delete s.jobs[1][1].runner_id;
    },
    (s) => {
      s.jobs[1][1].runner_id = 'not-a-runner';
    },
    (s) => {
      s.jobs[1][1].status = 'completed';
      s.jobs[1][1].conclusion = 'success';
    },
    (s) => {
      s.jobs[1][1].status = 'completed';
      s.jobs[1][1].conclusion = 'failure';
    },
    (s) => {
      s.jobs[1].push({
        ...s.jobs[1][1],
        id: 1010,
        name: workflow.jobs['deploy-web'].name,
        steps: [{ status: 'in_progress' }],
      });
    },
  ]) {
    const state = queueFixture();
    state.runs = [state.runs[0]];
    mutate(state);
    assert.equal((await state.run()).error, null);
    assert.deepEqual(state.cancelled, []);
  }
});

test('cleanup derives even renamed or newly added surface names from the immutable run definition', async () => {
  for (const modify of [
    (d) => {
      d.jobs['deploy-sandbox'].name = 'Renamed artifact surface';
    },
    (d) => {
      d.jobs.extra = {
        name: 'Additional production surface',
        steps: [{ run: 'vercel deploy --prod' }],
      };
    },
  ]) {
    const state = queueFixture();
    state.runs = [state.runs[0]];
    const definition = clone(workflow);
    modify(definition);
    state.definition = stringify(definition);
    const name = definition.jobs.extra?.name ?? definition.jobs['deploy-sandbox'].name;
    if (!definition.jobs.extra) state.jobs[1][1].name = name;
    state.jobs[1].push({ ...state.jobs[1][1], id: 1020, name, steps: [{ status: 'completed' }] });
    assert.equal((await state.run()).error, null);
    assert.deepEqual(state.cancelled, []);
  }
  assert.equal(Object.values(workflow.jobs).filter(isDeployJob).length, 2);
});

test('cleanup refuses pending runs with jobs and waiting runs without a blocked review', async () => {
  const pending = queueFixture();
  pending.runs = [pending.runs[1]];
  pending.jobs[2] = [{ ...pending.jobs[1][0], run_id: 2 }];
  assert.match((await pending.run()).error.message, /pending run is not confirmed quiet/);
  assert.deepEqual(pending.cancelled, []);
  const waiting = queueFixture();
  waiting.runs = [waiting.runs[0]];
  waiting.jobs[1] = [waiting.jobs[1][0]];
  assert.equal((await waiting.run()).error, null);
  assert.deepEqual(waiting.cancelled, []);
});

test('cleanup refuses incomplete, duplicate or changing run pagination before any cancellation', async () => {
  for (const mode of ['incomplete', 'duplicate', 'changing']) {
    const state = queueFixture();
    state.listPages.pending = [
      { total_count: 2, workflow_runs: [state.runs[1]] },
      mode === 'duplicate'
        ? { total_count: 2, workflow_runs: [state.runs[1]] }
        : { total_count: mode === 'changing' ? 1 : 2, workflow_runs: [] },
    ];
    await rejectsCleanup(state, /pagination|listing|duplicate/);
  }
});

test('cleanup refuses incomplete or prior-attempt job evidence', async () => {
  for (const mutate of [
    (s) => {
      delete s.jobs[1][1].steps;
    },
    (s) => {
      s.jobs[1][1].run_attempt = 2;
    },
    (s) => {
      s.jobs[1][1].run_id = 5;
    },
    (s) => {
      s.jobPages[1] = [
        { total_count: 3, jobs: s.jobs[1] },
        { total_count: 3, jobs: [] },
      ];
    },
  ]) {
    const state = queueFixture();
    state.runs = [state.runs[0]];
    mutate(state);
    await rejectsCleanup(state, /Incomplete/);
  }
});

test('cleanup inspects every job page and preserves a surface started on a later page', async () => {
  const state = queueFixture();
  state.runs = [state.runs[0]];
  state.jobPages[1] = [
    { total_count: 2, jobs: [state.jobs[1][0]] },
    { total_count: 2, jobs: [{ ...state.jobs[1][1], steps: [{ status: 'in_progress' }] }] },
  ];
  assert.equal((await state.run()).error, null);
  assert.deepEqual(state.cancelled, []);
  assert.ok(state.calls.some((call) => call.name === 'listJobs' && call.parameters.page === 2));
});

test('cleanup preserves candidates whose status, attempt or identity changes before cancellation', async () => {
  for (const mutate of [
    (r) => {
      r.status = 'in_progress';
    },
    (r) => {
      r.status = 'waiting';
    },
    (r) => {
      r.status = 'completed';
      r.conclusion = 'success';
    },
    (r) => {
      r.run_attempt = 2;
    },
    (r) => {
      r.head_sha = 'c'.repeat(40);
    },
  ]) {
    const state = queueFixture();
    state.runs = [state.runs[1]];
    state.hooks.getRun = (parameters, count) => {
      if (parameters.run_id === 2 && count === 2) mutate(state.runs[0]);
    };
    const result = await state.run();
    if (state.runs[0].status === 'completed') assert.equal(result.error, null);
    else assert.match(result.error.message, /pending run changed/);
    assert.deepEqual(state.cancelled, []);
  }
});

test('cleanup rechecks job evidence and main at the final opportunity', async () => {
  const active = queueFixture();
  active.runs = [active.runs[1]];
  active.hooks.listJobs = (parameters, count) => {
    if (parameters.run_id === 2 && count === 2)
      active.jobs[2] = [{ ...active.jobs[1][1], run_id: 2, status: 'in_progress' }];
  };
  assert.match((await active.run()).error.message, /pending run changed/);
  assert.deepEqual(active.cancelled, []);
  const advanced = queueFixture();
  advanced.runs = [advanced.runs[1]];
  advanced.hooks.getRef = (parameters, count) => {
    if (count === 3) advanced.mainSha = 'c'.repeat(40);
  };
  assert.equal((await advanced.run()).error, null);
  assert.deepEqual(advanced.cancelled, []);
});

test('cleanup fails closed on missing workflow definitions, authorization or transport errors', async () => {
  for (const method of ['getRef', 'getWorkflow', 'listRuns', 'compare', 'getContent', 'listJobs']) {
    const state = queueFixture();
    state.hooks[method] = () => {
      throw new Error(`${method} unavailable`);
    };
    await rejectsCleanup(state, /unavailable/);
  }
  const invalid = queueFixture();
  invalid.hooks.getContent = () => ({ data: { type: 'dir' } });
  await rejectsCleanup(invalid, /Missing immutable/);
});

test('cleanup treats cancellation conflicts as terminal only after rereading the same target', async () => {
  const completed = queueFixture();
  completed.runs = [completed.runs[1]];
  completed.hooks.cancel = (parameters) => {
    completed.runs[0].status = 'completed';
    completed.runs[0].conclusion = 'success';
    throw Object.assign(new Error('Conflict'), { status: 409 });
  };
  assert.equal((await completed.run()).error, null);
  assert.deepEqual(completed.cancelled, []);
  assert.match(completed.logs.join('\n'), /completed before cancellation/);
  const waiting = queueFixture();
  waiting.hooks.cancel = () => {
    throw Object.assign(new Error('Conflict'), { status: 409 });
  };
  await rejectsCleanup(waiting, /Conflict/);
});

test('cleanup does not free a waiting blocker while a pending cancellation is asynchronous', async () => {
  const state = queueFixture();
  state.hooks.cancel = (parameters) => {
    state.cancelled.push(parameters.run_id);
    return { status: 202, data: null };
  };
  const { error } = await state.run();
  assert.match(error.message, /Pending cancellation did not finish/);
  assert.deepEqual(state.cancelled, [2]);
  assert.equal(state.runs.find((run) => run.id === 1).status, 'waiting');
  assert.equal(
    state.calls.filter((call) => call.name === 'getRun' && call.parameters.run_id === 2).length,
    contract.releaseReadiness.maxPages + 2,
  );
});

test('cleanup confirms delayed pending cancellation before inspecting a waiting blocker', async () => {
  const state = queueFixture();
  state.hooks.cancel = (parameters) => {
    if (parameters.run_id === 2) {
      state.cancelled.push(2);
      return { status: 202, data: null };
    }
  };
  state.hooks.getRun = (parameters, count) => {
    if (parameters.run_id === 2 && count === 5) {
      state.runs[1].status = 'completed';
      state.runs[1].conclusion = 'cancelled';
    }
  };
  assert.equal((await state.run()).error, null);
  assert.deepEqual(state.cancelled, [2, 1]);
  assert.match(state.logs.join('\n'), /Confirmed pending run 2 cancelled/);
});

test('cleanup stops before waiting blockers when an accepted pending cancellation starts or changes identity', async () => {
  for (const mutate of [
    (r) => {
      r.status = 'in_progress';
    },
    (r) => {
      r.status = 'waiting';
    },
    (r) => {
      r.status = 'completed';
      r.conclusion = 'success';
    },
    (r) => {
      r.run_attempt = 2;
    },
    (r) => {
      r.head_sha = 'c'.repeat(40);
    },
  ]) {
    const state = queueFixture();
    state.hooks.cancel = (parameters) => {
      state.cancelled.push(parameters.run_id);
      mutate(state.runs.find((run) => run.id === parameters.run_id));
      return { status: 202, data: null };
    };
    assert.ok((await state.run()).error);
    assert.deepEqual(state.cancelled, [2]);
  }
});

test('cleanup rereads all surface jobs even when run status remains waiting', async () => {
  const state = queueFixture();
  state.runs = [state.runs[0]];
  state.hooks.listJobs = (parameters, count) => {
    if (count === 2)
      state.jobs[1].push({
        ...state.jobs[1][1],
        id: 1030,
        name: workflow.jobs['deploy-web'].name,
        status: 'in_progress',
        steps: [{ status: 'in_progress' }],
      });
  };
  assert.equal((await state.run()).error, null);
  assert.equal(state.runs[0].status, 'waiting');
  assert.deepEqual(state.cancelled, []);
});

test('cleanup refuses unknown or ambiguous surface job evidence', async () => {
  const unknown = queueFixture();
  unknown.runs = [unknown.runs[0]];
  unknown.jobs[1].push({
    ...unknown.jobs[1][0],
    id: 1040,
    name: 'Unmodelled surface',
    steps: [{ status: 'completed' }],
  });
  await rejectsCleanup(unknown, /Unknown production job/);
  const ambiguous = queueFixture();
  const definition = clone(workflow);
  definition.jobs['deploy-web'].name = '${{ matrix.surface }}';
  ambiguous.definition = stringify(definition);
  await rejectsCleanup(ambiguous, /Ambiguous production job/);
});

test('cleanup fails closed if bounded pagination or a second status listing cannot complete', async () => {
  const bound = queueFixture();
  bound.listPages.pending = Array.from(
    { length: contract.releaseReadiness.maxPages },
    (_, index) => ({
      total_count: contract.releaseReadiness.maxPages + 1,
      workflow_runs: [{ ...bound.runs[1], id: index + 2000 }],
    }),
  );
  await rejectsCleanup(bound, /canonical bound/);
  const denied = queueFixture();
  denied.hooks.listRuns = (parameters) => {
    if (parameters.status === 'waiting')
      throw Object.assign(new Error('Forbidden'), { status: 403 });
  };
  await rejectsCleanup(denied, /Forbidden/);
});

test('cleanup accepts the raw null runner evidence of an unstarted protected review', async () => {
  const state = queueFixture();
  state.runs = [state.runs[0]];
  state.jobs[1][1].runner_id = null;
  assert.equal((await state.run()).error, null);
  assert.deepEqual(state.cancelled, [1]);
});

test('cleanup does not accept a conflict response from another attempt or branch snapshot', async () => {
  for (const mutate of [
    (r) => {
      r.run_attempt = 2;
    },
    (r) => {
      r.head_sha = 'c'.repeat(40);
    },
    (r) => {
      r.path = '.github/workflows/other.yml';
    },
    (r) => {
      r.repository.full_name = 'foreign/repository';
    },
  ]) {
    const state = queueFixture();
    state.runs = [state.runs[1]];
    state.hooks.cancel = () => {
      state.runs[0].status = 'completed';
      state.runs[0].conclusion = 'cancelled';
      mutate(state.runs[0]);
      throw Object.assign(new Error('Conflict'), { status: 409 });
    };
    await rejectsCleanup(state, /Conflict/);
  }
});

test('cleanup trigger refuses failed, pull-request, non-main and foreign CI before any privileged step', () => {
  const state = queueFixture();
  const matches = (source) =>
    runInNewContext(queueWorkflow.jobs.cleanup.if, {
      github: { event: { workflow_run: source }, repository: 'fixture/repository' },
    });
  assert.equal(matches(state.source), true);
  for (const change of [
    { conclusion: 'failure' },
    { event: 'pull_request' },
    { head_branch: 'feature' },
    { head_repository: { full_name: 'foreign/repository' } },
  ])
    assert.equal(matches({ ...state.source, ...change }), false);
  assert.deepEqual(Object.keys(queueWorkflow.on), ['workflow_run']);
});

test('cleanup advances past unchanged pending runs GitHub auto-cancels during fresh or immediate reads', async () => {
  for (const read of [1, 2]) {
    const state = queueFixture();
    state.hooks.getRun = (parameters, count) => {
      if (parameters.run_id === 2 && count === read) {
        state.runs[1].status = 'completed';
        state.runs[1].conclusion = 'cancelled';
      }
    };
    assert.equal((await state.run()).error, null);
    assert.deepEqual(state.cancelled, [1]);
    assert.ok(state.logs.some((line) => /run 2 .*completed/.test(line)));
  }
});

test('cleanup refuses auto-completed candidates with changed immutable identity', async () => {
  for (const read of [1, 2]) {
    for (const mutate of [
      (r) => {
        r.head_sha = 'c'.repeat(40);
      },
      (r) => {
        r.run_attempt = 2;
      },
      (r) => {
        r.path = '.github/workflows/other.yml';
      },
      (r) => {
        r.workflow_id = 201;
      },
      (r) => {
        r.repository.full_name = 'foreign/repository';
      },
      (r) => {
        r.head_repository.full_name = 'foreign/repository';
      },
    ]) {
      const state = queueFixture();
      state.hooks.getRun = (parameters, count) => {
        if (parameters.run_id === 2 && count === read) {
          const run = state.runs[1];
          run.status = 'completed';
          run.conclusion = 'cancelled';
          mutate(run);
        }
      };
      await rejectsCleanup(state, /pending run/);
    }
  }
});
