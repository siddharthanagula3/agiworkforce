import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const script = fileURLToPath(new URL('./audit-worklist.mjs', import.meta.url));
const markdownOwner = createRequire(
  new URL('../packages/ui/unified-chat/package.json', import.meta.url),
);
const { unified } = await import(pathToFileURL(markdownOwner.resolve('unified')));
const { default: remarkParse } = await import(pathToFileURL(markdownOwner.resolve('remark-parse')));
const { default: remarkGfm } = await import(pathToFileURL(markdownOwner.resolve('remark-gfm')));

function textOf(node) {
  return node.children ? node.children.map(textOf).join('') : (node.value ?? '');
}

function tableRows(markdown) {
  const document = unified().use(remarkParse).use(remarkGfm).parse(markdown);
  return document.children
    .filter((node) => node.type === 'table')
    .flatMap((table) => table.children.slice(1))
    .map((row) => row.children.map(textOf));
}

function generatedFile(root, directory) {
  const names = readdirSync(join(root, directory)).filter((name) => name.endsWith('.md'));
  assert.equal(names.length, 1);
  return readFileSync(join(root, directory, names[0]), 'utf8');
}

for (const value of [
  'alpha|beta',
  String.raw`alpha\|beta`,
  String.raw`alpha\\|beta`,
  String.raw`alpha\\\|beta`,
  String.raw`\|\|`,
  'trailing\\',
  ' | leading\n\ttrailing | ',
]) {
  test(`generated audit tables preserve literal content ${JSON.stringify(value)}`, () => {
    const root = mkdtempSync(join(tmpdir(), 'audit-worklist-table-'));
    try {
      mkdirSync(join(root, 'audit/ledger'), { recursive: true });
      writeFileSync(
        join(root, 'audit/ledger/ecosystem-capability-ledger.jsonl'),
        `${JSON.stringify({
          id: 'T.1',
          section: 1,
          group: 'C',
          text: value,
          criterion: 'fixture',
          rollup: 'partial',
          cells: {
            web: { s: 'partial', remaining: value, miss: [value] },
            mobile: { s: 'unverified', settleBy: value },
          },
        })}\n`,
      );
      writeFileSync(
        join(root, 'audit/ledger/ecosystem-capability-ledger.meta.json'),
        JSON.stringify({ auditedCommit: 'fixture', sections: { 1: value } }),
      );
      const generated = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
      assert.equal(generated.status, 0, `${generated.stdout}${generated.stderr}`);
      const expected = value.replace(/\s+/g, ' ').trim();
      assert.deepEqual(tableRows(generatedFile(root, 'audit/partial')), [
        ['web', 'partial', expected, expected],
      ]);
      assert.deepEqual(tableRows(generatedFile(root, 'audit/live-check')), [
        [`T.1: ${expected}`, 'mobile', expected],
      ]);
      const waveRows = tableRows(readFileSync(join(root, 'audit/plan/waves.md'), 'utf8'));
      assert.equal(waveRows.length, 1);
      assert.equal(waveRows[0].length, 3);
      assert.equal(waveRows[0][0], `1. ${expected}`);
      assert.equal(waveRows[0][1], '1');
      const checked = spawnSync(process.execPath, [script, '--check'], {
        cwd: root,
        encoding: 'utf8',
      });
      assert.equal(checked.status, 0, `${checked.stdout}${checked.stderr}`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
