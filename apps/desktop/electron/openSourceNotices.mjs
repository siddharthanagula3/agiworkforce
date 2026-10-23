import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  addNpmPackage,
  buildNotices,
  packageRootOfModule,
  renderNoticesText,
} from '../../../scripts/lib/third-party-notices.mjs';

export const NOTICES_FILE_NAME = 'THIRD_PARTY_NOTICES.txt';

export function bundledModuleRoots(metafiles, workingDir) {
  const roots = new Set();
  for (const metafile of metafiles) {
    for (const input of Object.keys(metafile.inputs)) {
      const root = packageRootOfModule(input);
      if (root) roots.add(path.resolve(workingDir, root));
    }
  }
  return [...roots];
}

export function desktopNoticesText({ moduleRoots, extraRoots, bundledNoticesFiles }) {
  const records = new Map();
  for (const root of [...moduleRoots, ...extraRoots]) {
    addNpmPackage(records, path.join(root, 'package.json'), 'desktop');
  }
  const own = renderNoticesText(buildNotices(records), {
    title: 'Desktop app open-source notices',
    intro:
      'This app includes the open-source packages below. Each keeps its own copyright and license.',
  });
  const bundled = bundledNoticesFiles.map((file) => readFileSync(file, 'utf8').trimEnd());
  return [own.trimEnd(), ...bundled].join('\n\n\n').concat('\n');
}

export function writeDesktopNotices(outFile, options) {
  mkdirSync(path.dirname(outFile), { recursive: true });
  const text = desktopNoticesText(options);
  writeFileSync(outFile, text, 'utf8');
  return text;
}
