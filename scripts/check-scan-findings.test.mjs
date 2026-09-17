import assert from 'node:assert/strict';
import test from 'node:test';

import {
  gateFindings,
  normalizeTrivyReport,
  normalizeZapReport,
  parseAllowlist,
} from './check-scan-findings.mjs';

const ALLOWLIST_PATH = 'scripts/scan-allowlist.json';

function collector() {
  const errors = [];
  return { errors, fail: (message) => errors.push(message) };
}

function entry(overrides = {}) {
  return {
    id: 'CVE-2026-0001',
    scanner: 'trivy',
    owner: '@siddhartha',
    expires: '2099-01-01',
    reason: 'Not reachable from any runtime path.',
    ...overrides,
  };
}

test('a trivy report flattens vulnerabilities, misconfigurations and secrets', () => {
  const findings = normalizeTrivyReport({
    Results: [
      {
        Target: 'agiworkforce-web (debian 12)',
        Vulnerabilities: [
          {
            VulnerabilityID: 'CVE-2026-0001',
            PkgName: 'libfoo',
            InstalledVersion: '1.2.3',
            Severity: 'critical',
            Title: 'heap overflow',
          },
        ],
      },
      {
        Target: 'apps/web/Dockerfile',
        Misconfigurations: [{ ID: 'DS002', Severity: 'HIGH', Title: 'root user' }],
      },
      {
        Target: 'apps/web/.env',
        Secrets: [{ RuleID: 'stripe-secret', StartLine: 4, Severity: 'CRITICAL', Title: 'key' }],
      },
    ],
  });

  assert.deepEqual(
    findings.map((finding) => [finding.id, finding.severity, finding.location]),
    [
      ['CVE-2026-0001', 'CRITICAL', 'agiworkforce-web (debian 12):libfoo@1.2.3'],
      ['DS002', 'HIGH', 'apps/web/Dockerfile'],
      ['stripe-secret', 'CRITICAL', 'apps/web/.env:4'],
    ],
  );
});

test('a zap report maps risk codes onto the shared severity ladder', () => {
  const findings = normalizeZapReport({
    site: [
      {
        '@name': 'http://127.0.0.1:3000',
        alerts: [
          {
            pluginid: '10038',
            alert: 'Content Security Policy Header Not Set',
            riskcode: '2',
            instances: [{ uri: 'http://127.0.0.1:3000/login' }],
          },
          { pluginid: '10096', alert: 'Timestamp Disclosure', riskcode: '0', instances: [] },
        ],
      },
    ],
  });

  assert.deepEqual(
    findings.map((finding) => [finding.id, finding.severity, finding.location]),
    [
      ['10038', 'MEDIUM', 'http://127.0.0.1:3000/login'],
      ['10096', 'UNKNOWN', 'http://127.0.0.1:3000'],
    ],
  );
});

test('an allowlist entry missing an owner, a reason or an expiry is rejected', () => {
  for (const override of [{ owner: 'siddhartha' }, { reason: '  ' }, { expires: 'soon' }]) {
    const { errors, fail } = collector();
    parseAllowlist(
      { entries: [entry(override)] },
      { allowlistPath: ALLOWLIST_PATH, today: '2026-09-17', fail },
    );
    assert.equal(errors.length, 1, JSON.stringify(override));
  }
});

test('an expired acceptance fails even though the finding still matches', () => {
  const { errors, fail } = collector();
  const allowlist = parseAllowlist(
    { entries: [entry({ expires: '2026-09-16' })] },
    { allowlistPath: ALLOWLIST_PATH, today: '2026-09-17', fail },
  );

  assert.equal(allowlist.length, 0);
  assert.match(errors[0], /expired on 2026-09-16/u);
});

test('findings below the severity floor are out of scope and never need an acceptance', () => {
  const { errors, fail } = collector();
  const inScope = gateFindings({
    findings: normalizeTrivyReport({
      Results: [
        {
          Target: 'image',
          Vulnerabilities: [
            { VulnerabilityID: 'CVE-2026-0002', PkgName: 'a', Severity: 'MEDIUM' },
            { VulnerabilityID: 'CVE-2026-0003', PkgName: 'b', Severity: 'LOW' },
          ],
        },
      ],
    }),
    allowlist: [],
    minSeverity: 'HIGH',
    scanner: 'trivy',
    fail,
  });

  assert.deepEqual(errors, []);
  assert.equal(inScope.length, 0);
});

test('an unaccepted finding at or above the floor fails the gate', () => {
  const { errors, fail } = collector();
  gateFindings({
    findings: normalizeTrivyReport({
      Results: [
        {
          Target: 'image',
          Vulnerabilities: [
            { VulnerabilityID: 'CVE-2026-0004', PkgName: 'a', Severity: 'CRITICAL', Title: 'rce' },
          ],
        },
      ],
    }),
    allowlist: [],
    minSeverity: 'HIGH',
    scanner: 'trivy',
    fail,
  });

  assert.equal(errors.length, 1);
  assert.match(errors[0], /unaccepted: image:a@\? \[CRITICAL\] CVE-2026-0004/u);
});

test('an acceptance that matches nothing fails as stale', () => {
  const { errors, fail } = collector();
  gateFindings({
    findings: [],
    allowlist: [{ ...entry(), matched: 0 }],
    minSeverity: 'HIGH',
    scanner: 'trivy',
    fail,
  });

  assert.equal(errors.length, 1);
  assert.match(errors[0], /^stale: /u);
});

test('an acceptance is scoped to one scanner, so a zap id never excuses a trivy finding', () => {
  const { errors, fail } = collector();
  gateFindings({
    findings: [
      { id: '10038', location: 'image', severity: 'HIGH', title: 'x', scanner: 'trivy' },
      { id: '10038', location: 'http://host/', severity: 'HIGH', title: 'x', scanner: 'zap' },
    ],
    allowlist: [{ ...entry({ id: '10038', scanner: 'zap' }), matched: 0 }],
    minSeverity: 'HIGH',
    scanner: 'trivy',
    fail,
  });

  assert.deepEqual(errors.length, 1);
  assert.match(errors[0], /unaccepted: image/u);
});

test('a locations-scoped acceptance does not cover the same id somewhere else', () => {
  const { errors, fail } = collector();
  gateFindings({
    findings: [
      {
        id: 'DS002',
        location: 'apps/web/Dockerfile',
        severity: 'HIGH',
        title: '',
        scanner: 'trivy',
      },
      {
        id: 'DS002',
        location: 'services/signaling-server/Dockerfile',
        severity: 'HIGH',
        title: '',
        scanner: 'trivy',
      },
    ],
    allowlist: [{ ...entry({ id: 'DS002', locations: ['apps/web/Dockerfile'] }), matched: 0 }],
    minSeverity: 'HIGH',
    scanner: 'trivy',
    fail,
  });

  assert.equal(errors.length, 1);
  assert.match(errors[0], /services\/signaling-server\/Dockerfile/u);
});
