/**
 * AGI Guardian scan CLI — the deterministic worker entry point.
 *
 * Runs the curated repository checks, normalizes their results into the
 * Guardian finding schema, applies `.agi-guardian.yml` policy, and writes:
 *
 *   guardian-report.json  — full run record (findings, scanner runs, decision)
 *   guardian-checks.json  — ready-to-POST Check Run payloads
 *   guardian-summary.md   — the single editable PR summary comment body
 *
 * Exit code: 0 unless the policy decision is `failure` (blocking mode only),
 * or the runner itself crashes. Shadow/advisory runs always exit 0 so the
 * workflow stays green while the check-run conclusions carry the verdict.
 *
 * Security: child processes are spawned with argument arrays (no shell), a
 * hard timeout, and bounded output capture; all captured output is
 * secret-redacted before it reaches findings or logs.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  GUARDIAN_CONFIG_FILENAME,
  ReviewRunSchema,
  adapters,
  dedupeFindings,
  evaluatePolicy,
  parseGuardianConfig,
  type Finding,
  type ScannerRun,
} from '@agiworkforce/guardian-core';

import {
  CHECK_TIMEOUT_MS,
  DEEP_CHECKS,
  DEEP_CHECK_TIMEOUT_MS,
  FAST_CHECKS,
  type CatalogEntry,
} from './checks-catalog.js';
import {
  CHECK_NAMES,
  buildCategoryCheck,
  buildPolicyCheck,
  type CategoryCheck,
} from '../checks.js';
import { buildSummaryComment } from '../summary.js';

const MAX_OUTPUT_TAIL = 20_000;

interface CliArgs {
  repoRoot: string;
  outputDir: string;
  headSha: string;
  baseSha: string | null;
  deep: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const get = (flag: string): string | null => {
    const index = argv.indexOf(flag);
    const value = index >= 0 ? argv[index + 1] : undefined;
    return value !== undefined && !value.startsWith('--') ? value : null;
  };
  const repoRoot = resolve(get('--repo-root') ?? process.cwd());
  return {
    repoRoot,
    outputDir: resolve(get('--output-dir') ?? join(repoRoot, '.guardian')),
    headSha: get('--head-sha') ?? process.env['GITHUB_SHA'] ?? 'unknown',
    baseSha: get('--base-sha'),
    deep: argv.includes('--deep'),
  };
}

function runCheck(
  entry: CatalogEntry,
  repoRoot: string,
  timeoutMs: number,
): Promise<{ execution: adapters.RepoCheckExecution; durationMs: number }> {
  return new Promise((resolvePromise) => {
    const startedAt = Date.now();
    // Argument array, no shell: the script name comes from our own catalog,
    // never from repository-controlled input.
    const child = spawn('pnpm', ['run', entry.script], {
      cwd: repoRoot,
      shell: false,
      timeout: timeoutMs,
      env: { ...process.env, FORCE_COLOR: '0', CI: process.env['CI'] ?? 'true' },
    });
    let tail = '';
    const capture = (chunk: Buffer) => {
      tail = (tail + chunk.toString('utf8')).slice(-MAX_OUTPUT_TAIL);
    };
    child.stdout.on('data', capture);
    child.stderr.on('data', capture);
    child.on('error', () => {
      resolvePromise({
        execution: {
          exitCode: null,
          outputTail: tail || 'failed to spawn pnpm',
          failedToRun: true,
        },
        durationMs: Date.now() - startedAt,
      });
    });
    child.on('close', (code, signal) => {
      resolvePromise({
        execution: {
          exitCode: code,
          outputTail: tail,
          failedToRun: signal !== null, // timeout or external kill
        },
        durationMs: Date.now() - startedAt,
      });
    });
  });
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const runId = `local-${args.headSha.slice(0, 12)}-${Date.now()}`;

  let configText: string | null = null;
  try {
    configText = readFileSync(join(args.repoRoot, GUARDIAN_CONFIG_FILENAME), 'utf8');
  } catch {
    configText = null;
  }
  const { config, errors: configErrors, source: configSource } = parseGuardianConfig(configText);
  if (configErrors.length > 0) {
    console.error(
      `[guardian] invalid ${GUARDIAN_CONFIG_FILENAME}; running with fail-closed defaults:`,
    );
    for (const error of configErrors) console.error(`  - ${error}`);
  }

  const runContext: adapters.RunContext = {
    repositoryId: 0,
    installationId: 0,
    reviewRunId: runId,
    headSha: args.headSha,
    baseSha: args.baseSha,
    now: () => new Date(),
  };

  const scannerRuns: ScannerRun[] = [];
  const findings: Finding[] = [];

  const checks = args.deep ? [...FAST_CHECKS, ...DEEP_CHECKS] : FAST_CHECKS;
  const timeoutMs = args.deep ? DEEP_CHECK_TIMEOUT_MS : CHECK_TIMEOUT_MS;
  for (const entry of checks) {
    console.error(`[guardian] running ${entry.script} ...`);
    const { execution, durationMs } = await runCheck(entry, args.repoRoot, timeoutMs);
    const outcome = adapters.parseRepoCheckResult(entry, execution);
    const finalized = adapters.finalizeOutcome(
      {
        scannerId: entry.script,
        sourceType: 'repo-check',
        version: 'repo',
        durationMs,
        exitCode: execution.exitCode,
      },
      outcome,
      runContext,
    );
    scannerRuns.push(finalized.scannerRun);
    findings.push(...finalized.findings);
    console.error(
      `[guardian]   ${finalized.scannerRun.status} in ${Math.round(durationMs / 1000)}s`,
    );
  }

  const deduped = dedupeFindings(findings);
  const decision = evaluatePolicy(deduped, scannerRuns, config);

  const reviewRun = ReviewRunSchema.parse({
    run_id: runId,
    repository: process.env['GITHUB_REPOSITORY'] ?? 'local',
    repository_id: 0,
    installation_id: 0,
    event_type: 'push',
    base_sha: args.baseSha,
    head_sha: args.headSha,
    mode: config.mode,
    scanner_runs: scannerRuns,
    created_at: new Date().toISOString(),
  });

  // Build category check payloads: findings grouped by catalog group.
  const groups: Record<
    CatalogEntry['group'],
    { name: string; findings: Finding[]; scanners: ScannerRun[] }
  > = {
    security: { name: CHECK_NAMES.security, findings: [], scanners: [] },
    correctness: { name: CHECK_NAMES.correctness, findings: [], scanners: [] },
    architecture: { name: CHECK_NAMES.architecture, findings: [], scanners: [] },
    'technical-debt': { name: CHECK_NAMES['technical-debt'], findings: [], scanners: [] },
  };
  const groupByScript = new Map(checks.map((entry) => [entry.script, entry.group]));
  for (const scanner of scannerRuns) {
    const group = groupByScript.get(scanner.scanner_id);
    if (group) groups[group].scanners.push(scanner);
  }
  for (const finding of deduped) {
    const group = groupByScript.get(finding.source) ?? 'correctness';
    groups[group].findings.push(finding);
  }

  const categoryChecks: CategoryCheck[] = Object.values(groups).map((group) =>
    buildCategoryCheck(group.name, args.headSha, group.findings, group.scanners),
  );
  const policyCheck = buildPolicyCheck(args.headSha, decision);

  const summary = buildSummaryComment({
    headSha: args.headSha,
    mode: config.mode,
    decision,
    findings: deduped,
    fixedSincePreviousRun: [],
    scannerRuns,
  });

  mkdirSync(args.outputDir, { recursive: true });
  writeFileSync(
    join(args.outputDir, 'guardian-report.json'),
    JSON.stringify(
      {
        schema_version: 1,
        config_source: configSource,
        review_run: reviewRun,
        findings: deduped,
        decision,
      },
      null,
      2,
    ),
  );
  writeFileSync(
    join(args.outputDir, 'guardian-checks.json'),
    JSON.stringify({ category_checks: categoryChecks, policy_check: policyCheck }, null, 2),
  );
  writeFileSync(join(args.outputDir, 'guardian-summary.md'), summary);

  console.error(
    `[guardian] ${deduped.length} finding(s); policy: ${decision.conclusion} (${config.mode} mode); reports in ${args.outputDir}`,
  );
  return decision.conclusion === 'failure' ? 2 : 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error('[guardian] runner crashed:', error);
    process.exit(3);
  },
);
