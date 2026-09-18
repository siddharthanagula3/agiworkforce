#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VETTING_ROOT = join(REPO_ROOT, 'tools', 'skill-vetting');
const LOCK_PATH = join(REPO_ROOT, 'skills-lock.json');

const BLOCKING_RECOMMENDATIONS = new Set(['DO_NOT_INSTALL']);

const FIXTURE_ROOT = 'packages/client/client-runtime/src/plugins/__fixtures__';
const HOSTILE_FIXTURE = join(REPO_ROOT, FIXTURE_ROOT, 'malicious-skill');
const BENIGN_FIXTURE = join(REPO_ROOT, FIXTURE_ROOT, 'benign-skill');

/**
 * An uploaded package lives outside the tree, so the caller names its extracted
 * directory in SKILL_VETTING_EXTRA_ROOTS and it clears the same bar.
 */
function skillRoots() {
  const extra = (process.env['SKILL_VETTING_EXTRA_ROOTS'] ?? '')
    .split(':')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (!existsSync(LOCK_PATH)) return ['.agents/skills', ...extra];
  const lock = JSON.parse(readFileSync(LOCK_PATH, 'utf-8'));
  const roots =
    Array.isArray(lock.roots) && lock.roots.length > 0 ? lock.roots : ['.agents/skills'];
  return [...roots, ...extra];
}

function discoverSkillPackages() {
  const packages = [];
  for (const root of skillRoots()) {
    const absoluteRoot = resolve(REPO_ROOT, root);
    if (!existsSync(absoluteRoot)) continue;
    for (const entry of readdirSync(absoluteRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const packageDir = join(absoluteRoot, entry.name);
      if (existsSync(join(packageDir, 'SKILL.md'))) packages.push(packageDir);
    }
  }
  return packages;
}

function resolveScanner() {
  const fromEnv = process.env['SKILLSPECTOR_BIN'];
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  const venvBin = join(
    process.env['TMPDIR'] ?? '/tmp',
    'skill-vetting-venv',
    'bin',
    'skillspector',
  );
  if (existsSync(venvBin)) return venvBin;
  return null;
}

const DEFAULT_SCAN_TIMEOUT_MS = 120_000;

function scanTimeoutMs() {
  const raw = Number(process.env['SKILL_VETTING_SCAN_TIMEOUT_MS']);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_SCAN_TIMEOUT_MS;
}

function scanVerdict(scanner, packageDir, reportDir) {
  const reportPath = join(reportDir, `${Buffer.from(packageDir).toString('hex').slice(-32)}.json`);
  const timeout = scanTimeoutMs();
  try {
    execFileSync(
      scanner,
      ['scan', packageDir, '--no-llm', '--format', 'json', '--output', reportPath],
      { cwd: VETTING_ROOT, stdio: 'ignore', timeout, killSignal: 'SIGKILL' },
    );
  } catch (error) {
    // A nonzero exit only means "risk score > 50"; the report is still written
    // and is the authoritative source of the verdict. A timeout is different:
    // the scanned package stalled the scanner, so no verdict exists at all.
    if (error?.['code'] === 'ETIMEDOUT' || error?.['signal'] === 'SIGKILL') {
      return { recommendation: null, error: `scanner timed out after ${timeout}ms` };
    }
  }
  if (!existsSync(reportPath)) {
    return { recommendation: null, error: 'scanner produced no report' };
  }
  const report = JSON.parse(readFileSync(reportPath, 'utf-8'));
  return {
    recommendation: report?.risk_assessment?.recommendation ?? null,
    riskScore: report?.risk_score ?? null,
  };
}

const args = process.argv.slice(2);
const selfTest = args.includes('--self-test');
const explicitTargets = args
  .filter((entry) => !entry.startsWith('--'))
  .map((entry) => resolve(REPO_ROOT, entry));
const targets = selfTest
  ? [HOSTILE_FIXTURE, BENIGN_FIXTURE]
  : explicitTargets.length > 0
    ? explicitTargets
    : discoverSkillPackages();

if (targets.length === 0) {
  console.log('No in-repo skill packages to vet.');
  process.exit(0);
}

const scanner = resolveScanner();
if (!scanner) {
  console.error(
    'skillspector is not installed. Provision it with `tools/skill-vetting/verify.sh` (which also proves the gate) or set SKILLSPECTOR_BIN.',
  );
  process.exit(2);
}

const reportDir = mkdtempSync(join(tmpdir(), 'skill-vetting-reports-'));
let blocked = 0;
const verdicts = new Map();
try {
  for (const target of targets) {
    const label = relative(REPO_ROOT, target);
    const { recommendation, riskScore, error } = scanVerdict(scanner, target, reportDir);
    verdicts.set(target, { recommendation, error });
    if (error !== undefined) {
      console.error(`❌ ${label}: ${error}`);
      blocked += 1;
      continue;
    }
    const suffix = riskScore === null ? '' : ` (risk score ${riskScore})`;
    if (recommendation === null) {
      console.error(`❌ ${label}: scanner returned no recommendation${suffix}`);
      blocked += 1;
    } else if (BLOCKING_RECOMMENDATIONS.has(recommendation)) {
      console.error(`❌ ${label}: ${recommendation}${suffix}`);
      blocked += 1;
    } else {
      console.log(`✅ ${label}: ${recommendation}${suffix}`);
    }
  }
} finally {
  rmSync(reportDir, { recursive: true, force: true });
}

// A gate nobody has watched refuse anything is not known to be a gate: the
// hostile fixture must be refused and the ordinary one must not.
if (selfTest) {
  const hostile = verdicts.get(HOSTILE_FIXTURE) ?? {};
  const benign = verdicts.get(BENIGN_FIXTURE) ?? {};
  const failures = [];
  if (!BLOCKING_RECOMMENDATIONS.has(hostile.recommendation)) {
    failures.push(
      `the hostile fixture was not refused (recommendation ${hostile.recommendation ?? 'none'})`,
    );
  }
  if (benign.error !== undefined || BLOCKING_RECOMMENDATIONS.has(benign.recommendation)) {
    failures.push(
      `the ordinary fixture was refused (recommendation ${benign.recommendation ?? 'none'})`,
    );
  }
  if (failures.length > 0) {
    console.error(`Skill vetting self-test failed: ${failures.join('; ')}.`);
    process.exit(1);
  }
  console.log('Skill vetting self-test passed: hostile refused, ordinary allowed.');
  process.exit(0);
}

if (blocked > 0) {
  console.error(`Skill vetting failed for ${blocked} package(s).`);
  process.exit(1);
}
console.log(`Skill vetting passed for ${targets.length} package(s).`);
