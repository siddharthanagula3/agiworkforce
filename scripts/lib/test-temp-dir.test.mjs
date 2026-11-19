import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const HELPER = new URL('./test-temp-dir.mjs', import.meta.url).href;

function runInIsolatedTemp(t, source) {
  const isolated = mkdtempSync(join(tmpdir(), 'agi-test-temp-dir-'));
  t.after(() => rmSync(isolated, { recursive: true, force: true }));
  const printed = execFileSync(process.execPath, ['--input-type=module', '-e', source], {
    env: { ...process.env, TMPDIR: isolated },
    encoding: 'utf8',
  });
  return { isolated, printed: printed.trim().split('\n') };
}

test('folders made for a test are gone once its process exits', (t) => {
  const { isolated, printed } = runInIsolatedTemp(
    t,
    `import fs from 'node:fs';
import { makeTempDir } from ${JSON.stringify(HELPER)};
const first = makeTempDir('fixture-');
const second = makeTempDir('fixture-');
fs.writeFileSync(first + '/file.txt', 'fixture');
console.log(first);
console.log(second);`,
  );

  assert.equal(printed.length, 2);
  for (const dir of printed) {
    assert.ok(dir.startsWith(isolated), `${dir} was not made in the temp folder`);
    assert.equal(existsSync(dir), false);
  }
  assert.deepEqual(readdirSync(isolated), []);
});

test('a folder the test already removed does not stop the cleanup', (t) => {
  const { isolated } = runInIsolatedTemp(
    t,
    `import fs from 'node:fs';
import { makeTempDir } from ${JSON.stringify(HELPER)};
fs.rmSync(makeTempDir('removed-'), { recursive: true });
makeTempDir('kept-until-exit-');`,
  );

  assert.deepEqual(readdirSync(isolated), []);
});
