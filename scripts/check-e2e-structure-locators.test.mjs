import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  SPEC_FILE,
  checkE2eStructureLocators,
  findStructuralLocators,
} from './check-e2e-structure-locators.mjs';

function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-structure-locators-'));
  for (const [relative, source] of Object.entries(files)) {
    const full = path.join(root, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, source);
  }
  return { root, files: Object.keys(files) };
}

test('a parent walk by XPath fails, naming the line', () => {
  const { root, files } = fixture({
    'apps/desktop/e2e/privacy.spec.ts':
      "const row = page.getByText('Usage Events:');\nrow.locator('xpath=../..');\n",
  });
  const { failures } = checkE2eStructureLocators(root, files);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /privacy\.spec\.ts:2: an XPath locator walks the DOM tree/);
});

test('a parent hop and a positional selector each fail', () => {
  assert.equal(findStructuralLocators("heading.locator('..').click();\n").length, 1);
  assert.equal(findStructuralLocators("page.locator('li:nth-child(3)');\n").length, 1);
  assert.equal(findStructuralLocators("page.locator('tr:nth-of-type(2)');\n").length, 1);
});

test('role, label, text and test id locators pass', () => {
  const { root, files } = fixture({
    'apps/web/e2e/settings.spec.ts': [
      "dialog.getByRole('switch', { name: 'Enable Analytics' });",
      "dialog.getByRole('listitem').filter({ hasText: 'Usage Events:' });",
      "page.getByLabel('Email');",
      "page.getByTestId('composer');",
      "page.locator('[data-state=open]').first();",
    ].join('\n'),
  });
  assert.deepEqual(checkE2eStructureLocators(root, files).failures, []);
});

test('only spec files are scanned', () => {
  assert.equal(SPEC_FILE.test('apps/desktop/e2e/gdpr.spec.ts'), true);
  assert.equal(SPEC_FILE.test('apps/web/e2e/utils/helpers.ts'), false);
});
