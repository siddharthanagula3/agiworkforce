import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { EXTRACTORS, REGISTRY, evaluate, parseDocumentClasses } from './check-document-classes.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');

function scratchRepository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'document-classes-guard-'));
  const files = [REGISTRY, ...Object.values(EXTRACTORS).map((entry) => entry.module)];
  for (const relativePath of new Set(files)) {
    const destination = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(REPO_ROOT, relativePath), destination);
  }
  return root;
}

function rewriteRegistry(root, replace) {
  const destination = path.join(root, REGISTRY);
  fs.writeFileSync(destination, replace(fs.readFileSync(destination, 'utf8')));
}

test('the shipped registry passes', () => {
  const root = scratchRepository();
  const { failures, classes } = evaluate(root);
  assert.deepEqual(failures, []);
  assert.ok(classes.length >= 13);
  fs.rmSync(root, { recursive: true, force: true });
});

test('a class routed to a decoder that cannot read it fails', () => {
  const root = scratchRepository();
  rewriteRegistry(root, (source) =>
    source.replace(
      "    id: 'pptx',\n    label: 'PPTX',\n    family: 'presentation',\n    extractor: 'office',",
      "    id: 'pptx',\n    label: 'PPTX',\n    family: 'presentation',\n    extractor: 'text',",
    ),
  );
  const { failures } = evaluate(root);
  assert.ok(failures.some((failure) => failure.includes('pptx')));
  fs.rmSync(root, { recursive: true, force: true });
});

test('a class naming a decoder family that does not exist fails', () => {
  const root = scratchRepository();
  rewriteRegistry(root, (source) => source.replace("extractor: 'pdf',", "extractor: 'ocr',"));
  const { failures } = evaluate(root);
  assert.ok(failures.some((failure) => failure.includes('"ocr"')));
  fs.rmSync(root, { recursive: true, force: true });
});

test('a declared class whose office decoder stopped accepting it fails', () => {
  const root = scratchRepository();
  const officeModule = path.join(root, EXTRACTORS.office.module);
  const source = fs.readFileSync(officeModule, 'utf8');
  fs.writeFileSync(
    officeModule,
    source.replaceAll('presentationml.presentation', 'presentationml.removed'),
  );
  const { failures } = evaluate(root);
  assert.ok(failures.some((failure) => failure.includes('pptx')));
  fs.rmSync(root, { recursive: true, force: true });
});

test('two classes claiming one media type fails', () => {
  const root = scratchRepository();
  rewriteRegistry(root, (source) =>
    source.replace("mediaTypes: ['text/tab-separated-values'],", "mediaTypes: ['text/csv'],"),
  );
  const { failures } = evaluate(root);
  assert.ok(failures.some((failure) => failure.includes('text/csv')));
  fs.rmSync(root, { recursive: true, force: true });
});

test('a missing decoder module fails rather than passing silently', () => {
  const root = scratchRepository();
  fs.rmSync(path.join(root, EXTRACTORS.office.module));
  const { failures } = evaluate(root);
  assert.ok(failures.some((failure) => failure.includes('is missing')));
  fs.rmSync(root, { recursive: true, force: true });
});

test('every shipped class carries a label, a media type and an extension', () => {
  const classes = parseDocumentClasses(fs.readFileSync(path.join(REPO_ROOT, REGISTRY), 'utf8'));
  for (const documentClass of classes) {
    assert.ok(documentClass.label, `${documentClass.id} has no label`);
    assert.ok(documentClass.mediaTypes.length > 0, `${documentClass.id} has no media type`);
    assert.ok(documentClass.extensions.length > 0, `${documentClass.id} has no extension`);
  }
});
