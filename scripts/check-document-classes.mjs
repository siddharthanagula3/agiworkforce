#!/usr/bin/env node

// A class the product says it reads has to have something that reads it. This
// guard enumerates DOCUMENT_CLASSES from the contract and checks each one
// against the extractor its own entry names, so declaring a class without a
// decoder fails here rather than on somebody's upload.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const REGISTRY = 'packages/contracts/types/src/file-model.ts';
export const TEXT_POLICY = 'packages/contracts/types/src/file-input.ts';

/** Where each decoder family lives, and how it says which bytes it accepts. */
export const EXTRACTORS = Object.freeze({
  office: {
    module: 'apps/web/lib/server/office-document-text.ts',
    accepts: (source, { mediaTypes, extensions }) =>
      mediaTypes.every((type) => source.includes(type)) &&
      extensions.every((extension) => source.includes(`.${extension}`)),
  },
  pdf: {
    module: 'apps/web/lib/server/pdf-attachment-content.ts',
    accepts: (source) =>
      /export async function extract\w*\(/.test(source) && /\bBuffer\b/.test(source),
  },
  text: {
    module: TEXT_POLICY,
    accepts: (source, { mediaTypes }) =>
      mediaTypes.every(
        (type) =>
          type.startsWith('text/') ||
          source.includes(`'${type}'`) ||
          ['+json', '+xml', '+yaml'].some((suffix) => type.endsWith(suffix)),
      ),
  },
});

function read(scanRoot, relativePath) {
  try {
    return fs.readFileSync(path.join(scanRoot, relativePath), 'utf8');
  } catch {
    return null;
  }
}

/** The declared classes, read out of the contract rather than restated here. */
export function parseDocumentClasses(source) {
  const block =
    /DOCUMENT_CLASSES:\s*readonly DocumentClass\[\]\s*=\s*\[([\s\S]*?)\n\]\s*as const;/.exec(
      source ?? '',
    );
  if (!block) return [];
  const classes = [];
  for (const entry of block[1].matchAll(/\{([\s\S]*?)\n  \}/g)) {
    const body = entry[1];
    const field = (name) => new RegExp(`${name}:\\s*'([^']+)'`).exec(body)?.[1] ?? null;
    const list = (name) => {
      const raw = new RegExp(`${name}:\\s*\\[([\\s\\S]*?)\\]`).exec(body)?.[1] ?? '';
      return [...raw.matchAll(/'([^']+)'/g)].map((match) => match[1]);
    };
    const id = field('id');
    if (!id) continue;
    classes.push({
      id,
      label: field('label'),
      family: field('family'),
      extractor: field('extractor'),
      mediaTypes: list('mediaTypes'),
      extensions: list('extensions'),
    });
  }
  return classes;
}

export function evaluate(scanRoot) {
  const failures = [];
  const registrySource = read(scanRoot, REGISTRY);
  const classes = parseDocumentClasses(registrySource);

  if (classes.length === 0) {
    return { failures: [`${REGISTRY} declares no document classes; nothing says what is read.`] };
  }

  const sources = new Map();
  for (const [family, extractor] of Object.entries(EXTRACTORS)) {
    const source = read(scanRoot, extractor.module);
    if (source === null) {
      failures.push(`the ${family} extractor ${extractor.module} is missing`);
      continue;
    }
    sources.set(family, source);
  }

  const seenMediaTypes = new Map();
  const seenExtensions = new Map();

  for (const documentClass of classes) {
    if (documentClass.mediaTypes.length === 0) {
      failures.push(`class ${documentClass.id} claims no media type, so nothing can route to it`);
    }
    if (documentClass.extensions.length === 0) {
      failures.push(`class ${documentClass.id} claims no extension`);
    }
    if (!documentClass.label) {
      failures.push(`class ${documentClass.id} has no label to show a reader`);
    }

    for (const [values, seen, what] of [
      [documentClass.mediaTypes, seenMediaTypes, 'media type'],
      [documentClass.extensions, seenExtensions, 'extension'],
    ]) {
      for (const value of values) {
        const owner = seen.get(value);
        if (owner && owner !== documentClass.id) {
          failures.push(`${what} ${value} is claimed by both ${owner} and ${documentClass.id}`);
        }
        seen.set(value, documentClass.id);
      }
    }

    const extractor = EXTRACTORS[documentClass.extractor ?? ''];
    if (!extractor) {
      failures.push(
        `class ${documentClass.id} names extractor "${documentClass.extractor}", which no decoder family provides`,
      );
      continue;
    }
    const source = sources.get(documentClass.extractor);
    if (source === undefined) continue;
    if (!extractor.accepts(source, documentClass)) {
      failures.push(
        `class ${documentClass.id} routes to the ${documentClass.extractor} extractor ` +
          `(${extractor.module}), which does not accept ${documentClass.mediaTypes.join(', ')}`,
      );
    }
  }

  return { failures, classes };
}

function main() {
  const rootIndex = process.argv.indexOf('--root');
  const scanRoot = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : REPO_ROOT;
  const { failures, classes = [] } = evaluate(scanRoot);

  if (failures.length === 0) {
    console.log(
      `check-document-classes: ${classes.length} declared classes, each routed to a decoder that accepts it.`,
    );
    process.exit(0);
  }

  console.error('Document classes the product claims to read but does not:\n');
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error(`\n${failures.length} finding(s).`);
  process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
