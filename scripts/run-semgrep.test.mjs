import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PRODUCER = path.join(ROOT, 'scripts/run-semgrep.py');

function validate(body) {
  const code = `import importlib.util,sys\nsys.dont_write_bytecode=True\nspec=importlib.util.spec_from_file_location('producer',${JSON.stringify(PRODUCER)})\np=importlib.util.module_from_spec(spec)\nspec.loader.exec_module(p)\n${body}\n`;
  return spawnSync('python3', ['-I', '-S', '-B', '-c', code], { encoding: 'utf8', cwd: ROOT });
}

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
