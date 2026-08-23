#!/usr/bin/env node
/* global console, process */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(__dirname, '..');

const PLACEHOLDER_PREFIX = 'PLACEHOLDER_REPLACE_BEFORE_LAUNCH_';

const appEnv = process.env.EXPO_PUBLIC_APP_ENV ?? '';
if (appEnv === 'development' || appEnv === 'test') {
  console.log(
    `[check-tls-pins] Skipping pin check in ${appEnv} environment (placeholder pins are intentional pre-launch).`,
  );
  process.exit(0);
}

const pinningPath = path.join(mobileRoot, 'lib', 'pinning.ts');

if (!fs.existsSync(pinningPath)) {
  console.error(`[check-tls-pins] ERROR: lib/pinning.ts not found at ${pinningPath}`);
  process.exit(1);
}

const pinningSource = fs.readFileSync(pinningPath, 'utf8');

// PINNING_ENFORCED is derived from PINNING_ROLLOUT, so matching a `= true`
// literal here would never fire and this gate would print PASS unconditionally.
const rolloutMatch = pinningSource.match(
  /export\s+const\s+PINNING_ROLLOUT\s*:\s*PinningStage\s*=\s*'([a-z-]+)'/,
);
if (!rolloutMatch) {
  console.error(
    '[check-tls-pins] ERROR: could not read PINNING_ROLLOUT from lib/pinning.ts. This gate cannot verify the release; fix the check rather than shipping past it.',
  );
  process.exit(1);
}
const pinningEnforced = rolloutMatch[1] === 'enforced';

const PIN_VALUE_RE = /['"]sha256\//;
const placeholderLines = pinningSource
  .split('\n')
  .filter((line) => PIN_VALUE_RE.test(line) && line.includes(PLACEHOLDER_PREFIX))
  .map((line) => line.trim());

if (pinningEnforced && placeholderLines.length > 0) {
  console.error(
    '[check-tls-pins] FAIL: PINNING_ENFORCED=true but lib/pinning.ts still contains placeholder TLS SPKI pins.',
  );
  console.error(
    '[check-tls-pins] Replace the following before releasing (or keep PINNING_ENFORCED=false):',
  );
  for (const line of placeholderLines) {
    console.error(`  ${line}`);
  }
  console.error('[check-tls-pins] Follow the pin-capture runbook in apps/mobile/lib/pinning.ts.');
  process.exit(1);
}

if (placeholderLines.length > 0) {
  console.log(
    '[check-tls-pins] PASS: placeholder pins present but PINNING_ENFORCED=false — ships safely on standard TLS. ' +
      'Provision real SPKI hashes and flip PINNING_ENFORCED=true to enable pinning.',
  );
} else {
  console.log('[check-tls-pins] PASS: all TLS SPKI pins are provisioned (no placeholders found).');
}
process.exit(0);
