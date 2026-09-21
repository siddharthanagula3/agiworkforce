import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  ADMISSION_FILE,
  CLASSES_FILE,
  compareToBaseline,
  coverage,
  declaredClasses,
  listLiterals,
  read,
} from './check-attachment-class-coverage.mjs';

const CLASSES_SOURCE = `
export const DOCUMENT_CLASSES: readonly DocumentClass[] = [
  {
    id: 'csv',
    label: 'CSV',
    family: 'structured_data',
    extractor: 'text',
    mediaTypes: ['text/csv'],
    extensions: ['csv'],
  },
  {
    id: 'pdf',
    label: 'PDF',
    family: 'document',
    extractor: 'pdf',
    mediaTypes: ['application/pdf'],
    extensions: ['pdf'],
  },
] as const;
`;

const ADMISSION_SOURCE = `
export const CHAT_ATTACHMENT_MIME_TYPES = ['image/png', 'text/csv', 'application/pdf'] as const;
const CHAT_ATTACHMENT_EXTENSIONS = ['.csv', '.pdf'] as const;
`;

function scratch(admission, classes) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'attachment-classes-'));
  for (const [relative, content] of [
    [ADMISSION_FILE, admission],
    [CLASSES_FILE, classes],
  ]) {
    const full = path.join(root, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return root;
}

test('both lists are read out of the contracts', () => {
  assert.deepEqual(listLiterals(ADMISSION_SOURCE, 'CHAT_ATTACHMENT_EXTENSIONS'), ['.csv', '.pdf']);
  assert.deepEqual(
    declaredClasses(CLASSES_SOURCE).map((entry) => `${entry.id}:${entry.extractor}`),
    ['csv:text', 'pdf:pdf'],
  );
});

test('a matched pair of lists reports nothing', () => {
  const root = scratch(ADMISSION_SOURCE, CLASSES_SOURCE);
  const result = read(root);
  assert.deepEqual(result.unclassed, []);
  assert.deepEqual(result.unreachable, []);
});

test('an image needs no extractor', () => {
  const { unclassed } = coverage(['image/png'], [], declaredClasses(CLASSES_SOURCE));
  assert.deepEqual(unclassed, []);
});

test('an admitted type with no class is reported', () => {
  const root = scratch(
    ADMISSION_SOURCE.replace(
      "'application/pdf'] as const",
      "'application/pdf', 'text/x-python'] as const",
    ),
    CLASSES_SOURCE,
  );
  assert.deepEqual(read(root).unclassed, ['media-type:text/x-python']);
});

test('an admitted extension with no class is reported', () => {
  const root = scratch(
    ADMISSION_SOURCE.replace("'.pdf'] as const", "'.pdf', '.rs'] as const"),
    CLASSES_SOURCE,
  );
  assert.deepEqual(read(root).unclassed, ['extension:rs']);
});

test('a class no upload can reach is reported', () => {
  const root = scratch(
    ADMISSION_SOURCE.replace("'text/csv', ", '').replace("'.csv', ", ''),
    CLASSES_SOURCE,
  );
  assert.deepEqual(read(root).unreachable, ['class:csv']);
});

test('an empty accept list is an error, not a clean run', () => {
  const root = scratch('export const CHAT_ATTACHMENT_MIME_TYPES = [] as const;', CLASSES_SOURCE);
  assert.match(read(root).error, /declared no accepted types/);
});

test('no declared class at all is an error', () => {
  const root = scratch(ADMISSION_SOURCE, 'export const OTHER = 1;');
  assert.match(read(root).error, /declared no document classes/);
});

test('a baselined entry without a reason fails', () => {
  const { missingReason } = compareToBaseline(['extension:rs'], { 'extension:rs': {} });
  assert.deepEqual(missingReason, ['extension:rs']);
});

test('a new unclassed type is growth', () => {
  const { grown } = compareToBaseline(['extension:rs', 'extension:go'], {
    'extension:rs': { reason: 'r', declareIn: 'f' },
  });
  assert.deepEqual(grown, ['extension:go']);
});

test('a baselined type that gained a class must be removed', () => {
  const { fixed } = compareToBaseline([], { 'extension:rs': { reason: 'r', declareIn: 'f' } });
  assert.deepEqual(fixed, ['extension:rs']);
});
