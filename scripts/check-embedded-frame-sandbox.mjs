#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  escapesItsSandbox,
  findCreatedFrames,
  findEmbeddedFrames,
} from './lib/embedded-frames.mjs';
import { sourceFiles } from './lib/workspace-cache-scope.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootIndex = process.argv.indexOf('--root');
const scanRoot = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : repoRoot;

const SCAN_ROOTS = [
  'apps/web/app',
  'apps/web/features',
  'apps/web/shared',
  'apps/web/lib',
  'apps/desktop/src',
  'apps/extension/src',
  'packages/ui/ui/src',
];

/**
 * A frame that renders on an origin of its own may hold both allow-scripts and
 * allow-same-origin, because same-origin there is not same-origin here. Each
 * entry names the renderer and why it qualifies.
 */
const DEDICATED_ORIGIN_RENDERERS = [
  {
    file: 'apps/web/features/chat/components/SandboxedIframe.tsx',
    reason:
      'Renders artifact HTML from NEXT_PUBLIC_ARTIFACT_SANDBOX_ORIGIN, a separate origin that stores no session, so the pair grants reach over an empty origin rather than over the app.',
  },
];

/**
 * Frames that embed a document without declaring a sandbox. The guard refuses a
 * new one, so this list can only shrink.
 */
const UNDECLARED = [
  {
    file: 'apps/web/features/chat/components/artifacts/ArtifactPreview.tsx',
    owed: 'add sandbox="allow-same-origin" to the PDF preview frame, which is all the built-in viewer needs.',
    reason:
      'The frame embeds a PDF and its src is narrowed to a data:application/pdf URL, a blob: URL or a same-origin path that ends in .pdf, so it cannot reach another origin today. It carries no sandbox attribute at all, which means the narrowing in pdfSrc is the only thing standing between a mistyped route response and a same-origin script. The component is owned by the chat surface lane.',
  },
];

const failures = [];
let frameCount = 0;
let declaredCount = 0;

function relative(file) {
  return path.relative(scanRoot, file).split(path.sep).join('/');
}

for (const root of SCAN_ROOTS) {
  const directory = path.join(scanRoot, root);
  if (!fs.existsSync(directory)) continue;
  for (const file of sourceFiles(directory)) {
    const source = fs.readFileSync(file, 'utf8');
    if (!source.includes('iframe')) continue;
    const name = relative(file);
    const dedicated = DEDICATED_ORIGIN_RENDERERS.find((entry) => entry.file === name);
    const known = UNDECLARED.find((entry) => entry.file === name);

    for (const frame of [...findEmbeddedFrames(source), ...findCreatedFrames(source)]) {
      frameCount += 1;
      if (frame.declared) declaredCount += 1;
      else if (!known) {
        failures.push(
          `${name}:${frame.line} embeds a document with no sandbox attribute, so the framed ` +
            `content runs with the privileges of the page that framed it`,
        );
      }

      if (!escapesItsSandbox(frame.tokens)) continue;
      if (dedicated && frame.crossOrigin) continue;
      failures.push(
        `${name}:${frame.line} combines allow-scripts with allow-same-origin, which lets the ` +
          `framed document reach out of its frame and act as the page`,
      );
    }
  }
}

for (const entry of [...UNDECLARED, ...DEDICATED_ORIGIN_RENDERERS]) {
  if (!fs.existsSync(path.join(scanRoot, entry.file))) {
    failures.push(`stale entry: ${entry.file} no longer exists`);
  } else if (entry.reason.trim().length < 80) {
    failures.push(`the entry for ${entry.file} needs a reason`);
  }
}

for (const entry of UNDECLARED) {
  const full = path.join(scanRoot, entry.file);
  if (!fs.existsSync(full)) continue;
  const source = fs.readFileSync(full, 'utf8');
  const frames = [...findEmbeddedFrames(source), ...findCreatedFrames(source)];
  if (frames.every((frame) => frame.declared)) {
    failures.push(`${entry.file} declares every frame now; remove its entry so the next gap shows`);
  }
}

if (failures.length === 0) {
  console.log(
    `check-embedded-frame-sandbox: ${frameCount} embedded frames, ${declaredCount} declaring a ` +
      `sandbox, ${UNDECLARED.length} owed, ${DEDICATED_ORIGIN_RENDERERS.length} on an origin of ` +
      `their own.`,
  );
  process.exit(0);
}

console.error('Documents embedded without a sandbox of their own:\n');
for (const failure of failures) console.error(`  - ${failure}`);
for (const entry of UNDECLARED) console.error(`\n  owed: ${entry.file}: ${entry.owed}`);
console.error(`\n${failures.length} finding(s).`);
process.exit(1);
