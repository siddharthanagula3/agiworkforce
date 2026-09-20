#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { declaredChannels, scannerChannels, wiredChannels } from './lib/outbound-inspection.mjs';
import { sourceFiles } from './lib/workspace-cache-scope.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootIndex = process.argv.indexOf('--root');
const scanRoot = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : repoRoot;

const MODULE = 'apps/web/lib/security/outbound-content-inspection.ts';
const SCAN_ROOTS = ['apps/web/app', 'apps/web/lib', 'apps/web/features'];

/**
 * A declared channel with no call site yet. Each entry names the route that
 * owes the call and why; the guard refuses a new one, so the list can only
 * shrink.
 */
const UNWIRED = [
  {
    channel: 'artifact_publish',
    owed:
      'apps/web/app/api/artifacts/publish/[token]/route.ts must call inspectOutboundContent ' +
      "with channel 'artifact_publish' before it writes the published row.",
    reason:
      'Publishing an artifact puts its bytes behind a link that leaves the workspace, which is why secretPatternScanner already lists this channel. The route predates the inspection and is owned by the surface lane; until it calls in, a published artifact carrying a key is not scanned.',
  },
];

const failures = [];
const modulePath = path.join(scanRoot, MODULE);

if (!fs.existsSync(modulePath)) {
  console.error(`check-outbound-inspection-coverage: ${MODULE} is missing; nothing inspects.`);
  process.exit(1);
}

const moduleSource = fs.readFileSync(modulePath, 'utf8');
const channels = declaredChannels(moduleSource);

if (channels === null || channels.length === 0) {
  failures.push(`OutboundChannel is unreadable in ${MODULE}; there is no vocabulary to check`);
} else {
  for (const required of [
    { pattern: /resolveMode/, detail: 'reads the workspace policy before it decides' },
    { pattern: /mode = 'block'|policy = \{ mode: 'block'/, detail: 'falls back to block' },
    { pattern: /recordAuditEvent/, detail: 'records what it blocked or redacted' },
    { pattern: /dlp_content_blocked/, detail: 'names the block in the trail' },
  ]) {
    if (!required.pattern.test(moduleSource)) {
      failures.push(`${MODULE} no longer ${required.detail}`);
    }
  }

  const scanners = scannerChannels(moduleSource);
  for (const channel of scanners) {
    if (!channels.includes(channel)) {
      failures.push(
        `a scanner declares the channel '${channel}', which OutboundChannel does not; it will ` +
          `never run`,
      );
    }
  }

  const wired = new Set();
  let callSites = 0;
  for (const root of SCAN_ROOTS) {
    for (const file of sourceFiles(path.join(scanRoot, root))) {
      if (path.resolve(file) === path.resolve(modulePath)) continue;
      const source = fs.readFileSync(file, 'utf8');
      if (!source.includes('inspectOutboundContent')) continue;
      for (const channel of wiredChannels(source)) {
        wired.add(channel);
        callSites += 1;
      }
    }
  }

  for (const channel of channels) {
    if (wired.has(channel)) continue;
    const known = UNWIRED.find((entry) => entry.channel === channel);
    if (!known) {
      failures.push(
        `the channel '${channel}' is declared but nothing calls inspectOutboundContent for it, ` +
          `so content leaves that way unscanned`,
      );
      continue;
    }
    if (known.reason.trim().length < 80 || known.owed.trim().length < 40) {
      failures.push(`the baseline entry for '${channel}' needs a reason and the work it owes`);
    }
  }

  for (const entry of UNWIRED) {
    if (!channels.includes(entry.channel)) {
      failures.push(`stale baseline: '${entry.channel}' is no longer a channel`);
    } else if (wired.has(entry.channel)) {
      failures.push(
        `'${entry.channel}' is wired now; remove its baseline entry so the next gap is visible`,
      );
    }
  }

  if (failures.length === 0) {
    console.log(
      `check-outbound-inspection-coverage: ${channels.length} outbound channels, ` +
        `${wired.size} inspected at ${callSites} call sites, ${UNWIRED.length} owed.`,
    );
    process.exit(0);
  }
}

console.error('Content that can leave without being inspected:\n');
for (const failure of failures) console.error(`  - ${failure}`);
for (const entry of UNWIRED) console.error(`\n  owed: ${entry.owed}`);
console.error(`\n${failures.length} finding(s).`);
process.exit(1);
