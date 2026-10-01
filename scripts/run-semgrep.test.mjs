import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import { parse } from 'yaml';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PRODUCER = path.join(ROOT, 'scripts/run-semgrep.py');

function validate(body) {
  const code = `import importlib.util,sys\nsys.dont_write_bytecode=True\nspec=importlib.util.spec_from_file_location('producer',${JSON.stringify(PRODUCER)})\np=importlib.util.module_from_spec(spec)\nspec.loader.exec_module(p)\n${body}\n`;
  return spawnSync('python3', ['-I', '-S', '-B', '-c', code], { encoding: 'utf8', cwd: ROOT });
}

function sdkFixture() {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'semgrep-sdk-owner-')));
  const interpreter = path.join(directory, 'venv', 'bin', 'python');
  const created = spawnSync(
    'python3',
    ['-I', '-S', '-m', 'venv', '--without-pip', path.join(directory, 'venv')],
    { encoding: 'utf8', timeout: 10000 },
  );
  assert.equal(created.status, 0, created.stdout + created.stderr);
  const location = spawnSync(
    interpreter,
    ['-I', '-B', '-c', 'import sysconfig; print(sysconfig.get_path("purelib"))'],
    { encoding: 'utf8' },
  );
  assert.equal(location.status, 0, location.stdout + location.stderr);
  const installed = path.join(location.stdout.trim(), 'semgrep');
  fs.mkdirSync(path.join(installed, 'console_scripts'), { recursive: true });
  fs.mkdirSync(path.join(installed, 'bin'));
  fs.writeFileSync(path.join(installed, '__init__.py'), '__VERSION__="1.0.0"\n');
  fs.writeFileSync(path.join(installed, 'console_scripts', '__init__.py'), '');
  fs.writeFileSync(path.join(installed, 'bin', 'semgrep-core'), '#!/bin/sh\nexit 0\n', {
    mode: 0o755,
  });
  fs.writeFileSync(
    path.join(installed, 'console_scripts', 'entrypoint.py'),
    `import json,pathlib,sys\nimport semgrep\nargs=sys.argv[1:]\nif args==['--version']:\n print(semgrep.__VERSION__)\nelse:\n assert args[0]=='scan'\n output=pathlib.Path(args[args.index('--output')+1])\n output.write_text(json.dumps({'version':semgrep.__VERSION__,'results':[],'fixtureIdentity':{'prefix':sys.prefix,'interpreter':sys.executable,'module':__file__,'isolated':sys.flags.isolated}}))\n`,
  );
  const cwd = path.join(directory, 'source');
  const hostile = path.join(directory, 'hostile');
  fs.mkdirSync(cwd);
  fs.mkdirSync(hostile);
  const marker = path.join(directory, 'hostile-executed');
  const hostileCode = `#!${interpreter}\nimport json,pathlib,sys\npathlib.Path(${JSON.stringify(marker)}).write_text('executed')\nargs=sys.argv[1:]\nif '--output' in args: pathlib.Path(args[args.index('--output')+1]).write_text(json.dumps({'version':'1.0.0','results':[]}))\n`;
  for (const name of ['semgrep', 'python'])
    fs.writeFileSync(path.join(hostile, name), hostileCode, { mode: 0o755 });
  const state = path.join(directory, 'state');
  const output = path.join(directory, 'report.json');
  function run(extra = '') {
    const body = `import importlib.util,sys,json,pathlib\nsys.dont_write_bytecode=True\nspec=importlib.util.spec_from_file_location('producer',${JSON.stringify(PRODUCER)})\np=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)\ndef resolve(configs,version,destination):\n destination.write_text('{"rules":[]}')\n return {'version':version}\np.resolve_bundle=resolve\np.sources=lambda *args: []\np.git=lambda cwd,args: (('a' if args[-1]=='HEAD' else 'b')*40).encode()\n${extra}\nsys.argv=['producer','--expected-version','1.0.0','--config','fixture','--timeout','1','--jobs','1','--state-dir',${JSON.stringify(state)},'--output',${JSON.stringify(output)}]\np.main()\n`;
    return spawnSync(interpreter, ['-I', '-B', '-c', body], {
      cwd,
      encoding: 'utf8',
      timeout: 15000,
      env: { ...process.env, PATH: hostile + path.delimiter + process.env.PATH, PYTHONPATH: cwd },
    });
  }
  return { directory, interpreter, installed, cwd, hostile, marker, state, output, run };
}

test('producer uses the installed interpreter and SDK despite hostile command lookup', () => {
  const fixture = sdkFixture();
  try {
    const result = fixture.run();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.ok(!fs.existsSync(fixture.marker), 'PATH-selected shadow scanner executed');
    const identity = JSON.parse(fs.readFileSync(fixture.output, 'utf8')).fixtureIdentity;
    assert.equal(fs.realpathSync(identity.prefix), path.join(fixture.directory, 'venv'));
    assert.equal(identity.interpreter, fixture.interpreter);
    assert.equal(identity.module, path.join(fixture.installed, 'console_scripts', 'entrypoint.py'));
    assert.equal(identity.isolated, 1);
  } finally {
    fs.rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test('producer ignores source and Python path module shadows', () => {
  const fixture = sdkFixture();
  try {
    const shadow = path.join(fixture.cwd, 'semgrep', 'console_scripts');
    fs.mkdirSync(shadow, { recursive: true });
    fs.writeFileSync(path.join(fixture.cwd, 'semgrep', '__init__.py'), '__VERSION__="1.0.0"\n');
    fs.writeFileSync(path.join(shadow, '__init__.py'), '');
    fs.writeFileSync(
      path.join(shadow, 'entrypoint.py'),
      `import pathlib\npathlib.Path(${JSON.stringify(fixture.marker)}).write_text('executed')\n`,
    );
    const result = fixture.run();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.ok(!fs.existsSync(fixture.marker), 'untrusted module shadow executed');
    assert.equal(
      JSON.parse(fs.readFileSync(fixture.output, 'utf8')).fixtureIdentity.module,
      path.join(fixture.installed, 'console_scripts', 'entrypoint.py'),
    );
  } finally {
    fs.rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test('producer refuses a missing packaged native engine before execution', () => {
  const fixture = sdkFixture();
  try {
    fs.rmSync(path.join(fixture.installed, 'bin', 'semgrep-core'));
    const result = fixture.run();
    assert.notEqual(result.status, 0);
    assert.ok(!fs.existsSync(fixture.marker), 'fallback PATH scanner executed');
    assert.ok(!fs.existsSync(fixture.output));
  } finally {
    fs.rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test('canonical resolver refuses errors, empty rules and duplicate identities', () => {
  const result = validate(`
from types import SimpleNamespace
class Config:
    valid={'fixture': True}
    missed_rule_count=0
    def __init__(self, rules): self.rules=rules
    def get_rules(self, no_rewrite_rule_ids): return [SimpleNamespace(raw=rule) for rule in self.rules]
for config, errors in [(Config([]), []), (Config([{'id':'fixture'}]), [object()]), (Config([{'id':'same'},{'id':'same'}]), [])]:
    try: p.canonical_rules(config, errors)
    except RuntimeError: pass
    else: raise AssertionError('incomplete resolver accepted')
assert p.canonical_rules(Config([{'id':'fixture','pattern':'call()'}]), []) == {'rules':[{'id':'fixture','pattern':'call()'}]}
`);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('local reload refuses changes to rule bodies, order and available coverage', () => {
  const result = validate(`
from types import SimpleNamespace
class Config:
    valid={'fixture': True}
    missed_rule_count=0
    def __init__(self, rules): self.rules=rules
    def get_rules(self, no_rewrite_rule_ids):
        assert no_rewrite_rule_ids is True
        return [SimpleNamespace(raw=rule) for rule in self.rules]
original={'rules':[{'id':'first','pattern':'call()'},{'id':'second','pattern':'other()'}]}
p.verify_roundtrip(original,Config(original['rules']),[])
for changed in [[{'id':'first','pattern':'changed()'},original['rules'][1]], list(reversed(original['rules'])), original['rules'][:1]]:
    try: p.verify_roundtrip(original,Config(changed),[])
    except RuntimeError: pass
    else: raise AssertionError('changed local bundle accepted')
bad=Config(original['rules']);bad.missed_rule_count=1
try: p.verify_roundtrip(original,bad,[])
except RuntimeError: pass
else: raise AssertionError('missed local coverage accepted')
`);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('workflow owns one engine version and uses the canonical producer bundle for the gate', () => {
  const workflow = parse(fs.readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8'));
  const job = workflow.jobs.security;
  assert.match(job.env.SEMGREP_VERSION, /^\d+\.\d+\.\d+$/);
  const scan = job.steps.find((step) => step.id === 'semgrep').run;
  assert.ok(scan.includes('"semgrep==$SEMGREP_VERSION"'));
  assert.ok(scan.includes('python3 scripts/run-semgrep.py'));
  assert.ok(scan.includes('--expected-version "$SEMGREP_VERSION"'));
  for (const config of ['p/security-audit', 'p/typescript', 'p/owasp-top-ten'])
    assert.ok(scan.includes(`--config ${config}`));
  assert.ok(!scan.includes('semgrep scan'));
  const gate = job.steps.find((step) => step.name?.startsWith('Semgrep gate')).run;
  assert.ok(gate.includes('--expected-version "$SEMGREP_VERSION"'));
  assert.ok(gate.includes('--rule-bundle "$RUNNER_TEMP/semgrep-analysis/rules.json"'));
  assert.ok(gate.includes('--source-context "$RUNNER_TEMP/semgrep-analysis/source-context.json"'));
  assert.ok(!scan.includes('--exclude') && !gate.includes('--exclude'));
  assert.ok(!scan.includes('1.178.0') && !gate.includes('1.178.0'));
});

test('producer stops an actual owned subprocess before returning from cleanup', () => {
  const result = validate(`
import subprocess,os,sys
child=subprocess.Popen([sys.executable,'-I','-S','-c','import time; time.sleep(60)'],start_new_session=True)
p.stop_owned(child)
assert child.poll() is not None
try: os.killpg(child.pid,0)
except ProcessLookupError: pass
else: raise AssertionError('owned process group remains alive')
`);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('permanent process observation denial never certifies cleanup', () => {
  const result = validate(`
from types import SimpleNamespace
def denied(*args): raise PermissionError('fixture observation denial')
p.os.killpg=denied
try: p.stop_owned(SimpleNamespace(pid=1_000_000_000,poll=lambda:None))
except PermissionError: pass
else: raise AssertionError('unknown process group falsely certified stopped')
`);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
