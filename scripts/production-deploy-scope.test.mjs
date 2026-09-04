import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  SURFACE_DEPLOY_JOBS,
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
  const workflow = fs.readFileSync('.github/workflows/deploy-production.yml', 'utf8');
  const jobNames = new Set(
    [...workflow.matchAll(/^ {4}name: (.+)$/gm)].map((match) => match[1].trim()),
  );

  for (const [surface, jobName] of Object.entries(SURFACE_DEPLOY_JOBS)) {
    assert.equal(jobNames.has(jobName), true, `${surface} -> ${jobName}`);
  }
});

test('shared build inputs conservatively rebuild every deployable lane', () => {
  const scope = classifyDeployScope(['pnpm-lock.yaml']);
  assert.deepEqual(scope, {
    web: true,
    signaling: true,
    sandbox: true,
    desktop: true,
    native: true,
    extension: true,
    vscode: true,
    mobile: true,
  });
  assert.match(formatGithubOutputs(scope), /^web=true$/m);
  assert.match(formatGithubOutputs(scope), /^native=true$/m);
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

  for (const workflow of [webWorkflow, signalingWorkflow]) {
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
  assert.match(job, /cargo test -p agiworkforce-desktop --lib data::cloud_sync::fixture_tests/);
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
