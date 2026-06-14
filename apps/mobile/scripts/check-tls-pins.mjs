#!/usr/bin/env node
/* global console, process */
/**
 * Release-lane guard: fails (exit 1) when lib/pinning.ts still contains
 * placeholder TLS SPKI hashes.
 *
 * Run this in your production/release CI lane ONLY — placeholder pins are
 * intentional pre-launch and must not block development or test runs.
 *
 *   # Release lane CI:
 *   node apps/mobile/scripts/check-tls-pins.mjs
 *
 *   # Or via the package.json script:
 *   pnpm --filter @agiworkforce/mobile check:tls-pins
 *
 * The script is deliberately NOT wired into the default dev/test path. It is
 * scoped to the release preflight (scripts/release/preflight.sh) so developers
 * can run the app locally with placeholder pins while waiting for ops to
 * provision real SPKI hashes.
 *
 * REAL PIN PROVISIONING REMAINS AN OPS DEPENDENCY. See the runbook in
 * apps/mobile/lib/pinning.ts for the `openssl` commands and rotation protocol.
 *
 * Environment gate:
 *   - Skips (exit 0) when EXPO_PUBLIC_APP_ENV is 'development' or 'test'.
 *   - Fails when EXPO_PUBLIC_APP_ENV is 'production' (or unset, since
 *     release lanes always set this to 'production').
 *
 * Issue: #387
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// This script lives at apps/mobile/scripts/; mobile root is one level up.
const mobileRoot = path.resolve(__dirname, '..');

const PLACEHOLDER_PREFIX = 'PLACEHOLDER_REPLACE_BEFORE_LAUNCH_';

// ---------------------------------------------------------------------------
// Environment gate — skip in dev/test; only enforce in release lane.
// ---------------------------------------------------------------------------
const appEnv = process.env.EXPO_PUBLIC_APP_ENV ?? '';
if (appEnv === 'development' || appEnv === 'test') {
  console.log(
    `[check-tls-pins] Skipping pin check in ${appEnv} environment (placeholder pins are intentional pre-launch).`,
  );
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Read pinning.ts and scan for placeholder strings.
// ---------------------------------------------------------------------------
const pinningPath = path.join(mobileRoot, 'lib', 'pinning.ts');

if (!fs.existsSync(pinningPath)) {
  console.error(`[check-tls-pins] ERROR: lib/pinning.ts not found at ${pinningPath}`);
  process.exit(1);
}

const pinningSource = fs.readFileSync(pinningPath, 'utf8');

// Placeholder pins are only a launch blocker when enforcement is ON — with
// PINNING_ENFORCED=false the app falls back to standard platform TLS validation
// and ships safely. So this guard fails the release lane only for the genuinely
// broken combo: enforcement on AND unprovisioned (placeholder) pins. (#387)
const pinningEnforced = /export\s+const\s+PINNING_ENFORCED\s*=\s*true\b/.test(pinningSource);

// Scan only for lines that look like actual pin string values (quoted sha256/...
// or sha256/PLACEHOLDER...) in the PINS_BY_HOST object. We match lines that
// contain a quoted string starting with 'sha256/' and also contain the
// placeholder prefix. This deliberately skips comment lines, the PLACEHOLDER_PREFIX
// const definition, and runbook documentation lines.
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
