import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const repositoryRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const eslint = new ESLint({ cwd: repositoryRoot });

test('the generated privacy parser vendor tree is excluded from source lint', async () => {
  assert.equal(
    await eslint.isPathIgnored(
      path.join(repositoryRoot, 'apps/mobile/.cache/privacy-parser/lib/vendor.js'),
    ),
    true,
  );
});

test('mobile javascript remains checked after privacy parser setup', async () => {
  const [result] = await eslint.lintText('unexpectedSourceGlobal();', {
    filePath: path.join(repositoryRoot, 'apps/mobile/lint-control.js'),
  });
  assert.equal(result.errorCount, 1);
  assert.equal(result.messages[0].ruleId, 'no-undef');
});

test('the privacy parser exception does not exclude unrelated cache trees', async () => {
  assert.equal(
    await eslint.isPathIgnored(
      path.join(repositoryRoot, 'apps/mobile/.cache/unrelated-tool/lib/source.js'),
    ),
    false,
  );
});
