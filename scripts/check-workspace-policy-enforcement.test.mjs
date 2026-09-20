import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CONTRACT_FILE,
  EFFECTIVE_ROUTE_FILE,
  codeActsByControl,
  compareToBaseline,
  declaredPolicyKeys,
  featuresEnforcedIn,
  findUnenforcedKeys,
  invokedCodeActs,
  isEnforcementFile,
  servedFamilies,
} from './lib/workspace-policy-enforcement.mjs';

const CONTRACT = `
export const WORKSPACE_FEATURES = ['browser', 'projects'] as const;

export interface WorkspaceControls {
  featureAccess: WorkspaceFeatureAccess;
  maxReasoningEffort: WorkspaceReasoningEffort | null;
}

export const WORKSPACE_CODE_CONTROL_KEYS = ['allowGithubConnection'] as const;
`;

function tree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'policy-enforcement-'));
  for (const [rel, source] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, source);
  }
  return root;
}

test('the keys are enumerated from the contract, not from a list here', () => {
  assert.deepEqual(declaredPolicyKeys(CONTRACT), [
    { key: 'browser', kind: 'feature' },
    { key: 'projects', kind: 'feature' },
    { key: 'maxReasoningEffort', kind: 'control' },
    { key: 'allowGithubConnection', kind: 'code' },
  ]);
});

test('each of the three server refusal shapes counts as enforcing a feature', () => {
  assert.deepEqual(
    [
      ...featuresEnforcedIn(
        "buildWorkspaceFeatureGateResponse(userId, request, 'projects', 'web')",
      ),
    ],
    ['projects'],
  );
  assert.deepEqual([...featuresEnforcedIn("features.push('browser')")], ['browser']);
  assert.deepEqual(
    [...featuresEnforcedIn('controls.featureAccess.computer_use')],
    ['computer_use'],
  );
});

test('declaring, storing and drawing a control is not enforcing it', () => {
  assert.equal(isEnforcementFile(CONTRACT_FILE), false);
  assert.equal(isEnforcementFile('apps/web/lib/services/organization-policy-service.ts'), false);
  assert.equal(
    isEnforcementFile('apps/web/app/api/settings/organization/policy/code/route.ts'),
    false,
  );
  assert.equal(isEnforcementFile('apps/web/lib/managed-compute-gate.test.ts'), false);
  assert.equal(isEnforcementFile('apps/web/app/api/projects/route.ts'), true);
});

test('a declared key that no server file acts on is reported', () => {
  const root = tree({
    [CONTRACT_FILE]: CONTRACT,
    'apps/web/app/api/projects/route.ts':
      "buildWorkspaceFeatureGateResponse(userId, request, 'projects', 'web');",
    'apps/web/lib/x.ts': 'const maxReasoningEffort = 1;',
  });

  const { unenforced } = findUnenforcedKeys(root);

  assert.deepEqual(unenforced.sort(), ['code:allowGithubConnection', 'feature:browser']);
});

test('a key only the console UI mentions is still unenforced', () => {
  const root = tree({
    [CONTRACT_FILE]: CONTRACT,
    'apps/web/features/workspace-console/CodeControls.tsx': 'draft.allowGithubConnection',
    'apps/web/lib/x.ts': "features.push('browser'); const maxReasoningEffort = 1;",
    'apps/web/app/api/projects/route.ts': "features.push('projects');",
  });

  assert.deepEqual(findUnenforcedKeys(root).unenforced, ['code:allowGithubConnection']);
});

test('a key that gains enforcement fails until it leaves the baseline', () => {
  const baseline = {
    unenforced: {
      'feature:browser': { reason: 'nothing refuses it', enforceIn: 'apps/web/app/api/x/route.ts' },
    },
  };

  assert.deepEqual(compareToBaseline([], baseline, new Set()).fixed, ['feature:browser']);
  assert.deepEqual(compareToBaseline(['feature:browser'], baseline, new Set()).fixed, []);
});

test('a new unenforced key is refused even though others are baselined', () => {
  const baseline = {
    unenforced: {
      'feature:browser': { reason: 'nothing refuses it', enforceIn: 'apps/web/app/api/x/route.ts' },
    },
  };

  const { grown } = compareToBaseline(
    ['feature:browser', 'code:allowMcpServers'],
    baseline,
    new Set(),
  );

  assert.deepEqual(grown, ['code:allowMcpServers']);
});

test('a baseline entry without a reason or a file is refused', () => {
  const withoutReason = { unenforced: { 'feature:browser': { enforceIn: 'a.ts' } } };
  const withoutFile = { unenforced: { 'feature:browser': { reason: 'because' } } };

  assert.deepEqual(compareToBaseline([], withoutReason, new Set()).missingReason, [
    'feature:browser',
  ]);
  assert.deepEqual(compareToBaseline([], withoutFile, new Set()).missingReason, [
    'feature:browser',
  ]);
});

test('a client-honoured exemption is refused unless the server publishes that family', () => {
  const baseline = {
    servedToClients: {
      'code:allowGithubConnection': {
        reason: 'the client honours it',
        servedBy: EFFECTIVE_ROUTE_FILE,
      },
    },
  };

  assert.deepEqual(
    compareToBaseline(['code:allowGithubConnection'], baseline, new Set(['feature'])).unserved,
    ['code:allowGithubConnection'],
  );
  assert.deepEqual(
    compareToBaseline(['code:allowGithubConnection'], baseline, new Set(['code'])).unserved,
    [],
  );
});

test('the published families are read off the effective route, not assumed', () => {
  assert.deepEqual([...servedFamilies('const body = { controls: effective.controls };')].sort(), [
    'control',
    'feature',
  ]);
  assert.ok(servedFamilies('code: effective.code,').has('code'));
  assert.equal(servedFamilies('return NextResponse.json({});').size, 0);
});

const CODE_DECISION = `
const CODE_ACT_TOGGLES = Object.freeze({
  connect_github: 'allowGithubConnection',
  review_pull_request: 'allowAutomatedReview',
});

export function evaluateWorkspaceCodeAct(controls, act) {
  switch (act.act) {
    case 'open_cloud_session': {
      return codeControlOff('allowDesktopCloudSync');
    }
    case 'reach_host': {
      return { allowed: false, control: 'allowedEgressHosts' };
    }
  }
}
`;

test('a Code control is mapped to its acts by the shared decision, table or branch', () => {
  const map = codeActsByControl(CODE_DECISION);

  assert.deepEqual([...(map.get('allowGithubConnection') ?? [])], ['connect_github']);
  assert.deepEqual([...(map.get('allowAutomatedReview') ?? [])], ['review_pull_request']);
  assert.deepEqual([...(map.get('allowDesktopCloudSync') ?? [])], ['open_cloud_session']);
  assert.deepEqual([...(map.get('allowedEgressHosts') ?? [])], ['reach_host']);
});

test('a Code control is enforced only when some route invokes one of its acts', () => {
  const contract = `${CONTRACT}\n${CODE_DECISION}`.replace(
    "export const WORKSPACE_CODE_CONTROL_KEYS = ['allowGithubConnection'] as const;",
    "export const WORKSPACE_CODE_CONTROL_KEYS = ['allowGithubConnection', 'allowedEgressHosts'] as const;",
  );
  const base = {
    [CONTRACT_FILE]: contract,
    'apps/web/lib/x.ts': "features.push('browser'); const maxReasoningEffort = 1;",
    'apps/web/app/api/projects/route.ts': "features.push('projects');",
  };

  assert.deepEqual(findUnenforcedKeys(tree(base)).unenforced.sort(), [
    'code:allowGithubConnection',
    'code:allowedEgressHosts',
  ]);

  const wired = tree({
    ...base,
    'apps/web/app/api/github/start/route.ts': "await gate(db, userId, { act: 'connect_github' });",
  });

  assert.deepEqual(findUnenforcedKeys(wired).unenforced, ['code:allowedEgressHosts']);
});

test('naming the control key at a call site is not enforcement on its own', () => {
  const contract = `${CONTRACT}\n${CODE_DECISION}`;
  const root = tree({
    [CONTRACT_FILE]: contract,
    'apps/web/lib/x.ts': "features.push('browser'); const maxReasoningEffort = 1;",
    'apps/web/app/api/projects/route.ts': "features.push('projects');",
    'apps/web/app/api/github/start/route.ts': 'if (controls.allowGithubConnection) return;',
  });

  assert.deepEqual(findUnenforcedKeys(root).unenforced, ['code:allowGithubConnection']);
});

test('an act nothing maps to leaves its control unenforced', () => {
  assert.deepEqual([...invokedCodeActs("{ act: 'connect_github' }")], ['connect_github']);
  assert.equal(codeActsByControl('export function somethingElse() {}').size, 0);
});
