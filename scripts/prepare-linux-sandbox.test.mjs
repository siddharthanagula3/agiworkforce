import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { parse } from 'yaml';

const root = process.cwd();
const script = path.join(root, 'scripts/prepare-linux-sandbox.py');
const profile = `abi <abi/4.0>,
include <tunables/global>
profile bwrap /usr/bin/bwrap flags=(attach_disconnected) {
  allow capability,
  allow file rwlkm /{**,},
  allow userns,
  allow px /** -> bwrap//&unpriv_bwrap,
  include if exists <local/bwrap-userns-restrict>
}
profile unpriv_bwrap flags=(attach_disconnected) {
  allow file rwlkm /{**,},
  allow pix /** -> &unpriv_bwrap,
  audit deny capability,
  include if exists <local/unpriv_bwrap>
}
`;

function check(expression, value) {
  return spawnSync(
    '/usr/bin/python3',
    [
      '-I',
      '-S',
      '-c',
      `import importlib.util,json,sys
spec=importlib.util.spec_from_file_location('prerequisite',sys.argv[1])
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
value=json.load(sys.stdin)
${expression}
`,
      script,
    ],
    { input: JSON.stringify(value), encoding: 'utf8', timeout: 10_000 },
  );
}

test('packaged policy admits setup and enforces descendant capability denial', () => {
  const accepted = check('module.policy_blocks(value)', profile);
  assert.equal(accepted.status, 0, accepted.stderr);
  for (const mutation of [
    profile.replace('allow capability,', ''),
    profile.replace('allow userns,', ''),
    profile.replace('audit deny capability,', ''),
    profile.replace('audit deny capability,', 'audit deny capability,\n  allow capability,'),
    profile.replace('allow px /** -> bwrap//&unpriv_bwrap,', 'allow ix /**,'),
    profile.replace('allow pix /** -> &unpriv_bwrap,', 'allow ix /**,'),
    profile.replace('/usr/bin/bwrap flags=', '/tmp/bwrap flags='),
    profile.replace('flags=(attach_disconnected)', 'flags=(complain)'),
    profile.replace('flags=(attach_disconnected)', 'flags=(unconfined)'),
    profile.replace('audit deny capability,', '# audit deny capability,'),
  ]) {
    assert.notEqual(check('module.policy_blocks(value)', mutation).status, 0);
  }
});

test('a successful child requires reached network, capability and profile evidence', () => {
  const value = {
    request: { sentinel: 'owned-fixture', port: 12345 },
    parent: { net: 'net:[1]', user: 'user:[1]', mnt: 'mnt:[1]' },
    report: {
      sentinel: 'owned-fixture',
      privateLoopbackReached: true,
      hostListenerBlocked: true,
      namespaces: { net: 'net:[2]', user: 'user:[2]', mnt: 'mnt:[2]' },
      status: { CapEff: '0000000000000000', CapPrm: '0000000000000000', NoNewPrivs: '1' },
      profile: 'bwrap//&unpriv_bwrap (enforce)',
    },
  };
  const expression = "module.validate_child(value['report'],value['request'],value['parent'])";
  assert.equal(check(expression, value).status, 0);
  for (const mutate of [
    (report) => (report.sentinel = 'unrelated'),
    (report) => (report.privateLoopbackReached = false),
    (report) => (report.hostListenerBlocked = false),
    (report) => (report.namespaces.net = 'net:[1]'),
    (report) => (report.status.CapEff = '0000000000001000'),
    (report) => (report.status.CapPrm = '0000000000001000'),
    (report) => (report.status.NoNewPrivs = '0'),
    (report) => (report.profile = 'unconfined'),
    (report) => (report.profile = 'bwrap//&unpriv_bwrap (complain)'),
  ]) {
    const changed = JSON.parse(JSON.stringify(value));
    mutate(changed.report);
    assert.notEqual(check(expression, changed).status, 0);
  }
});

test('output collection drains and rejects oversized children', () => {
  const accepted = check(
    "result=module.command([sys.executable,'-I','-S','-c','print(\"reached\")']);module.require(result.returncode==0 and result.stdout==b'reached\\n','Positive child required')",
    null,
  );
  assert.equal(accepted.status, 0, accepted.stderr);
  const oversized = check(
    "module.command([sys.executable,'-I','-S','-c','import sys;sys.stdout.write(\"x\"*1048577)'])",
    null,
  );
  assert.notEqual(oversized.status, 0);
  assert.match(oversized.stderr, /Bounded prerequisite command output required/);
});

test('closed pipes cannot qualify a surviving or unobservable process group', () => {
  const survived = check(
    `original=module.os.killpg
def simulated_survivor(pid, action):
    if action == 0:
        return
    return original(pid, action)
module.os.killpg=simulated_survivor
module.command([sys.executable,'-I','-S','-c','print("reached")'])`,
    null,
  );
  assert.notEqual(survived.status, 0);
  assert.match(survived.stderr, /Prerequisite command process group must be absent/);
  const unobservable = check(
    `def unknown_group(pid, action):
    raise PermissionError('owned fixture')
module.os.killpg=unknown_group
module.require_stopped_group(12345)`,
    null,
  );
  assert.notEqual(unobservable.status, 0);
  assert.match(unobservable.stderr, /PermissionError/);
});

test('an existing reached policy is reused and conflicts fail closed', () => {
  const working = {
    exit: 0,
    childReached: true,
    networkIsolated: true,
    childCapabilitiesEmpty: true,
    childProfileEnforced: true,
  };
  const loaded = 'bwrap (enforce)\nunpriv_bwrap (enforce)\n';
  const expression =
    "result=module.preparation_action(value['before'],value['loaded'].encode());module.require(result==value['expected'],'Exact policy action required')";
  assert.equal(check(expression, { before: working, loaded, expected: 'reuse' }).status, 0);
  assert.equal(
    check(expression, {
      before: { exit: 1, loopbackSetupDenied: true },
      loaded: '',
      expected: 'add',
    }).status,
    0,
  );
  for (const value of [
    { before: { ...working, childReached: false }, loaded },
    { before: working, loaded: 'bwrap (complain)\nunpriv_bwrap (enforce)\n' },
    { before: working, loaded: 'unrelated (enforce)\n' },
    { before: { exit: 1, loopbackSetupDenied: true }, loaded },
    { before: { exit: 1, loopbackSetupDenied: false }, loaded: '' },
  ]) {
    assert.notEqual(check(expression, { ...value, expected: 'reuse' }).status, 0);
  }
});

test('linux setup reaches the prerequisite before unchanged native tests', () => {
  const workflow = parse(fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8'));
  const job = workflow.jobs['rust-desktop-cli'];
  const setup = job.steps.findIndex((step) => step.name === 'Prepare unprivileged Linux sandbox');
  const install = job.steps.findIndex(
    (step) => step.name === 'Install system dependencies (Linux)',
  );
  const native = job.steps.findIndex(
    (step) => step.name === 'Test (apps/desktop + apps/cli + shared crates, default features)',
  );
  assert.equal(job['runs-on'], 'ubuntu-24.04');
  assert.ok(install >= 0 && setup > install && native > setup);
  assert.match(
    job.steps[install].run,
    /apt-get install[^\n]*\bapparmor-profiles\b[^\n]*\bbubblewrap\b/,
  );
  assert.equal(job.steps[setup].run, '/usr/bin/python3 -I -S scripts/prepare-linux-sandbox.py');
  assert.equal(job.steps[setup]['continue-on-error'], undefined);
  assert.equal(job.steps[setup].if, undefined);
  assert.match(
    job.steps[native].run,
    /xvfb-run --auto-servernum cargo test --locked -p agiworkforce-cli\n/,
  );
  assert.doesNotMatch(job.steps[native].run, /sudo|--skip/);
});
