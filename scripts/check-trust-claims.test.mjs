import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { INDEX, digestOf, ledgerRows, runTrustClaimsCheck } from './check-trust-claims.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = 'apps/web/app/fixture/page.tsx';
const PROOF = 'apps/web/app/fixture/page.test.ts';
const TODAY = new Date('2026-09-21T12:00:00Z');

const COMPLIANCE_VALUE = 'Implemented. Export and erasure run for every account. As of 2026-09-01.';
const POSTURE_VALUE = "Implemented, with the 'nonce' named. As of 2026-08-05.";

function pageSource({ compliance = COMPLIANCE_VALUE, posture = POSTURE_VALUE, extra = '' } = {}) {
  return [
    "import { Ledger } from '@/features/marketing/components/system';",
    '',
    'const COMPLIANCE: { label: string; value: string }[] = [',
    '  {',
    "    label: 'GDPR: data subject rights',",
    '    value:',
    `      '${compliance}',`,
    '  },',
    '];',
    '',
    'const POSTURE: { label: string; value: string }[] = [',
    '  {',
    "    label: 'Content Security Policy',",
    `    value: "${posture}",`,
    '  },',
    extra,
    '];',
    '',
  ].join('\n');
}

function baseIndex() {
  return {
    note: 'fixture',
    reviewCadenceDays: 90,
    owners: ['Security', 'Legal/compliance'],
    pages: [PAGE],
    jurisdictionRequired: [`${PAGE}#COMPLIANCE`],
    unprovenCeiling: 0,
    claims: [
      {
        page: PAGE,
        ledger: 'COMPLIANCE',
        label: 'GDPR: data subject rights',
        owner: 'Legal/compliance',
        reviewedOn: '2026-09-20',
        asOf: '2026-09-01',
        digest: digestOf(COMPLIANCE_VALUE),
        jurisdiction: 'European Union (GDPR)',
        scope: 'Every account',
        implementation: [PAGE],
        proof: [{ kind: 'test', file: PROOF, name: 'erases what it exports' }],
      },
      {
        page: PAGE,
        ledger: 'POSTURE',
        label: 'Content Security Policy',
        owner: 'Security',
        reviewedOn: '2026-09-20',
        asOf: '2026-08-05',
        digest: digestOf(POSTURE_VALUE),
        implementation: [`${PAGE}#COMPLIANCE`],
        proof: [{ kind: 'test', file: PROOF, name: 'sends a nonce' }],
      },
    ],
  };
}

function fixture({ page = pageSource(), index = baseIndex() } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trust-claims-'));
  const write = (relative, contents) => {
    fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    fs.writeFileSync(path.join(root, relative), contents);
  };
  write(PAGE, page);
  write(PROOF, "it('erases what it exports', () => {});\nit('sends a nonce', () => {});\n");
  write(INDEX, JSON.stringify(index, null, 2));
  return root;
}

function failuresFor(options, today = TODAY) {
  return runTrustClaimsCheck(fixture(options), today);
}

test('passes a ledger whose every row is owned, proved and freshly reviewed', () => {
  assert.deepEqual(failuresFor(), []);
});

test('reads single and double quoted rows and unicode escapes as the page renders them', () => {
  const rows = ledgerRows(pageSource({ posture: 'It\\u2019s implemented. As of 2026-08-05.' }));
  assert.deepEqual(
    rows.map((row) => [row.ledger, row.label]),
    [
      ['COMPLIANCE', 'GDPR: data subject rights'],
      ['POSTURE', 'Content Security Policy'],
    ],
  );
  assert.equal(rows[1].value, 'It’s implemented. As of 2026-08-05.');
  assert.deepEqual(rows.unreadable, []);
});

test('fails when a row is edited without a new review', () => {
  const failures = failuresFor({
    page: pageSource({ compliance: 'Implemented for every account worldwide. As of 2026-09-01.' }),
  });
  assert.ok(failures.some((failure) => failure.includes('changed without a review')));
});

test('fails on a published row nobody has indexed', () => {
  const extra =
    "  {\n    label: 'Rate limiting',\n    value: 'Implemented. As of 2026-08-05.',\n  },";
  const failures = failuresFor({ page: pageSource({ extra }) });
  assert.ok(
    failures.some((failure) => failure.includes('"Rate limiting" is published with no owner')),
  );
});

test('fails on an index entry whose row is gone', () => {
  const index = baseIndex();
  index.claims.push({ ...index.claims[1], label: 'Retired control' });
  const failures = failuresFor({ index });
  assert.ok(failures.some((failure) => failure.includes('no such row is published any more')));
});

test('fails once a review is older than the cadence', () => {
  const failures = failuresFor({}, new Date('2026-12-31T00:00:00Z'));
  assert.ok(failures.some((failure) => failure.includes('more than 90 days ago')));
});

test('fails when the page and the index disagree on the as-of date', () => {
  const failures = failuresFor({
    page: pageSource({ compliance: COMPLIANCE_VALUE.replace('2026-09-01', '2026-09-02') }),
  });
  assert.ok(failures.some((failure) => failure.includes('the page says "As of 2026-09-02"')));
});

test('fails on a review dated before the fact it reviews', () => {
  const index = baseIndex();
  index.claims[0].reviewedOn = '2026-08-30';
  const failures = failuresFor({ index });
  assert.ok(failures.some((failure) => failure.includes('before the 2026-09-01 fact')));
});

test('fails when a proof test no longer exists', () => {
  const index = baseIndex();
  index.claims[1].proof = [{ kind: 'test', file: PROOF, name: 'a test that was deleted' }];
  const failures = failuresFor({ index });
  assert.ok(
    failures.some((failure) => failure.includes('"a test that was deleted" no longer exists')),
  );
});

test('refuses an unproven row past the ceiling, and one with no reason', () => {
  const index = baseIndex();
  index.claims[1].proof = [];
  const failures = failuresFor({ index });
  assert.ok(failures.some((failure) => failure.includes('above the ceiling of 0')));
  assert.ok(failures.some((failure) => failure.includes('states no reason why')));
});

test('requires a compliance row to name its jurisdiction and scope', () => {
  const index = baseIndex();
  delete index.claims[0].jurisdiction;
  const failures = failuresFor({ index });
  assert.ok(failures.some((failure) => failure.includes('must name its jurisdiction')));
});

test('refuses an owner the index does not declare', () => {
  const index = baseIndex();
  index.claims[1].owner = 'Somebody';
  const failures = failuresFor({ index });
  assert.ok(failures.some((failure) => failure.includes('owner "Somebody"')));
});

test('reports a row whose value is not a plain string instead of skipping it', () => {
  const extra = "  {\n    label: 'Rendered row',\n    value: `built ${'at'} runtime`,\n  },";
  const failures = failuresFor({ page: pageSource({ extra }) });
  assert.ok(failures.some((failure) => failure.includes('2 rows declared, 1 readable')));
});

test('the published trust ledger passes', () => {
  assert.deepEqual(runTrustClaimsCheck(repoRoot), []);
});
