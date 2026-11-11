import { execFileSync } from 'node:child_process';
import console from 'node:console';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

import {
  addCargoPackage,
  buildNotices,
  cargoRuntimeClosure,
  renderNoticesText,
} from '../../../../scripts/lib/third-party-notices.mjs';
import { PRODUCT_NAMES } from '../../../../packages/contracts/types/src/product-names.ts';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const output = path.join(root, 'apps/desktop/gpui/assets/THIRD_PARTY_NOTICES.txt');
const metadata = JSON.parse(
  execFileSync('cargo', ['metadata', '--locked', '--format-version', '1'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
  }),
);
const records = new Map();
for (const pkg of cargoRuntimeClosure(metadata, 'agiworkforce-desktop-gpui')) {
  addCargoPackage(records, pkg, 'desktop-gpui');
}
const notices = renderNoticesText(buildNotices(records), {
  title: `${PRODUCT_NAMES.desktop} native host open-source notices`,
  intro:
    'The native host includes the Rust crates below. Each retains its own copyright and license.',
});
if (process.argv.includes('--check')) {
  if (!fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== notices) {
    throw new Error(
      'Native host notices are stale; run node apps/desktop/gpui/scripts/notices.mjs',
    );
  }
  console.log('Native host open-source notices are current.');
} else {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, notices);
  console.log(`Wrote ${path.relative(root, output)}.`);
}
