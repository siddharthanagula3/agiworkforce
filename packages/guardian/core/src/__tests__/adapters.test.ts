import { describe, expect, it } from 'vitest';

import { finalizeFinding, finalizeOutcome } from '../adapters/builder.js';
import { parseEslintOutput } from '../adapters/eslint.js';
import { parseGitleaksOutput } from '../adapters/gitleaks.js';
import { parseKnipOutput } from '../adapters/knip.js';
import { parseRepoCheckResult } from '../adapters/repo-check.js';
import { parseSemgrepOutput } from '../adapters/semgrep.js';
import { redactSecrets } from '../adapters/types.js';
import type { RunContext } from '../adapters/builder.js';

const ctx: RunContext = {
  repositoryId: 1,
  installationId: 10,
  reviewRunId: 'run-1',
  headSha: 'headsha',
  now: () => new Date('2026-08-09T00:00:00.000Z'),
  newId: () => '00000000-0000-4000-8000-000000000001',
};

describe('parseEslintOutput', () => {
  it('maps error-severity messages to findings and skips warnings', () => {
    const output = JSON.stringify([
      {
        filePath: '/repo/apps/web/a.ts',
        messages: [
          {
            ruleId: 'no-unused-vars',
            severity: 2,
            message: "'x' is defined but never used.",
            line: 3,
            endLine: 3,
          },
          {
            ruleId: 'prefer-const',
            severity: 1,
            message: 'warning stays with the linter',
            line: 9,
          },
        ],
      },
      { filePath: '/repo/apps/web/b.ts', messages: [] },
    ]);
    const outcome = parseEslintOutput(output, '/repo');
    expect(outcome.status).toBe('findings');
    expect(outcome.findings).toHaveLength(1);
    expect(outcome.findings[0]?.path).toBe('apps/web/a.ts');
    expect(outcome.findings[0]?.rule_id).toBe('eslint/no-unused-vars');
  });

  it('reports clean for zero errors and scanner-failed for garbage', () => {
    expect(parseEslintOutput('[]', '/repo').status).toBe('clean');
    expect(parseEslintOutput('not json', '/repo').status).toBe('scanner-failed');
    expect(parseEslintOutput('{"unexpected": true}', '/repo').status).toBe('scanner-failed');
  });
});

describe('parseKnipOutput', () => {
  it('maps unused files, dependencies, and exports', () => {
    const output = JSON.stringify({
      files: ['apps/web/dead.ts'],
      issues: [
        {
          file: 'apps/web/package.json',
          dependencies: [{ name: 'left-pad' }],
          exports: [{ name: 'unusedHelper', line: 12 }],
        },
      ],
    });
    const outcome = parseKnipOutput(output);
    expect(outcome.status).toBe('findings');
    expect(outcome.findings.map((f) => f.rule_id).sort()).toEqual([
      'knip/unused-dependency',
      'knip/unused-export',
      'knip/unused-file',
    ]);
    expect(outcome.findings.every((f) => f.category === 'technical-debt')).toBe(true);
  });

  it('reports scanner-failed on unparseable output', () => {
    expect(parseKnipOutput('¯\\_(ツ)_/¯').status).toBe('scanner-failed');
  });
});

describe('parseGitleaksOutput', () => {
  it('produces critical secret findings without ever carrying the secret', () => {
    const output = JSON.stringify([
      {
        RuleID: 'github-pat',
        Description: 'GitHub personal access token',
        File: 'apps/web/config.ts',
        StartLine: 4,
        EndLine: 4,
        Secret: 'ghp_abcdefghijklmnopqrstuvwxyz123456789012',
        Match: 'token = ghp_abcdefghijklmnopqrstuvwxyz123456789012',
      },
    ]);
    const outcome = parseGitleaksOutput(output);
    expect(outcome.status).toBe('findings');
    const finding = outcome.findings[0];
    expect(finding?.severity).toBe('critical');
    expect(JSON.stringify(outcome)).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz123456789012');
  });

  it('treats an empty report as clean and garbage as scanner-failed', () => {
    expect(parseGitleaksOutput('[]').status).toBe('clean');
    expect(parseGitleaksOutput('').status).toBe('clean');
    expect(parseGitleaksOutput('{oops').status).toBe('scanner-failed');
  });
});

describe('parseSemgrepOutput', () => {
  it('maps results with security metadata to security findings', () => {
    const output = JSON.stringify({
      results: [
        {
          check_id: 'rules.security.no-shell-concat',
          path: 'apps/cli/src/run.rs',
          start: { line: 10 },
          end: { line: 12 },
          extra: {
            message: 'Shell command built by string concatenation',
            severity: 'ERROR',
            metadata: { cwe: 'CWE-78', confidence: 'HIGH' },
          },
        },
      ],
      errors: [],
    });
    const outcome = parseSemgrepOutput(output);
    expect(outcome.status).toBe('findings');
    expect(outcome.findings[0]?.category).toBe('security');
    expect(outcome.findings[0]?.severity).toBe('high');
  });

  it('reports scanner-failed on malformed output', () => {
    expect(parseSemgrepOutput('null').status).toBe('scanner-failed');
  });
});

describe('parseRepoCheckResult', () => {
  const spec = {
    script: 'check:trust-boundaries',
    category: 'security' as const,
    severity: 'high' as const,
    impact: 'A trust-boundary violation can silently route local data to the cloud.',
  };

  it('maps exit 0 to clean', () => {
    expect(
      parseRepoCheckResult(spec, { exitCode: 0, outputTail: 'ok', failedToRun: false }).status,
    ).toBe('clean');
  });

  it('maps a nonzero exit to one finding with output evidence', () => {
    const outcome = parseRepoCheckResult(spec, {
      exitCode: 1,
      outputTail: 'trust boundary violation in apps/web/lib/x.ts',
      failedToRun: false,
    });
    expect(outcome.status).toBe('findings');
    expect(outcome.findings[0]?.evidence).toContain('trust boundary violation');
  });

  it('maps spawn failure and null exit codes to scanner-failed, never clean', () => {
    expect(
      parseRepoCheckResult(spec, { exitCode: null, outputTail: '', failedToRun: false }).status,
    ).toBe('scanner-failed');
    expect(
      parseRepoCheckResult(spec, { exitCode: 0, outputTail: 'ENOENT', failedToRun: true }).status,
    ).toBe('scanner-failed');
  });
});

describe('finalize', () => {
  it('produces schema-valid findings with deterministic ids and fingerprints', () => {
    const outcome = parseRepoCheckResult(
      { script: 'check:x', category: 'correctness', severity: 'medium', impact: 'impact' },
      { exitCode: 1, outputTail: 'failed', failedToRun: false },
    );
    const { scannerRun, findings } = finalizeOutcome(
      {
        scannerId: 'check:x',
        sourceType: 'repo-check',
        version: 'repo',
        durationMs: 5,
        exitCode: 1,
      },
      outcome,
      ctx,
    );
    expect(scannerRun.status).toBe('findings');
    expect(scannerRun.finding_count).toBe(1);
    expect(findings[0]?.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(findings[0]?.first_seen_sha).toBe('headsha');
  });

  it('records scanner-failed runs with an error and zero findings', () => {
    const { scannerRun, findings } = finalizeOutcome(
      {
        scannerId: 'check:y',
        sourceType: 'repo-check',
        version: 'repo',
        durationMs: 5,
        exitCode: null,
      },
      { status: 'scanner-failed', findings: [], error: 'crashed hard' },
      ctx,
    );
    expect(scannerRun.status).toBe('scanner-failed');
    expect(scannerRun.error).toBe('crashed hard');
    expect(findings).toEqual([]);
  });

  it('finalizeFinding computes stable fingerprints for identical raw findings', () => {
    const raw = {
      rule_id: 'r',
      source: 's',
      source_type: 'repo-check' as const,
      category: 'correctness' as const,
      severity: 'low' as const,
      confidence: 1,
      path: './a.ts',
      title: 't',
      evidence: 'e',
      impact: 'i',
    };
    expect(finalizeFinding(raw, ctx).fingerprint).toBe(finalizeFinding(raw, ctx).fingerprint);
  });
});

describe('redactSecrets', () => {
  it('redacts common credential shapes', () => {
    const awsAccessKeyFixture = ['AKIA', 'ABCDEFGHIJKLMNOP'].join('');
    const pemPrivateKeyFixture = [
      '-----BEGIN ',
      'RSA PRIVATE KEY-----\nMIIB\n-----END RSA PRIVATE KEY-----',
    ].join('');
    const text = [
      'ghp_abcdefghijklmnopqrstuvwxyz1234567890',
      'sk-proj-abcdefghijklmnop',
      awsAccessKeyFixture,
      'password = "hunter2secret"',
      pemPrivateKeyFixture,
    ].join(' ');
    const redacted = redactSecrets(text);
    expect(redacted).not.toContain('ghp_');
    expect(redacted).not.toContain('sk-proj');
    expect(redacted).not.toContain('AKIA');
    expect(redacted).not.toContain('hunter2secret');
    expect(redacted).not.toContain('MIIB');
  });

  it('redacts the whole remainder of an authorization line and bearer tokens', () => {
    const opaque = 'Zk9pQ2xhc3NpZmllZFRva2VuOTk5MTIz';
    expect(redactSecrets(`Authorization: Bearer ${opaque}`)).not.toContain(opaque);
    expect(redactSecrets(`x-forwarded-authorization = ${opaque} trailing`)).not.toContain(opaque);
    expect(redactSecrets(`retrying with bearer ${opaque}`)).not.toContain(opaque);
  });

  it('redacts JWTs, quoted JSON credential values, and vendor key prefixes', () => {
    const jwt = [
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
      'eyJzdWIiOiIxMjM0NTY3ODkwIn0',
      'S1gN4tuR3xyz',
    ].join('.');
    expect(redactSecrets(`token expired: ${jwt}`)).not.toContain('eyJzdWIiOiIxMjM0NTY3ODkw');

    expect(redactSecrets('{"token": "gArBaGe1234567890xyz"}')).not.toContain(
      'gArBaGe1234567890xyz',
    );
    expect(redactSecrets("{'api_key' : 'gArBaGe1234567890xyz'}")).not.toContain(
      'gArBaGe1234567890xyz',
    );
    expect(
      redactSecrets('AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMIK7MDENGbPxRfiCYEXAMPLEKEY'),
    ).not.toContain('wJalrXUtnFEMIK7MDENG');

    const stripeFixture = ['sk', '_live_', 'Qw3rTy0987654321AbCdEfGh'].join('');
    const webhookFixture = ['whsec', '_', 'Zx8Cv7Bn6Mq5Lp4Kj3Hg2Fd1'].join('');
    const googleFixture = ['AIza', 'Sy0987654321AbCdEfGhIjKlMnOpQrStUv'].join('');
    expect(redactSecrets(stripeFixture)).toBe('[REDACTED]');
    expect(redactSecrets(webhookFixture)).toBe('[REDACTED]');
    expect(redactSecrets(googleFixture)).toBe('[REDACTED]');
  });

  it('redacts unprefixed high-entropy tokens without eating ordinary evidence', () => {
    const opaque = 'A1b2C3d4E5f6G7h8I9j0KlMnOpQrStUv';
    expect(redactSecrets(`connect failed with ${opaque}`)).toBe('connect failed with [REDACTED]');
    expect(redactSecrets('deadbeefcafebabe1234567890abcdef12345678')).toBe(
      'deadbeefcafebabe1234567890abcdef12345678',
    );
    expect(redactSecrets('packages/guardian/core/src/adapters/types.ts failed typecheck')).toBe(
      'packages/guardian/core/src/adapters/types.ts failed typecheck',
    );
  });

  it('stays linear on long adversarial input', () => {
    const started = Date.now();
    redactSecrets(`${'a'.repeat(60_000)} password`);
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});
