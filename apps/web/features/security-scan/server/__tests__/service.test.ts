import { beforeEach, describe, expect, it, vi } from 'vitest';

type SessionServiceModule = typeof import('@/lib/services/cloud-code-session-service');

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  commitAndPush: vi.fn(),
  openPullRequest: vi.fn(),
  workspace: null as unknown,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/services/cloud-code-session-service', async (importOriginal) => {
  const actual = await importOriginal<SessionServiceModule>();
  return {
    ...actual,
    getCloudCodeSession: mocks.getSession,
    commitFileAndPushCloudCodeSession: mocks.commitAndPush,
    openCloudCodeSessionPullRequest: mocks.openPullRequest,
  };
});
vi.mock('../model', () => ({
  SECURITY_SCAN_QUOTA_FEATURE: 'security_scan',
  SecurityScanBudgetError: class SecurityScanBudgetError extends Error {},
  SecurityScanNoRouteError: class SecurityScanNoRouteError extends Error {},
  resolveSecurityScanModel: vi.fn(),
}));
vi.mock('../workspace', () => ({
  shellQuote: (value: string) => `'${value}'`,
  withSecurityScanWorkspace: vi.fn(
    async (
      _db: unknown,
      _owner: unknown,
      _id: unknown,
      _tier: unknown,
      work: (workspace: unknown) => unknown,
    ) => work(mocks.workspace),
  ),
}));

import {
  CloudCodeConflictError,
  CloudCodeValidationError,
} from '@/lib/services/cloud-code-session-service';
import type {
  SecurityScanCompletedReport,
  SecurityScanReport,
} from '@agiworkforce/cloud-contracts';
import type { SecurityScanModel, SecurityScanModelCall } from '../model';
import { SECURITY_SCAN_REPLAY_MESSAGE, SecurityScanReportReplayError } from '../report-signing';
import { decideSecurityScanFinding, readSecurityScanState, runSecurityScan } from '../service';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const COMMIT = 'a'.repeat(40);
const OBJECT = '0123456789abcdef0123456789abcdef01234567';
const ROUTE_SOURCE = [
  'export async function handler(req, res) {',
  '  const rows = await db.query(`select * from users where id = ${req.query.id}`);',
  '  res.json(rows);',
  '}',
  '',
].join('\n');

const VALID_CANDIDATE = {
  path: 'src/api/users.ts',
  line: 2,
  severity: 'high',
  category: 'sql-injection',
  title: 'SQL injection in handler',
  explanation: 'The id parameter reaches SQL unescaped.',
  evidence: 'const rows = await db.query(`select * from users where id = ${req.query.id}`);',
  fix: {
    original: 'db.query(`select * from users where id = ${req.query.id}`)',
    replacement: "db.query('select * from users where id = $1', [req.query.id])",
  },
};

const INVENTED_CANDIDATE = {
  ...VALID_CANDIDATE,
  title: 'Command injection',
  evidence: 'spawnShell(req.body.cmd)',
  fix: { original: 'spawnShell(req.body.cmd)', replacement: 'noop()' },
};

interface FakeWorkspace {
  report: SecurityScanReport | null;
  replayed: SecurityScanReportReplayError | null;
  writes: SecurityScanReport[];
  commands: string[];
  reads: string[];
  applyCheckOk: boolean;
  dirtyPaths: Set<string>;
  stagedPaths: string[];
  unpushedCommits: string[];
  files: Map<string, string>;
  listedSizes: Map<string, number>;
}

function fakeWorkspace(): FakeWorkspace {
  const files = new Map([
    ['src/api/users.ts', ROUTE_SOURCE],
    ['src/format.ts', 'export const x = 1;\n'],
  ]);
  const state: FakeWorkspace = {
    report: null,
    replayed: null,
    writes: [],
    commands: [],
    reads: [],
    applyCheckOk: true,
    dirtyPaths: new Set(),
    stagedPaths: [],
    unpushedCommits: [],
    files,
    listedSizes: new Map(),
  };
  const ok = (stdout = '') => ({ ok: true, output: stdout, stdout, stderr: '', exitCode: 0 });
  const fail = () => ({ ok: false, output: '', stdout: '', stderr: 'error', exitCode: 1 });
  mocks.workspace = {
    session: { id: SESSION_ID },
    async run(command: string) {
      state.commands.push(command);
      if (command === 'git rev-parse HEAD') return ok(`${COMMIT}\n`);
      if (command === 'git ls-files -s -z') {
        return ok([...files.keys()].map((path) => `100644 ${OBJECT} 0\t${path}\0`).join(''));
      }
      if (command.startsWith('git apply --check')) return state.applyCheckOk ? ok() : fail();
      if (command.startsWith('git apply')) return ok();
      if (command.startsWith('stat -L ')) {
        return ok(
          [...files.entries()]
            .filter(([path]) => command.includes(`'${path}'`))
            .map(([path, content]) => {
              const size = state.listedSizes.get(path) ?? Buffer.byteLength(content, 'utf8');
              return `${size}\t${path}\0`;
            })
            .join(''),
        );
      }
      if (command === 'git diff --cached --name-only -z') {
        return ok(state.stagedPaths.map((path) => `${path}\0`).join(''));
      }
      if (command === 'git rev-list --max-count=1 HEAD --not --remotes') {
        return ok(state.unpushedCommits.map((sha) => `${sha}\n`).join(''));
      }
      if (command.startsWith('git status --porcelain')) {
        const path = /'(.+)'$/.exec(command)?.[1] ?? '';
        return ok(state.dirtyPaths.has(path) ? ` M ${path}\n` : '');
      }
      return fail();
    },
    readText: async (path: string) => {
      state.reads.push(path);
      return files.get(path) ?? null;
    },
    readReport: async () => {
      if (state.replayed) throw state.replayed;
      return state.report;
    },
    async writeReport(report: SecurityScanReport) {
      state.report = report;
      state.writes.push(report);
    },
    writePatch: async (id: string) => `/home/user/.agi-security-scan/${id}.patch`,
  };
  return state;
}

function scriptedModel(answers: {
  scan: unknown;
  verify?: (prompt: string) => unknown;
}): SecurityScanModel & { calls: SecurityScanModelCall[] } {
  const calls: SecurityScanModelCall[] = [];
  return {
    label: 'Test model',
    calls,
    async call(call) {
      calls.push(call);
      if (call.ref.startsWith('scan:')) return { text: JSON.stringify(answers.scan) };
      const ids = [...call.prompt.matchAll(/=== FINDING ([0-9a-f]{16}) ===/g)].map((m) => m[1]);
      return {
        text: JSON.stringify(
          answers.verify?.(call.prompt) ?? {
            verdicts: ids.map((id) => ({ id, verdict: 'confirmed', reason: 'Reachable.' })),
          },
        ),
      };
    },
  };
}

function context(model: SecurityScanModel) {
  return {
    db: {} as never,
    owner: { userId: 'user-1', organizationId: null },
    sessionId: SESSION_ID,
    planTier: 'pro',
    resolveModel: async () => model,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({
    id: SESSION_ID,
    title: 'Repo',
    repositoryUrl: 'https://github.com/acme/app.git',
    state: 'ready',
    workingBranch: 'agi/repo-1',
  });
  mocks.commitAndPush.mockResolvedValue({ session: {}, push: {} });
  mocks.openPullRequest.mockResolvedValue({
    url: 'https://github.com/acme/app/pull/7',
    number: 7,
    alreadyOpen: false,
  });
});

const REPLAYED = new SecurityScanReportReplayError({
  scanId: '22222222-2222-4222-8222-222222222222',
  issuedAt: '2026-10-22T09:00:00.000Z',
});

describe('readSecurityScanState', () => {
  it('shows a stored report that is not the latest one as a failed scan to run again', async () => {
    const workspace = fakeWorkspace();
    workspace.replayed = REPLAYED;

    const state = await readSecurityScanState(context(scriptedModel({ scan: {} })));

    expect(state.report).toEqual({
      status: 'failed',
      scanId: REPLAYED.scanId,
      startedAt: REPLAYED.issuedAt,
      error: SECURITY_SCAN_REPLAY_MESSAGE,
    });
  });
});

describe('runSecurityScan', () => {
  it('keeps only findings that are anchored, confirmed and whose fix applies', async () => {
    const workspace = fakeWorkspace();
    const model = scriptedModel({ scan: { findings: [VALID_CANDIDATE, INVENTED_CANDIDATE] } });

    const report = await runSecurityScan(context(model), null);

    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]).toMatchObject({
      path: 'src/api/users.ts',
      line: 2,
      state: 'open',
      verification: 'Reachable.',
    });
    expect(report.findings[0]?.patch).toContain(
      "+  const rows = await db.query('select * from users where id = $1', [req.query.id]);",
    );
    expect(report.dropped).toEqual({ unanchored: 1, patchRejected: 0, refuted: 0, unparsable: 0 });
    expect(report.coverage).toMatchObject({ candidateFiles: 2, scannedFiles: 2, skippedFiles: 0 });
    expect(report.commit).toBe(COMMIT);
    expect(report.model).toBe('Test model');
    expect(workspace.writes.map((write) => write.status)).toEqual(['running', 'completed']);
    expect(workspace.commands.some((command) => command.startsWith('git apply --check'))).toBe(
      true,
    );
  });

  it('drops a finding the verifier refutes or does not answer for', async () => {
    fakeWorkspace();
    const model = scriptedModel({
      scan: { findings: [VALID_CANDIDATE] },
      verify: () => ({ verdicts: [] }),
    });

    const report = await runSecurityScan(context(model), null);

    expect(report.findings).toEqual([]);
    expect(report.dropped.refuted).toBe(1);
  });

  it('drops a confirmed finding whose fix does not apply to the workspace', async () => {
    const workspace = fakeWorkspace();
    workspace.applyCheckOk = false;
    const model = scriptedModel({ scan: { findings: [VALID_CANDIDATE] } });

    const report = await runSecurityScan(context(model), null);

    expect(report.findings).toEqual([]);
    expect(report.dropped.patchRejected).toBe(1);
  });

  it('refuses to start while another scan is running', async () => {
    const workspace = fakeWorkspace();
    workspace.report = {
      status: 'running',
      scanId: '22222222-2222-4222-8222-222222222222',
      startedAt: new Date().toISOString(),
    };
    const model = scriptedModel({ scan: { findings: [] } });

    await expect(runSecurityScan(context(model), null)).rejects.toBeInstanceOf(
      CloudCodeConflictError,
    );
    expect(model.calls).toEqual([]);
  });

  it('starts a new scan over a stored report that is not the latest one', async () => {
    const workspace = fakeWorkspace();
    workspace.replayed = REPLAYED;
    const model = scriptedModel({ scan: { findings: [] } });

    const report = await runSecurityScan(context(model), null);

    expect(report.status).toBe('completed');
    expect(workspace.writes.map((write) => write.status)).toEqual(['running', 'completed']);
  });

  it('records a failed scan when the model cannot be reached', async () => {
    const workspace = fakeWorkspace();
    const model: SecurityScanModel = {
      label: 'Test model',
      call: async () => {
        throw new Error('upstream 500');
      },
    };

    await expect(runSecurityScan(context(model), null)).rejects.toThrow('upstream 500');
    expect(workspace.report).toMatchObject({
      status: 'failed',
      error: 'The scan could not finish. Try again.',
    });
  });

  it('shows the verifier the fix it would approve', async () => {
    fakeWorkspace();
    const model = scriptedModel({ scan: { findings: [VALID_CANDIDATE] } });

    await runSecurityScan(context(model), null);

    const verify = model.calls.find((call) => call.ref === 'verify');
    expect(verify?.prompt).toContain('Proposed fix:');
    expect(verify?.prompt).toContain(
      "+  const rows = await db.query('select * from users where id = $1', [req.query.id]);",
    );
  });

  it('never reads a file whose listed size is over the batch limit', async () => {
    const workspace = fakeWorkspace();
    workspace.listedSizes.set('src/api/users.ts', 10 * 1024 * 1024);
    const model = scriptedModel({ scan: { findings: [] } });

    const report = await runSecurityScan(context(model), null);

    expect(workspace.reads).toEqual(['src/format.ts']);
    expect(report.coverage).toMatchObject({ candidateFiles: 2, scannedFiles: 1 });
  });

  it('stops reading once the listed sizes fill the scan budget', async () => {
    const workspace = fakeWorkspace();
    for (let index = 0; index < 6; index += 1) {
      workspace.files.set(`src/api/route${index}.ts`, 'x'.repeat(40 * 1024));
    }
    const model = scriptedModel({ scan: { findings: [] } });

    const report = await runSecurityScan(context(model), null);

    const routeReads = workspace.reads.filter((path) => path.startsWith('src/api/route'));
    expect(routeReads).toHaveLength(4);
    expect(report.coverage.scannedBytes).toBeLessThanOrEqual(4 * 48 * 1024);
  });

  it('refuses a session with no repository before resolving a model', async () => {
    mocks.getSession.mockResolvedValueOnce({ id: SESSION_ID, repositoryUrl: null });
    const resolveModel = vi.fn();

    await expect(
      runSecurityScan({ ...context(scriptedModel({ scan: {} })), resolveModel }, null),
    ).rejects.toBeInstanceOf(CloudCodeValidationError);
    expect(resolveModel).not.toHaveBeenCalled();
  });
});

async function scannedWorkspace(): Promise<{
  workspace: FakeWorkspace;
  report: SecurityScanCompletedReport;
}> {
  const workspace = fakeWorkspace();
  const report = await runSecurityScan(
    context(scriptedModel({ scan: { findings: [VALID_CANDIDATE] } })),
    null,
  );
  workspace.commands.length = 0;
  return { workspace, report };
}

describe('decideSecurityScanFinding', () => {
  it('refuses a decision on a report that is not the latest one, and changes nothing', async () => {
    const { workspace, report } = await scannedWorkspace();
    workspace.replayed = REPLAYED;
    workspace.commands.length = 0;

    await expect(
      decideSecurityScanFinding(context(scriptedModel({ scan: {} })), {
        scanId: report.scanId,
        findingId: report.findings[0]!.id,
        decision: 'approve',
      }),
    ).rejects.toBe(REPLAYED);
    expect(workspace.commands).toEqual([]);
    expect(mocks.commitAndPush).not.toHaveBeenCalled();
  });

  it('applies an approved fix, then commits only that file and opens the pull request', async () => {
    const { workspace, report } = await scannedWorkspace();
    const finding = report.findings[0]!;

    const result = await decideSecurityScanFinding(context(scriptedModel({ scan: {} })), {
      scanId: report.scanId,
      findingId: finding.id,
      decision: 'approve',
    });

    expect(workspace.commands).toEqual([
      'git diff --cached --name-only -z',
      'git rev-list --max-count=1 HEAD --not --remotes',
      "git status --porcelain -- 'src/api/users.ts'",
      `git apply --check '/home/user/.agi-security-scan/${finding.id}.patch'`,
      `git apply '/home/user/.agi-security-scan/${finding.id}.patch'`,
    ]);
    expect(result.report.findings[0]?.state).toBe('approved');
    expect(mocks.commitAndPush).toHaveBeenCalledWith(
      {},
      { userId: 'user-1', organizationId: null },
      SESSION_ID,
      'pro',
      'fix: SQL injection in handler',
      'src/api/users.ts',
    );
    expect(result.delivery).toEqual({
      status: 'pushed',
      pullRequestUrl: 'https://github.com/acme/app/pull/7',
      error: null,
    });
  });

  it('refuses to approve over uncommitted changes to the same file', async () => {
    const { workspace, report } = await scannedWorkspace();
    workspace.dirtyPaths.add('src/api/users.ts');

    await expect(
      decideSecurityScanFinding(context(scriptedModel({ scan: {} })), {
        scanId: report.scanId,
        findingId: report.findings[0]!.id,
        decision: 'approve',
      }),
    ).rejects.toBeInstanceOf(CloudCodeConflictError);
    expect(workspace.commands.some((command) => command.startsWith('git apply '))).toBe(false);
    expect(mocks.commitAndPush).not.toHaveBeenCalled();
  });

  it('refuses to approve while other changes are staged, so only the fix is committed', async () => {
    const { workspace, report } = await scannedWorkspace();
    workspace.stagedPaths.push('src/secrets.ts');

    await expect(
      decideSecurityScanFinding(context(scriptedModel({ scan: {} })), {
        scanId: report.scanId,
        findingId: report.findings[0]!.id,
        decision: 'approve',
      }),
    ).rejects.toThrow('This session has staged changes');
    expect(workspace.commands.some((command) => command.startsWith('git apply'))).toBe(false);
    expect(workspace.report).toMatchObject({ findings: [{ state: 'open' }] });
    expect(mocks.commitAndPush).not.toHaveBeenCalled();
  });

  it('refuses to approve while the branch has commits GitHub has not seen', async () => {
    const { workspace, report } = await scannedWorkspace();
    workspace.unpushedCommits.push('b'.repeat(40));

    await expect(
      decideSecurityScanFinding(context(scriptedModel({ scan: {} })), {
        scanId: report.scanId,
        findingId: report.findings[0]!.id,
        decision: 'approve',
      }),
    ).rejects.toThrow('commits that are not on GitHub yet');
    expect(workspace.commands.some((command) => command.startsWith('git apply'))).toBe(false);
    expect(mocks.commitAndPush).not.toHaveBeenCalled();
  });

  it('tells the user the applied fix is still in the session when delivery fails', async () => {
    const { report } = await scannedWorkspace();
    mocks.commitAndPush.mockRejectedValueOnce(new Error('socket hang up'));

    const result = await decideSecurityScanFinding(context(scriptedModel({ scan: {} })), {
      scanId: report.scanId,
      findingId: report.findings[0]!.id,
      decision: 'approve',
    });

    expect(result.delivery).toEqual({
      status: 'failed',
      pullRequestUrl: null,
      error:
        'The fix is applied in this session but did not reach GitHub. Push it from the session.',
    });
  });

  it('keeps the approval and reports a push that GitHub refused', async () => {
    const { report } = await scannedWorkspace();
    mocks.commitAndPush.mockRejectedValueOnce(
      new CloudCodeValidationError('No connected GitHub installation can push to this repository'),
    );

    const result = await decideSecurityScanFinding(context(scriptedModel({ scan: {} })), {
      scanId: report.scanId,
      findingId: report.findings[0]!.id,
      decision: 'approve',
    });

    expect(result.report.findings[0]?.state).toBe('approved');
    expect(result.delivery).toEqual({
      status: 'failed',
      pullRequestUrl: null,
      error: 'No connected GitHub installation can push to this repository',
    });
    expect(mocks.openPullRequest).not.toHaveBeenCalled();
  });

  it('dismisses without touching the repository', async () => {
    const { workspace, report } = await scannedWorkspace();

    const result = await decideSecurityScanFinding(context(scriptedModel({ scan: {} })), {
      scanId: report.scanId,
      findingId: report.findings[0]!.id,
      decision: 'dismiss',
    });

    expect(result.report.findings[0]?.state).toBe('dismissed');
    expect(result.delivery).toBeNull();
    expect(workspace.commands).toEqual([]);
    expect(mocks.commitAndPush).not.toHaveBeenCalled();
  });

  it('refuses a decision on an earlier scan or an already decided finding', async () => {
    const { report } = await scannedWorkspace();
    const input = { findingId: report.findings[0]!.id, decision: 'dismiss' as const };
    const ctx = context(scriptedModel({ scan: {} }));

    await expect(
      decideSecurityScanFinding(ctx, { ...input, scanId: '33333333-3333-4333-8333-333333333333' }),
    ).rejects.toBeInstanceOf(CloudCodeConflictError);
    await decideSecurityScanFinding(ctx, { ...input, scanId: report.scanId });
    await expect(
      decideSecurityScanFinding(ctx, { ...input, scanId: report.scanId, decision: 'approve' }),
    ).rejects.toBeInstanceOf(CloudCodeConflictError);
  });
});
