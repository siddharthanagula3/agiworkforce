#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const SURFACES = [
  {
    name: 'web',
    proof: 'apps/web/__tests__/trust-boundary.test.ts',
    cmd: ['pnpm', ['--filter', '@agiworkforce/web', 'run', 'test', 'trust-boundary.test']],
  },
  {
    name: 'extension',
    proof: 'apps/extension/__tests__/trust-boundary.test.ts',
    cmd: ['pnpm', ['--filter', '@agiworkforce/extension', 'run', 'test', 'trust-boundary.test']],
  },
  {
    name: 'mobile',
    proof: 'apps/mobile/__tests__/trust-boundary.test.ts',
    cmd: ['pnpm', ['--filter', '@agiworkforce/mobile', 'run', 'test', 'trust-boundary.test']],
  },
  {
    name: 'extension-vscode',
    proof: 'apps/extension-vscode/src/__tests__/trust-boundary.test.ts',
    cmd: ['pnpm', ['--filter', 'agi-workforce', 'run', 'test', 'trust-boundary.test']],
  },
  {
    name: 'local-runtime-classification',
    proof: 'packages/contracts/types/src/__tests__/trust-boundary.test.ts',
    cmd: ['pnpm', ['--filter', '@agiworkforce/types', 'run', 'test', 'trust-boundary.test']],
  },
  {
    name: 'desktop-routing',
    proof: 'apps/desktop/src-tauri/src/core/llm/tests/routing_logic_tests.rs',
    cmd: ['cargo', ['test', '-p', 'agiworkforce-desktop', '--lib', 'routing_logic_tests']],
  },
  {
    name: 'desktop-cloud-sync',
    proof: 'apps/desktop/src-tauri/src/sys/commands/chat/send_message_setup.rs',
    cmd: ['cargo', ['test', '-p', 'agiworkforce-desktop', '--lib', 'send_message_setup::tests']],
  },
];

const failures = [];

const desktopCargo = fs.readFileSync(path.join(root, 'apps/desktop/src-tauri/Cargo.toml'), 'utf8');
const desktopNativeDiagnosticSources = [
  'apps/desktop/src-tauri/src/sys/commands/error_reporting.rs',
  'apps/desktop/src-tauri/src/sys/telemetry/mod.rs',
  'apps/desktop/src-tauri/src/sys/telemetry/tracing.rs',
];
const nativeDiagnosticSource = desktopNativeDiagnosticSources
  .map((relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8'))
  .join('\n');
if (
  /^\s*sentry\s*=/m.test(desktopCargo) ||
  /SENTRY_DSN|sentry::|X-Sentry-Auth|\/api\/[^/]+\/store\//.test(nativeDiagnosticSource)
) {
  console.error(
    '\n❌ [trust-boundaries] desktop-native-diagnostics: remote native crash egress bypasses the renderer-owned consent boundary',
  );
  failures.push('desktop-native-diagnostics');
} else {
  console.log(
    '\n✅ [trust-boundaries] desktop-native-diagnostics: panic and submitted diagnostics remain local-only',
  );
}

for (const surface of SURFACES) {
  const proofPath = path.join(root, surface.proof);
  if (!fs.existsSync(proofPath)) {
    console.error(
      `\n❌ [trust-boundaries] ${surface.name}: missing contract test ${surface.proof}`,
    );
    failures.push(surface.name);
    continue;
  }
  console.log(`\n──────── trust-boundaries · ${surface.name} ────────`);
  try {
    execFileSync(surface.cmd[0], surface.cmd[1], { stdio: 'inherit', cwd: root });
  } catch {
    failures.push(surface.name);
  }
}

if (failures.length > 0) {
  console.error(`\n❌ [trust-boundaries] FAILED in: ${failures.join(', ')}`);
  process.exit(1);
}
console.log(
  `\n✅ [trust-boundaries] all surfaces passed: ${SURFACES.map((s) => s.name).join(', ')}`,
);
