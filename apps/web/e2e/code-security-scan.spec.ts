import { expect, test } from '@playwright/test';
import {
  securityScanSessionPath,
  type SecurityScanStateResponse,
} from '@agiworkforce/cloud-contracts';
import { signIn } from './qa-capability-harness';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';

const STATE: SecurityScanStateResponse = {
  session: {
    id: SESSION_ID,
    title: 'acme/app',
    repositoryUrl: 'https://github.com/acme/app.git',
    workingBranch: 'agi/app-1',
    pullRequestUrl: null,
  },
  models: [],
  report: {
    status: 'completed',
    scanId: '22222222-2222-4222-8222-222222222222',
    startedAt: '2026-10-22T10:00:00.000Z',
    completedAt: '2026-10-22T10:02:00.000Z',
    commit: null,
    model: 'Auto',
    coverage: {
      scope: null,
      candidateFiles: 2,
      scannedFiles: 2,
      scannedBytes: 400,
      skippedFiles: 0,
    },
    dropped: { unanchored: 0, patchRejected: 0, refuted: 0, unparsable: 0 },
    findings: [
      {
        id: '0123456789abcdef',
        path: 'src/api/users.ts',
        line: 2,
        severity: 'high',
        category: 'sql-injection',
        title: 'SQL injection in handler',
        explanation: 'The id parameter reaches SQL unescaped.',
        evidence: 'db.query(`select ${id}`)',
        verification: 'The id comes straight from the request.',
        patch:
          'diff --git a/src/api/users.ts b/src/api/users.ts\n--- a/src/api/users.ts\n+++ b/src/api/users.ts\n@@ -2,1 +2,1 @@\n-db.query(`select ${id}`)\n+db.query(sql, [id])\n',
        state: 'open',
        decidedAt: null,
      },
    ],
  },
};

test.describe('code security scan page', () => {
  test('shows validated findings with their fix and gates a new scan on consent', async ({
    page,
  }) => {
    await signIn(page);
    await page.route(`**${securityScanSessionPath(SESSION_ID)}`, async (route) => {
      if (route.request().method() !== 'GET') return route.abort();
      return route.fulfill({ json: STATE });
    });

    await page.goto(`/code/${SESSION_ID}/security`, { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Security scan' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText('1 validated finding')).toBeVisible();
    await expect(page.getByText('+db.query(sql, [id])')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve fix' })).toBeEnabled();

    const rescan = page.getByRole('button', { name: 'Scan again' });
    await expect(rescan).toBeDisabled();
    await page
      .getByRole('checkbox', { name: 'Send source files from this repository to the scan model' })
      .check();
    await expect(rescan).toBeEnabled();
  });
});
