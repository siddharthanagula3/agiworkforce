#!/usr/bin/env node
/**
 * What the composer admits and what the product says it can read are the same
 * set.
 *
 * Two lists decide an attachment's fate and neither knows about the other:
 * `CHAT_ATTACHMENT_MIME_TYPES` and `CHAT_ATTACHMENT_EXTENSIONS` decide what may
 * be uploaded, `DOCUMENT_CLASSES` decides which extractor reads it and what the
 * Library calls it. A type on the first list and not the second is admitted and
 * then classified as nothing; a class on the second and not the first is a
 * capability nobody can reach.
 *
 * Both lists are read out of the contracts, never restated here, so a type
 * added to either is checked the day it is added.
 *
 * The baseline records the types that are admitted without a class today, each
 * with a reason and the file that has to declare it. It may shrink, never grow.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const ADMISSION_FILE = 'packages/contracts/cloud-contracts/src/chat-attachments.ts';
export const CLASSES_FILE = 'packages/contracts/types/src/file-model.ts';
export const BASELINE_FILE = 'scripts/config/attachment-class-coverage-baseline.json';

/** Images are carried to the model as bytes, so no text extractor applies. */
const IMAGE_MEDIA_TYPE = /^image\//;

export function listLiterals(source, constantName) {
  const start = source.indexOf(`const ${constantName} = [`);
  if (start < 0) return [];
  const end = source.indexOf('] as const', start);
  if (end < 0) return [];
  return [...source.slice(start, end).matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

export function declaredClasses(source) {
  const start = source.indexOf('export const DOCUMENT_CLASSES');
  if (start < 0) return [];
  const body = source.slice(start, source.indexOf('] as const;', start));
  const classes = [];
  for (const block of body.split(/\n  \{\n/).slice(1)) {
    const id = /id:\s*'([^']+)'/.exec(block)?.[1];
    const extractor = /extractor:\s*'([^']+)'/.exec(block)?.[1];
    if (!id || !extractor) continue;
    classes.push({
      id,
      extractor,
      mediaTypes: listBlock(block, 'mediaTypes'),
      extensions: listBlock(block, 'extensions'),
    });
  }
  return classes;
}

function listBlock(block, field) {
  const match = new RegExp(`${field}:\\s*\\[([^\\]]*)\\]`, 's').exec(block);
  if (!match) return [];
  return [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]);
}

export function coverage(admittedTypes, admittedExtensions, classes) {
  const classedTypes = new Set(classes.flatMap((entry) => entry.mediaTypes));
  const classedExtensions = new Set(classes.flatMap((entry) => entry.extensions));

  const unclassed = [
    ...admittedTypes
      .filter((type) => !IMAGE_MEDIA_TYPE.test(type) && !classedTypes.has(type))
      .map((type) => `media-type:${type}`),
    ...admittedExtensions
      .map((extension) => extension.replace(/^\./, ''))
      .filter((extension) => !classedExtensions.has(extension))
      .map((extension) => `extension:${extension}`),
  ].sort();

  const admittedTypeSet = new Set(admittedTypes);
  const admittedExtensionSet = new Set(
    admittedExtensions.map((extension) => extension.replace(/^\./, '')),
  );
  const unreachable = classes
    .filter(
      (entry) =>
        !entry.mediaTypes.some((type) => admittedTypeSet.has(type)) &&
        !entry.extensions.some((extension) => admittedExtensionSet.has(extension)),
    )
    .map((entry) => `class:${entry.id}`)
    .sort();

  return { unclassed, unreachable };
}

export function compareToBaseline(found, recordedEntries) {
  const recorded = new Map(Object.entries(recordedEntries ?? {}));
  return {
    missingReason: [...recorded.entries()]
      .filter(([, entry]) => !entry?.reason || !entry?.declareIn)
      .map(([key]) => key),
    grown: found.filter((key) => !recorded.has(key)),
    fixed: [...recorded.keys()].filter((key) => !found.includes(key)),
  };
}

export function read(scanRoot) {
  const admissionPath = path.join(scanRoot, ADMISSION_FILE);
  const classesPath = path.join(scanRoot, CLASSES_FILE);
  if (!fs.existsSync(admissionPath)) return { error: `${ADMISSION_FILE} is missing.` };
  if (!fs.existsSync(classesPath)) return { error: `${CLASSES_FILE} is missing.` };

  const admission = fs.readFileSync(admissionPath, 'utf8');
  const types = listLiterals(admission, 'CHAT_ATTACHMENT_MIME_TYPES');
  const extensions = listLiterals(admission, 'CHAT_ATTACHMENT_EXTENSIONS');
  const classes = declaredClasses(fs.readFileSync(classesPath, 'utf8'));
  if (types.length === 0 || extensions.length === 0) {
    return { error: `${ADMISSION_FILE} declared no accepted types, which cannot be right.` };
  }
  if (classes.length === 0) {
    return { error: `${CLASSES_FILE} declared no document classes, which cannot be right.` };
  }
  return { types, extensions, classes, ...coverage(types, extensions, classes) };
}

function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const rootIndex = process.argv.indexOf('--root');
  const scanRoot = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : repoRoot;

  const result = read(scanRoot);
  if (result.error) {
    console.error(`check-attachment-class-coverage: ${result.error}`);
    process.exit(1);
  }

  const baselinePath = path.join(scanRoot, BASELINE_FILE);
  const baseline = fs.existsSync(baselinePath)
    ? JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
    : { unclassed: {}, unreachable: {} };

  const sides = [
    {
      found: result.unclassed,
      recorded: baseline.unclassed,
      grew: `admitted attachment type(s) have no declared document class`,
      fix: `Declare the class in ${CLASSES_FILE}, or record it in the baseline.`,
    },
    {
      found: result.unreachable,
      recorded: baseline.unreachable,
      grew: `document class(es) are declared but no upload can reach them`,
      fix: `Admit the type in ${ADMISSION_FILE}, or record it in the baseline.`,
    },
  ];

  for (const side of sides) {
    const { missingReason, grown, fixed } = compareToBaseline(side.found, side.recorded);
    if (missingReason.length > 0) {
      console.error('Every baselined entry needs a reason and the file that closes it:');
      for (const key of missingReason) console.error(`  ${key}`);
      process.exit(1);
    }
    if (grown.length > 0) {
      console.error(`${grown.length} ${side.grew}:`);
      for (const key of grown) console.error(`  ${key}`);
      console.error(side.fix);
      process.exit(1);
    }
    if (fixed.length > 0) {
      console.error(`${fixed.length} baselined entry(ies) are now closed. Remove them:`);
      for (const key of fixed) console.error(`  ${key}`);
      process.exit(1);
    }
  }

  const covered = result.types.length + result.extensions.length - result.unclassed.length;
  console.log(
    `check-attachment-class-coverage: ${result.types.length} media types and ` +
      `${result.extensions.length} extensions admitted, ${covered} classed by ` +
      `${result.classes.length} document classes, ${result.unclassed.length} unclassed and ` +
      `${result.unreachable.length} unreachable, all baselined.`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
