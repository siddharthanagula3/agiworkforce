import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type {
  SecurityScanCompletedReport,
  SecurityScanFinding,
  SecurityScanStateResponse,
} from '@agiworkforce/cloud-contracts';
import type { SecurityScanApi } from '../services/security-scan-api';
import { SecurityScanPage } from './SecurityScanPage';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';

const FINDING: SecurityScanFinding = {
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
};

const REPORT: SecurityScanCompletedReport = {
  status: 'completed',
  scanId: '22222222-2222-4222-8222-222222222222',
  startedAt: '2026-10-22T10:00:00.000Z',
  completedAt: '2026-10-22T10:02:00.000Z',
  commit: 'abcdef0123456789abcdef0123456789abcdef01',
  model: 'Test model',
  coverage: { scope: null, candidateFiles: 4, scannedFiles: 3, scannedBytes: 900, skippedFiles: 1 },
  dropped: { unanchored: 1, patchRejected: 0, refuted: 1, unparsable: 0 },
  findings: [FINDING],
};

function state(report: SecurityScanStateResponse['report']): SecurityScanStateResponse {
  return {
    session: {
      id: SESSION_ID,
      title: 'acme/app',
      repositoryUrl: 'https://github.com/acme/app.git',
      workingBranch: 'agi/app-1',
      pullRequestUrl: null,
    },
    report,
  };
}

function fakeApi(initial: SecurityScanStateResponse): SecurityScanApi {
  return {
    read: vi.fn().mockResolvedValue(initial),
    scan: vi.fn().mockResolvedValue(REPORT),
    decide: vi.fn().mockImplementation(async (_sessionId, input) => ({
      report: {
        ...REPORT,
        findings: [
          {
            ...FINDING,
            state: input.decision === 'approve' ? 'approved' : 'dismissed',
            decidedAt: '2026-10-22T10:05:00.000Z',
          },
        ],
      },
      delivery:
        input.decision === 'approve'
          ? { status: 'pushed', pullRequestUrl: 'https://github.com/acme/app/pull/7', error: null }
          : null,
    })),
  };
}

describe('SecurityScanPage', () => {
  it('shows the branch the scan reads and its fixes are pushed to', async () => {
    render(<SecurityScanPage sessionId={SESSION_ID} api={fakeApi(state(null))} />);

    const branch = await screen.findByTestId('security-scan-branch');
    expect(branch).toHaveTextContent('agi/app-1');
  });

  it('leaves the branch out when the session has none', async () => {
    const api = fakeApi(state(null));
    const base = state(null);
    vi.mocked(api.read).mockResolvedValue({
      ...base,
      session: { ...base.session, workingBranch: null },
    });
    render(<SecurityScanPage sessionId={SESSION_ID} api={api} />);

    await screen.findByRole('button', { name: 'Scan repository' });
    expect(screen.queryByTestId('security-scan-branch')).toBeNull();
  });

  it('scans only after the user consents to sending source files', async () => {
    const user = userEvent.setup();
    const api = fakeApi(state(null));
    render(<SecurityScanPage sessionId={SESSION_ID} api={api} />);

    const scan = await screen.findByRole('button', { name: 'Scan repository' });
    expect(scan).toBeDisabled();
    await user.type(screen.getByLabelText('Folder to scan'), 'src/api');
    await user.click(
      screen.getByRole('checkbox', {
        name: 'Send source files from this repository to the scan model',
      }),
    );
    await user.click(scan);

    expect(api.scan).toHaveBeenCalledWith(SESSION_ID, { scope: 'src/api' });
    expect(await screen.findByText('1 validated finding')).toBeInTheDocument();
    expect(screen.getByText(/3 of 4 source files scanned/)).toBeInTheDocument();
    expect(screen.getByText('2 possible issues set aside after validation')).toBeInTheDocument();
    expect(screen.getByText('+db.query(sql, [id])')).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('asks before approving, names what it pushes, then links the pull request', async () => {
    const user = userEvent.setup();
    const api = fakeApi(state(REPORT));
    render(<SecurityScanPage sessionId={SESSION_ID} api={api} />);

    await user.click(await screen.findByRole('button', { name: 'Approve fix' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/commits it to the agi\/app-1 branch/)).toBeInTheDocument();
    expect(api.decide).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Approve and push' }));

    await waitFor(() =>
      expect(api.decide).toHaveBeenCalledWith(SESSION_ID, {
        scanId: REPORT.scanId,
        findingId: FINDING.id,
        decision: 'approve',
      }),
    );
    expect(await screen.findByText('Fix approved')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View pull request' })).toHaveAttribute(
      'href',
      'https://github.com/acme/app/pull/7',
    );
  });

  it('dismisses only after confirmation', async () => {
    const user = userEvent.setup();
    const api = fakeApi(state(REPORT));
    render(<SecurityScanPage sessionId={SESSION_ID} api={api} />);

    await user.click(await screen.findByRole('button', { name: 'Dismiss' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Dismiss' }));

    await waitFor(() =>
      expect(api.decide).toHaveBeenCalledWith(SESSION_ID, {
        scanId: REPORT.scanId,
        findingId: FINDING.id,
        decision: 'dismiss',
      }),
    );
    expect(await screen.findByText('Dismissed')).toBeInTheDocument();
  });

  it('explains when the session has no repository and offers no scan', async () => {
    const api = fakeApi({
      ...state(null),
      session: { ...state(null).session, repositoryUrl: null },
    });
    render(<SecurityScanPage sessionId={SESSION_ID} api={api} />);

    expect(
      await screen.findByText('Open this session on a GitHub repository to scan it.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Scan repository' })).toBeNull();
  });

  it('shows a load failure with a retry', async () => {
    const user = userEvent.setup();
    const api = fakeApi(state(null));
    vi.mocked(api.read).mockRejectedValueOnce(
      new Error('Code session is busy; wait and try again'),
    );
    render(<SecurityScanPage sessionId={SESSION_ID} api={api} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Code session is busy');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Scan repository' })).toBeInTheDocument();
  });

  it('shows a failed scan with the reason', async () => {
    const api = fakeApi(
      state({
        status: 'failed',
        scanId: REPORT.scanId,
        startedAt: REPORT.startedAt,
        error: 'Your usage allowance cannot cover a security scan right now',
      }),
    );
    render(<SecurityScanPage sessionId={SESSION_ID} api={api} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Your usage allowance');
    expect(screen.getByRole('button', { name: 'Scan again' })).toBeDisabled();
  });
});
