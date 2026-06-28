#!/usr/bin/env node
/**
 * Unified trust-boundary contract gate (INC-0.3).
 *
 * The trust boundaries are the platform's P0 invariants (AGI Invariants 1–9):
 *   - Local mode never silently routes to BYOK or Managed cloud.
 *   - Local mode never talks to AGI Cloud.
 *   - BYOK is Local-only, user-supplied keys, no AGI-funded compute / no markup.
 *   - Managed cloud is the only AGI-funded surface.
 *
 * Each surface already owns trust-boundary tests, but they live in different
 * places and run under different runners (vitest / jest / cargo), so there was
 * no single command CI (or an agent) could run to assert "the boundaries hold
 * across every surface." This script IS that command — it runs each surface's
 * trust-boundary contract tests through the surface's own runner (so per-surface
 * config/aliases stay the single source of truth) and fails if any surface fails.
 *
 * This is a real aggregator over real tests — not a stub. If a surface's
 * trust-boundary file is moved or renamed, this gate goes red (a missing
 * surface is a failure, never a silent skip), which is the point.
 *
 * Usage:  node scripts/check-trust-boundaries.mjs
 * Exit:   0 = every surface passed · 1 = at least one surface failed/missing.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

/**
 * Each surface declares how to run its trust-boundary contract tests. `proof`
 * is a file that MUST exist (so a renamed/removed test file fails the gate
 * loudly instead of running zero tests and reporting green).
 */
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
    // Desktop's P0 invariant: pure Local mode must never yield a ManagedCloud
    // routing candidate (apps/desktop/src-tauri/src/core/llm/tests/routing_logic_tests.rs).
    name: 'desktop-routing',
    proof: 'apps/desktop/src-tauri/src/core/llm/tests/routing_logic_tests.rs',
    cmd: ['cargo', ['test', '-p', 'agiworkforce-desktop', '--lib', 'routing_logic_tests']],
  },
  {
    // Desktop's P0 egress gate: a Local session must NEVER sync data to AGI Cloud,
    // regardless of stored storage preference (derive_cloud_sync_enabled — DESK-6).
    name: 'desktop-cloud-sync',
    proof: 'apps/desktop/src-tauri/src/sys/commands/chat/send_message_setup.rs',
    cmd: ['cargo', ['test', '-p', 'agiworkforce-desktop', '--lib', 'send_message_setup::tests']],
  },
];

const failures = [];
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
