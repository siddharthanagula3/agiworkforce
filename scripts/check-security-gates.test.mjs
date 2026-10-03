import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

import {
  checkSecurityGates,
  collectContinueOnErrorSteps,
  parseDenyAdvisoryIgnores,
  pnpmPatchHash,
} from './check-security-gates.mjs';

const repositoryRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const policy = JSON.parse(
  fs.readFileSync(path.join(repositoryRoot, '.github/security-gate-policy.json'), 'utf8'),
);
const workflow = parse(fs.readFileSync(path.join(repositoryRoot, policy.workflow), 'utf8'));
const denyToml = fs.readFileSync(path.join(repositoryRoot, 'deny.toml'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
const lockfile = parse(fs.readFileSync(path.join(repositoryRoot, 'pnpm-lock.yaml'), 'utf8'));
const patchContents = Object.fromEntries(
  (policy.exclusions ?? [])
    .filter((entry) => entry.patch?.path)
    .map((entry) => [
      entry.patch.path,
      fs.readFileSync(path.join(repositoryRoot, entry.patch.path)),
    ]),
);

function repositoryFailures(options) {
  return checkSecurityGates({ patchContents, ...options });
}

// Gates that name their own workflow, the scanners that need Docker and a booted
// application, are loaded the same way the script loads them.
const workflows = Object.fromEntries(
  [...new Set((policy.gates ?? []).map((gate) => gate.workflow).filter(Boolean))].map(
    (relativePath) => [
      relativePath,
      parse(fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8')),
    ],
  ),
);

const WAIVER_TODAY = '2026-10-01';
const WAIVER_ADVISORY = 'GHSA-0000-0000-0000';

function scopedLockfile() {
  return {
    importers: {
      '.': { devDependencies: { prettier: { specifier: '^3.0.0', version: '3.0.0' } } },
      'apps/mobile': {
        dependencies: { 'mobile-kit': { specifier: '^1.0.0', version: '1.0.0' } },
        devDependencies: { 'build-tool': { specifier: '^3.0.0', version: '3.0.0' } },
      },
      'apps/web': { dependencies: { 'web-kit': { specifier: '^2.0.0', version: '2.0.0' } } },
      'packages/shared': { dependencies: {} },
    },
    snapshots: {
      'prettier@3.0.0': {},
      'mobile-kit@1.0.0': { dependencies: { 'build-tool': '3.0.0' } },
      'build-tool@3.0.0': { dependencies: { 'waived-package': '1.4.0' } },
      'web-kit@2.0.0': {},
      'waived-package@1.4.0': {},
    },
  };
}

function auditWaiverFailures({
  entry = {},
  lockfile: scenario = scopedLockfile(),
  today = WAIVER_TODAY,
  ignores = [WAIVER_ADVISORY],
} = {}) {
  const waived = structuredClone(policy);
  waived.exclusions = waived.exclusions.filter(
    (existing) => existing.kind !== 'pnpm-audit-advisory-ignore',
  );
  waived.exclusions.push({
    id: 'scoped-audit-waiver',
    kind: 'pnpm-audit-advisory-ignore',
    advisories: ['GHSA-0000-0000-0000'],
    package: 'waived-package',
    dependents: { packages: ['build-tool'], importers: ['apps/mobile'] },
    reason: 'Reachable only from build tooling.',
    owner: 'Platform lead',
    tracking: 'GHSA-0000-0000-0000',
    expires: '2026-10-31',
    ...entry,
  });
  const ignoring = structuredClone(manifest);
  ignoring.pnpm.auditConfig = {
    ...ignoring.pnpm.auditConfig,
    ignoreGhsas: ignores,
  };
  return repositoryFailures({
    policy: waived,
    workflow,
    denyToml,
    workflows,
    manifest: ignoring,
    lockfile: scenario,
    today,
  });
}

test('every CI exclusion is registered with a reason, an owner, and a tracking id', () => {
  assert.deepEqual(
    repositoryFailures({ policy, workflow, denyToml, workflows, manifest, lockfile }),
    [],
  );
});

test('the registry accounts for exactly the exclusions CI actually has', () => {
  const found = collectContinueOnErrorSteps(workflow);
  const registered = (policy.exclusions ?? []).filter(
    (entry) => entry.kind === 'continue-on-error',
  );
  assert.equal(found.length, registered.length);
});

test('a new continue-on-error step nobody registered fails the build', () => {
  const drifted = structuredClone(workflow);
  drifted.jobs.security.steps.push({
    name: 'Dependency audit (JS), quietly not blocking',
    run: 'pnpm audit',
    'continue-on-error': true,
  });
  const failures = repositoryFailures({
    policy,
    workflow: drifted,
    denyToml,
    workflows,
    manifest,
    lockfile,
  });
  assert.deepEqual(failures, [
    'security step "Dependency audit (JS), quietly not blocking" is continue-on-error but is not registered in .github/security-gate-policy.json',
  ]);
});

test('turning a documented blocking gate into a warning fails the build', () => {
  const drifted = structuredClone(workflow);
  const step = drifted.jobs.security.steps.find(
    (candidate) => candidate.name === 'Dependency audit (JS), high (blocking, FIX-043)',
  );
  step['continue-on-error'] = true;
  const failures = repositoryFailures({
    policy,
    workflow: drifted,
    denyToml,
    workflows,
    manifest,
    lockfile,
  });
  assert.ok(
    failures.some((message) =>
      message.includes('js-dependency-audit-high is registered as blocking'),
    ),
  );
});

test('an exclusion left behind after the step starts blocking is reported as stale', () => {
  const drifted = structuredClone(workflow);
  const step = drifted.jobs['rust-desktop-cli'].steps.find(
    (candidate) =>
      candidate.name === 'Dependency advisories (Rust), non-blocking warning-policy debt',
  );
  delete step['continue-on-error'];
  const failures = repositoryFailures({
    policy,
    workflow: drifted,
    denyToml,
    workflows,
    manifest,
    lockfile,
  });
  assert.ok(failures.some((message) => message.includes('is stale')));
});

test('an unregistered cargo-deny advisory ignore fails the build', () => {
  const drifted = `${denyToml}\n[advisories]\nignore = ["RUSTSEC-2000-0001"]\n`;
  const failures = repositoryFailures({
    policy,
    workflow,
    denyToml: drifted,
    workflows,
    manifest,
    lockfile,
  });
  assert.ok(failures.some((message) => message.includes('RUSTSEC-2000-0001')));
});

test('the checked-in cargo-deny advisory policy suppresses no vulnerabilities', () => {
  assert.deepEqual(parseDenyAdvisoryIgnores(denyToml), []);
});

test('a pnpm audit ignore nobody registered fails the build', () => {
  const drifted = structuredClone(manifest);
  drifted.pnpm.auditConfig = {
    ...drifted.pnpm.auditConfig,
    ignoreGhsas: [...(drifted.pnpm.auditConfig?.ignoreGhsas ?? []), 'GHSA-0000-0000-0000'],
  };
  const failures = repositoryFailures({
    policy,
    workflow,
    denyToml,
    workflows,
    manifest: drifted,
    lockfile,
    today: WAIVER_TODAY,
  });
  assert.deepEqual(failures, [
    'package.json ignores GHSA-0000-0000-0000 without registering it in .github/security-gate-policy.json',
  ]);
});

test('a pnpm audit waiver fails the build once it expires', () => {
  assert.deepEqual(auditWaiverFailures({ entry: { expires: '2026-01-01' }, today: '2026-01-02' }), [
    'exclusion scoped-audit-waiver expired on 2026-01-01: fix the advisory or re-triage the waiver',
  ]);
});

test('a waiver whose expiry is not a real calendar date fails the build', () => {
  for (const expires of ['2026-13-99', '2026-02-30']) {
    assert.deepEqual(auditWaiverFailures({ entry: { expires }, today: '2026-12-31' }), [
      'exclusion scoped-audit-waiver must set expires to a real calendar date in YYYY-MM-DD form',
    ]);
  }
});

test('a day-month typo in the expiry does not keep the waiver alive', () => {
  assert.deepEqual(auditWaiverFailures({ entry: { expires: '2026-31-10' }, today: '2026-12-31' }), [
    'exclusion scoped-audit-waiver must set expires to a real calendar date in YYYY-MM-DD form',
  ]);
});

test('a waiver left registered after package.json stops ignoring it is reported as stale', () => {
  assert.deepEqual(auditWaiverFailures({ ignores: [] }), [
    'exclusion scoped-audit-waiver is stale: package.json no longer ignores GHSA-0000-0000-0000',
  ]);
});

test('a waiver whose dependents and importers match the lockfile passes', () => {
  assert.deepEqual(auditWaiverFailures(), []);
});

test('a waiver that names no package or permitted dependents fails the build', () => {
  assert.deepEqual(auditWaiverFailures({ entry: { package: undefined, dependents: undefined } }), [
    'exclusion scoped-audit-waiver must name the waived package and the dependents and importers allowed to reach it',
  ]);
});

test('a waiver whose package name matches nothing in the lockfile fails the build', () => {
  assert.deepEqual(auditWaiverFailures({ entry: { package: 'waived-packag' } }), [
    'exclusion scoped-audit-waiver waives waived-packag, which pnpm-lock.yaml does not contain; correct the name or delete the waiver',
  ]);
});

test('a waiver whose package has left the lockfile fails the build', () => {
  const drifted = scopedLockfile();
  delete drifted.snapshots['waived-package@1.4.0'];
  delete drifted.snapshots['build-tool@3.0.0'].dependencies['waived-package'];
  assert.deepEqual(auditWaiverFailures({ lockfile: drifted }), [
    'exclusion scoped-audit-waiver waives waived-package, which pnpm-lock.yaml does not contain; correct the name or delete the waiver',
  ]);
});

test('a dependency the lockfile has no snapshot for fails the walk instead of ending it', () => {
  const drifted = scopedLockfile();
  drifted.snapshots['mobile-kit@1.0.0'].dependencies.ghost = '1.0.0';
  assert.deepEqual(auditWaiverFailures({ lockfile: drifted }), [
    'exclusion scoped-audit-waiver cannot finish its walk: pnpm-lock.yaml reaches ghost@1.0.0 but has no snapshot for it',
  ]);
});

test('a waiver cannot be scoped without the lockfile', () => {
  assert.deepEqual(auditWaiverFailures({ lockfile: null }), [
    'exclusion scoped-audit-waiver cannot be scoped without the importers and snapshots of pnpm-lock.yaml',
  ]);
});

test('a new parent of the waived package fails the build', () => {
  const drifted = scopedLockfile();
  drifted.importers['apps/web'].dependencies.selfsigned = { specifier: '^2.4.1', version: '2.4.1' };
  drifted.snapshots['selfsigned@2.4.1'] = { dependencies: { 'waived-package': '1.4.0' } };
  assert.deepEqual(auditWaiverFailures({ lockfile: drifted }), [
    'exclusion scoped-audit-waiver waives waived-package for build-tool only, but selfsigned also depends on it in pnpm-lock.yaml',
    'exclusion scoped-audit-waiver waives waived-package for apps/mobile only, but apps/web also reaches it in pnpm-lock.yaml',
  ]);
});

test('a parent that depends on the waived package through an alias fails the build', () => {
  const drifted = scopedLockfile();
  drifted.snapshots['mobile-kit@1.0.0'].dependencies['forge-alias'] = 'waived-package@1.4.0';
  assert.deepEqual(auditWaiverFailures({ lockfile: drifted }), [
    'exclusion scoped-audit-waiver waives waived-package for build-tool only, but mobile-kit also depends on it in pnpm-lock.yaml',
  ]);
});

test('an allowed importer that depends on the waived package directly fails the build', () => {
  const drifted = scopedLockfile();
  drifted.importers['apps/mobile'].dependencies['waived-package'] = {
    specifier: '^1.4.0',
    version: '1.4.0',
  };
  assert.deepEqual(auditWaiverFailures({ lockfile: drifted }), [
    'exclusion scoped-audit-waiver waives waived-package for build-tool only, but apps/mobile also depends on it in pnpm-lock.yaml',
  ]);
});

test('an allowed importer that aliases the waived package fails the build', () => {
  const drifted = scopedLockfile();
  drifted.importers['apps/mobile'].dependencies.rsa = {
    specifier: 'npm:waived-package@1.4.0',
    version: 'waived-package@1.4.0',
  };
  assert.deepEqual(auditWaiverFailures({ lockfile: drifted }), [
    'exclusion scoped-audit-waiver waives waived-package for build-tool only, but apps/mobile also depends on it in pnpm-lock.yaml',
  ]);
});

test('an importer listed as a permitted dependent may depend on the waived package directly', () => {
  const drifted = scopedLockfile();
  drifted.importers['apps/mobile'].dependencies['waived-package'] = {
    specifier: '^1.4.0',
    version: '1.4.0',
  };
  const dependents = { packages: ['apps/mobile', 'build-tool'], importers: ['apps/mobile'] };
  assert.deepEqual(auditWaiverFailures({ lockfile: drifted, entry: { dependents } }), []);
});

test('another importer reaching the waived package through a permitted dependent fails the build', () => {
  const drifted = scopedLockfile();
  drifted.importers['packages/shared'].dependencies['build-tool'] = {
    specifier: '^3.0.0',
    version: '3.0.0',
  };
  drifted.importers['apps/web'].dependencies['@example/shared'] = {
    specifier: 'workspace:*',
    version: 'link:../../packages/shared',
  };
  assert.deepEqual(auditWaiverFailures({ lockfile: drifted }), [
    'exclusion scoped-audit-waiver waives waived-package for apps/mobile only, but apps/web also reaches it in pnpm-lock.yaml',
    'exclusion scoped-audit-waiver waives waived-package for apps/mobile only, but packages/shared also reaches it in pnpm-lock.yaml',
  ]);
});

const PATCH_CONTENT =
  'diff --git a/index.js b/index.js\n--- a/index.js\n+++ b/index.js\n@@ -1 +1 @@\n-module.exports = unsafe;\n+module.exports = safe;\n';
const PATCH_SHA256 = 'd7ca6c69871ab0e5fdd9f23b06e7f451d194d59839fc3780f8e8a17fcaa78292';
const PATCH_HASH = 'auhunmvbregeblouyq5ebm56ba';
const PATCH_BINDINGS = [
  { advisory: 'GHSA-ch52-4w7c-c8xp', package: 'http-cache-semantics', version: '4.2.0' },
  { advisory: 'GHSA-vfj7-8cjw-p6xm', package: 'braces', version: '3.0.3' },
];

function patchedScenario(binding = PATCH_BINDINGS[0]) {
  const key = `${binding.package}@${binding.version}`;
  const patchPath = `patches/${key}.patch`;
  const reference = `${binding.version}(patch_hash=${PATCH_HASH})`;
  return {
    policy: {
      gates: [],
      exclusions: [
        {
          id: 'patched-advisory',
          kind: 'pnpm-audit-advisory-ignore',
          advisories: [binding.advisory],
          package: binding.package,
          reason: 'Published advisory has no fixed registry release; source is patched.',
          owner: 'Security lead',
          tracking: binding.advisory,
          expires: '2026-10-31',
          dependents: { packages: ['build-tool'], importers: ['apps/mobile'] },
          patch: { version: binding.version, path: patchPath, sha256: PATCH_SHA256 },
        },
      ],
    },
    workflow: { jobs: {} },
    denyToml: '',
    manifest: {
      pnpm: {
        auditConfig: { ignoreGhsas: [binding.advisory] },
        patchedDependencies: { [key]: patchPath },
      },
    },
    lockfile: {
      patchedDependencies: { [key]: { hash: PATCH_HASH, path: patchPath } },
      packages: { 'build-tool@1.0.0': {}, [key]: {} },
      importers: { 'apps/mobile': { devDependencies: { 'build-tool': { version: '1.0.0' } } } },
      snapshots: {
        'build-tool@1.0.0': { dependencies: { [binding.package]: reference } },
        [`${binding.package}@${reference}`]: {},
      },
    },
    patchContents: { [patchPath]: PATCH_CONTENT },
    today: WAIVER_TODAY,
  };
}

test('pnpm 9 base32 MD5 patch hash matches an independent vector and all existing lock pairs', () => {
  assert.equal(pnpmPatchHash(PATCH_CONTENT), PATCH_HASH);
  for (const patch of Object.values(lockfile.patchedDependencies)) {
    assert.equal(pnpmPatchHash(fs.readFileSync(path.join(repositoryRoot, patch.path))), patch.hash);
  }
});

for (const binding of PATCH_BINDINGS) {
  const key = `${binding.package}@${binding.version}`;
  const patchPath = `patches/${key}.patch`;
  const patchedKey = `${key}(patch_hash=${PATCH_HASH})`;
  const positive = () => patchedScenario(binding);
  const fails = (mutate, pattern) => {
    const scenario = positive();
    mutate(scenario);
    assert.ok(checkSecurityGates(scenario).some((message) => pattern.test(message)));
  };

  test(`${binding.advisory} accepts only a fully bound, patched and scoped package`, () => {
    assert.deepEqual(checkSecurityGates(positive()), []);
    const withPeer = positive();
    withPeer.lockfile.snapshots[`peer-tool@1.0.0(${patchedKey})`] = {};
    assert.deepEqual(checkSecurityGates(withPeer), []);
    const withNpmAlias = positive();
    withNpmAlias.lockfile.snapshots['build-tool@1.0.0'].dependencies[binding.package] =
      `npm:${patchedKey}`;
    assert.deepEqual(checkSecurityGates(withNpmAlias), []);
  });

  test(`${binding.advisory} rejects missing or modified patch bytes`, () => {
    fails((scenario) => {
      scenario.patchContents = {};
    }, /missing patch contents/u);
    fails((scenario) => {
      scenario.patchContents[patchPath] += '\n';
    }, /registered SHA256/u);
    fails((scenario) => {
      scenario.patchContents = null;
    }, /missing patch contents/u);
  });

  test(`${binding.advisory} rejects removed metadata and downgraded waiver kinds`, () => {
    fails((scenario) => {
      delete scenario.policy.exclusions[0].patch;
    }, /must pin patch/u);
    fails((scenario) => {
      scenario.policy.exclusions[0].kind = 'allowlist-file';
    }, /must remain a patched/u);
  });

  test(`${binding.advisory} rejects a wrong advisory, package, version or patch path`, () => {
    fails((scenario) => {
      scenario.policy.exclusions[0].advisories = [WAIVER_ADVISORY];
    }, /must bind/u);
    fails((scenario) => {
      scenario.policy.exclusions[0].package = 'node-forge';
    }, /must bind/u);
    fails((scenario) => {
      scenario.policy.exclusions[0].patch.version = '99.0.0';
    }, /must pin patch/u);
    fails((scenario) => {
      scenario.policy.exclusions[0].patch.path = 'patches/another.patch';
    }, /must pin patch/u);
    fails((scenario) => {
      scenario.policy.exclusions[0].patch.sha256 = 'not-a-digest';
    }, /must pin patch/u);
  });

  test(`${binding.advisory} rejects missing, wrong or broader manifest patch selectors`, () => {
    fails((scenario) => {
      delete scenario.manifest.pnpm.patchedDependencies[key];
    }, /package.json pnpm.patchedDependencies/u);
    fails((scenario) => {
      scenario.manifest.pnpm.patchedDependencies[key] = 'patches/wrong.patch';
    }, /package.json pnpm.patchedDependencies/u);
    fails((scenario) => {
      scenario.manifest.pnpm.patchedDependencies[binding.package] = patchPath;
    }, /broader or different package.json/u);
  });

  test(`${binding.advisory} rejects missing or mismatched lock patch records`, () => {
    fails((scenario) => {
      delete scenario.lockfile.patchedDependencies[key];
    }, /pnpm-lock.yaml patchedDependencies/u);
    fails((scenario) => {
      scenario.lockfile.patchedDependencies[key].path = 'patches/wrong.patch';
    }, /pnpm-lock.yaml patchedDependencies/u);
    fails((scenario) => {
      scenario.lockfile.patchedDependencies[key].hash = 'wrong';
    }, /pnpm-lock.yaml patchedDependencies/u);
    fails((scenario) => {
      scenario.lockfile.patchedDependencies[binding.package] =
        scenario.lockfile.patchedDependencies[key];
    }, /broader or different pnpm-lock.yaml/u);
  });

  test(`${binding.advisory} rejects any unpatched second snapshot or package version`, () => {
    fails((scenario) => {
      scenario.lockfile.snapshots[key] = {};
    }, /without version.*patch_hash/u);
    fails((scenario) => {
      scenario.lockfile.packages[`${binding.package}@1.0.0`] = {};
    }, /requires exactly/u);
    fails((scenario) => {
      delete scenario.lockfile.snapshots[patchedKey];
    }, /no patched.*snapshot/u);
    fails((scenario) => {
      scenario.lockfile.snapshots[`${key}(patch_hash=wrong)`] = {};
    }, /without version.*patch_hash/u);
    fails((scenario) => {
      scenario.lockfile.snapshots[`${binding.package}@`] = {};
    }, /without version.*patch_hash/u);
    fails((scenario) => {
      scenario.lockfile.snapshots[`${patchedKey}(patch_hash=wrong)`] = {};
    }, /without version.*patch_hash/u);
  });

  test(`${binding.advisory} rejects unpatched consumers including aliases and peer contexts`, () => {
    fails((scenario) => {
      scenario.lockfile.snapshots['build-tool@1.0.0'].dependencies[binding.package] =
        binding.version;
    }, /without version.*patch_hash/u);
    fails((scenario) => {
      scenario.lockfile.snapshots['build-tool@1.0.0'].optionalDependencies = { alias: key };
    }, /without version.*patch_hash/u);
    fails((scenario) => {
      scenario.lockfile.importers['apps/mobile'].dependencies = { alias: { version: key } };
    }, /without version.*patch_hash/u);
    fails((scenario) => {
      scenario.lockfile.snapshots[`peer-tool@1.0.0(${key})`] = {};
    }, /without version.*patch_hash/u);
  });

  test(`${binding.advisory} rejects malformed suffixes and unbalanced peer references`, () => {
    fails((scenario) => {
      delete scenario.lockfile.snapshots[patchedKey];
      scenario.lockfile.snapshots[`${patchedKey}garbage`] = {};
      scenario.lockfile.snapshots['build-tool@1.0.0'].dependencies[binding.package] =
        `${binding.version}(patch_hash=${PATCH_HASH})garbage`;
    }, /malformed pnpm reference/u);
    for (const reference of [
      `peer-tool@1.0.0(${patchedKey}`,
      `peer-tool@1.0.0(${patchedKey}garbage)`,
      `peer-tool@1.0.0(${patchedKey}))`,
      `${patchedKey}(peer-tool@1.0.0)(patch_hash=${PATCH_HASH})`,
      `${patchedKey}()`,
    ]) {
      fails((scenario) => {
        scenario.lockfile.snapshots[reference] = {};
      }, /malformed pnpm reference/u);
    }
  });

  test(`${binding.advisory} rejects an unpatched npm alias even with matching forged lock records`, () => {
    fails((scenario) => {
      scenario.lockfile.snapshots['build-tool@1.0.0'].dependencies.alias = `npm:${key}`;
      scenario.lockfile.snapshots[`npm:${key}`] = {};
      scenario.lockfile.packages[`npm:${key}`] = {};
    }, /without version.*patch_hash/u);
    fails((scenario) => {
      scenario.lockfile.snapshots[`npm:${patchedKey}`] = {};
    }, /malformed pnpm reference/u);
  });

  test(`${binding.advisory} requires actual package and snapshot metadata`, () => {
    fails((scenario) => {
      scenario.lockfile.snapshots[patchedKey] = null;
    }, /requires snapshot metadata/u);
    fails((scenario) => {
      scenario.lockfile.packages[key] = null;
    }, /requires package metadata/u);
  });

  test(`${binding.advisory} rejects stale expiry, missing owner and broader dependent scopes`, () => {
    fails((scenario) => {
      scenario.policy.exclusions[0].expires = '2026-09-30';
    }, /expired/u);
    fails((scenario) => {
      delete scenario.policy.exclusions[0].owner;
    }, /must state a owner/u);
    fails((scenario) => {
      scenario.policy.exclusions[0].dependents.packages.push('future-consumer');
    }, /broader dependent packages scope/u);
    fails((scenario) => {
      scenario.policy.exclusions[0].dependents.importers.push('apps/web');
    }, /broader dependent importers scope/u);
    fails((scenario) => {
      scenario.lockfile.importers['apps/web'] = {
        dependencies: { 'build-tool': { version: '1.0.0' } },
      };
    }, /apps\/web also reaches/u);
  });
}

function runPatchFileScenario(t, mutate) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'security-gate-patch-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const root = path.join(temporary, 'repository');
  const scenario = patchedScenario();
  scenario.policy.workflow = '.github/ci.yml';
  const patchPath = scenario.policy.exclusions[0].patch.path;
  for (const [relativePath, contents] of [
    ['.github/security-gate-policy.json', JSON.stringify(scenario.policy)],
    ['.github/ci.yml', JSON.stringify(scenario.workflow)],
    ['package.json', JSON.stringify(scenario.manifest)],
    ['pnpm-lock.yaml', JSON.stringify(scenario.lockfile)],
    ['deny.toml', ''],
    [patchPath, PATCH_CONTENT],
  ]) {
    const absolute = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, contents);
  }
  mutate?.({ root, temporary, patchPath, scenario });
  fs.writeFileSync(
    path.join(root, '.github/security-gate-policy.json'),
    JSON.stringify(scenario.policy),
  );
  return spawnSync(
    process.execPath,
    [path.join(repositoryRoot, 'scripts/check-security-gates.mjs')],
    { cwd: root, encoding: 'utf8' },
  );
}

test('the main wrapper reads a regular in-root patch into the pure guard', (t) => {
  const result = runPatchFileScenario(t);
  assert.equal(result.status, 0, result.stderr);
});

test('the main wrapper rejects missing patch files', (t) => {
  const result = runPatchFileScenario(t, ({ root, patchPath }) =>
    fs.unlinkSync(path.join(root, patchPath)),
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /missing or unreadable/u);
});

test('the main wrapper rejects a directory in place of a patch file', (t) => {
  const result = runPatchFileScenario(t, ({ root, patchPath }) => {
    fs.unlinkSync(path.join(root, patchPath));
    fs.mkdirSync(path.join(root, patchPath));
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /must be a regular file/u);
});

test('the main wrapper rejects lexical root escapes and absolute patch paths', (t) => {
  for (const relativePath of [
    '../outside.patch',
    '/tmp/outside.patch',
    'patches/../outside.patch',
    'patches\\outside.patch',
  ]) {
    const result = runPatchFileScenario(t, ({ scenario }) => {
      scenario.policy.exclusions[0].patch.path = relativePath;
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /normalized in-root patch path/u);
  }
});

test('the main wrapper rejects a patch symlink that resolves outside the repository', (t) => {
  const result = runPatchFileScenario(t, ({ root, temporary, patchPath }) => {
    const outside = path.join(temporary, 'outside.patch');
    fs.writeFileSync(outside, PATCH_CONTENT);
    fs.unlinkSync(path.join(root, patchPath));
    fs.symlinkSync(outside, path.join(root, patchPath));
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /resolves outside the repository root/u);
});

test('the main wrapper rejects an in-root symlink in place of the patch file', (t) => {
  const result = runPatchFileScenario(t, ({ root, patchPath }) => {
    const target = path.join(root, 'real.patch');
    fs.writeFileSync(target, PATCH_CONTENT);
    fs.unlinkSync(path.join(root, patchPath));
    fs.symlinkSync(target, path.join(root, patchPath));
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /must be a regular file/u);
});
