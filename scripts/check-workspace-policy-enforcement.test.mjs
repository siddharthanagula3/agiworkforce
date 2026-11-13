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
  controlPredicateReads,
  featuresEnforcedIn,
  findUnenforcedKeys,
  invokedCodeActs,
  invokedControlPredicateKeys,
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

test('follows real shared control predicates without crediting imports, strings or shadowed names', () => {
  const contract = `
    export function isRestrictionActive(controls): boolean {
      return controls.countryRestrictionActive;
    }
    export function isCountryAllowed(controls, country): boolean {
      return !isRestrictionActive(controls) || controls.allowedCountries.includes(country);
    }
  `;
  const predicates = controlPredicateReads(contract);
  const imported = "import { isCountryAllowed as permitsCountry } from '@agiworkforce/types';";
  const consumer = `${imported}\nif (!permitsCountry(controls, country)) throw new Error('Denied');`;
  assert.deepEqual([...invokedControlPredicateKeys(consumer, predicates)].sort(), [
    'allowedCountries',
    'countryRestrictionActive',
  ]);
  assert.equal(invokedControlPredicateKeys(imported, predicates).size, 0);
  assert.equal(
    invokedControlPredicateKeys(
      `${imported}\nconst note = 'permitsCountry(controls, country)';`,
      predicates,
    ).size,
    0,
  );
  assert.equal(
    invokedControlPredicateKeys(consumer.replace('@agiworkforce/types', 'untrusted'), predicates)
      .size,
    0,
  );
  assert.equal(
    invokedControlPredicateKeys(
      `${imported}\nfunction decide(permitsCountry) { return permitsCountry(controls, country); }`,
      predicates,
    ).size,
    0,
  );
  const changed = controlPredicateReads(
    contract.replace('controls.allowedCountries.includes(country)', 'true'),
  );
  assert.equal(invokedControlPredicateKeys(consumer, changed).has('allowedCountries'), false);
});

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
  const narrowed =
    'code: {\n  ...effective.code,\n  // note\n  allowMcpServers:\n    effective.code.allowMcpServers &&\n    !(effective.code.mcpRestrictionActive && effective.code.allowedMcpServers.length === 0),\n},';
  assert.ok(servedFamilies(narrowed).has('code'));
  for (const looser of [
    'code: { ...effective.code, allowMcpServers: true },',
    'code: { ...effective.code, allowMcpServers: false },',
    'code: { ...effective.code, allowMcpServers: effective.code.allowMcpServers || flag },',
    'code: { ...effective.code, allowMcpServers: effective.code.allowMcpServers ? true : flag },',
    'code: { ...effective.code, allowMcpServers: effective.code.allowGithubConnection && true },',
    'code: { ...effective.code, allowMcpServers },',
    'code: { ...effective.code, ...other },',
    'code: { ...effective.code, allowMcpServers: effective.code.allowMcpServers && ok, allowedEgressHosts: [] },',
  ]) {
    assert.equal(servedFamilies(looser).has('code'), false, looser);
  }
  assert.equal(servedFamilies('code: effective.code.allowMcpServers,').has('code'), false);
  assert.equal(
    servedFamilies('code: { allowMcpServers: effective.code.allowMcpServers },').size,
    0,
  );
  assert.equal(servedFamilies('return NextResponse.json({});').size, 0);
});

const TOGGLE_CONTRACT = `export const WORKSPACE_CODE_TOGGLE_KEYS = ['allowMcpServers'] as const;`;

const COUNTRY_CONTRACT = `
export const WORKSPACE_FEATURES = [] as const;
export interface WorkspaceControls {
  allowedCountries: readonly string[];
  countryRestrictionActive: boolean;
}
export const WORKSPACE_CODE_CONTROL_KEYS = [] as const;
function restrictionActive(controls) { return controls.countryRestrictionActive; }
export function isWorkspaceCountryAllowed(controls, country) {
  return !restrictionActive(controls) || controls.allowedCountries.includes(country);
}
`;

test('follows an imported country decision into the canonical contract reads', () => {
  const root = tree({
    [CONTRACT_FILE]: COUNTRY_CONTRACT,
    'apps/web/lib/country-decision.ts': `
import { isWorkspaceCountryAllowed as permits } from '@agiworkforce/types';
export function decide(controls, country) { return permits(controls, country); }
`,
  });
  try {
    assert.deepEqual(findUnenforcedKeys(root).unenforced, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

for (const [name, consumer, contract = COUNTRY_CONTRACT] of [
  [
    'an unused imported decision',
    "import { isWorkspaceCountryAllowed } from '@agiworkforce/types'; export function decide() { return true; }",
  ],
  [
    'a shadowing parameter',
    "import { isWorkspaceCountryAllowed } from '@agiworkforce/types'; export function decide(isWorkspaceCountryAllowed) { return isWorkspaceCountryAllowed(); }",
  ],
  [
    'a different module',
    "import { isWorkspaceCountryAllowed } from './other'; export function decide() { return isWorkspaceCountryAllowed(); }",
  ],
  [
    'a type-only import',
    "import type { isWorkspaceCountryAllowed } from '@agiworkforce/types'; export function decide() { return isWorkspaceCountryAllowed(); }",
  ],
  [
    'a commented call',
    "import { isWorkspaceCountryAllowed } from '@agiworkforce/types'; // isWorkspaceCountryAllowed()\nexport function decide() { return true; }",
  ],
  [
    'a string naming the decision',
    "import { isWorkspaceCountryAllowed } from '@agiworkforce/types'; export const note = 'isWorkspaceCountryAllowed()';",
  ],
  [
    'an unused canonical reader',
    "import { isWorkspaceCountryAllowed } from '@agiworkforce/types'; export function decide() { return isWorkspaceCountryAllowed(); }",
    COUNTRY_CONTRACT.replace(
      'return !restrictionActive(controls) || controls.allowedCountries.includes(country);',
      'return true;',
    ),
  ],
]) {
  test(`does not credit ${name} with country enforcement`, () => {
    const root = tree({
      [CONTRACT_FILE]: contract,
      'apps/web/lib/country-decision.ts': consumer,
    });
    try {
      assert.deepEqual(findUnenforcedKeys(root).unenforced.sort(), [
        'control:allowedCountries',
        'control:countryRestrictionActive',
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

test('publishes a restricted code projection while retaining the other code controls', () => {
  const source = `const body = { code: {
    ...effective.code,
    allowMcpServers: effective.code.allowMcpServers &&
      !(effective.code.mcpRestrictionActive && effective.code.allowedMcpServers.length === 0),
  } };`;
  assert.ok(servedFamilies(source, TOGGLE_CONTRACT).has('code'));
});

for (const [name, source] of [
  ['an unrelated spread', 'const body = { code: { ...other.code } };'],
  ['a different family', 'const body = { code: { ...effective.controls } };'],
  ['a later opaque spread', 'const body = { code: { ...effective.code, ...other } };'],
  [
    'a missing boolean',
    'const body = { code: { ...effective.code, allowMcpServers: undefined } };',
  ],
  ['a missing list', 'const body = { code: { ...effective.code, allowedMcpServers: undefined } };'],
  [
    'a list replaced with a boolean',
    'const body = { code: { ...effective.code, allowedMcpServers: effective.code.allowedMcpServers && !blocked } };',
  ],
  [
    'a different toggle as the source',
    'const body = { code: { ...effective.code, allowMcpServers: effective.code.allowGithubConnection && !blocked } };',
  ],
  [
    'an opaque replacement',
    'const body = { code: { ...effective.code, allowMcpServers: decide(effective.code) } };',
  ],
  ['a string containing publication text', 'const note = "code: effective.code";'],
  ['a comment containing publication text', '// code: effective.code\nconst body = {};'],
]) {
  test(`does not credit ${name} as a published code policy`, () => {
    assert.equal(servedFamilies(source, TOGGLE_CONTRACT).has('code'), false);
  });
}

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

test('a Code control the decision maps to no act is enforced where a decision reads it', () => {
  const contract = `${CONTRACT}\n${CODE_DECISION}`.replace(
    "export const WORKSPACE_CODE_CONTROL_KEYS = ['allowGithubConnection'] as const;",
    "export const WORKSPACE_CODE_CONTROL_KEYS = ['sessionRetentionDays'] as const;",
  );
  const base = {
    [CONTRACT_FILE]: contract,
    'apps/web/lib/x.ts': "features.push('browser'); const maxReasoningEffort = 1;",
    'apps/web/app/api/projects/route.ts': "features.push('projects');",
  };

  assert.deepEqual(findUnenforcedKeys(tree(base)).unenforced, ['code:sessionRetentionDays']);

  const wired = tree({
    ...base,
    'apps/web/lib/services/domain-retention-service.ts':
      'const days = controls.sessionRetentionDays;',
  });

  assert.deepEqual(findUnenforcedKeys(wired).unenforced, []);
});

const COUNTRY_CONTRACT = `${CONTRACT.replace(
  '  maxReasoningEffort: WorkspaceReasoningEffort | null;\n',
  '  maxReasoningEffort: WorkspaceReasoningEffort | null;\n  allowedCountries: readonly string[];\n',
)}
export function isWorkspaceCountryAllowed(
  controls: Pick<WorkspaceControls, 'allowedCountries'>,
  country: string | null,
): boolean {
  return controls.allowedCountries.length === 0 || controls.allowedCountries.includes(country ?? '');
}

export function resolveWorkspaceControls(base: WorkspaceControls): WorkspaceControls {
  return { ...base, allowedCountries: base.allowedCountries, maxReasoningEffort: null };
}
`;

const ENFORCED_ELSEWHERE = {
  'apps/web/app/api/projects/route.ts':
    "buildWorkspaceFeatureGateResponse(userId, request, 'projects', 'web'); features.push('browser'); const maxReasoningEffort = 1; act: 'connect_github'",
};

test('a decision that asks the contract predicate enforces the controls the predicate reads', () => {
  const root = tree({
    [CONTRACT_FILE]: COUNTRY_CONTRACT,
    ...ENFORCED_ELSEWHERE,
    'apps/web/lib/services/evaluator.ts':
      "import { isWorkspaceCountryAllowed } from '@agiworkforce/types';\nif (!isWorkspaceCountryAllowed(policy.controls, country)) return deny();",
  });

  assert.equal(findUnenforcedKeys(root).unenforced.includes('control:allowedCountries'), false);
});

test('calling a contract resolver that only merges controls enforces none of them', () => {
  const root = tree({
    [CONTRACT_FILE]: COUNTRY_CONTRACT,
    ...ENFORCED_ELSEWHERE,
    'apps/web/lib/services/merge.ts': 'const merged = resolveWorkspaceControls(policy.controls);',
  });

  assert.ok(findUnenforcedKeys(root).unenforced.includes('control:allowedCountries'));
});
