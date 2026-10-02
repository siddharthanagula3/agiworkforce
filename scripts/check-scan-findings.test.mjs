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

function zapSite(alerts) {
  return { site: [{ '@name': 'http://127.0.0.1:3000', alerts }] };
}

test('a zap acceptance names one alert of a plugin, so it never excuses a sibling alert', () => {
  const { errors, fail } = collector();
  gateFindings({
    findings: normalizeZapReport(
      zapSite([
        {
          pluginid: '10055',
          alertRef: '10055-6',
          alert: 'CSP: style-src unsafe-inline',
          riskcode: '2',
          instances: [{ uri: 'http://127.0.0.1:3000/pricing' }],
        },
        {
          pluginid: '10055',
          alertRef: '10055-5',
          alert: 'CSP: script-src unsafe-inline',
          riskcode: '2',
          instances: [{ uri: 'http://127.0.0.1:3000/pricing' }],
        },
      ]),
    ),
    allowlist: [{ ...entry({ id: '10055-6', scanner: 'zap' }), matched: 0 }],
    minSeverity: 'MEDIUM',
    scanner: 'zap',
    fail,
  });

  assert.deepEqual(errors, [
    'unaccepted: http://127.0.0.1:3000/pricing [MEDIUM] 10055-5, CSP: script-src unsafe-inline',
  ]);
});

test('every url a zap alert lists has to fall inside its locations-scoped acceptance', () => {
  const { errors, fail } = collector();
  gateFindings({
    findings: normalizeZapReport(
      zapSite([
        {
          pluginid: '10099',
          alertRef: '10099',
          alert: 'Source Code Disclosure - Python',
          riskcode: '2',
          instances: [
            { uri: 'http://127.0.0.1:3000/api-docs' },
            { uri: 'http://127.0.0.1:3000/admin/export' },
            { uri: 'http://127.0.0.1:3000/admin/export' },
          ],
        },
      ]),
    ),
    allowlist: [
      {
        ...entry({ id: '10099', scanner: 'zap', locations: ['http://127.0.0.1:3000/api-docs'] }),
        matched: 0,
      },
    ],
    minSeverity: 'MEDIUM',
    scanner: 'zap',
    fail,
  });

  assert.deepEqual(errors, [
    'unaccepted: http://127.0.0.1:3000/admin/export [MEDIUM] 10099, Source Code Disclosure - Python',
  ]);
});

test('a zap location covers its own path and what sits below it, not every url containing it', () => {
  const { errors, fail } = collector();
  gateFindings({
    findings: normalizeZapReport(
      zapSite([
        {
          pluginid: '10099',
          alertRef: '10099',
          alert: 'Source Code Disclosure - Python',
          riskcode: '2',
          instances: [
            { uri: 'http://127.0.0.1:3000/api-docs' },
            { uri: 'http://127.0.0.1:3000/api-docs/streaming?lang=python#sdk' },
            { uri: 'http://127.0.0.1:3000/gallery/python-data-pipeline' },
            { uri: 'http://127.0.0.1:3000/api-docs-internal/dump' },
            { uri: 'http://127.0.0.1:3000/admin/export?next=http://127.0.0.1:3000/gallery/x' },
            { uri: 'http://127.0.0.1:3000/gallery' },
            { uri: 'https://127.0.0.1:3000/api-docs' },
          ],
        },
      ]),
    ),
    allowlist: [
      {
        ...entry({
          id: '10099',
          scanner: 'zap',
          locations: ['http://127.0.0.1:3000/api-docs', 'http://127.0.0.1:3000/gallery/'],
        }),
        matched: 0,
      },
    ],
    minSeverity: 'MEDIUM',
    scanner: 'zap',
    fail,
  });

  assert.deepEqual(errors, [
    'unaccepted: http://127.0.0.1:3000/api-docs-internal/dump [MEDIUM] 10099, Source Code Disclosure - Python',
    'unaccepted: http://127.0.0.1:3000/admin/export?next=http://127.0.0.1:3000/gallery/x [MEDIUM] 10099, Source Code Disclosure - Python',
    'unaccepted: http://127.0.0.1:3000/gallery [MEDIUM] 10099, Source Code Disclosure - Python',
    'unaccepted: https://127.0.0.1:3000/api-docs [MEDIUM] 10099, Source Code Disclosure - Python',
  ]);
});

test('a zap location has to be an absolute url without a query or fragment', () => {
  for (const location of [
    '/api-docs',
    'api-docs',
    'http://127.0.0.1:3000/api-docs?lang=python',
    'http://127.0.0.1:3000/gallery/#sql',
    'file:///api-docs',
  ]) {
    const { errors, fail } = collector();
    const allowlist = parseAllowlist(
      { entries: [entry({ id: '10099', scanner: 'zap', locations: [location] })] },
      { allowlistPath: ALLOWLIST_PATH, today: '2026-10-02', fail },
    );

    assert.equal(allowlist.length, 0, location);
    assert.deepEqual(errors, [
      `${ALLOWLIST_PATH} entries[0] (10099) "locations" for a zap entry must be absolute http or https URLs with no query or fragment.`,
    ]);
  }
});

const WILDCARD_PREAMBLE =
  'The following directives either allow wildcard sources (or ancestors), are not defined, or are overly broadly defined:';

test('a zap acceptance pinned to a line of other info fails an instance that reports more', () => {
  const { errors, fail } = collector();
  const wildcard = (uri, directives) => ({
    uri,
    evidence: "default-src 'self'; img-src 'self' https:",
    otherinfo: `${WILDCARD_PREAMBLE}\n${directives}`,
  });
  gateFindings({
    findings: normalizeZapReport(
      zapSite([
        {
          pluginid: '10055',
          alertRef: '10055-4',
          alert: 'CSP: Wildcard Directive',
          riskcode: '2',
          instances: [
            wildcard('http://127.0.0.1:3000/', 'img-src'),
            wildcard('http://127.0.0.1:3000/pricing', 'script-src, img-src, connect-src'),
          ],
        },
      ]),
    ),
    allowlist: [{ ...entry({ id: '10055-4', scanner: 'zap', otherinfo: 'img-src' }), matched: 0 }],
    minSeverity: 'MEDIUM',
    scanner: 'zap',
    fail,
  });

  assert.deepEqual(errors, [
    `unaccepted: http://127.0.0.1:3000/pricing [MEDIUM] 10055-4, CSP: Wildcard Directive (${WILDCARD_PREAMBLE} script-src, img-src, connect-src)`,
  ]);
});

test('a zap acceptance pinned to evidence fails an instance on the same page that carries none of it', () => {
  const { errors, fail } = collector();
  gateFindings({
    findings: normalizeZapReport(
      zapSite([
        {
          pluginid: '90003',
          alertRef: '90003',
          alert: 'Sub Resource Integrity Attribute Missing',
          riskcode: '2',
          instances: [
            {
              uri: 'http://127.0.0.1:3000/auth',
              evidence:
                '<script src="https://clerk-ci.invalid/npm/@clerk/clerk-js@6/dist/clerk.browser.js" async=""></script>',
            },
            {
              uri: 'http://127.0.0.1:3000/auth',
              evidence:
                '<link rel="preload" href="https://clerk-ci.invalid/npm/@clerk/ui@1/dist/ui.browser.js" as="script"/>',
            },
            {
              uri: 'http://127.0.0.1:3000/auth',
              evidence: '<script src="https://cdn.evil.example/lib.js"></script>',
            },
          ],
        },
      ]),
    ),
    allowlist: [
      {
        ...entry({
          id: '90003',
          scanner: 'zap',
          evidence: [
            'https://clerk-ci.invalid/npm/@clerk/clerk-js@',
            'https://clerk-ci.invalid/npm/@clerk/ui@',
          ],
        }),
        matched: 0,
      },
    ],
    minSeverity: 'MEDIUM',
    scanner: 'zap',
    fail,
  });

  assert.deepEqual(errors, [
    'unaccepted: http://127.0.0.1:3000/auth [MEDIUM] 90003, Sub Resource Integrity Attribute Missing (<script src="https://cdn.evil.example/lib.js"></script>)',
  ]);
});

test('only a zap entry can pin other info or evidence, and each pin has a shape', () => {
  for (const override of [
    { otherinfo: 'img-src' },
    { scanner: 'zap', otherinfo: ' ' },
    { scanner: 'zap', evidence: '/npm/@clerk/clerk-js@' },
    { scanner: 'zap', evidence: [] },
    { scanner: 'zap', evidence: ['/npm/@clerk/clerk-js@', ''] },
  ]) {
    const { errors, fail } = collector();
    const allowlist = parseAllowlist(
      { entries: [entry(override)] },
      { allowlistPath: ALLOWLIST_PATH, today: '2026-10-02', fail },
    );

    assert.equal(allowlist.length, 0, JSON.stringify(override));
    assert.equal(errors.length, 1, JSON.stringify(override));
  }
});

test('a key the gate does not read is rejected, so a misspelled scope or pin cannot widen an entry', () => {
  for (const [key, value] of [
    ['otherInfo', 'img-src'],
    ['evidences', ['https://clerk-ci.invalid/npm/@clerk/clerk-js@']],
    ['location', ['http://127.0.0.1:3000/api-docs']],
  ]) {
    const { errors, fail } = collector();
    const allowlist = parseAllowlist(
      {
        entries: [
          entry({
            id: '10055-4',
            scanner: 'zap',
            locations: ['http://127.0.0.1:3000'],
            [key]: value,
          }),
        ],
      },
      { allowlistPath: ALLOWLIST_PATH, today: '2026-10-02', fail },
    );

    assert.equal(allowlist.length, 0, key);
    assert.deepEqual(errors, [
      `${ALLOWLIST_PATH} entries[0] (10055-4) sets "${key}", which the gate does not read. An entry takes only id, scanner, owner, expires, reason, locations, otherinfo and evidence, and a misspelled scope or pin would accept every instance of 10055-4.`,
    ]);
  }
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

test('an acceptance whose expiry is not a real calendar date is rejected', () => {
  for (const expires of ['2026-13-99', '2026-02-30', '2026-31-10']) {
    const { errors, fail } = collector();
    const allowlist = parseAllowlist(
      { entries: [entry({ expires })] },
      { allowlistPath: ALLOWLIST_PATH, today: '2026-12-31', fail },
    );

    assert.equal(allowlist.length, 0, expires);
    assert.deepEqual(errors, [
      `${ALLOWLIST_PATH} entries[0] (CVE-2026-0001) must set "expires" to a real calendar date in YYYY-MM-DD form.`,
    ]);
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
