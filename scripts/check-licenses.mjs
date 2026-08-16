#!/usr/bin/env node

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NOTICES = join(ROOT, 'THIRD_PARTY_LICENSES.md');

const ALLOWED = new Set([
  'MIT',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  '0BSD',
  'Unlicense',
  'CC0-1.0',
  'Zlib',
  'Python-2.0',
  'BlueOak-1.0.0',
]);

const DENIED = new Set([
  'AGPL-1.0',
  'AGPL-3.0',
  'AGPL-3.0-only',
  'AGPL-3.0-or-later',
  'GPL-2.0',
  'GPL-3.0',
  'GPL-3.0-only',
  'GPL-3.0-or-later',
  'SSPL-1.0',
  'BUSL-1.1',
  'FSL-1.1',
  'FSL-1.1-MIT',
  'FSL-1.1-ALv2',
  'SONAR',
  'Commons-Clause',
  'NONE',
  'UNLICENSED',
  'PROPRIETARY',
]);

const REVIEW = new Set([
  'LGPL-2.1',
  'LGPL-3.0',
  'MPL-2.0',
  'EPL-2.0',
  'CC-BY-NC-4.0',
  'PolyForm-Free-Trial-1.0.0',
  'PolyForm-Noncommercial-1.0.0',
  'NOASSERTION',
]);

const DENIED_UPSTREAMS = [
  'claude-code',
  'anthropics/claude-code',
  'crush',
  'auto-code-rover',
  'devon',
  'ultralytics',
];

function classify(rawLicense) {
  const spdx = (rawLicense.replace(/[`*[\]]/g, '').match(/[A-Za-z0-9.+-]+/) || [''])[0];
  if (DENIED.has(spdx)) return { spdx, verdict: 'denied' };
  if (ALLOWED.has(spdx)) return { spdx, verdict: 'allowed' };
  if (REVIEW.has(spdx)) return { spdx, verdict: 'review' };
  return { spdx, verdict: 'unknown' };
}

function scanNotices(text) {
  const violations = [];
  const warnings = [];
  const blocks = text.split(/\n## /).slice(1);
  for (const block of blocks) {
    const name = block.split('\n')[0].trim();
    const licenseMatch = block.match(/^\s*-\s*\*\*License\*\*:\s*([^\n]+)/im);
    if (!licenseMatch) continue;
    const upstream = (block.match(/^\s*-\s*\*\*Upstream\*\*:\s*([^\n]+)/im) || [
      '',
      '',
    ])[1].toLowerCase();
    const { spdx, verdict } = classify(licenseMatch[1]);
    if (verdict === 'denied') {
      violations.push(`"${name}": forbidden license ${spdx}`);
    } else if (verdict === 'unknown') {
      violations.push(
        `"${name}": unrecognized license "${licenseMatch[1].trim()}" — classify it in scripts/check-licenses.mjs`,
      );
    } else if (verdict === 'review') {
      warnings.push(`"${name}": ${spdx} requires manual legal review`);
    }
    const badUpstream = DENIED_UPSTREAMS.find((bad) => upstream.includes(bad));
    if (badUpstream) {
      violations.push(
        `"${name}": upstream "${badUpstream}" is study-only and must never be ported`,
      );
    }
  }
  return { violations, warnings };
}

function selftest() {
  const fixture = [
    '# fixture',
    '## BadLicense',
    '- **Upstream**: [foo/bar](https://example.com)',
    '- **License**: AGPL-3.0',
    '## ProprietaryUpstream',
    '- **Upstream**: anthropics/claude-code',
    '- **License**: MIT',
    '## DocSection',
    'A table or note with no license line must be ignored.',
  ].join('\n');
  const { violations } = scanNotices(fixture);
  const caughtLicense = violations.some((m) => m.includes('AGPL-3.0'));
  const caughtUpstream = violations.some((m) => m.includes('claude-code'));
  if (caughtLicense && caughtUpstream && violations.length === 2) {
    console.log('✓ selftest passed: gate catches forbidden license + upstream');
    process.exit(0);
  }
  console.error('✗ selftest FAILED:', JSON.stringify(violations));
  process.exit(1);
}

function main() {
  if (process.argv.slice(2).includes('--selftest')) selftest();
  if (!existsSync(NOTICES)) {
    console.error('✗ license-gate: THIRD_PARTY_LICENSES.md not found');
    process.exit(1);
  }
  const { violations, warnings } = scanNotices(readFileSync(NOTICES, 'utf8'));
  for (const w of warnings) console.warn(`⚠ ${w}`);
  if (violations.length) {
    console.error(`\n✗ license-gate: ${violations.length} violation(s)\n`);
    for (const v of violations) console.error(`  - ${v}`);
    console.error('\nPolicy: docs/strategy/11-execution-playbook.md §0\n');
    process.exit(1);
  }
  console.log('✓ license-gate: all attributed ports carry an allowed license');
}

main();
