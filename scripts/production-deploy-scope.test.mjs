import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  RELEASE_READINESS,
  SURFACE_DEPLOY_JOBS,
  SURFACE_DEPLOY_WORKFLOWS,
  githubPages,
  publishRelayVerdict,
  requireReleaseReady,
  requireZeroOpenAlerts,
  SYNC_PARITY_SOURCES,
  classifyDeployScope,
  formatGithubOutputs,
  isEligibleProductionRun,
  selectSurfaceBaseline,
} from './production-deploy-scope.mjs';

test('web-only changes do not spend unrelated expensive runners', () => {
  assert.deepEqual(classifyDeployScope(['apps/web/app/page.tsx']), {
    web: true,
    signaling: false,
    sandbox: false,
    desktop: false,
    native: false,
    extension: false,
    vscode: false,
    mobile: false,
  });
});

test('service and native paths select only their owning expensive lanes', () => {
  assert.deepEqual(classifyDeployScope(['services/signaling-server/src/index.ts']), {
    web: false,
    signaling: true,
    sandbox: false,
    desktop: false,
    native: false,
    extension: false,
    vscode: false,
    mobile: false,
  });
  assert.deepEqual(classifyDeployScope(['apps/desktop/src-tauri/src/lib.rs']), {
    web: false,
    signaling: false,
    sandbox: false,
    desktop: true,
    native: true,
    extension: false,
    vscode: false,
    mobile: false,
  });
});

test('the image-build contract selects only the containerized signaling lane', () => {
  assert.deepEqual(classifyDeployScope(['.dockerignore']), {
    web: false,
    signaling: true,
    sandbox: false,
    desktop: false,
    native: false,
    extension: false,
    vscode: false,
    mobile: false,
  });
});

test('the artifact sandbox origin is its own deployable surface', () => {
  const untouched = {
    web: false,
    signaling: false,
    desktop: false,
    native: false,
    extension: false,
    vscode: false,
    mobile: false,
  };

  // The CSP in this vercel.json IS the isolation boundary for every
  // model-generated artifact, so a change to it has to reach production through
  // the pipeline rather than from whoever last ran the CLI on a laptop.
  for (const file of [
    'infrastructure/sandbox/vercel.json',
    'infrastructure/sandbox/index.html',
    'infrastructure/sandbox/package.json',
  ]) {
    assert.deepEqual(classifyDeployScope([file]), { ...untouched, sandbox: true }, file);
  }

  // And it does not ride along with unrelated surfaces.
  for (const file of [
    'apps/web/app/page.tsx',
    'services/signaling-server/src/index.ts',
    'apps/mobile/app/index.tsx',
    'docs/development/ci-and-deploys.md',
  ]) {
    assert.equal(classifyDeployScope([file]).sandbox, false, file);
  }
});

test('the sandbox origin has a CI deploy path gated on the CI-verified commit', () => {
  const workflow = fs.readFileSync('.github/workflows/deploy-production.yml', 'utf8');

  // The scope key has to be published as a job output and consumed by the job,
  // or the deploy silently never fires.
  assert.match(workflow, /sandbox: \$\{\{ steps\.sandbox\.outputs\.sandbox \}\}/);
  assert.match(workflow, /node scripts\/production-deploy-scope\.mjs --shipped sandbox/);
  assert.match(workflow, /if: needs\.scope\.outputs\.sandbox == 'true'/);
  assert.match(workflow, /needs: scope/);

  // Deploying from anywhere inside the checkout attaches git metadata, which
  // lands the deployment in state BLOCKED. The job must stage the tree out of
  // the worktree and prove it did.
  assert.match(workflow, /cp -R infrastructure\/sandbox\/\. "\$staging\/"/);
  assert.match(workflow, /git -C "\$staging" rev-parse --git-dir/);

  // Same pinned CLI as the web promotion; an unpinned global dies at packaging.
  assert.match(workflow, /npm install --global vercel@58\.4\.0/);

  // The deploy target is read from a TRACKED file in the repo, never inherited
  // from the web environment's VERCEL_PROJECT_ID, a sandbox deploy carrying
  // that one publishes these files into the web project.
  const link = JSON.parse(fs.readFileSync('infrastructure/sandbox/deploy-target.json', 'utf8'));
  assert.equal(link.projectName, 'agiworkforce-sandbox');
  assert.match(link.projectId, /^prj_/);
  assert.match(link.orgId, /^team_/);
  assert.match(workflow, /infrastructure\/sandbox\/deploy-target\.json/);
  assert.match(workflow, /link\.projectName !== 'agiworkforce-sandbox'/);

  // outputDirectory is "." for this project, so the staged tree is what the
  // public origin serves. The deploy target is build input, not an asset.
  assert.match(workflow, /rm -f "\$staging\/deploy-target\.json"/);
});

test('no CI-executed path reads the git-ignored Vercel link directory', () => {
  // .gitignore matches `.vercel`, so that directory exists only in the working
  // tree of whoever last ran `vercel link`. A fresh CI checkout ENOENTs on it.
  // and because this very file is the `scope` job's self-test, and deploy-web
  // declares `needs: scope`, such a read takes the WEB promotion down with it.
  // Split so this assertion cannot match itself.
  const ignoredLinkDir = `.${'vercel'}/`;

  for (const path of [
    '.github/workflows/deploy-production.yml',
    'scripts/production-deploy-scope.mjs',
    'scripts/production-deploy-scope.test.mjs',
  ]) {
    assert.equal(fs.readFileSync(path, 'utf8').includes(ignoredLinkDir), false, path);
  }
});

test('every surface baseline names a deploy job that actually exists', () => {
  // selectSurfaceBaseline matches on the job's display name, so a renamed job
  // reads as "never shipped". That fails open to deploying, but it also means
  // the surface is never again measured from what it shipped.
  for (const [surface, jobName] of Object.entries(SURFACE_DEPLOY_JOBS)) {
    const workflow = fs.readFileSync(
      `.github/workflows/${SURFACE_DEPLOY_WORKFLOWS[surface]}`,
      'utf8',
    );
    const jobNames = new Set(
      [...workflow.matchAll(/^ {4}name: (.+)$/gm)].map((match) => match[1].trim()),
    );
    assert.equal(jobNames.has(jobName), true, `${surface} -> ${jobName}`);
  }
});

test('shared JavaScript build inputs do not rebuild native binaries', () => {
  const scope = classifyDeployScope(['pnpm-lock.yaml']);
  assert.deepEqual(scope, {
    web: true,
    signaling: true,
    sandbox: true,
    desktop: true,
    native: false,
    extension: true,
    vscode: true,
    mobile: true,
  });
  assert.match(formatGithubOutputs(scope), /^web=true$/m);
  assert.match(formatGithubOutputs(scope), /^native=false$/m);
});

test('Rust builds run only for native inputs and cross-language sync parity', () => {
  for (const file of [
    'Cargo.lock',
    'Cargo.toml',
    'deny.toml',
    'rust-toolchain.toml',
    'apps/cli/src/main.rs',
    'apps/desktop/src-tauri/src/lib.rs',
    'crates/agiworkforce-protocol/src/lib.rs',
    'packages/client/sync/src/cursor.ts',
  ]) {
    assert.equal(classifyDeployScope([file]).native, true, file);
  }

  for (const file of [
    '.github/workflows/ci.yml',
    'package.json',
    'pnpm-lock.yaml',
    'packages/ai/model-registry/catalog/models.curation.json',
    'packages/ai/routing/src/index.ts',
  ]) {
    assert.equal(classifyDeployScope([file]).native, false, file);
  }
});

test('documentation-only changes do not allocate deploy or native work', () => {
  assert.deepEqual(classifyDeployScope(['docs/development/ci-and-deploys.md']), {
    web: false,
    signaling: false,
    sandbox: false,
    desktop: false,
    native: false,
    extension: false,
    vscode: false,
    mobile: false,
  });
});

test('product-shell paths select their real E2E lane', () => {
  const expectedBase = {
    web: false,
    signaling: false,
    sandbox: false,
    desktop: false,
    native: false,
    extension: false,
    vscode: false,
    mobile: false,
  };

  assert.deepEqual(classifyDeployScope(['apps/extension/src/background.ts']), {
    ...expectedBase,
    extension: true,
  });
  assert.deepEqual(classifyDeployScope(['apps/extension-vscode/src/extension.ts']), {
    ...expectedBase,
    vscode: true,
  });
  assert.deepEqual(classifyDeployScope(['apps/cli/src/app_server/developer_host.rs']), {
    ...expectedBase,
    native: true,
    vscode: true,
  });
  assert.deepEqual(classifyDeployScope(['crates/agiworkforce-protocol/src/developer_session.rs']), {
    ...expectedBase,
    native: true,
    vscode: true,
  });
  assert.deepEqual(classifyDeployScope(['Cargo.lock']), {
    ...expectedBase,
    native: true,
    vscode: true,
  });
  assert.deepEqual(classifyDeployScope(['apps/mobile/app/index.tsx']), {
    ...expectedBase,
    mobile: true,
  });
});

test('the production workflows fail closed unless the upstream CI run succeeded', () => {
  const webWorkflow = fs.readFileSync('.github/workflows/deploy-production.yml', 'utf8');
  const signalingWorkflow = fs.readFileSync(
    '.github/workflows/deploy-signaling-server.yml',
    'utf8',
  );
  const stagingWorkflow = fs.readFileSync('.github/workflows/deploy-staging.yml', 'utf8');

  for (const workflow of [webWorkflow, signalingWorkflow, stagingWorkflow]) {
    assert.match(workflow, /workflow_run:/);
    assert.match(workflow, /github\.event\.workflow_run\.conclusion == 'success'/);
    assert.match(workflow, /github\.event\.workflow_run\.event == 'push'/);
    assert.match(workflow, /github\.event\.workflow_run\.head_branch == 'main'/);
    assert.match(workflow, /head_repository\.full_name == github\.repository/);
  }
});

test('a red or foreign CI completion is ineligible for production', () => {
  const successfulRun = {
    conclusion: 'success',
    event: 'push',
    head_branch: 'main',
    head_repository: { full_name: 'owner/repository' },
  };

  assert.equal(isEligibleProductionRun(successfulRun, 'owner/repository'), true);
  assert.equal(
    isEligibleProductionRun({ ...successfulRun, conclusion: 'failure' }, 'owner/repository'),
    false,
  );
  assert.equal(
    isEligibleProductionRun({ ...successfulRun, conclusion: 'cancelled' }, 'owner/repository'),
    false,
  );
  assert.equal(isEligibleProductionRun(successfulRun, 'attacker/fork'), false);
});

test('the baseline is the commit a surface last SHIPPED from, not the last green run', () => {
  const WEB = 'Deploy verified web artifact';
  const base = {
    conclusion: 'success',
    event: 'push',
    head_branch: 'main',
    head_repository: { full_name: 'owner/repository' },
  };

  const runs = [
    { ...base, head_sha: 'newest', jobs: [{ name: WEB, conclusion: 'skipped' }] },
    { ...base, head_sha: 'shipped', jobs: [{ name: WEB, conclusion: 'success' }] },
    { ...base, head_sha: 'older', jobs: [{ name: WEB, conclusion: 'success' }] },
  ];

  assert.equal(selectSurfaceBaseline(runs, 'owner/repository', WEB), 'shipped');
});

test('a failed deploy job is not a baseline, and neither is a foreign run', () => {
  const WEB = 'Deploy verified web artifact';
  const base = {
    conclusion: 'success',
    event: 'push',
    head_branch: 'main',
    head_repository: { full_name: 'owner/repository' },
  };

  assert.equal(
    selectSurfaceBaseline(
      [{ ...base, head_sha: 'failed', jobs: [{ name: WEB, conclusion: 'failure' }] }],
      'owner/repository',
      WEB,
    ),
    null,
  );

  assert.equal(
    selectSurfaceBaseline(
      [
        {
          ...base,
          head_sha: 'fork',
          head_repository: { full_name: 'attacker/fork' },
          jobs: [{ name: WEB, conclusion: 'success' }],
        },
      ],
      'owner/repository',
      WEB,
    ),
    null,
  );
});

test('surfaces are tracked independently', () => {
  const WEB = 'Deploy verified web artifact';
  const OTHER = 'Deploy signaling server';
  const base = {
    conclusion: 'success',
    event: 'push',
    head_branch: 'main',
    head_repository: { full_name: 'owner/repository' },
  };

  const runs = [
    { ...base, head_sha: 'web-only', jobs: [{ name: WEB, conclusion: 'success' }] },
    { ...base, head_sha: 'other-only', jobs: [{ name: OTHER, conclusion: 'success' }] },
  ];

  assert.equal(selectSurfaceBaseline(runs, 'owner/repository', WEB), 'web-only');
  assert.equal(selectSurfaceBaseline(runs, 'owner/repository', OTHER), 'other-only');
});

test('never deployed reads as null, which the caller must treat as deploy-everything', () => {
  const WEB = 'Deploy verified web artifact';
  assert.equal(selectSurfaceBaseline([], 'owner/repository', WEB), null);
  assert.equal(selectSurfaceBaseline(undefined, 'owner/repository', WEB), null);
});

test('Vercel Git integration cannot race the CI-owned main promotion', () => {
  const config = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  const gitDeploymentsOff =
    config.git.deploymentEnabled === false || config.git.deploymentEnabled.main === false;
  assert.equal(gitDeploymentsOff, true);

  const workflow = fs.readFileSync('.github/workflows/deploy-production.yml', 'utf8');
  assert.match(workflow, /vercel deploy --prebuilt --prod/);
});

test('the web promotion verifies the schema ledger before it deploys', () => {
  const workflow = fs.readFileSync('.github/workflows/deploy-production.yml', 'utf8');
  assert.match(workflow, /pnpm db:migrate -- verify/);
  assert.doesNotMatch(workflow, /api-gateway/);
});

test('editing either half of the sync parity pair selects the lane that runs both', () => {
  for (const file of [
    'packages/client/sync/src/__fixtures__/pull-apply.json',
    'packages/client/sync/src/__fixtures__/cursor-compare.json',
    'packages/client/sync/src/__fixtures__/push-body.json',
    'packages/client/sync/src/cursor.ts',
    'packages/client/sync/src/messages.ts',
    'apps/desktop/src-tauri/src/data/cloud_sync.rs',
  ]) {
    assert.equal(classifyDeployScope([file]).native, true, file);
  }

  assert.equal(classifyDeployScope(['packages/platform/utils/src/logger.ts']).native, false);
});

test('the sync parity sources named by the classifier still exist', () => {
  for (const source of SYNC_PARITY_SOURCES) {
    assert.equal(fs.existsSync(source), true, source);
  }
});

test('CI runs the TS suite and the Rust fixture replay in the same job', () => {
  const workflow = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
  const stepAt = workflow.indexOf('Cross-language sync parity');
  assert.notEqual(stepAt, -1);

  const headers = [...workflow.matchAll(/^ {2}[a-z0-9-]+:$/gm)];
  const owner = headers.filter((header) => header.index < stepAt).at(-1);
  const next = headers.find((header) => header.index > stepAt);
  const job = workflow.slice(owner.index, next ? next.index : workflow.length);

  assert.match(job, /if: needs\.scope\.outputs\.native_changed == 'true'/);
  assert.match(job, /run: pnpm install --frozen-lockfile/);
  assert.match(job, /pnpm --filter @agiworkforce\/sync test/);
  assert.match(
    job,
    /cargo test --locked -p agiworkforce-desktop --lib data::cloud_sync::fixture_tests/,
  );
  assert.match(job, /grep -c ': test\$'/);
  assert.match(job, /if \[ "\$matched" -eq 0 \]; then/);

  const syncManifest = JSON.parse(fs.readFileSync('packages/client/sync/package.json', 'utf8'));
  assert.equal(syncManifest.name, '@agiworkforce/sync');
  assert.equal(typeof syncManifest.scripts.test, 'string');

  const rust = fs.readFileSync('apps/desktop/src-tauri/src/data/cloud_sync.rs', 'utf8');
  assert.match(rust, /^mod fixture_tests \{$/m);
  assert.match(rust, /packages\/client\/sync\/src\/__fixtures__\/pull-apply\.json/);
  assert.match(rust, /packages\/client\/sync\/src\/__fixtures__\/cursor-compare\.json/);
});

const candidateSha = 'a'.repeat(40);
const releaseEnvironment = {
  GITHUB_REPOSITORY: 'fixture/repository',
  GITHUB_TOKEN: 'fixture',
  GITHUB_SHA: candidateSha,
  GITHUB_RUN_ID: '42',
  GITHUB_SERVER_URL: 'https://github.com',
  SIGNALING_DEPLOY_URL: 'https://relay.fixture.invalid',
};

function releaseApi(replace = () => undefined) {
  const calls = [];
  const fetchImpl = async (rawUrl, request) => {
    const url = new URL(rawUrl);
    calls.push({ url, request });
    const workflow = RELEASE_READINESS.workflows.find((name) =>
      url.pathname.includes(`/workflows/${name}/runs`),
    );
    let body;
    if (workflow) {
      assert.equal(url.searchParams.get('head_sha'), candidateSha);
      assert.equal(url.searchParams.get('event'), 'push');
      assert.equal(url.searchParams.get('branch'), 'main');
      body = {
        workflow_runs: [
          {
            id: 1,
            event: 'push',
            status: 'completed',
            conclusion: 'success',
            head_sha: candidateSha,
            head_branch: 'main',
            head_repository: { full_name: releaseEnvironment.GITHUB_REPOSITORY },
            path: `.github/workflows/${workflow}`,
          },
        ],
      };
    } else if (url.pathname === '/health') {
      body = {
        status: 'healthy',
        deployment: { target: 'fly', version: candidateSha },
        dependencies: { database: { status: 'ok' } },
      };
    } else if (url.pathname.endsWith('/code-scanning/alerts')) {
      assert.equal(url.searchParams.get('state'), 'open');
      body = [];
    } else if (url.pathname.endsWith('/status')) {
      assert.ok(url.pathname.endsWith(`/commits/${candidateSha}/status`));
      body = {
        sha: candidateSha,
        statuses: [
          {
            id: 10,
            context: RELEASE_READINESS.relay.context,
            state: 'success',
            target_url: `https://github.com/${releaseEnvironment.GITHUB_REPOSITORY}/actions/runs/42`,
          },
        ],
      };
    } else if (url.pathname.endsWith('/actions/runs/42')) {
      body = {
        id: 42,
        event: 'workflow_dispatch',
        head_branch: 'main',
        head_sha: 'b'.repeat(40),
        head_repository: { full_name: releaseEnvironment.GITHUB_REPOSITORY },
        path: `.github/workflows/${RELEASE_READINESS.relay.workflow}`,
      };
    } else if (url.pathname.endsWith('/actions/runs/42/jobs')) {
      body = {
        jobs: [
          {
            name: RELEASE_READINESS.relay.jobName,
            status: 'completed',
            conclusion: 'success',
            steps: [
              {
                name: `${RELEASE_READINESS.relay.verificationStepPrefix}${candidateSha}`,
                status: 'completed',
                conclusion: 'success',
              },
            ],
          },
        ],
      };
    } else if (url.pathname.endsWith(`/statuses/${candidateSha}`)) {
      body = { id: 11 };
    } else {
      assert.fail(`Unexpected fixture API path ${url.pathname}`);
    }
    const replacement = replace(url, body, request) ?? {};
    return new Response(JSON.stringify(replacement.body ?? body), {
      status: replacement.status ?? 200,
      headers: replacement.link ? { link: replacement.link } : {},
    });
  };
  return { fetchImpl, calls };
}

function boundedReleaseOptions(api, extra = {}) {
  let now = 0;
  return {
    fetchImpl: api.fetchImpl,
    timeoutMs: 1000,
    now: () => now,
    sleep: async (milliseconds) => {
      now += milliseconds;
    },
    ...extra,
  };
}

test('release admission reads candidate CI, processed scanning, open alerts and the actual relay receipt', async () => {
  const api = releaseApi();
  await requireReleaseReady(releaseEnvironment, boundedReleaseOptions(api, { requireRelay: true }));
  assert.equal(api.calls.filter((call) => call.url.pathname.includes('/workflows/')).length, 2);
  assert.equal(
    api.calls.filter((call) => call.url.pathname.endsWith('/code-scanning/alerts')).length,
    2,
  );
  assert.ok(api.calls.some((call) => call.url.pathname.endsWith('/actions/runs/42/jobs')));
  assert.ok(
    api.calls
      .filter((call) => call.url.origin === 'https://api.github.com')
      .every((call) => call.request.redirect === 'error'),
  );
  const health = api.calls.find((call) => call.url.pathname === '/health');
  assert.ok(health);
  assert.equal(health.request.headers.authorization, undefined);
});

test('manual relay admission requires CI too and does not consume an unrelated relay verdict', async () => {
  const api = releaseApi();
  await requireReleaseReady(releaseEnvironment, boundedReleaseOptions(api));
  assert.ok(api.calls.some((call) => call.url.pathname.includes('/workflows/ci.yml/runs')));
  assert.ok(
    api.calls.some((call) => call.url.pathname.includes('/workflows/codeql-analysis.yml/runs')),
  );
  assert.equal(
    api.calls.some((call) => call.url.pathname.endsWith('/status')),
    false,
  );
});

test('release admission cannot reuse a green run from another source or an older failed rerun', async () => {
  for (const mutate of [
    (run) => {
      run.head_repository.full_name = 'foreign/repository';
    },
    (run) => {
      run.head_sha = 'b'.repeat(40);
    },
    (run) => {
      run.head_branch = 'develop';
    },
    (run) => {
      run.event = 'pull_request';
    },
    (run) => {
      run.path = '.github/workflows/another.yml';
    },
    (run) => {
      run.conclusion = 'failure';
    },
  ]) {
    const api = releaseApi((url, body) => {
      if (url.pathname.includes('/workflows/ci.yml/')) mutate(body.workflow_runs[0]);
    });
    await assert.rejects(requireReleaseReady(releaseEnvironment, boundedReleaseOptions(api)));
    assert.ok(api.calls.some((call) => call.url.pathname.includes('/workflows/ci.yml/runs')));
    assert.equal(
      api.calls.some((call) => call.url.pathname.endsWith('/code-scanning/alerts')),
      false,
    );
  }
  const api = releaseApi((url, body) => {
    if (url.pathname.includes('/workflows/ci.yml/'))
      body.workflow_runs.push({ ...body.workflow_runs[0], id: 2, conclusion: 'failure' });
  });
  await assert.rejects(
    requireReleaseReady(releaseEnvironment, boundedReleaseOptions(api)),
    /did not accept/,
  );
});

test('missing and pending candidate scans reach a bounded timeout', async () => {
  for (const pending of [[], [{ status: 'in_progress', conclusion: null }]]) {
    const api = releaseApi((url, body) => {
      if (url.pathname.includes('/workflows/codeql-analysis.yml/')) {
        body.workflow_runs = pending.map((run) => ({ ...body.workflow_runs[0], ...run }));
      }
    });
    await assert.rejects(
      requireReleaseReady(releaseEnvironment, boundedReleaseOptions(api)),
      /deadline/,
    );
    assert.equal(
      api.calls.some((call) => call.url.pathname.endsWith('/code-scanning/alerts')),
      false,
    );
    assert.ok(
      api.calls.filter((call) => call.url.pathname.includes('/workflows/codeql-analysis.yml/'))
        .length >= 2,
    );
  }
});

test('scan API failures and malformed collections block deployment', async () => {
  for (const response of [{ status: 403 }, { status: 500 }, { body: {} }]) {
    const api = releaseApi((url) =>
      url.pathname.endsWith('/code-scanning/alerts') ? response : undefined,
    );
    await assert.rejects(requireReleaseReady(releaseEnvironment, boundedReleaseOptions(api)));
    assert.ok(api.calls.some((call) => call.url.pathname.endsWith('/code-scanning/alerts')));
  }
});

test('open alerts on a later page block release without printing their details', async () => {
  const marker = 'private finding detail';
  const api = releaseApi((url) => {
    if (!url.pathname.endsWith('/code-scanning/alerts')) return;
    return url.searchParams.has('page')
      ? { body: [{ state: 'open', number: 1, detail: marker }] }
      : { body: [], link: `<${url.href}&page=2>; rel="next"` };
  });
  await assert.rejects(
    requireReleaseReady(releaseEnvironment, boundedReleaseOptions(api)),
    (error) => /Open code scanning alerts/.test(error.message) && !error.message.includes(marker),
  );
  assert.ok(api.calls.some((call) => call.url.searchParams.get('page') === '2'));
});

test('pagination cannot change origins, selectors or loop indefinitely', async () => {
  for (const link of [
    'https://foreign.invalid/repos/fixture/repository/code-scanning/alerts?state=open&per_page=100&page=2',
    'https://api.github.com/repos/fixture/repository/code-scanning/alerts?state=closed&per_page=100&page=2',
    'https://api.github.com/repos/fixture/repository/code-scanning/alerts?state=open&state=closed&per_page=100&page=2',
    'https://api.github.com/repos/fixture/repository/code-scanning/alerts?state=open&per_page=100&page=1',
  ]) {
    const api = releaseApi((url) =>
      url.pathname.endsWith('/code-scanning/alerts')
        ? { link: `<${link}>; rel="next"` }
        : undefined,
    );
    await assert.rejects(
      requireZeroOpenAlerts(
        { repository: releaseEnvironment.GITHUB_REPOSITORY, token: 'fixture' },
        { fetchImpl: api.fetchImpl },
      ),
    );
    assert.equal(
      api.calls.some((call) => call.url.origin === 'https://foreign.invalid'),
      false,
    );
  }
  const api = releaseApi(() => ({ link: 'invalid pagination' }));
  await assert.rejects(
    githubPages(
      '/repos/fixture/repository/code-scanning/alerts?state=open&per_page=100',
      'fixture',
      null,
      { fetchImpl: api.fetchImpl },
    ),
    /pagination/,
  );
});

test('relay acceptance rejects a different candidate, foreign receipt and failed actual deploy', async () => {
  for (const mutate of [
    (url, body) => {
      if (url.pathname.endsWith('/status')) body.sha = 'b'.repeat(40);
    },
    (url, body) => {
      if (url.pathname.endsWith('/status'))
        body.statuses[0].target_url = 'https://github.com/foreign/repository/actions/runs/42';
    },
    (url, body) => {
      if (url.pathname.endsWith('/status')) body.statuses[0].state = 'failure';
    },
    (url, body) => {
      if (url.pathname.endsWith('/actions/runs/42'))
        body.head_repository.full_name = 'foreign/repository';
    },
    (url, body) => {
      if (url.pathname.endsWith('/actions/runs/42')) body.path = '.github/workflows/ci.yml';
    },
    (url, body) => {
      if (url.pathname.endsWith('/actions/runs/42/jobs')) body.jobs[0].conclusion = 'skipped';
    },
  ]) {
    const api = releaseApi((url, body) => {
      mutate(url, body);
    });
    await assert.rejects(
      requireReleaseReady(releaseEnvironment, boundedReleaseOptions(api, { requireRelay: true })),
    );
    assert.ok(
      api.calls.some((call) => call.url.pathname.endsWith(`/commits/${candidateSha}/status`)),
    );
  }
});

test('a relay that never reports cannot unlock web promotion', async () => {
  const api = releaseApi((url, body) => {
    if (url.pathname.endsWith('/status')) body.statuses = [];
  });
  await assert.rejects(
    requireReleaseReady(releaseEnvironment, boundedReleaseOptions(api, { requireRelay: true })),
    /deadline/,
  );
  assert.ok(api.calls.filter((call) => call.url.pathname.endsWith('/status')).length >= 2);
});

test('receipt publication binds both successful and unsuccessful outcomes to the resolved full candidate', async () => {
  for (const outcome of ['success', 'failure', 'cancelled', 'skipped']) {
    const api = releaseApi();
    await publishRelayVerdict(
      { ...releaseEnvironment, RELAY_DEPLOY_RESULT: outcome },
      { fetchImpl: api.fetchImpl },
    );
    assert.equal(api.calls.length, 1);
    const call = api.calls[0];
    assert.equal(call.url.pathname, `/repos/fixture/repository/statuses/${candidateSha}`);
    assert.equal(call.request.method, 'POST');
    const receipt = JSON.parse(call.request.body);
    assert.equal(receipt.state, outcome === 'success' ? 'success' : 'failure');
    assert.equal(receipt.context, RELEASE_READINESS.relay.context);
    assert.equal(receipt.target_url, 'https://github.com/fixture/repository/actions/runs/42');
  }
  const api = releaseApi();
  await assert.rejects(
    publishRelayVerdict(
      { ...releaseEnvironment, GITHUB_SHA: candidateSha.slice(0, 7) },
      { fetchImpl: api.fetchImpl },
    ),
    /full candidate/,
  );
  assert.equal(api.calls.length, 0);
});

test('a later workflow page cannot smuggle a foreign candidate past a clean first page', async () => {
  const api = releaseApi((url, body) => {
    if (!url.pathname.includes('/workflows/ci.yml/')) return;
    if (!url.searchParams.has('page')) return { link: `<${url.href}&page=2>; rel="next"` };
    body.workflow_runs[0].head_sha = 'b'.repeat(40);
  });
  await assert.rejects(
    requireReleaseReady(releaseEnvironment, boundedReleaseOptions(api)),
    /invalid candidate workflow/,
  );
  assert.ok(
    api.calls.some(
      (call) =>
        call.url.pathname.includes('/workflows/ci.yml/') &&
        call.url.searchParams.get('page') === '2',
    ),
  );
});

test('a stale successful receipt cannot unlock web when the live relay has changed', async () => {
  const api = releaseApi((url, body) => {
    if (url.pathname === '/health') body.deployment.version = 'b'.repeat(40);
  });
  await assert.rejects(
    requireReleaseReady(releaseEnvironment, boundedReleaseOptions(api, { requireRelay: true })),
    /another candidate/,
  );
  assert.ok(api.calls.some((call) => call.url.pathname.endsWith('/actions/runs/42/jobs')));
  assert.ok(api.calls.some((call) => call.url.pathname === '/health'));
});

test('the check at a production write fails immediately instead of waiting on pending scans', async () => {
  const api = releaseApi((url, body) => {
    if (url.pathname.includes('/workflows/codeql-analysis.yml/'))
      body.workflow_runs[0].status = 'in_progress';
  });
  let slept = false;
  await assert.rejects(
    requireReleaseReady(releaseEnvironment, {
      fetchImpl: api.fetchImpl,
      noWait: true,
      sleep: async () => {
        slept = true;
      },
    }),
    /deadline/,
  );
  assert.equal(slept, false);
});

test('relay receipts from an unreviewed workflow branch cannot authorize production', async () => {
  const api = releaseApi((url, body) => {
    if (url.pathname.endsWith('/actions/runs/42')) body.head_branch = 'unreviewed';
  });
  await assert.rejects(
    requireReleaseReady(releaseEnvironment, boundedReleaseOptions(api, { requireRelay: true })),
    /another deployment/,
  );
  assert.equal(
    api.calls.some((call) => call.url.pathname === '/health'),
    false,
  );
});

test('a genuine successful deploy of another candidate cannot serve as this candidate receipt', async () => {
  const api = releaseApi((url, body) => {
    if (url.pathname.endsWith('/actions/runs/42/jobs'))
      body.jobs[0].steps[0].name = `${RELEASE_READINESS.relay.verificationStepPrefix}${'b'.repeat(40)}`;
  });
  await assert.rejects(
    requireReleaseReady(releaseEnvironment, boundedReleaseOptions(api, { requireRelay: true })),
    /did not verify this candidate/,
  );
  assert.ok(api.calls.some((call) => call.url.pathname.endsWith('/actions/runs/42/jobs')));
  assert.equal(
    api.calls.some((call) => call.url.pathname === '/health'),
    false,
  );
});
