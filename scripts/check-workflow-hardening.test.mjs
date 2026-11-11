import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { parse } from 'yaml';

import {
  evaluateReleaseSettings,
  rulesetCoversRef,
} from './release/check-release-environments.mjs';
import {
  CONTRACT_PATH,
  REPO_ROOT,
  WORKFLOW_DIR,
  checkWorkflowHardening,
  isDeployJob,
  resolvedPermissions,
  unpinnedAction,
  workflowFiles,
  writeScopes,
} from './check-workflow-hardening.mjs';

const roots = [];

const EMPTY_CONTRACT = {
  productionEnvironments: ['production-web'],
  allowedWriteScopes: [],
  knownGaps: {
    unpinnedActions: [],
    implicitPermissions: [],
    missingJobTimeout: [],
    deployWithoutEnvironment: [],
    runInterpolatesUntrustedInput: [],
  },
};

const CLEAN_WORKFLOW = `
name: Clean
on:
  push:
    branches: [main]
permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@2222222222222222222222222222222222222222
      - uses: third/party@1111111111111111111111111111111111111111
      - run: pnpm test
`;

function fixture(workflows, contract = EMPTY_CONTRACT) {
  const root = mkdtempSync(path.join(tmpdir(), 'workflow-hardening-'));
  roots.push(root);
  mkdirSync(path.join(root, WORKFLOW_DIR), { recursive: true });
  mkdirSync(path.join(root, path.dirname(CONTRACT_PATH)), { recursive: true });
  writeFileSync(path.join(root, CONTRACT_PATH), JSON.stringify(contract));
  for (const [name, body] of Object.entries(workflows)) {
    writeFileSync(path.join(root, WORKFLOW_DIR, name), body);
  }
  return root;
}

function errorsFor(workflows, contract) {
  return checkWorkflowHardening(fixture(workflows, contract)).errors;
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('the real guard passes on the repository as it stands', () => {
  const { errors, report } = checkWorkflowHardening(REPO_ROOT);
  assert.deepEqual(errors, []);
  assert.ok(report.workflows > 20, 'every workflow in the repository is measured');
  assert.ok(report.jobs > report.workflows);
  assert.ok(report.actions > 0);
});

test('it reads every workflow file in the repository, not a listed subset', () => {
  assert.ok(workflowFiles(REPO_ROOT).includes('deploy-production.yml'));
  assert.ok(workflowFiles(REPO_ROOT).includes('ci.yml'));
});

test('a synthetic clean workflow passes', () => {
  assert.deepEqual(errorsFor({ 'clean.yml': CLEAN_WORKFLOW }), []);
});

test('an action pinned to a tag fails', () => {
  const errors = errorsFor({
    'tagged.yml': CLEAN_WORKFLOW.replace(
      'third/party@1111111111111111111111111111111111111111',
      'third/party@v3',
    ),
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /unpinnedActions/);
  assert.match(errors[0], /third\/party@v3/);
});

test('a GitHub-owned action pinned to a tag fails, whatever the contract lists', () => {
  const errors = errorsFor(
    {
      'first-party.yml': CLEAN_WORKFLOW.replace(
        '      - uses: third/party@1111111111111111111111111111111111111111\n',
        [
          '      - uses: actions/checkout@v7',
          '      - uses: github/codeql-action/init@v3',
          '      - uses: microsoft/setup-msbuild@v2',
          '',
        ].join('\n'),
      ),
    },
    { ...EMPTY_CONTRACT, trustedActionPrefixes: ['actions', 'github', 'microsoft'] },
  );
  assert.equal(errors.length, 3);
  assert.match(errors[0], /unpinnedActions: first-party\.yml:build: actions\/checkout@v7/);
  assert.match(errors[1], /github\/codeql-action\/init@v3/);
  assert.match(errors[2], /microsoft\/setup-msbuild@v2/);
});

test('an action pinned to a short sha fails', () => {
  const errors = errorsFor({
    'short.yml': CLEAN_WORKFLOW.replace(
      'third/party@1111111111111111111111111111111111111111',
      'third/party@1111111',
    ),
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /40 character commit sha/);
});

test('a job that declares no permissions anywhere fails', () => {
  const errors = errorsFor({
    'implicit.yml': CLEAN_WORKFLOW.replace('permissions:\n  contents: read\n', ''),
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /implicitPermissions: implicit\.yml:build/);
});

test('write-all fails outright and cannot be baselined', () => {
  const errors = errorsFor({
    'writeall.yml': CLEAN_WORKFLOW.replace(
      'permissions:\n  contents: read',
      'permissions: write-all',
    ),
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /resolves to write-all/);
});

test('an undeclared write scope fails and a declared one passes', () => {
  const granted = CLEAN_WORKFLOW.replace('contents: read', 'contents: write');
  assert.match(errorsFor({ 'w.yml': granted })[0], /grants a write scope/);
  assert.deepEqual(
    errorsFor(
      { 'w.yml': granted },
      {
        ...EMPTY_CONTRACT,
        allowedWriteScopes: [{ id: 'w.yml:build:contents', reason: 'it uploads the release' }],
      },
    ),
    [],
  );
});

test('a declared write scope with no reason fails', () => {
  const errors = errorsFor(
    { 'w.yml': CLEAN_WORKFLOW.replace('contents: read', 'contents: write') },
    { ...EMPTY_CONTRACT, allowedWriteScopes: [{ id: 'w.yml:build:contents', reason: '  ' }] },
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0], /carries no reason/);
});

test('a write scope allowance that no job still needs fails', () => {
  const errors = errorsFor(
    { 'clean.yml': CLEAN_WORKFLOW },
    {
      ...EMPTY_CONTRACT,
      allowedWriteScopes: [{ id: 'gone.yml:build:contents', reason: 'it used to upload' }],
    },
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0], /cannot outlive the need/);
});

test('a job with no timeout fails, and a baselined one needs a reason and a fix', () => {
  const noTimeout = CLEAN_WORKFLOW.replace('    timeout-minutes: 10\n', '');
  assert.match(errorsFor({ 't.yml': noTimeout })[0], /missingJobTimeout: t\.yml:build/);

  assert.deepEqual(
    errorsFor(
      { 't.yml': noTimeout },
      {
        ...EMPTY_CONTRACT,
        knownGaps: {
          ...EMPTY_CONTRACT.knownGaps,
          missingJobTimeout: [
            { id: 't.yml:build', reason: 'the workflow is frozen', fix: 'timeout-minutes: 10' },
          ],
        },
      },
    ),
    [],
  );

  const noFix = errorsFor(
    { 't.yml': noTimeout },
    {
      ...EMPTY_CONTRACT,
      knownGaps: {
        ...EMPTY_CONTRACT.knownGaps,
        missingJobTimeout: [{ id: 't.yml:build', reason: 'the workflow is frozen' }],
      },
    },
  );
  assert.equal(noFix.length, 1);
  assert.match(noFix[0], /names no fix/);
});

test('a baseline entry that no longer violates the rule fails', () => {
  const errors = errorsFor(
    { 'clean.yml': CLEAN_WORKFLOW },
    {
      ...EMPTY_CONTRACT,
      knownGaps: {
        ...EMPTY_CONTRACT.knownGaps,
        missingJobTimeout: [{ id: 'clean.yml:build', reason: 'stale', fix: 'timeout-minutes: 10' }],
      },
    },
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0], /cannot grow back/);
});

test('a deploy job with no concurrency group fails', () => {
  const deploy = `
name: Deploy
on:
  workflow_dispatch:
permissions:
  contents: read
jobs:
  ship:
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    environment:
      name: production-web
    steps:
      - run: vercel deploy --prebuilt --prod
`;
  const errors = errorsFor({ 'deploy.yml': deploy });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /declares no concurrency group/);

  assert.deepEqual(
    errorsFor({
      'deploy.yml': deploy.replace(
        'permissions:',
        'concurrency:\n  group: production\npermissions:',
      ),
    }),
    [],
  );
});

test('a deploy job with no environment, and one naming an undeclared environment, both fail', () => {
  const base = `
name: Deploy
on:
  workflow_dispatch:
concurrency:
  group: production
permissions:
  contents: read
jobs:
  ship:
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    steps:
      - run: flyctl deploy --remote-only
`;
  assert.match(errorsFor({ 'd.yml': base })[0], /deployWithoutEnvironment: d\.yml:ship/);

  const unknown = base.replace('    steps:', '    environment:\n      name: mystery\n    steps:');
  const errors = errorsFor({ 'd.yml': unknown });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /does not list/);
});

test('pull_request_target that checks out the head ref fails', () => {
  const errors = errorsFor({
    'prt.yml': `
name: Risky
on:
  pull_request_target:
permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@2222222222222222222222222222222222222222
        with:
          ref: \${{ github.event.pull_request.head.sha }}
      - run: pnpm test
`,
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /runs on pull_request_target and checks out/);
});

test('pull_request_target that reads a repository secret fails', () => {
  const errors = errorsFor({
    'prt.yml': `
name: Risky
on:
  pull_request_target:
permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    env:
      TOKEN: \${{ secrets.DEPLOY_TOKEN }}
    steps:
      - run: pnpm test
`,
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /reads a repository secret/);
});

test('a run step that interpolates a pull request title fails', () => {
  const errors = errorsFor({
    'inject.yml': CLEAN_WORKFLOW.replace(
      '      - run: pnpm test',
      '      - run: echo "\${{ github.event.pull_request.title }}"',
    ),
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /runInterpolatesUntrustedInput/);
  assert.match(errors[0], /github\.event\.pull_request\.title/);
});

test('an unparseable workflow and a workflow with no jobs both fail', () => {
  assert.match(errorsFor({ 'bad.yml': 'name: [unclosed\n' })[0], /not parseable YAML/);
  assert.match(errorsFor({ 'empty.yml': 'name: Nothing\non: push\n' })[0], /declares no jobs/);
});

test('the helpers read what the rules depend on', () => {
  assert.equal(unpinnedAction('./.github/workflows/reusable.yml'), null);
  assert.match(unpinnedAction('actions/checkout@v7'), /not to a 40 character commit sha/);
  assert.match(unpinnedAction('other/thing@v1'), /not to a 40 character commit sha/);
  assert.match(unpinnedAction('other/thing'), /names no version at all/);

  assert.deepEqual(writeScopes({ contents: 'read', packages: 'write' }), ['packages']);
  assert.deepEqual(writeScopes('write-all'), ['write-all']);
  assert.deepEqual(writeScopes(null), []);

  assert.deepEqual(resolvedPermissions({ permissions: { contents: 'read' } }, {}), {
    contents: 'read',
  });
  assert.deepEqual(
    resolvedPermissions({ permissions: { contents: 'read' } }, { permissions: {} }),
    {},
  );
  assert.equal(resolvedPermissions({}, {}), null);

  assert.equal(isDeployJob({ steps: [{ run: 'vercel promote abc' }] }), true);
  assert.equal(isDeployJob({ steps: [{ run: 'pnpm build' }] }), false);
});

const RELEASE_CONTRACT = {
  ...EMPTY_CONTRACT,
  productionEnvironments: ['production-web', 'vscode-marketplace', 'cli-release'],
  releaseEnvironments: {
    'vscode-marketplace': { tags: ['v-vscode-*'] },
    'cli-release': { tags: ['v-cli-*'] },
  },
  signingSecrets: { AGI_CLI_RELEASE_SIGNING_KEY: 'cli-release' },
};

function releaseWorkflow({ tag, environment = '', permissions = 'contents: read', steps }) {
  return `
name: Release
on:
  push:
    tags:
      - '${tag}'
  workflow_dispatch:
concurrency:
  group: release
permissions:
  contents: read
jobs:
  ship:
    runs-on: ubuntu-24.04
    timeout-minutes: 10
${environment ? `    environment: ${environment}\n` : ''}    permissions:
      ${permissions}
    steps:
${steps}
`;
}

test('a job that runs vsce publish with no environment is a deploy without one', () => {
  const workflow = releaseWorkflow({
    tag: 'v-vscode-*',
    steps: '      - run: pnpm --dir apps/extension-vscode exec vsce publish --azure-credential',
  });
  const errors = errorsFor({ 'vsce.yml': workflow }, RELEASE_CONTRACT);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /deployWithoutEnvironment: vsce\.yml:ship/);
  assert.deepEqual(
    errorsFor(
      {
        'vsce.yml': releaseWorkflow({
          tag: 'v-vscode-*',
          environment: 'vscode-marketplace',
          steps:
            '      - run: pnpm --dir apps/extension-vscode exec vsce publish --azure-credential',
        }),
      },
      RELEASE_CONTRACT,
    ),
    [],
  );
});

test('every store publish, release action and signing step is recognised as a deploy', () => {
  for (const step of [
    { run: 'pnpm --dir apps/extension-vscode exec vsce publish --packagePath x.vsix' },
    { run: 'pnpm --dir apps/extension-vscode exec ovsx publish x.vsix --trusted-publishing' },
    { run: 'node apps/extension/scripts/publish-chrome-web-store.mjs "$ARCHIVE_PATH"' },
    { uses: 'softprops/action-gh-release@efb35369e0ad2afab669f228072c1b0d510eae64' },
    { run: 'cd archives\ncosign sign-blob --yes --bundle b.json SHA256SUMS' },
  ]) {
    assert.equal(isDeployJob({ steps: [step] }), true, JSON.stringify(step));
  }
  assert.equal(
    isDeployJob({ steps: [{ run: "requireText(cli, 'cosign sign-blob', 'must sign')" }] }),
    false,
    'a guard that only quotes the command is not a release',
  );
  assert.equal(
    isDeployJob({ steps: [{ run: 'cosign verify-blob --bundle b.json SHA256SUMS' }] }),
    false,
  );
});

test('a job that reads the CLI signing key outside cli-release fails', () => {
  const signing =
    '      - env:\n          KEY: ${{ secrets.AGI_CLI_RELEASE_SIGNING_KEY }}\n        run: ./sign.sh';
  const outside = errorsFor(
    { 'sign.yml': releaseWorkflow({ tag: 'v-cli-*', steps: signing }) },
    RELEASE_CONTRACT,
  );
  assert.ok(
    outside.some((error) =>
      /sign\.yml:ship reads AGI_CLI_RELEASE_SIGNING_KEY in no environment/.test(error),
    ),
  );
  assert.ok(outside.some((error) => /deployWithoutEnvironment: sign\.yml:ship/.test(error)));

  const elsewhere = errorsFor(
    {
      'sign.yml': releaseWorkflow({
        tag: 'v-cli-*',
        environment: 'production-web',
        steps: signing,
      }),
    },
    RELEASE_CONTRACT,
  );
  assert.ok(elsewhere.some((error) => /in environment "production-web"/.test(error)));

  assert.deepEqual(
    errorsFor(
      {
        'sign.yml': releaseWorkflow({ tag: 'v-cli-*', environment: 'cli-release', steps: signing }),
      },
      RELEASE_CONTRACT,
    ),
    [],
  );

  const workflowLevel = releaseWorkflow({
    tag: 'v-cli-*',
    environment: 'cli-release',
    steps: signing,
  }).replace(
    'permissions:\n  contents: read\njobs:',
    'permissions:\n  contents: read\nenv:\n  KEY: ${{ secrets.AGI_CLI_RELEASE_SIGNING_KEY }}\njobs:',
  );
  assert.ok(
    errorsFor({ 'sign.yml': workflowLevel }, RELEASE_CONTRACT).some((error) =>
      /reads AGI_CLI_RELEASE_SIGNING_KEY at workflow level/.test(error),
    ),
  );
});

test('a release environment named by a workflow its tags cannot reach fails', () => {
  const errors = errorsFor(
    {
      'wrong.yml': releaseWorkflow({
        tag: 'v-ext-*',
        environment: 'vscode-marketplace',
        steps: '      - run: pnpm --dir apps/extension-vscode exec vsce publish',
      }),
    },
    RELEASE_CONTRACT,
  );
  assert.equal(errors.length, 1);
  assert.match(
    errors[0],
    /allows only tags v-vscode-\*, but the workflow is triggered by v-ext-\*/,
  );
});

test('a release environment the contract does not declare as production fails', () => {
  const errors = errorsFor(
    { 'clean.yml': CLEAN_WORKFLOW },
    { ...RELEASE_CONTRACT, releaseEnvironments: { 'open-vsx': { tags: [] } } },
  );
  assert.ok(
    errors.some((error) => /lists "open-vsx", which productionEnvironments does not/.test(error)),
  );
  assert.ok(errors.some((error) => /"open-vsx" names no tag pattern/.test(error)));
});

// The shape of release-chrome-extension.yml before the Sentry step moved out:
// the store ZIP is hashed, a registry install runs, then the ZIP is uploaded.
const CHROME_PACKAGE_BEFORE_SPLIT = `      - run: |
          pnpm --filter @agiworkforce/extension package
          sha256sum "dist/chrome/x.zip" > "dist/chrome/x.zip.sha256"
      - run: |
          npm install --global @sentry/cli@2.58.6
          sentry-cli releases new "$SENTRY_RELEASE"
      - uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9
        with:
          path: dist/chrome/`;

test('a global registry install in a job that uploads the release artifact fails', () => {
  const errors = errorsFor(
    {
      'release-chrome.yml': releaseWorkflow({ tag: 'v-ext-*', steps: CHROME_PACKAGE_BEFORE_SPLIT }),
    },
    RELEASE_CONTRACT,
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0], /releaseJobGlobalInstall: release-chrome\.yml:ship/);
});

test('a global registry install beside a write token fails, and alone with a read token passes', () => {
  const install = '      - run: npm i -g @sentry/cli@2.58.6';
  const writing = errorsFor(
    {
      'release-cli.yml': releaseWorkflow({
        tag: 'v-cli-*',
        permissions: 'contents: write',
        steps: install,
      }),
    },
    {
      ...RELEASE_CONTRACT,
      allowedWriteScopes: [
        { id: 'release-cli.yml:ship:contents', reason: 'it creates the release' },
      ],
    },
  );
  assert.equal(writing.length, 1);
  assert.match(writing[0], /releaseJobGlobalInstall: release-cli\.yml:ship/);

  assert.deepEqual(
    errorsFor(
      { 'release-cli.yml': releaseWorkflow({ tag: 'v-cli-*', steps: install }) },
      RELEASE_CONTRACT,
    ),
    [],
  );
});

test('a job holding id-token: write that runs install scripts fails', () => {
  const steps = (install) =>
    `      - run: ${install}\n      - run: pnpm --dir apps/extension-vscode exec vsce publish`;
  const errors = errorsFor(
    {
      'vsce.yml': releaseWorkflow({
        tag: 'v-vscode-*',
        environment: 'vscode-marketplace',
        permissions: 'id-token: write',
        steps: steps('pnpm install --frozen-lockfile'),
      }),
    },
    {
      ...RELEASE_CONTRACT,
      allowedWriteScopes: [{ id: 'vsce.yml:ship:id-token', reason: 'OIDC publish' }],
    },
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0], /oidcJobRunsInstallScripts: vsce\.yml:ship/);

  assert.deepEqual(
    errorsFor(
      {
        'vsce.yml': releaseWorkflow({
          tag: 'v-vscode-*',
          environment: 'vscode-marketplace',
          permissions: 'id-token: write',
          steps: steps('pnpm install --frozen-lockfile --ignore-scripts --filter agi-workforce'),
        }),
      },
      {
        ...RELEASE_CONTRACT,
        allowedWriteScopes: [{ id: 'vsce.yml:ship:id-token', reason: 'OIDC publish' }],
      },
    ),
    [],
  );
});

test('the release workflows declare the environments the owner protects', () => {
  const contract = JSON.parse(readFileSync(path.join(REPO_ROOT, CONTRACT_PATH), 'utf8'));
  assert.deepEqual(Object.keys(contract.releaseEnvironments).sort(), [
    'chrome-web-store',
    'cli-release',
    'open-vsx',
    'vscode-marketplace',
  ]);
  assert.equal(contract.signingSecrets.AGI_CLI_RELEASE_SIGNING_KEY, 'cli-release');
  const cli = parse(readFileSync(path.join(REPO_ROOT, WORKFLOW_DIR, 'release-cli.yml'), 'utf8'));
  assert.equal(cli.jobs['sign-release-assets'].environment, 'cli-release');
  assert.equal(cli.jobs['sign-release-assets'].if, "github.event_name == 'push'");
  const configureCross = cli.jobs.build.steps.find((step) => step.name === 'Configure cross');
  assert.match(
    configureCross.run,
    /\[target\.aarch64-unknown-linux-gnu\]\nimage = "ghcr\.io\/cross-rs\/aarch64-unknown-linux-gnu@sha256:[0-9a-f]{64}"/,
    'the cross build image is pinned by digest, not by its movable tag',
  );
});

const PROBE_CONTRACT = {
  releaseEnvironments: {
    'cli-release': { tags: ['v-cli-*'] },
    'chrome-web-store': { tags: ['v-ext-*'] },
  },
  signingSecrets: { AGI_CLI_RELEASE_SIGNING_KEY: 'cli-release' },
};

function protectedEnvironment() {
  return {
    can_admins_bypass: false,
    protection_rules: [
      { type: 'required_reviewers', prevent_self_review: false, reviewers: [{ type: 'User' }] },
      { type: 'branch_policy' },
    ],
    deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
  };
}

function protectedSettings() {
  return {
    contract: PROBE_CONTRACT,
    environments: {
      'cli-release': protectedEnvironment(),
      'chrome-web-store': protectedEnvironment(),
    },
    branchPolicies: {
      'cli-release': { branch_policies: [{ name: 'v-cli-*', type: 'tag' }] },
      'chrome-web-store': { branch_policies: [{ name: 'v-ext-*', type: 'tag' }] },
    },
    repositorySecrets: [],
    environmentSecrets: { 'cli-release': ['AGI_CLI_RELEASE_SIGNING_KEY'], 'chrome-web-store': [] },
    rulesets: [
      {
        name: 'release-tags',
        target: 'tag',
        enforcement: 'active',
        conditions: {
          ref_name: { include: ['refs/tags/v-cli-*', 'refs/tags/v-ext-*'], exclude: [] },
        },
        rules: [{ type: 'creation' }, { type: 'update' }, { type: 'deletion' }],
        bypass_actors: [{ actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'always' }],
      },
    ],
  };
}

test('the release probe passes protected settings and refuses each missing protection', () => {
  assert.deepEqual(evaluateReleaseSettings(protectedSettings()).failures, []);

  const cases = [
    [
      (s) => {
        s.environments['cli-release'] = null;
      },
      /cli-release does not exist/,
    ],
    [
      (s) => {
        s.environments['cli-release'].protection_rules = [];
      },
      /has no required reviewer/,
    ],
    [
      (s) => {
        s.environments['cli-release'].can_admins_bypass = true;
      },
      /administrators bypass/,
    ],
    [
      (s) => {
        s.environments['cli-release'].deployment_branch_policy = null;
      },
      /does not restrict deployments/,
    ],
    [
      (s) => {
        s.branchPolicies['cli-release'].branch_policies.push({ name: 'main', type: 'branch' });
      },
      /allows branch main/,
    ],
    [
      (s) => {
        s.branchPolicies['chrome-web-store'].branch_policies = [];
      },
      /lacks the tag policy v-ext-\*/,
    ],
    [
      (s) => {
        s.repositorySecrets.push('AGI_CLI_RELEASE_SIGNING_KEY');
      },
      /is a repository secret/,
    ],
    [
      (s) => {
        s.rulesets = [];
      },
      /no active tag ruleset restricts creation, update, deletion of refs\/tags\/v-cli-\*/,
    ],
    [
      (s) => {
        s.rulesets[0].enforcement = 'disabled';
      },
      /no active tag ruleset/,
    ],
    [
      (s) => {
        s.rulesets[0].rules = [{ type: 'creation' }];
      },
      /restricts update, deletion/,
    ],
  ];
  for (const [mutate, expected] of cases) {
    const settings = protectedSettings();
    mutate(settings);
    const { failures } = evaluateReleaseSettings(settings);
    assert.ok(
      failures.some((failure) => expected.test(failure)),
      `${expected}: ${failures.join(' | ')}`,
    );
  }
});

test('the release probe reads a v-* tag ruleset as covering every release tag', () => {
  assert.equal(
    rulesetCoversRef(
      { conditions: { ref_name: { include: ['refs/tags/v-*'] } } },
      'refs/tags/v-cli-*',
    ),
    true,
  );
  assert.equal(
    rulesetCoversRef(
      { conditions: { ref_name: { include: ['refs/tags/v-*'], exclude: ['refs/tags/v-cli-*'] } } },
      'refs/tags/v-cli-*',
    ),
    false,
  );
  assert.equal(
    rulesetCoversRef(
      { conditions: { ref_name: { include: ['refs/tags/v-desktop-*'] } } },
      'refs/tags/v-cli-*',
    ),
    false,
  );
  assert.equal(
    rulesetCoversRef({ conditions: { ref_name: { include: ['~ALL'] } } }, 'refs/tags/v-ext-*'),
    true,
  );
});
