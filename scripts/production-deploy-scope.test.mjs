import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  classifyDeployScope,
  formatGithubOutputs,
  isEligibleProductionRun,
  selectSurfaceBaseline,
} from './production-deploy-scope.mjs';

test('web-only changes do not spend unrelated expensive runners', () => {
  assert.deepEqual(classifyDeployScope(['apps/web/app/page.tsx']), {
    web: true,
    gateway: false,
    signaling: false,
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
    gateway: false,
    signaling: true,
    desktop: false,
    native: false,
    extension: false,
    vscode: false,
    mobile: false,
  });
  assert.deepEqual(classifyDeployScope(['services/api-gateway/src/index.ts']), {
    web: false,
    gateway: true,
    signaling: false,
    desktop: false,
    native: false,
    extension: false,
    vscode: false,
    mobile: false,
  });
  assert.deepEqual(classifyDeployScope(['apps/desktop/src-tauri/src/lib.rs']), {
    web: false,
    gateway: false,
    signaling: false,
    desktop: true,
    native: true,
    extension: false,
    vscode: false,
    mobile: false,
  });
});

test('gateway image and host contracts select only the gateway deploy lane', () => {
  for (const file of [
    '.dockerignore',
    'infrastructure/api-gateway/fly.production.toml',
    'scripts/verify-gateway-deployment.mjs',
  ]) {
    assert.deepEqual(classifyDeployScope([file]), {
      web: false,
      gateway: true,
      signaling: false,
      desktop: false,
      native: false,
      extension: false,
      vscode: false,
      mobile: false,
    });
  }
});

test('shared build inputs conservatively rebuild every deployable lane', () => {
  const scope = classifyDeployScope(['pnpm-lock.yaml']);
  assert.deepEqual(scope, {
    web: true,
    gateway: true,
    signaling: true,
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
  assert.deepEqual(classifyDeployScope(['docs/current/ci-deployment-policy.md']), {
    web: false,
    gateway: false,
    signaling: false,
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
    gateway: false,
    signaling: false,
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
  const GATEWAY = 'Promote verified gateway image to production';
  const base = {
    conclusion: 'success',
    event: 'push',
    head_branch: 'main',
    head_repository: { full_name: 'owner/repository' },
  };

  const runs = [
    { ...base, head_sha: 'web-only', jobs: [{ name: WEB, conclusion: 'success' }] },
    { ...base, head_sha: 'both', jobs: [{ name: GATEWAY, conclusion: 'success' }] },
  ];

  assert.equal(selectSurfaceBaseline(runs, 'owner/repository', WEB), 'web-only');
  assert.equal(selectSurfaceBaseline(runs, 'owner/repository', GATEWAY), 'both');
});

test('never deployed reads as null, which the caller must treat as deploy-everything', () => {
  const WEB = 'Deploy verified web artifact';
  assert.equal(selectSurfaceBaseline([], 'owner/repository', WEB), null);
  assert.equal(selectSurfaceBaseline(undefined, 'owner/repository', WEB), null);
});

test('Vercel Git integration cannot race the CI-owned main promotion', () => {
  const config = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  assert.equal(config.git.deploymentEnabled.main, false);

  const workflow = fs.readFileSync('.github/workflows/deploy-production.yml', 'utf8');
  assert.match(workflow, /vercel deploy --prebuilt --prod/);
});

test('gateway production reuses the immutable image verified in staging', () => {
  const workflow = fs.readFileSync('.github/workflows/deploy-production.yml', 'utf8');
  assert.match(workflow, /containerimage\.digest/);
  assert.match(
    workflow,
    /IMAGE_REF: \$\{\{ needs\.deploy-gateway-staging\.outputs\.image_ref \}\}/,
  );
  assert.match(workflow, /pnpm db:migrate -- verify/);
  assert.equal((workflow.match(/node scripts\/verify-gateway-deployment\.mjs/g) ?? []).length, 2);
});
