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

function skillRoots() {
  if (!existsSync(LOCK_PATH)) return ['.agents/skills'];
  const lock = JSON.parse(readFileSync(LOCK_PATH, 'utf-8'));
  return Array.isArray(lock.roots) && lock.roots.length > 0 ? lock.roots : ['.agents/skills'];
}

function discoverSkillPackages() {
  const packages = [];
  for (const root of skillRoots()) {
    const absoluteRoot = join(REPO_ROOT, root);
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

function scanVerdict(scanner, packageDir, reportDir) {
  const reportPath = join(reportDir, `${Buffer.from(packageDir).toString('hex').slice(-32)}.json`);
  try {
    execFileSync(
      scanner,
      ['scan', packageDir, '--no-llm', '--format', 'json', '--output', reportPath],
      { cwd: VETTING_ROOT, stdio: 'ignore' },
    );
  } catch {
    // A nonzero exit only means "risk score > 50"; the report is still written
    // and is the authoritative source of the verdict.
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

const explicitTargets = process.argv.slice(2).map((entry) => resolve(REPO_ROOT, entry));
const targets = explicitTargets.length > 0 ? explicitTargets : discoverSkillPackages();

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
try {
  for (const target of targets) {
    const label = relative(REPO_ROOT, target);
    const { recommendation, riskScore, error } = scanVerdict(scanner, target, reportDir);
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

if (blocked > 0) {
  console.error(`Skill vetting failed for ${blocked} package(s).`);
  process.exit(1);
}
console.log(`Skill vetting passed for ${targets.length} package(s).`);
