import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  MIN_TARGET_PX,
  PRIMITIVES_ROOT,
  REPO_ROOT,
  checkUiButtons,
  findUndersizedControls,
  heightOf,
  readVariantTables,
  variantTableFailures,
} from './check-ui-buttons.mjs';

const roots = [];

function primitiveFixture(body) {
  const root = mkdtempSync(path.join(tmpdir(), 'agi-ui-buttons-'));
  roots.push(root);
  mkdirSync(path.join(root, PRIMITIVES_ROOT), { recursive: true });
  writeFileSync(path.join(root, PRIMITIVES_ROOT, 'Control.tsx'), body);
  return root;
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('sizing utilities resolve to pixels', () => {
  assert.equal(heightOf('h-10 px-4'), 40);
  assert.equal(heightOf('size-6'), 24);
  assert.equal(heightOf('min-h-5'), 20);
  assert.equal(heightOf('h-[18px]'), 18);
  assert.equal(heightOf('h-[1.5rem]'), 24);
  assert.equal(heightOf('rounded-md px-3'), null);
});

test('every shared control variant table passes today', () => {
  const { failures, inspected } = variantTableFailures(REPO_ROOT);
  assert.deepEqual(failures, []);
  assert.ok(inspected.length >= 3, `expected control tables, found ${inspected.length}`);
});

const CONTROL = (base, sizes) => `
import { cva } from 'class-variance-authority';
const controlVariants = cva(
  '${base}',
  { variants: { size: {
${sizes.map((s) => `      ${s.name}: '${s.classes}',`).join('\n')}
      } }, defaultVariants: { size: 'default' } },
);
export function Control({ disabled }: { disabled?: boolean }) {
  return <button disabled={disabled} className={controlVariants({})} />;
}
`;

test('a size under the target minimum is reported', () => {
  const root = primitiveFixture(
    CONTROL('focus-visible:ring-2 disabled:opacity-50', [
      { name: 'default', classes: 'h-10 px-4' },
      { name: 'tiny', classes: 'h-5 px-1' },
    ]),
  );
  const { failures } = variantTableFailures(root);
  assert.equal(failures.length, 1);
  assert.match(failures[0], new RegExp(`"tiny" is 20px tall, under the ${MIN_TARGET_PX}px`));
});

test('a control table with no focus-visible style is reported', () => {
  const root = primitiveFixture(
    CONTROL('disabled:opacity-50', [{ name: 'default', classes: 'h-10' }]),
  );
  assert.ok(variantTableFailures(root).failures.some((line) => line.includes('focus-visible')));
});

test('a control table with no disabled style is reported', () => {
  const root = primitiveFixture(
    CONTROL('focus-visible:ring-2', [{ name: 'default', classes: 'h-10' }]),
  );
  assert.ok(variantTableFailures(root).failures.some((line) => line.includes('disabled style')));
});

test('a presentational table with sizes and nothing to press is left alone', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'agi-ui-buttons-presentational-'));
  roots.push(root);
  mkdirSync(path.join(root, PRIMITIVES_ROOT), { recursive: true });
  writeFileSync(
    path.join(root, PRIMITIVES_ROOT, 'Mark.tsx'),
    `import { cva } from 'class-variance-authority';
const markVariants = cva('rounded-full', { variants: { size: { sm: 'h-4 w-4' } } });
export function Mark() { return <div role="status" className={markVariants({})} />; }
`,
  );
  assert.deepEqual(variantTableFailures(root).failures, []);
});

test('the table reader enumerates from the cva call rather than a list', () => {
  const tables = readVariantTables(
    CONTROL('focus-visible:ring-2 disabled:opacity-50', [
      { name: 'default', classes: 'h-10 px-4' },
      { name: 'sm', classes: 'h-9 px-3' },
    ]),
    'Control.tsx',
  );
  assert.equal(tables.length, 1);
  assert.deepEqual(
    tables[0].sizes.map((size) => size.name),
    ['default', 'sm'],
  );
});

test('an undersized control at a call site is reported', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'agi-ui-buttons-call-site-'));
  roots.push(root);
  mkdirSync(path.join(root, 'apps/web/shared'), { recursive: true });
  writeFileSync(
    path.join(root, 'apps/web/shared/a.tsx'),
    '<button className="h-4 w-4 rounded" aria-label="Dismiss" />\n',
  );
  const found = findUndersizedControls(root, ['apps/web/shared/a.tsx']);
  assert.equal(found.length, 1);
  assert.match(found[0].key, /apps\/web\/shared\/a\.tsx:1:16px$/);
});

test('no control the shell sizes explicitly is under the target minimum', () => {
  assert.deepEqual(checkUiButtons(REPO_ROOT).found, []);
});
